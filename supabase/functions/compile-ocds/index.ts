import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { proposalId } = await req.json();

    if (!proposalId) {
      return new Response(JSON.stringify({ error: "Missing proposalId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller has at least viewer access to this proposal
    const { data: hasAccess, error: accessError } = await supabase.rpc(
      "has_any_proposal_role",
      { _user_id: authData.user.id, _proposal_id: proposalId }
    );
    if (accessError || !hasAccess) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    // Fetch proposal acronym
    const { data: proposal } = await supabase
      .from("proposals")
      .select("acronym")
      .eq("id", proposalId)
      .single();

    // Fetch all participants ordered by participant_number
    const { data: participants, error: partError } = await supabase
      .from("participants")
      .select("id, participant_number, organisation_short_name, organisation_name, organisation_category")
      .eq("proposal_id", proposalId)
      .order("participant_number", { ascending: true });

    if (partError || !participants) {
      return new Response(JSON.stringify({ error: "Failed to fetch participants" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all OCD uploads for this proposal
    const { data: ocdUploads } = await supabase
      .from("participant_ocd_uploads")
      .select("participant_id, file_path")
      .eq("proposal_id", proposalId);

    const uploadMap = new Map<string, string>();
    if (ocdUploads) {
      for (const u of ocdUploads) {
        uploadMap.set(u.participant_id, u.file_path);
      }
    }

    // Check which participants have uploaded
    const missing: string[] = [];
    const toMerge: { participantNumber: number; name: string; filePath: string }[] = [];

    for (const p of participants) {
      const category = (p as any).organisation_category;
      // Public organisations don't require OCD
      if (category === 'PUB') continue;

      const filePath = uploadMap.get(p.id);
      const name = (p as any).organisation_short_name || (p as any).organisation_name || `Partner ${p.participant_number}`;
      if (filePath) {
        toMerge.push({ participantNumber: p.participant_number!, name, filePath });
      } else {
        missing.push(name);
      }
    }

    // Return info about missing partners (client will show warning)
    if (toMerge.length === 0) {
      return new Response(
        JSON.stringify({ error: "No signed OCDs have been uploaded yet.", missing }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Sort by participant number
    toMerge.sort((a, b) => a.participantNumber - b.participantNumber);

    // Merge all PDFs
    const mergedPdf = await PDFDocument.create();

    for (const item of toMerge) {
      try {
        const { data: fileData, error: dlError } = await supabase.storage
          .from("proposal-files")
          .download(item.filePath);

        if (dlError || !fileData) {
          console.error(`Failed to download OCD for ${item.name}:`, dlError);
          continue;
        }

        const pdfBytes = await fileData.arrayBuffer();
        const pdf = await PDFDocument.load(pdfBytes);
        const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        for (const page of pages) {
          mergedPdf.addPage(page);
        }
      } catch (err) {
        console.error(`Error processing PDF for ${item.name}:`, err);
      }
    }

    const mergedBytes = await mergedPdf.save();

    // Convert to base64
    let binary = "";
    for (let i = 0; i < mergedBytes.length; i++) {
      binary += String.fromCharCode(mergedBytes[i]);
    }
    const fileBase64 = btoa(binary);

    const acronym = proposal?.acronym || "project";
    const filename = `Ownership_Control_Declarations_${acronym}.pdf`.replace(/[^a-zA-Z0-9._-]/g, "_");

    return new Response(
      JSON.stringify({ fileBase64, filename, missing }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Compile OCDs error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
