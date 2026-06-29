// Returns per-proposal map: participant_number -> { subcontracting, travel, other_goods } full text from A3 xlsx comments.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import JSZip from "https://esm.sh/jszip@3.10.1";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const PROPOSALS = [
  { id: "dd66432e-dccb-4303-9db3-dcba9e16bfc9", acronym: "ADDGenAI" },
  { id: "af325ea2-ae8c-4f59-8625-283d5437efba", acronym: "SUSIE-Q" },
];
const FOLDER_TS = "2026-06-26 06-00-09";

function decode(s: string) {
  return s.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#x?\w+;/g, m => {
    const n = m.startsWith("&#x") ? parseInt(m.slice(3,-1),16) : parseInt(m.slice(2,-1),10);
    return isNaN(n) ? m : String.fromCharCode(n);
  });
}

async function dl(path: string) {
  const { data, error } = await supa.storage.from("proposal-backups").download(path);
  if (error) throw new Error(`${path}: ${error.message}`);
  return new Uint8Array(await data.arrayBuffer());
}

async function parseXlsx(zipBytes: Uint8Array) {
  const zip = await JSZip.loadAsync(zipBytes);
  const wb = await zip.file("xl/workbook.xml")!.async("string");
  const sheets: { name: string; rId: string }[] = [];
  for (const m of wb.matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) sheets.push({ name: decode(m[1]), rId: m[2] });
  const rels = await zip.file("xl/_rels/workbook.xml.rels")!.async("string");
  const relMap: Record<string,string> = {};
  for (const m of rels.matchAll(/<Relationship [^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) relMap[m[1]] = m[2];
  let sst: string[] = [];
  const sstFile = zip.file("xl/sharedStrings.xml");
  if (sstFile) {
    const sx = await sstFile.async("string");
    sst = [...sx.matchAll(/<si\b[\s\S]*?<\/si>/g)].map(m => [...m[0].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(x => decode(x[1])).join(""));
  }
  const result: Record<string, { values: Record<string,string>; comments: Record<string,string> }> = {};
  for (const sh of sheets) {
    const target = relMap[sh.rId]; if (!target) continue;
    const sheetPath = "xl/" + target;
    const sheetXml = await zip.file(sheetPath)!.async("string");
    const cells: Record<string,string> = {};
    for (const cm of sheetXml.matchAll(/<c r="([A-Z]+\d+)"([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = cm[1], attrs = cm[2] || "", body = cm[3] || "";
      const t = (attrs.match(/t="([^"]+)"/) || [])[1] || "n";
      const v = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      const is = body.match(/<is>([\s\S]*?)<\/is>/);
      let val = "";
      if (v !== undefined) { val = v; if (t === "s") val = sst[parseInt(val)] || ""; }
      else if (is) val = [...is[0].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(x => decode(x[1])).join("");
      cells[ref] = val;
    }
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
          // Preserve paragraph breaks: each <r> in text often has its own run; join with newlines where <br/> or new <r> starts after newline
          const txt = [...cm[2].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(x => decode(x[1])).join("");
          comments[cm[1]] = txt.trim();
        }
      }
    }
    result[sh.name] = { values: cells, comments };
  }
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const out: any = {};
    for (const p of PROPOSALS) {
      const path = `${p.id}/${FOLDER_TS}/${p.acronym} Part A3 ${FOLDER_TS}.xlsx`;
      const bytes = await dl(path);
      const parsed = await parseXlsx(bytes);
      // Find the budget sheet — try first sheet that has comments in col E/F/H
      const sheets: any = {};
      for (const [name, sh] of Object.entries(parsed)) {
        sheets[name] = { comments: sh.comments, sampleA: Object.entries(sh.values).filter(([k]) => k.startsWith("A")).slice(0, 30) };
      }
      out[p.acronym] = { path, sheets };
    }
    return new Response(JSON.stringify(out, null, 2), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e), stack: (e as any).stack }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
