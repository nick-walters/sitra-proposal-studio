import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";




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
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const callerId = auth.userId;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;


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
      .eq("user_id", callerId)
      .eq("proposal_id", proposalId)
      .maybeSingle();

    const { data: isOwner } = await adminClient.rpc("is_owner", {
      _user_id: callerId,
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

    // Use the published app URL as the redirect base. Only accept Origin if it is on a strict allowlist
    // (prevents an attacker-controlled Origin header from hijacking the password-set link).
    const PUBLISHED_URL = "https://sitra-proposal-studio.lovable.app";
    const ALLOWED_ORIGINS = new Set<string>([
      PUBLISHED_URL,
      "https://id-preview--41c4eaa0-9c42-48fb-8a64-8c910390fe96.lovable.app",
      "http://localhost:5173",
      "http://localhost:8080",
    ]);
    const rawOrigin = req.headers.get("origin")?.trim();
    const isAllowedLovableHost = !!rawOrigin && /^https:\/\/[a-z0-9-]+\.lovable\.app$/i.test(rawOrigin) && !rawOrigin.includes("supabase");
    const redirectBase = (rawOrigin && (ALLOWED_ORIGINS.has(rawOrigin) || isAllowedLovableHost)) ? rawOrigin : PUBLISHED_URL;

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

    // Redact email in logs (PII): keep first char + domain only.
    const redactEmail = (e: string) => {
      const [local, domain] = e.split("@");
      if (!local || !domain) return "***";
      return `${local[0]}***@${domain}`;
    };
    const safeEmail = redactEmail(email);

    if (resetError) {
      console.warn("Failed to send password-set email:", resetError.message);
    } else {
      console.log(`Password-set email sent to ${safeEmail}`);
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

    console.log(`User ${safeEmail} created for proposal ${proposalAcronym}`);

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
