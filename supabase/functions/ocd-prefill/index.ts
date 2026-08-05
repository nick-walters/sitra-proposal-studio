import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";

/** Escape a plain string for safe inclusion in RTF content. */
function escapeRtf(str: string): string {
  let out = "";
  for (const ch of str) {
    const code = ch.codePointAt(0)!;
    if (ch === "\\" || ch === "{" || ch === "}") out += "\\" + ch;
    else if (ch === "\n") out += "\\par ";
    else if (code > 127) out += `\\u${code > 32767 ? code - 65536 : code}?`;
    else out += ch;
  }
  return out;
}

/**
 * Insert a value immediately after a label in the RTF body, e.g.
 * "Legal name:" -> "Legal name: ACME Ltd". Only fills the first occurrence
 * and only when the label is not already followed by text.
 */
function fillAfterLabel(rtf: string, label: string, value: string): string {
  if (!value) return rtf;
  const idx = rtf.indexOf(label);
  if (idx === -1) return rtf;
  const insertAt = idx + label.length;
  return rtf.slice(0, insertAt) + " " + escapeRtf(value) + rtf.slice(insertAt);
}


serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const callerId = auth.userId;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;


    const { proposalId, participantId } = await req.json();

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!proposalId || typeof proposalId !== "string" || !UUID_RE.test(proposalId)) {
      return new Response(JSON.stringify({ error: "Invalid proposalId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!participantId || typeof participantId !== "string" || !UUID_RE.test(participantId)) {
      return new Response(JSON.stringify({ error: "Invalid participantId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller has access to this proposal
    const { data: hasAccess, error: accessError } = await supabase.rpc(
      "has_any_proposal_role",
      { _user_id: callerId, _proposal_id: proposalId }
    );
    if (accessError || !hasAccess) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    // Fetch proposal info
    const { data: proposal, error: proposalError } = await supabase
      .from("proposals")
      .select("title, acronym, ocd_template_path")
      .eq("id", proposalId)
      .single();

    if (proposalError || !proposal) {
      return new Response(JSON.stringify({ error: "Proposal not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const templatePath = (proposal as any).ocd_template_path;
    if (!templatePath) {
      return new Response(JSON.stringify({ error: "No OCD template uploaded" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch participant info
    const { data: participant, error: participantError } = await supabase
      .from("participants")
      .select("organisation_name, organisation_short_name, pic_number, participant_number")
      .eq("id", participantId)
      .eq("proposal_id", proposalId)
      .single();

    if (participantError || !participant) {
      return new Response(JSON.stringify({ error: "Participant not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Download template from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("proposal-files")
      .download(templatePath);

    if (downloadError || !fileData) {
      return new Response(JSON.stringify({ error: "Failed to download template" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Read the RTF template as text
    const arrayBuffer = await fileData.arrayBuffer();
    let rtf = new TextDecoder("utf-8").decode(new Uint8Array(arrayBuffer));

    const projectTitle = proposal.title || "";
    const acronym = proposal.acronym || "";
    const legalName = (participant as any).organisation_name || "";
    const picNumber = (participant as any).pic_number || "";
    const shortName = (participant as any).organisation_short_name || "";

    // Replace placeholders and fill in the values next to their labels
    rtf = rtf.replace(/\[project title\]/gi, escapeRtf(projectTitle));
    rtf = rtf.replace(/\[acronym\]/gi, escapeRtf(acronym));
    rtf = rtf.replace(/\[legal name\]/gi, escapeRtf(legalName));
    rtf = rtf.replace(/\[pic\]/gi, escapeRtf(picNumber));
    rtf = fillAfterLabel(rtf, "Legal name:", legalName);
    rtf = fillAfterLabel(rtf, "PIC:", picNumber);

    const outBytes = new TextEncoder().encode(rtf);

    // Convert to base64
    let binary = "";
    for (let i = 0; i < outBytes.length; i++) {
      binary += String.fromCharCode(outBytes[i]);
    }
    const fileBase64 = btoa(binary);

    const filename = `OCD_${shortName || legalName.substring(0, 20)}_${acronym}.rtf`
      .replace(/[^a-zA-Z0-9._-]/g, "_");

    return new Response(
      JSON.stringify({ fileBase64, filename }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("OCD prefill error:", err);
    return new Response(JSON.stringify({ error: "An internal error occurred" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
