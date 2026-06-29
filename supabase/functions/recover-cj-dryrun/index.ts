// Dry-run cost justification recovery: downloads backup files, parses, returns JSON report.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import JSZip from "https://esm.sh/jszip@3.10.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const PROPOSALS = [
  { id: "dd66432e-dccb-4303-9db3-dcba9e16bfc9", acronym: "ADDGenAI", folder: "dd66432e-dccb-4303-9db3-dcba9e16bfc9/2026-06-26 06-00-09" },
  { id: "af325ea2-ae8c-4f59-8625-283d5437efba", acronym: "SUSIE-Q", folder: "af325ea2-ae8c-4f59-8625-283d5437efba/2026-06-26 06-00-09" },
];

async function dl(path: string) {
  const { data, error } = await supa.storage.from("proposal-backups").download(path);
  if (error) throw new Error(`${path}: ${error.message}`);
  return new Uint8Array(await data.arrayBuffer());
}

// crude XML helpers
function stripTags(s: string) { return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(); }
function decode(s: string) {
  return s.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#x?\w+;/g, m => {
    const n = m.startsWith("&#x") ? parseInt(m.slice(3,-1),16) : parseInt(m.slice(2,-1),10);
    return isNaN(n) ? m : String.fromCharCode(n);
  });
}

// Extract all <w:tbl>...</w:tbl> blocks AND surrounding paragraph text (for captions)
function parseDocxBody(xml: string) {
  // Split by paragraphs and tables, keeping order
  const parts: { type: "p" | "t"; xml: string }[] = [];
  const re = /<w:p\b[\s\S]*?<\/w:p>|<w:tbl\b[\s\S]*?<\/w:tbl>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    parts.push({ type: m[0].startsWith("<w:p") ? "p" : "t", xml: m[0] });
  }
  return parts;
}
function tableToRows(tblXml: string): string[][] {
  const rows: string[][] = [];
  const rowRe = /<w:tr\b[\s\S]*?<\/w:tr>/g;
  let rm;
  while ((rm = rowRe.exec(tblXml)) !== null) {
    const cells: string[] = [];
    const cellRe = /<w:tc\b[\s\S]*?<\/w:tc>/g;
    let cm;
    while ((cm = cellRe.exec(rm[0])) !== null) {
      // collect text from <w:t> only (not <w:tcPr> etc.)
      const text = [...cm[0].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(x => decode(x[1])).join("");
      // paragraph breaks
      const paraJoined = cm[0].split(/<w:p\b[^>]*>/).map(seg => {
        return [...seg.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(x => decode(x[1])).join("");
      }).filter(Boolean).join("\n").trim();
      cells.push(paraJoined || text.trim());
    }
    rows.push(cells);
  }
  return rows;
}

async function parseB31(zipBytes: Uint8Array) {
  const zip = await JSZip.loadAsync(zipBytes);
  const doc = await zip.file("word/document.xml")!.async("string");
  const parts = parseDocxBody(doc);
  // find tables 3.1.g and 3.1.h via preceding caption (search backwards)
  const result: { g?: string[][]; h?: string[][] } = {};
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].type !== "t") continue;
    // look at preceding ~6 paragraphs for "Table 3.1.g" or "Table 3.1.h"
    let label = "";
    for (let j = i - 1; j >= Math.max(0, i - 8); j--) {
      if (parts[j].type !== "p") continue;
      const t = stripTags(parts[j].xml).toLowerCase();
      if (t.includes("table 3.1.g") || t.includes("table 3.1.h")) { label = t.includes("3.1.g") ? "g" : "h"; break; }
    }
    if (!label) {
      // also check FOLLOWING paragraph (caption may follow table)
      for (let j = i + 1; j <= Math.min(parts.length - 1, i + 4); j++) {
        if (parts[j].type !== "p") continue;
        const t = stripTags(parts[j].xml).toLowerCase();
        if (t.includes("table 3.1.g") || t.includes("table 3.1.h")) { label = t.includes("3.1.g") ? "g" : "h"; break; }
      }
    }
    if (label === "g") result.g = tableToRows(parts[i].xml);
    if (label === "h") result.h = tableToRows(parts[i].xml);
  }
  return result;
}

// Parse xlsx: find comments per sheet, return {sheetName: {cellRef: text}}
async function parseXlsxComments(zipBytes: Uint8Array) {
  const zip = await JSZip.loadAsync(zipBytes);
  // workbook.xml -> sheet name->id
  const wb = await zip.file("xl/workbook.xml")!.async("string");
  const sheets: { name: string; rId: string; sheetId: string }[] = [];
  for (const m of wb.matchAll(/<sheet [^>]*name="([^"]+)"[^>]*sheetId="(\d+)"[^>]*r:id="([^"]+)"/g)) {
    sheets.push({ name: decode(m[1]), sheetId: m[2], rId: m[3] });
  }
  const rels = await zip.file("xl/_rels/workbook.xml.rels")!.async("string");
  const relMap: Record<string,string> = {};
  for (const m of rels.matchAll(/<Relationship [^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) relMap[m[1]] = m[2];

  // For each sheet, look at its rels for comments file
  const result: Record<string, { values: Record<string,string>; comments: Record<string,string>; rows: Record<number, Record<string,string>> }> = {};
  // shared strings
  let sst: string[] = [];
  const sstFile = zip.file("xl/sharedStrings.xml");
  if (sstFile) {
    const sx = await sstFile.async("string");
    sst = [...sx.matchAll(/<si\b[\s\S]*?<\/si>/g)].map(m => {
      const tparts = [...m[0].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => decode(x[1]));
      return tparts.join("");
    });
  }

  for (const sh of sheets) {
    const target = relMap[sh.rId]; // e.g. worksheets/sheet1.xml
    const sheetPath = "xl/" + target;
    const sheetXml = await zip.file(sheetPath)!.async("string");
    // values
    const cells: Record<string,string> = {};
    const rows: Record<number, Record<string,string>> = {};
    for (const cm of sheetXml.matchAll(/<c r="([A-Z]+)(\d+)"([^/>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const col = cm[1], row = parseInt(cm[2]), attrs = cm[3] || "", body = cm[4] || "";
      const typeMatch = attrs.match(/t="([^"]+)"/);
      const t = typeMatch ? typeMatch[1] : "n";
      const vMatch = body.match(/<v>([\s\S]*?)<\/v>/);
      const isMatch = body.match(/<is>([\s\S]*?)<\/is>/);
      let val = "";
      if (vMatch) {
        val = vMatch[1];
        if (t === "s") val = sst[parseInt(val)] || "";
      } else if (isMatch) {
        val = [...isMatch[0].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => decode(x[1])).join("");
      }
      cells[`${col}${row}`] = val;
      if (!rows[row]) rows[row] = {};
      rows[row][col] = val;
    }
    // comments
    const sheetRelsPath = sheetPath.replace(/([^/]+)$/, "_rels/$1.rels");
    const sheetRelsFile = zip.file(sheetRelsPath);
    const comments: Record<string,string> = {};
    if (sheetRelsFile) {
      const srx = await sheetRelsFile.async("string");
      const commentsRel = [...srx.matchAll(/<Relationship [^>]*Target="([^"]*comments\d+\.xml)"/g)][0];
      if (commentsRel) {
        const cpath = "xl/" + commentsRel[1].replace(/^\.\.\//, "");
        const cxml = await zip.file(cpath)!.async("string");
        for (const cm of cxml.matchAll(/<comment ref="([^"]+)"[^>]*>([\s\S]*?)<\/comment>/g)) {
          const txt = [...cm[2].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => decode(x[1])).join("");
          comments[cm[1]] = txt.trim();
        }
      }
    }
    result[sh.name] = { values: cells, comments, rows };
  }
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const report: any = { proposals: [] };
    for (const p of PROPOSALS) {
      const entry: any = { proposal: p.acronym, proposal_id: p.id, snapshot: p.folder, files_used: [], parsed: {} };
      // B3.1 docx
      const b31path = `${p.folder}/${p.acronym} Part B3.1 2026-06-26 06-00-09.docx`;
      try {
        const b31 = await dl(b31path);
        entry.files_used.push({ path: b31path, size: b31.length });
        entry.parsed.b31 = await parseB31(b31);
      } catch (e) { entry.parsed.b31_error = String(e); }
      // A3 xlsx
      const a3path = `${p.folder}/${p.acronym} Part A3 2026-06-26 06-00-09.xlsx`;
      try {
        const a3 = await dl(a3path);
        entry.files_used.push({ path: a3path, size: a3.length });
        entry.parsed.a3 = await parseXlsxComments(a3);
      } catch (e) { entry.parsed.a3_error = String(e); }

      // Resolve participants + budget_rows
      const { data: parts } = await supa.from("participants").select("id,participant_number,organisation_short_name,organisation_name,english_name").eq("proposal_id", p.id).order("participant_number");
      const { data: brows } = await supa.from("budget_rows").select("id,participant_id,subcontracting,purchase_travel,purchase_equipment,purchase_other_goods").eq("proposal_id", p.id);
      entry.participants = parts;
      entry.budget_rows = brows;
      report.proposals.push(entry);
    }
    return new Response(JSON.stringify(report, null, 2), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e), stack: (e as any).stack }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
