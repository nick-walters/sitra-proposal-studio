import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import JSZip from "https://esm.sh/jszip@3.10.1";
import { corsHeaders } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";




function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Find the text content of a label that may be split across multiple <w:r> runs
 * (e.g. bold formatting causes "Legal name:" to be in a separate run).
 * Returns the index in the XML where the label's containing <w:tc> ends,
 * or -1 if not found.
 */
function findLabelCellEnd(xml: string, labelText: string): number {
  // Strategy: strip all XML tags from segments to find the label text,
  // then locate its position in the original XML.
  
  // Try direct match first (unformatted text)
  const directIdx = xml.indexOf(labelText);
  if (directIdx !== -1) {
    const cellEnd = xml.indexOf("</w:tc>", directIdx);
    return cellEnd !== -1 ? cellEnd : -1;
  }

  // For formatted text (bold etc.), the label may be split across runs.
  // Search for the label by looking at <w:t> content within each <w:tc>.
  const cellRegex = /<w:tc[\s>]/g;
  let cellMatch;
  while ((cellMatch = cellRegex.exec(xml)) !== null) {
    const cellStart = cellMatch.index;
    const cellEnd = xml.indexOf("</w:tc>", cellStart);
    if (cellEnd === -1) continue;

    const cellXml = xml.substring(cellStart, cellEnd);
    
    // Extract all text content from <w:t> tags in this cell
    const textParts: string[] = [];
    const tRegex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
    let tMatch;
    while ((tMatch = tRegex.exec(cellXml)) !== null) {
      textParts.push(tMatch[1]);
    }
    
    const cellText = textParts.join("");
    if (cellText.includes(labelText)) {
      return cellEnd;
    }
  }

  return -1;
}

/**
 * Inject a value into the table cell adjacent to a label cell.
 * Handles labels that may be formatted (bold) and split across multiple runs.
 */
function injectCellValue(xml: string, labelText: string, value: string): string {
  const cellEnd = findLabelCellEnd(xml, labelText);
  if (cellEnd === -1) return xml;

  // Find the label cell's position for row boundary check
  const labelCellStart = xml.lastIndexOf("<w:tc", cellEnd);

  // Find the next cell after this one
  const afterCellEnd = cellEnd + "</w:tc>".length;
  const nextCell = xml.indexOf("<w:tc>", afterCellEnd);
  const nextCellAlt = xml.indexOf("<w:tc ", afterCellEnd);
  let nextCellPos = -1;

  if (nextCell === -1 && nextCellAlt === -1) return xml;
  if (nextCell === -1) nextCellPos = nextCellAlt;
  else if (nextCellAlt === -1) nextCellPos = nextCell;
  else nextCellPos = Math.min(nextCell, nextCellAlt);

  // Ensure within the same row
  const rowEnd = xml.indexOf("</w:tr>", labelCellStart);
  if (rowEnd !== -1 && nextCellPos > rowEnd) return xml;

  // Find the last </w:p> in the next cell to insert before it
  const nextCellEnd = xml.indexOf("</w:tc>", nextCellPos);
  if (nextCellEnd === -1) return xml;

  const cellContent = xml.substring(nextCellPos, nextCellEnd);
  const lastPEnd = cellContent.lastIndexOf("</w:p>");
  if (lastPEnd === -1) return xml;

  const insertPos = nextCellPos + lastPEnd;
  const run = `<w:r><w:rPr><w:b/></w:rPr><w:t>${escapeXml(value)}</w:t></w:r>`;
  return xml.substring(0, insertPos) + run + xml.substring(insertPos);
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
