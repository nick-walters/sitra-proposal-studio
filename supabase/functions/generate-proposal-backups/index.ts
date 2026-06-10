// Daily backup engine for proposals.
// Triggered hourly by pg_cron; self-gates to 06:00 Europe/Helsinki (handles EET/EEST).
// For every active proposal it writes plain-text backups of:
//   - Part A1, A2, A4, A5 (text summaries)
//   - Part A3 (text budget summary — full Excel reuse pending refactor)
//   - Part B sections (latest version content, HTML stripped)
// Files land in the private `proposal-backups` bucket and (when configured)
// are also pushed to SharePoint via the Microsoft SharePoint connector gateway.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const SHAREPOINT_API_KEY = Deno.env.get("MICROSOFT_SHAREPOINT_API_KEY");
const GATEWAY = "https://connector-gateway.lovable.dev/microsoft_sharepoint";

// ---------- helpers ----------

function helsinkiHour(now: Date): number {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Helsinki",
    hour: "2-digit",
    hour12: false,
  });
  return parseInt(fmt.format(now), 10);
}

function helsinkiStamp(now: Date): string {
  // YYYY-MM-DD HH-MM-SS in Europe/Helsinki time
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Helsinki",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}-${get("minute")}-${get("second")}`;
}

function safeAcronym(a: string | null | undefined): string {
  return (a || "Proposal").replace(/[^A-Za-z0-9 _-]/g, "_").trim() || "Proposal";
}

// Minimal HTML → plain text converter (no external deps).
// Preserves: headings as "# ...", lists as "- ...", table rows tab-separated,
// br/p as line breaks, cross-ref badges as their visible text.
function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  let s = String(html);
  // Normalise.
  s = s.replace(/\r\n?/g, "\n");
  // Headings.
  s = s.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_m, c) => `\n\n# ${strip(c)}\n`);
  s = s.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_m, c) => `\n\n## ${strip(c)}\n`);
  s = s.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_m, c) => `\n\n### ${strip(c)}\n`);
  s = s.replace(/<h[4-6][^>]*>([\s\S]*?)<\/h[4-6]>/gi, (_m, c) => `\n\n#### ${strip(c)}\n`);
  // Lists.
  s = s.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, c) => `- ${strip(c)}\n`);
  // Tables → tab-separated rows.
  s = s.replace(/<tr[^>]*>([\s\S]*?)<\/tr>/gi, (_m, row) => {
    const cells: string[] = [];
    row.replace(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi, (_x: string, c: string) => {
      cells.push(strip(c));
      return "";
    });
    return cells.join("\t") + "\n";
  });
  // Paragraphs and line breaks.
  s = s.replace(/<\/(p|div|section|article)\s*>/gi, "\n");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  // Drop remaining tags.
  s = s.replace(/<[^>]+>/g, "");
  // Decode common entities.
  s = s.replace(/&nbsp;/g, " ")
       .replace(/&amp;/g, "&")
       .replace(/&lt;/g, "<")
       .replace(/&gt;/g, ">")
       .replace(/&quot;/g, '"')
       .replace(/&#39;|&apos;/g, "'");
  // Collapse runs of blank lines.
  s = s.replace(/\n{3,}/g, "\n\n").trim();
  return s + "\n";
}

function strip(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function eur(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(Number(n))) return "0.00";
  return Number(n).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ---------- file builders ----------

async function buildPartA1(supabase: any, proposal: any): Promise<string> {
  const lines: string[] = [];
  lines.push(`# Part A1 — General information`);
  lines.push(``);
  lines.push(`Acronym\t${proposal.acronym ?? ""}`);
  lines.push(`Title\t${proposal.title ?? ""}`);
  lines.push(`Type\t${proposal.type ?? ""}`);
  lines.push(`Budget type\t${proposal.budget_type ?? ""}`);
  lines.push(`Submission stage\t${proposal.submission_stage ?? ""}`);
  lines.push(`Work programme\t${proposal.work_programme ?? ""}`);
  lines.push(`Destination\t${proposal.destination ?? ""}`);
  lines.push(`Topic URL\t${proposal.topic_url ?? ""}`);
  lines.push(`Deadline\t${proposal.deadline ?? ""}`);
  lines.push(`Status\t${proposal.status ?? ""}`);
  lines.push(`Duration (months)\t${proposal.duration_months ?? ""}`);
  lines.push(`Uses FSTP\t${proposal.uses_fstp ? "Yes" : "No"}`);

  const { data: partA } = await supabase
    .from("part_a_data")
    .select("*")
    .eq("proposal_id", proposal.id)
    .maybeSingle();
  if (partA) {
    lines.push(``);
    lines.push(`## Additional A1 fields`);
    for (const [k, v] of Object.entries(partA)) {
      if (["id", "proposal_id", "created_at", "updated_at"].includes(k)) continue;
      if (v === null || v === "" || v === undefined) continue;
      lines.push(`${k}\t${typeof v === "object" ? JSON.stringify(v) : v}`);
    }
  }
  return lines.join("\n") + "\n";
}

async function buildPartA2(supabase: any, proposal: any): Promise<string> {
  const { data: participants } = await supabase
    .from("participants")
    .select("*")
    .eq("proposal_id", proposal.id)
    .order("participant_number", { ascending: true });

  const lines: string[] = [];
  lines.push(`# Part A2 — Participants`);
  for (const p of participants ?? []) {
    lines.push(``);
    lines.push(`## P${p.participant_number} ${p.organisation_short_name ?? ""} — ${p.organisation_name ?? ""}`);
    const fields: [string, any][] = [
      ["English name", p.english_name],
      ["PIC", p.pic_number],
      ["Country", p.country],
      ["Legal entity type", p.legal_entity_type],
      ["Organisation category", p.organisation_category],
      ["Organisation type", p.organisation_type],
      ["SME", p.is_sme ? "Yes" : "No"],
      ["Street", p.street],
      ["Postcode", p.postcode],
      ["Town", p.town],
      ["Website", p.website],
    ];
    for (const [k, v] of fields) if (v) lines.push(`${k}\t${v}`);

    // Departments
    const { data: deps } = await supabase
      .from("participant_departments").select("*").eq("participant_id", p.id)
      .order("order_index", { ascending: true });
    if (deps?.length) {
      lines.push(`### Departments`);
      for (const d of deps) lines.push(`- ${d.department_name}${d.same_as_organisation ? " (same as organisation)" : ""}`);
    }

    // Key researchers
    const { data: researchers } = await supabase
      .from("participant_researchers").select("*").eq("participant_id", p.id);
    if (researchers?.length) {
      lines.push(`### Key researchers`);
      for (const r of researchers) {
        lines.push(`- ${r.full_name ?? ""}${r.role ? ` — ${r.role}` : ""}${r.orcid ? ` (ORCID: ${r.orcid})` : ""}`);
      }
    }
  }
  return lines.join("\n") + "\n";
}

async function buildPartA3(supabase: any, proposal: any): Promise<string> {
  const { data: participants } = await supabase
    .from("participants").select("id, participant_number, organisation_short_name")
    .eq("proposal_id", proposal.id)
    .order("participant_number", { ascending: true });
  const { data: rows } = await supabase
    .from("budget_rows").select("*").eq("proposal_id", proposal.id);

  const lines: string[] = [];
  lines.push(`# Part A3 — Budget summary`);
  lines.push(``);
  lines.push(`NOTE: This is a plain-text summary backup. The full Excel export (with per-participant detailed sheets) remains available in the live A3 portal. A future update will bundle the full .xlsx here as well.`);
  lines.push(``);
  lines.push(`Participant\tPersonnel\tSubcontracting\tEquipment\tOther goods/services/works\tIndirect costs\tTotal\tRequested EU`);

  const byPart = new Map<string, any>();
  for (const r of rows ?? []) {
    byPart.set(r.participant_id, r);
  }
  let grand = { p: 0, s: 0, e: 0, o: 0, i: 0, t: 0, req: 0 };
  for (const p of participants ?? []) {
    const r = byPart.get(p.id) ?? {};
    const personnel = Number(r.personnel_total ?? r.personnel ?? 0);
    const subcontract = Number(r.subcontracting_total ?? r.subcontracting ?? 0);
    const equipment = Number(r.equipment_total ?? r.equipment ?? 0);
    const other = Number(r.other_costs_total ?? r.other_costs ?? 0);
    const indirect = Number(r.indirect_costs ?? 0);
    const total = Number(r.total_costs ?? (personnel + subcontract + equipment + other + indirect));
    const req = Number(r.requested_contribution ?? r.eu_contribution ?? 0);
    lines.push(
      `P${p.participant_number} ${p.organisation_short_name ?? ""}\t${eur(personnel)}\t${eur(subcontract)}\t${eur(equipment)}\t${eur(other)}\t${eur(indirect)}\t${eur(total)}\t${eur(req)}`
    );
    grand.p += personnel; grand.s += subcontract; grand.e += equipment;
    grand.o += other; grand.i += indirect; grand.t += total; grand.req += req;
  }
  lines.push(
    `TOTAL\t${eur(grand.p)}\t${eur(grand.s)}\t${eur(grand.e)}\t${eur(grand.o)}\t${eur(grand.i)}\t${eur(grand.t)}\t${eur(grand.req)}`
  );
  return lines.join("\n") + "\n";
}

async function buildPartA4(supabase: any, proposal: any): Promise<string> {
  const { data: ethics } = await supabase
    .from("ethics_assessment").select("*").eq("proposal_id", proposal.id).maybeSingle();
  const lines: string[] = [`# Part A4 — Ethics & security`, ``];
  if (!ethics) { lines.push(`(no ethics data captured)`); return lines.join("\n") + "\n"; }
  for (const [k, v] of Object.entries(ethics)) {
    if (["id", "proposal_id", "created_at", "updated_at"].includes(k)) continue;
    if (v === null || v === "" || v === false || v === undefined) continue;
    lines.push(`${k}\t${typeof v === "object" ? JSON.stringify(v) : v}`);
  }
  return lines.join("\n") + "\n";
}

async function buildPartA5(supabase: any, proposal: any): Promise<string> {
  // A5 = OCDs (ownership/control declarations) and related per-participant uploads.
  const { data: uploads } = await supabase
    .from("participant_ocd_uploads").select("*, participants(participant_number, organisation_short_name)")
    .order("created_at", { ascending: true });
  const filtered = (uploads ?? []).filter((u: any) => u.participants);
  const lines: string[] = [`# Part A5 — Ownership control declarations`, ``];
  if (!filtered.length) { lines.push(`(no OCDs uploaded)`); return lines.join("\n") + "\n"; }
  for (const u of filtered) {
    const p = u.participants;
    lines.push(`P${p.participant_number} ${p.organisation_short_name ?? ""}\t${u.file_name ?? ""}\t${u.created_at ?? ""}`);
  }
  return lines.join("\n") + "\n";
}

async function buildPartBSections(supabase: any, proposal: any): Promise<{ name: string; content: string }[]> {
  // Latest version per Part B section.
  const { data: rows } = await supabase.rpc("get_latest_part_b_sections", {
    p_proposal_id: proposal.id,
  }).then((r: any) => r).catch(() => ({ data: null }));

  let sections: { section_id: string; content: string }[] = [];
  if (rows && Array.isArray(rows)) {
    sections = rows;
  } else {
    // Fallback: query directly using window function pattern via a simple raw query is not available.
    // Fetch all then dedupe to latest per section_id in JS.
    const { data: all } = await supabase
      .from("section_versions")
      .select("section_id, content, version_number")
      .eq("proposal_id", proposal.id)
      .like("section_id", "b%");
    const latest = new Map<string, any>();
    for (const v of all ?? []) {
      const prev = latest.get(v.section_id);
      if (!prev || v.version_number > prev.version_number) latest.set(v.section_id, v);
    }
    sections = Array.from(latest.values()).map((v) => ({ section_id: v.section_id, content: v.content ?? "" }));
  }

  return sections.map((s) => ({
    name: s.section_id.toUpperCase().replace(/-/g, "."),
    content: `# Part ${s.section_id.toUpperCase().replace(/-/g, ".")}\n\n${htmlToText(s.content)}`,
  }));
}

// ---------- SharePoint upload ----------

async function pushToSharePoint(
  cfg: any,
  acronym: string,
  files: { name: string; bytes: Uint8Array; mime: string }[]
): Promise<{ status: "uploaded" | "failed" | "skipped"; path?: string; error?: string }> {
  if (!cfg?.enabled || !cfg.site_id || !cfg.root_folder_path) {
    return { status: "skipped" };
  }
  if (!LOVABLE_API_KEY || !SHAREPOINT_API_KEY) {
    return { status: "skipped", error: "SharePoint connector not linked" };
  }
  try {
    const folder = cfg.per_proposal_subfolder
      ? `${cfg.root_folder_path}/${acronym} Proposal Backup`
      : cfg.root_folder_path;
    // Best-effort create folder (ignore failure).
    try {
      await fetch(
        `${GATEWAY}/sites/${cfg.site_id}/drive/root:/${encodeURI(folder)}:/children`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${LOVABLE_API_KEY}`,
            "X-Connection-Api-Key": SHAREPOINT_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: folder.split("/").pop(),
            folder: {},
            "@microsoft.graph.conflictBehavior": "replace",
          }),
        }
      ).then((r) => r.text());
    } catch (_) { /* ignore */ }

    for (const f of files) {
      const url = `${GATEWAY}/sites/${cfg.site_id}/drive/root:/${encodeURI(folder)}/${encodeURIComponent(f.name)}:/content`;
      const res = await fetch(url, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": SHAREPOINT_API_KEY,
          "Content-Type": f.mime,
        },
        body: f.bytes,
      });
      if (!res.ok) {
        const body = await res.text();
        return { status: "failed", error: `${res.status}: ${body.slice(0, 300)}` };
      }
      await res.text();
    }
    return { status: "uploaded", path: folder };
  } catch (e) {
    return { status: "failed", error: (e as Error).message };
  }
}

// ---------- main ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const now = new Date();
  const force = new URL(req.url).searchParams.get("force") === "1";
  const helsinkiH = helsinkiHour(now);
  if (!force && helsinkiH !== 6) {
    return new Response(
      JSON.stringify({ skipped: true, helsinki_hour: helsinkiH }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const stamp = helsinkiStamp(now);

  // SharePoint config (single global row).
  const { data: cfg } = await supabase
    .from("sharepoint_backup_config").select("*").maybeSingle();

  // Active proposals = anything not archived.
  const { data: proposals, error: pErr } = await supabase
    .from("proposals").select("*")
    .neq("status", "archived");
  if (pErr) {
    return new Response(JSON.stringify({ error: pErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: any[] = [];
  for (const proposal of proposals ?? []) {
    const acr = safeAcronym(proposal.acronym);
    try {
      const enc = new TextEncoder();
      const files: { name: string; bytes: Uint8Array; mime: string }[] = [];

      const a1 = await buildPartA1(supabase, proposal);
      files.push({ name: `${acr} Part A1 ${stamp}.txt`, bytes: enc.encode(a1), mime: "text/plain" });
      const a2 = await buildPartA2(supabase, proposal);
      files.push({ name: `${acr} Part A2 ${stamp}.txt`, bytes: enc.encode(a2), mime: "text/plain" });
      const a3 = await buildPartA3(supabase, proposal);
      files.push({ name: `${acr} Part A3 ${stamp}.txt`, bytes: enc.encode(a3), mime: "text/plain" });
      const a4 = await buildPartA4(supabase, proposal);
      files.push({ name: `${acr} Part A4 ${stamp}.txt`, bytes: enc.encode(a4), mime: "text/plain" });
      const a5 = await buildPartA5(supabase, proposal);
      files.push({ name: `${acr} Part A5 ${stamp}.txt`, bytes: enc.encode(a5), mime: "text/plain" });

      const bSections = await buildPartBSections(supabase, proposal);
      for (const s of bSections) {
        files.push({
          name: `${acr} Part ${s.name} ${stamp}.txt`,
          bytes: enc.encode(s.content),
          mime: "text/plain",
        });
      }

      // Upload to bucket.
      const bucketPaths: string[] = [];
      let totalBytes = 0;
      for (const f of files) {
        const path = `${proposal.id}/${stamp}/${f.name}`;
        const { error: upErr } = await supabase.storage
          .from("proposal-backups").upload(path, f.bytes, {
            contentType: f.mime, upsert: true,
          });
        if (upErr) throw upErr;
        bucketPaths.push(path);
        totalBytes += f.bytes.length;
      }

      // SharePoint push.
      const sp = await pushToSharePoint(cfg, acr, files);

      const { error: insErr } = await supabase.from("proposal_backups").insert({
        proposal_id: proposal.id,
        backup_timestamp: now.toISOString(),
        sharepoint_status: sp.status,
        sharepoint_path: sp.path ?? null,
        bucket_paths: bucketPaths,
        size_bytes: totalBytes,
        error: sp.error ?? null,
      });
      if (insErr) throw insErr;

      results.push({ proposal_id: proposal.id, acronym: acr, files: files.length, bytes: totalBytes, sharepoint: sp.status });
    } catch (e) {
      results.push({ proposal_id: proposal.id, acronym: acr, error: (e as Error).message });
      await supabase.from("proposal_backups").insert({
        proposal_id: proposal.id,
        backup_timestamp: now.toISOString(),
        sharepoint_status: "failed",
        bucket_paths: [],
        size_bytes: 0,
        error: (e as Error).message,
      });
    }
  }

  // Cleanup: delete rows + objects older than 90 days.
  try {
    const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: old } = await supabase
      .from("proposal_backups").select("id, bucket_paths").lt("backup_timestamp", cutoff);
    if (old?.length) {
      const allPaths = old.flatMap((r: any) => (r.bucket_paths ?? []) as string[]);
      if (allPaths.length) {
        // Batch removes in chunks of 100.
        for (let i = 0; i < allPaths.length; i += 100) {
          await supabase.storage.from("proposal-backups").remove(allPaths.slice(i, i + 100));
        }
      }
      await supabase.from("proposal_backups").delete().in("id", old.map((r: any) => r.id));
    }
  } catch (e) {
    console.warn("cleanup failed", e);
  }

  return new Response(JSON.stringify({ ran_at: now.toISOString(), helsinki_stamp: stamp, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
