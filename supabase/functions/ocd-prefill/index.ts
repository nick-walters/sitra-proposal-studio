import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Attempt to inject a value into the table cell adjacent to a label cell.
 * Works for standard EC OCD template format where label and value are in
 * adjacent table cells (possibly spanning multiple columns via gridSpan).
 */
function injectCellValue(xml: string, labelText: string, value: string): string {
  const labelIdx = xml.indexOf(labelText);
  if (labelIdx === -1) return xml;

  // Find end of current cell
  const cellEnd = xml.indexOf("</w:tc>", labelIdx);
  if (cellEnd === -1) return xml;

  // Find the next cell
  const nextCell = xml.indexOf("<w:tc>", cellEnd);
  const nextCellAlt = xml.indexOf("<w:tc ", cellEnd); // cell with attributes
  let nextCellPos = -1;

  if (nextCell === -1 && nextCellAlt === -1) return xml;
  if (nextCell === -1) nextCellPos = nextCellAlt;
  else if (nextCellAlt === -1) nextCellPos = nextCell;
  else nextCellPos = Math.min(nextCell, nextCellAlt);

  // Ensure this is within the same row
  const rowEnd = xml.indexOf("</w:tr>", labelIdx);
  if (rowEnd !== -1 && nextCellPos > rowEnd) return xml;

  // Find the last </w:p> in this cell to insert before it
  const nextCellEnd = xml.indexOf("</w:tc>", nextCellPos);
  if (nextCellEnd === -1) return xml;

  const cellContent = xml.substring(nextCellPos, nextCellEnd);
  const lastPEnd = cellContent.lastIndexOf("</w:p>");
  if (lastPEnd === -1) return xml;

  const insertPos = nextCellPos + lastPEnd;
  const run = `<w:r><w:t>${escapeXml(value)}</w:t></w:r>`;
  return xml.substring(0, insertPos) + run + xml.substring(insertPos);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { proposalId, participantId } = await req.json();

    if (!proposalId || !participantId) {
      return new Response(JSON.stringify({ error: "Missing proposalId or participantId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

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

    // Open the docx (which is a zip file)
    const arrayBuffer = await fileData.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    // Get document.xml
    const docXmlFile = zip.file("word/document.xml");
    if (!docXmlFile) {
      return new Response(JSON.stringify({ error: "Invalid docx file" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let xml = await docXmlFile.async("string");

    const projectTitle = proposal.title || "";
    const acronym = proposal.acronym || "";
    const legalName = (participant as any).organisation_name || "";
    const picNumber = (participant as any).pic_number || "";
    const shortName = (participant as any).organisation_short_name || "";

    // Replace placeholder text [project title] and [acronym]
    xml = xml.replace(/\[project title\]/gi, escapeXml(projectTitle));
    xml = xml.replace(/\[acronym\]/gi, escapeXml(acronym));

    // Try to inject Legal name and PIC into adjacent cells
    xml = injectCellValue(xml, "Legal name:", legalName);
    xml = injectCellValue(xml, "PIC:", picNumber);

    // Save modified XML back
    zip.file("word/document.xml", xml);

    // Generate the modified docx
    const modifiedDocx = await zip.generateAsync({ type: "uint8array" });

    // Convert to base64
    let binary = "";
    for (let i = 0; i < modifiedDocx.length; i++) {
      binary += String.fromCharCode(modifiedDocx[i]);
    }
    const fileBase64 = btoa(binary);

    const filename = `OCD_${shortName || legalName.substring(0, 20)}_${acronym}.docx`
      .replace(/[^a-zA-Z0-9._-]/g, "_");

    return new Response(
      JSON.stringify({ fileBase64, filename }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("OCD prefill error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
