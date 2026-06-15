import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface InviteRequest {
  email: string;
  fullName?: string;
  proposalId: string;
  proposalAcronym: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user: caller },
    } = await callerClient.auth.getUser();

    if (!caller) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const body = (await req.json()) as Partial<InviteRequest>;
    const email = body.email?.trim().toLowerCase();
    const proposalId = body.proposalId?.trim();
    const proposalAcronym = (body.proposalAcronym?.replace(/<[^>]*>/g, '').trim()) || "Proposal";
    const fullName = body.fullName?.replace(/<[^>]*>/g, '').trim();

    if (!email || !proposalId) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: "Invalid email address" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (fullName && fullName.length > 200) {
      return new Response(JSON.stringify({ error: "Name is too long (max 200 characters)" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (proposalAcronym.length > 100) {
      return new Response(JSON.stringify({ error: "Proposal acronym is too long" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: callerRole } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("proposal_id", proposalId)
      .maybeSingle();

    const { data: isOwner } = await adminClient.rpc("is_owner", {
      _user_id: caller.id,
    });

    if (!callerRole && !isOwner) {
      return new Response(JSON.stringify({ error: "No access to this proposal" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { data: existingProfile } = await adminClient
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    // Use the published app URL as the redirect base
    const PUBLISHED_URL = "https://sitra-proposal-studio.lovable.app";
    const origin = req.headers.get("origin")?.trim();
    const redirectBase = origin && /^https?:\/\//i.test(origin) && !origin.includes("supabase") ? origin : PUBLISHED_URL;

    if (existingProfile) {
      return new Response(
        JSON.stringify({
          alreadyExists: true,
          message: "User already has an account",
          signupUrl: `${redirectBase}/auth`,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    // Step 1: Create the user account with auto-confirm so they can immediately set a password
    const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        full_name: fullName || email.split("@")[0],
        invited_to_proposal: proposalAcronym,
      },
    });

    if (createError) {
      console.error("Create user error:", createError);
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const newUserId = createData.user?.id;

    // Step 2: Send a password recovery email so the user receives a link to set their password
    const redirectUrl = `${redirectBase}/auth?type=recovery`;

    const { error: resetError } = await adminClient.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl,
    });

    if (resetError) {
      console.warn("Failed to send password-set email:", resetError.message);
    } else {
      console.log(`Password-set email sent to ${email}`);
    }

    // Step 3: Also generate a direct link for the admin to share as backup
    let signupUrl: string | null = null;

    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: redirectUrl,
      },
    });

    if (linkError) {
      console.warn("Failed to generate password-set link:", linkError.message);
      signupUrl = `${redirectBase}/auth`;
    } else {
      signupUrl = linkData?.properties?.action_link ?? `${redirectBase}/auth`;
    }

    console.log(`User ${email} created for proposal ${proposalAcronym}`);

    return new Response(
      JSON.stringify({
        success: true,
        userId: newUserId,
        signupUrl,
        emailSent: !resetError,
        message: resetError
          ? `Account created for ${email}. Email could not be sent — share the link manually.`
          : `Account created for ${email}. A password-set email has been sent. You can also share the link directly.`,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  } catch (error) {
    console.error("Error in invite-user:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
