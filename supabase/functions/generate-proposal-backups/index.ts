// Daily backup engine for proposals.
// Triggered hourly by pg_cron; self-gates to 06:00 Europe/Helsinki (handles EET/EEST)
// unless `force=1` (query) or body.trigger === "manual" / body.force === true is passed.
//
// For every proposal it writes a per-day folder containing:
//   - {ACR} Part A1 {stamp}.docx        general info
//   - {ACR} Part A2 {stamp}.docx        full participants (incl. departments, researchers, infra, etc.)
//   - {ACR} Part A3 {stamp}.xlsx        budget summary (single sheet — per-partner sheet refactor pending)
//   - {ACR} Part A4 {stamp}.docx        ethics checklist + details
//   - {ACR} Part A5 {stamp}.docx        ownership control declarations
//   - {ACR} Part B1.1 / B1.2 / B2.1 / B2.2 / B3.2 {stamp}.docx   latest section content
//   - {ACR} Part B3.1 {stamp}.docx      merged intro-text + b3-1 + compulsory tables
//   - {ACR} WP{N} Draft {stamp}.docx    one per wp_drafts row
//   - {ACR} Case {N} Draft {stamp}.docx one per case_drafts row
//
// Files are written to the private `proposal-backups` bucket and (when configured)
// pushed to SharePoint via the Microsoft SharePoint connector gateway.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
} from "npm:docx@9.5.0";
import * as XLSX from "npm:xlsx@0.18.5";
import { parse as parseHtml } from "npm:node-html-parser@6.1.13";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const SHAREPOINT_API_KEY = Deno.env.get("MICROSOFT_SHAREPOINT_API_KEY");
const GATEWAY = "https://connector-gateway.lovable.dev/microsoft_sharepoint";

// Canonical Part B sections that map to standalone files.
const PART_B_SECTIONS: { id: string; label: string }[] = [
  { id: "b1-1", label: "B1.1" },
  { id: "b1-2", label: "B1.2" },
  { id: "b2-1", label: "B2.1" },
  { id: "b2-2", label: "B2.2" },
  // b3-1 is handled specially (merged with intro + compulsory tables)
  { id: "b3-2", label: "B3.2" },
];

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

function eur(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(Number(n))) return "0.00";
  return Number(n).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function yn(v: boolean | null | undefined): string {
  if (v === true) return "Yes";
  if (v === false) return "No";
  return "—";
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

// Strip noise that would otherwise leak into the docx as literal text:
// <style>/<script> blocks, HTML comments, and stray Word/MSO conditional
// markup. Inline tag attributes are kept (parser ignores them anyway).
function cleanHtml(html: string | null | undefined): string {
  if (!html) return "";
  return String(html)
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<o:p\b[^>]*>[\s\S]*?<\/o:p>/gi, "")
    .replace(/<\/?o:[^>]+>/gi, "");
}

// Tags whose text content must NEVER be emitted as visible text.
const SKIP_TAGS = new Set(["style", "script", "noscript", "template", "head", "meta", "link"]);

// ---------- HTML → docx walker ----------

const THIN_BORDER = { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" };
const CELL_BORDERS = { top: THIN_BORDER, bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER };

function inlineRuns(node: any, parentBold = false, parentItalic = false, parentUnderline = false): TextRun[] {
  const runs: TextRun[] = [];
  if (!node) return runs;
  if (node.nodeType === 3) {
    const t = decodeEntities(String(node.rawText ?? node.text ?? "")).replace(/\s+/g, " ");
    if (t) runs.push(new TextRun({ text: t, bold: parentBold, italics: parentItalic, underline: parentUnderline ? {} : undefined }));
    return runs;
  }
  const tag = (node.tagName || "").toLowerCase();
  if (SKIP_TAGS.has(tag)) return runs;
  let bold = parentBold;
  let italic = parentItalic;
  let underline = parentUnderline;
  if (tag === "strong" || tag === "b") bold = true;
  if (tag === "em" || tag === "i") italic = true;
  if (tag === "u") underline = true;
  if (tag === "br") { runs.push(new TextRun({ text: "", break: 1 })); return runs; }
  for (const child of node.childNodes ?? []) {
    runs.push(...inlineRuns(child, bold, italic, underline));
  }
  return runs;
}

function cellContents(node: any): Paragraph[] {
  const out: Paragraph[] = [];
  let inlineBuffer: any[] = [];
  const flush = () => {
    if (!inlineBuffer.length) return;
    const runs = inlineBuffer.flatMap((n) => inlineRuns(n));
    if (runs.length) out.push(new Paragraph({ children: runs }));
    inlineBuffer = [];
  };
  for (const child of node.childNodes ?? []) {
    const ctag = (child.tagName || "").toLowerCase();
    if (SKIP_TAGS.has(ctag)) continue;
    if (["p", "div", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6", "table"].includes(ctag)) {
      flush();
      out.push(...blockToDocx(child));
    } else {
      inlineBuffer.push(child);
    }
  }
  flush();
  if (!out.length) out.push(new Paragraph({ children: [new TextRun("")] }));
  return out;
}

function blockToDocx(node: any): (Paragraph | Table)[] {
  const tag = (node.tagName || "").toLowerCase();
  const out: (Paragraph | Table)[] = [];
  if (tag === "h1" || tag === "h2" || tag === "h3" || tag === "h4" || tag === "h5" || tag === "h6") {
    const level = ({ h1: HeadingLevel.HEADING_1, h2: HeadingLevel.HEADING_2, h3: HeadingLevel.HEADING_3, h4: HeadingLevel.HEADING_4, h5: HeadingLevel.HEADING_5, h6: HeadingLevel.HEADING_6 } as any)[tag];
    out.push(new Paragraph({ heading: level, children: inlineRuns(node) }));
    return out;
  }
  if (tag === "ul" || tag === "ol") {
    for (const li of node.childNodes ?? []) {
      if ((li.tagName || "").toLowerCase() !== "li") continue;
      out.push(new Paragraph({
        bullet: tag === "ul" ? { level: 0 } : undefined,
        numbering: tag === "ol" ? { reference: "decimal-list", level: 0 } : undefined,
        children: inlineRuns(li),
      }));
    }
    return out;
  }
  if (tag === "table") {
    const rows: TableRow[] = [];
    const trs = node.querySelectorAll("tr") ?? [];
    for (const tr of trs) {
      const cells: TableCell[] = [];
      for (const td of tr.childNodes ?? []) {
        const ctag = (td.tagName || "").toLowerCase();
        if (ctag !== "td" && ctag !== "th") continue;
        cells.push(new TableCell({
          borders: CELL_BORDERS,
          margins: { top: 60, bottom: 60, left: 90, right: 90 },
          children: cellContents(td),
        }));
      }
      if (cells.length) rows.push(new TableRow({ children: cells }));
    }
    if (rows.length) {
      out.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows,
      }));
    }
    return out;
  }
  if (tag === "hr") {
    out.push(new Paragraph({ children: [new TextRun("———")] }));
    return out;
  }
  // p, div, blockquote, default
  const runs = inlineRuns(node);
  if (runs.length) {
    out.push(new Paragraph({ children: runs, alignment: AlignmentType.JUSTIFIED }));
  }
  // Recurse into nested blocks inside divs
  for (const child of node.childNodes ?? []) {
    const ctag = (child.tagName || "").toLowerCase();
    if (["table", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6"].includes(ctag)) {
      out.push(...blockToDocx(child));
    }
  }
  return out;
}

function htmlToDocxChildren(html: string | null | undefined): (Paragraph | Table)[] {
  const cleaned = cleanHtml(html);
  if (!cleaned || !cleaned.trim()) return [new Paragraph({ children: [new TextRun({ text: "(empty)", italics: true })] })];
  const root = parseHtml(cleaned, { lowerCaseTagName: true });
  const out: (Paragraph | Table)[] = [];
  let inlineBuffer: any[] = [];
  const flush = () => {
    if (!inlineBuffer.length) return;
    const runs = inlineBuffer.flatMap((n) => inlineRuns(n));
    if (runs.length) out.push(new Paragraph({ children: runs, alignment: AlignmentType.JUSTIFIED }));
    inlineBuffer = [];
  };
  for (const child of root.childNodes ?? []) {
    const tag = (child.tagName || "").toLowerCase();
    if (SKIP_TAGS.has(tag)) continue;
    if (["p", "div", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6", "table", "hr", "blockquote"].includes(tag)) {
      flush();
      out.push(...blockToDocx(child));
    } else {
      inlineBuffer.push(child);
    }
  }
  flush();
  if (!out.length) out.push(new Paragraph({ children: [new TextRun({ text: "(empty)", italics: true })] }));
  return out;
}

// ---------- docx assembly helpers ----------

function H(level: typeof HeadingLevel.HEADING_1, text: string): Paragraph {
  return new Paragraph({ heading: level, children: [new TextRun({ text })] });
}
function P(text: string, opts: { bold?: boolean; italics?: boolean } = {}): Paragraph {
  return new Paragraph({ children: [new TextRun({ text, bold: opts.bold, italics: opts.italics })] });
}
function KV(key: string, val: string | number | null | undefined): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: `${key}: `, bold: true }),
      new TextRun({ text: val === null || val === undefined || val === "" ? "—" : String(val) }),
    ],
  });
}
function simpleTable(headers: string[], rows: (string | number | null | undefined)[][]): Table {
  const headRow = new TableRow({
    tableHeader: true,
    children: headers.map((h) => new TableCell({
      borders: CELL_BORDERS,
      margins: { top: 60, bottom: 60, left: 90, right: 90 },
      shading: { fill: "EFEFEF", type: "clear", color: "auto" } as any,
      children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
    })),
  });
  const bodyRows = rows.map((r) => new TableRow({
    children: r.map((c) => new TableCell({
      borders: CELL_BORDERS,
      margins: { top: 60, bottom: 60, left: 90, right: 90 },
      children: [new Paragraph({ children: [new TextRun({ text: c === null || c === undefined ? "" : String(c) })] })],
    })),
  }));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headRow, ...bodyRows],
  });
}

async function packDocx(children: (Paragraph | Table)[]): Promise<Uint8Array> {
  const doc = new Document({
    numbering: {
      config: [{
        reference: "decimal-list",
        levels: [{ level: 0, format: "decimal" as any, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }],
      }],
    },
    styles: {
      default: { document: { run: { font: "Calibri", size: 22 } } },
    },
    sections: [{ children }],
  });
  const buf = await Packer.toBuffer(doc);
  return new Uint8Array(buf);
}

// ---------- data fetch ----------

async function latestSectionContent(supabase: any, proposalId: string, sectionId: string): Promise<string> {
  const { data } = await supabase
    .from("section_versions")
    .select("content, version_number")
    .eq("proposal_id", proposalId)
    .eq("section_id", sectionId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.content ?? "";
}

// ---------- Table 3.1.b–style WP description table (shared) ----------

interface WpTableTask {
  number: number | string;
  title?: string | null;
  leadLabel: string;
  participantsLabel: string;
  duration: string;
  description?: string | null;
}
interface WpTableOpts {
  wpNumber: number | string;
  shortName?: string | null;
  title?: string | null;
  leadLabel: string;
  duration?: string | null;
  objectives?: string | null;
  description?: string | null;
  methodology?: string | null;
  tasks: WpTableTask[];
  extras?: [string, string | null | undefined][];
}

function buildWpDescriptionTable(opts: WpTableOpts): Table {
  const SHADE = { fill: "E7E6E6", type: "clear", color: "auto" } as any;
  const SHADE_DARK = { fill: "BFBFBF", type: "clear", color: "auto" } as any;
  const cellOpts = (o: { span?: number; shading?: any } = {}) => ({
    borders: CELL_BORDERS,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    columnSpan: o.span,
    shading: o.shading,
  });
  const txtCell = (text: string, o: { span?: number; shading?: any; bold?: boolean } = {}) =>
    new TableCell({
      ...cellOpts(o),
      children: [new Paragraph({ children: [new TextRun({ text: text ?? "", bold: o.bold })] })],
    });
  const htmlCell = (html: string | null | undefined, o: { span?: number; shading?: any } = {}) =>
    new TableCell({ ...cellOpts(o), children: htmlToDocxChildren(html) as Paragraph[] });
  const kvCell = (label: string, value: string, o: { span?: number; shading?: any } = {}) =>
    new TableCell({
      ...cellOpts(o),
      children: [new Paragraph({ children: [
        new TextRun({ text: `${label}: `, bold: true }),
        new TextRun({ text: value }),
      ] })],
    });

  const rows: TableRow[] = [];
  const titleBits = `Work package ${opts.wpNumber}: ${opts.shortName ?? ""}${opts.title ? ` — ${opts.title}` : ""}`;
  rows.push(new TableRow({ children: [txtCell(titleBits, { span: 6, shading: SHADE_DARK, bold: true })] }));
  rows.push(new TableRow({
    children: [
      kvCell("Lead participant", opts.leadLabel, { span: 3 }),
      kvCell("Duration", opts.duration ? String(opts.duration) : "—", { span: 3 }),
    ],
  }));
  if (opts.objectives && String(opts.objectives).trim()) {
    rows.push(new TableRow({ children: [txtCell("Objectives", { span: 6, shading: SHADE, bold: true })] }));
    rows.push(new TableRow({ children: [htmlCell(opts.objectives, { span: 6 })] }));
  }
  if (opts.description && String(opts.description).trim()) {
    rows.push(new TableRow({ children: [txtCell("Description", { span: 6, shading: SHADE, bold: true })] }));
    rows.push(new TableRow({ children: [htmlCell(opts.description, { span: 6 })] }));
  }
  if (opts.methodology && String(opts.methodology).trim()) {
    rows.push(new TableRow({ children: [txtCell("Methodology", { span: 6, shading: SHADE, bold: true })] }));
    rows.push(new TableRow({ children: [htmlCell(opts.methodology, { span: 6 })] }));
  }
  for (const t of opts.tasks) {
    rows.push(new TableRow({
      children: [txtCell(`Task ${opts.wpNumber}.${t.number}: ${t.title ?? ""}`, { span: 6, shading: SHADE, bold: true })],
    }));
    rows.push(new TableRow({
      children: [
        kvCell("Task leader", t.leadLabel, { span: 2 }),
        kvCell("Participants", t.participantsLabel, { span: 2 }),
        kvCell("Duration", t.duration, { span: 2 }),
      ],
    }));
    if (t.description && String(t.description).trim()) {
      rows.push(new TableRow({ children: [htmlCell(t.description, { span: 6 })] }));
    }
  }
  for (const [label, value] of (opts.extras ?? [])) {
    if (!value || !String(value).trim()) continue;
    rows.push(new TableRow({ children: [txtCell(label, { span: 6, shading: SHADE, bold: true })] }));
    rows.push(new TableRow({ children: [htmlCell(value, { span: 6 })] }));
  }
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [1500, 1500, 1500, 1500, 1500, 1500],
    rows,
  });
}

function monthRange(s: any, e: any): string {
  if (s == null && e == null) return "—";
  if (s != null && e != null) return `M${s}–M${e}`;
  return s != null ? `M${s}` : `M${e}`;
}

// ---------- file builders ----------


async function buildA1(supabase: any, proposal: any): Promise<Uint8Array> {
  const children: (Paragraph | Table)[] = [
    H(HeadingLevel.HEADING_1, "Part A1 — General information"),
    KV("Acronym", proposal.acronym),
    KV("Title", proposal.title),
    KV("Type", proposal.type),
    KV("Budget type", proposal.budget_type),
    KV("Submission stage", proposal.submission_stage),
    KV("Work programme", proposal.work_programme),
    KV("Destination", proposal.destination),
    KV("Deadline", proposal.deadline),
    KV("Opening date", proposal.opening_date),
    KV("Status", proposal.status),
    KV("Duration (months)", proposal.duration),
    KV("Uses FSTP", yn(proposal.uses_fstp)),
    KV("Cases enabled", yn(proposal.cases_enabled)),
    KV("Indicative budget per project", proposal.indicative_budget_per_project),
    KV("FSTP budget", proposal.fstp_budget),
    KV("FSTP budget per third party", proposal.fstp_budget_per_third_party),
    KV("Total budget text", proposal.total_budget_text),
  ];
  return await packDocx(children);
}

async function buildA2(supabase: any, proposal: any): Promise<Uint8Array> {
  const { data: participants } = await supabase
    .from("participants").select("*").eq("proposal_id", proposal.id)
    .order("participant_number", { ascending: true });

  const children: (Paragraph | Table)[] = [H(HeadingLevel.HEADING_1, "Part A2 — Participants")];

  for (const p of participants ?? []) {
    children.push(H(HeadingLevel.HEADING_2, `P${p.participant_number ?? "?"} ${p.organisation_short_name ?? ""} — ${p.organisation_name ?? ""}`));
    children.push(KV("English name", p.english_name));
    children.push(KV("PIC", p.pic_number));
    children.push(KV("Country", p.country));
    children.push(KV("Legal entity type", p.legal_entity_type));
    children.push(KV("Organisation category", p.organisation_category));
    children.push(KV("Organisation type", p.organisation_type));
    children.push(KV("SME", yn(p.is_sme)));
    children.push(KV("Street", p.street));
    children.push(KV("Postcode", p.postcode));
    children.push(KV("Town", p.town));
    children.push(KV("Website", p.website));
    children.push(KV("Personnel cost rate (€)", p.personnel_cost_rate));
    children.push(KV("Has Gender Equality Plan", yn(p.has_gender_equality_plan)));
    children.push(KV("Dependency declaration", p.dependency_declaration));

    children.push(H(HeadingLevel.HEADING_3, "Main contact"));
    children.push(KV("Name", `${p.main_contact_title ?? ""} ${p.main_contact_first_name ?? ""} ${p.main_contact_last_name ?? ""}`.trim()));
    children.push(KV("Position", p.main_contact_position));
    children.push(KV("Gender", p.main_contact_gender));
    children.push(KV("Email", p.contact_email));
    children.push(KV("Phone", p.main_contact_phone));
    if (!p.use_organisation_address) {
      children.push(KV("Contact address", `${p.main_contact_street ?? ""}, ${p.main_contact_postcode ?? ""} ${p.main_contact_town ?? ""}, ${p.main_contact_country ?? ""}`));
    }

    const gep = [
      ["Publication", p.gep_publication],
      ["Dedicated resources", p.gep_dedicated_resources],
      ["Data collection", p.gep_data_collection],
      ["Training", p.gep_training],
      ["Work–life balance", p.gep_work_life_balance],
      ["Gender leadership", p.gep_gender_leadership],
      ["Recruitment & progression", p.gep_recruitment_progression],
      ["Research & teaching", p.gep_research_teaching],
      ["Gender violence", p.gep_gender_violence],
    ];
    if (gep.some(([_, v]) => v !== null && v !== undefined)) {
      children.push(H(HeadingLevel.HEADING_3, "Gender Equality Plan elements"));
      children.push(simpleTable(["Element", "Status"], gep.map(([k, v]) => [k as string, yn(v as boolean)])));
    }

    const [{ data: deps }, { data: researchers }, { data: infra }, { data: ach }, { data: depns }, { data: prev }, { data: mem }, { data: roles }, { data: padata }] = await Promise.all([
      supabase.from("participant_departments").select("*").eq("participant_id", p.id).order("order_index", { ascending: true }),
      supabase.from("participant_researchers").select("*").eq("participant_id", p.id),
      supabase.from("participant_infrastructure").select("*").eq("participant_id", p.id).order("order_index", { ascending: true }),
      supabase.from("participant_achievements").select("*").eq("participant_id", p.id).order("order_index", { ascending: true }),
      supabase.from("participant_dependencies").select("*, linked:linked_participant_id(organisation_short_name)").eq("participant_id", p.id),
      supabase.from("participant_previous_projects").select("*").eq("participant_id", p.id).order("order_index", { ascending: true }),
      supabase.from("participant_members").select("*").eq("participant_id", p.id),
      supabase.from("participant_organisation_roles").select("*").eq("participant_id", p.id),
      supabase.from("part_a_data").select("*").eq("participant_id", p.id).maybeSingle(),
    ]);

    if (deps?.length) {
      children.push(H(HeadingLevel.HEADING_3, "Departments"));
      for (const d of deps) {
        children.push(new Paragraph({ children: [new TextRun({ text: `• ${d.department_name}${d.same_as_organisation ? " (same as organisation)" : ""}` })] }));
      }
    }
    if (researchers?.length) {
      children.push(H(HeadingLevel.HEADING_3, "Key researchers"));
      children.push(simpleTable(
        ["Name", "Role", "ORCID"],
        researchers.map((r: any) => [r.full_name ?? "", r.role ?? "", r.orcid ?? ""]),
      ));
    }
    if (infra?.length) {
      children.push(H(HeadingLevel.HEADING_3, "Infrastructure"));
      children.push(simpleTable(["Name", "Description"], infra.map((i: any) => [i.name ?? "", i.description ?? ""])));
    }
    if (ach?.length) {
      children.push(H(HeadingLevel.HEADING_3, "Achievements"));
      children.push(simpleTable(["Type", "Description"], ach.map((a: any) => [a.achievement_type ?? "", a.description ?? ""])));
    }
    if (depns?.length) {
      children.push(H(HeadingLevel.HEADING_3, "Dependencies"));
      children.push(simpleTable(["Linked participant", "Type", "Notes"], depns.map((d: any) => [d.linked?.organisation_short_name ?? "—", d.link_type ?? "", d.notes ?? ""])));
    }
    if (prev?.length) {
      children.push(H(HeadingLevel.HEADING_3, "Previous projects"));
      children.push(simpleTable(["Project", "Description"], prev.map((x: any) => [x.project_name ?? "", x.description ?? ""])));
    }
    if (mem?.length) {
      children.push(H(HeadingLevel.HEADING_3, "Team members"));
      children.push(simpleTable(
        ["Name", "Role in project", "Email", "PM", "Primary contact"],
        mem.map((m: any) => [m.full_name ?? "", m.role_in_project ?? "", m.email ?? "", m.person_months ?? "", yn(m.is_primary_contact)]),
      ));
    }
    if (roles?.length) {
      children.push(H(HeadingLevel.HEADING_3, "Organisation roles"));
      for (const r of roles) {
        children.push(KV(r.role_type ?? "Role", r.description ?? ""));
      }
    }
    if (padata) {
      children.push(H(HeadingLevel.HEADING_3, "Part A free-text"));
      if (padata.dependencies) { children.push(P("Dependencies", { bold: true })); children.push(...htmlToDocxChildren(padata.dependencies)); }
      if (padata.resources) { children.push(P("Resources", { bold: true })); children.push(...htmlToDocxChildren(padata.resources)); }
      if (padata.previous_proposals) { children.push(P("Previous proposals", { bold: true })); children.push(...htmlToDocxChildren(padata.previous_proposals)); }
      if (padata.declarations) { children.push(P("Declarations", { bold: true })); children.push(...htmlToDocxChildren(padata.declarations)); }
    }
  }
  return await packDocx(children);
}

async function buildA3Xlsx(supabase: any, proposal: any): Promise<Uint8Array> {
  const { data: participants } = await supabase
    .from("participants").select("id, participant_number, organisation_short_name, organisation_name")
    .eq("proposal_id", proposal.id)
    .order("participant_number", { ascending: true });
  const parts = participants ?? [];

  const wb = XLSX.utils.book_new();

  // ─── Sheet 1: Staff Effort (WPs × Participants matrix, PMs) ───
  const { data: wps } = await supabase
    .from("wp_drafts").select("id, number, short_name").eq("proposal_id", proposal.id)
    .order("number", { ascending: true });
  const wpList = wps ?? [];
  const { data: effortRows } = await supabase
    .from("wp_draft_effort").select("wp_draft_id, participant_id, person_months")
    .in("wp_draft_id", wpList.map((w: any) => w.id).concat(["00000000-0000-0000-0000-000000000000"]));
  const effortMap = new Map<string, number>();
  for (const e of effortRows ?? []) effortMap.set(`${e.wp_draft_id}::${e.participant_id}`, Number(e.person_months ?? 0));

  const effortHeader = ["Participant", ...wpList.map((w: any) => `WP${w.number}${w.short_name ? ` ${w.short_name}` : ""}`), "Total PMs"];
  const effortData: any[][] = [effortHeader];
  const wpTotals = new Array(wpList.length).fill(0);
  for (const p of parts) {
    const row: any[] = [`P${p.participant_number} ${p.organisation_short_name ?? ""}`];
    let rowTotal = 0;
    wpList.forEach((w: any, i: number) => {
      const v = effortMap.get(`${w.id}::${p.id}`) ?? 0;
      row.push(v || 0);
      wpTotals[i] += v;
      rowTotal += v;
    });
    row.push(rowTotal);
    effortData.push(row);
  }
  effortData.push(["TOTAL", ...wpTotals, wpTotals.reduce((a, b) => a + b, 0)]);
  const wsEffort = XLSX.utils.aoa_to_sheet(effortData);
  wsEffort["!cols"] = effortHeader.map((h) => ({ wch: Math.max(10, h.length + 2) }));
  XLSX.utils.book_append_sheet(wb, wsEffort, "Staff Effort");

  // ─── Sheet 2: Budget Overview (per-participant totals) ───
  const { data: rows } = await supabase
    .from("budget_rows").select("*").eq("proposal_id", proposal.id);
  const byPart = new Map<string, any>();
  for (const r of rows ?? []) byPart.set(r.participant_id, r);

  const header = [
    "Participant #", "Short name", "Organisation",
    "Personnel", "Subcontracting", "Travel", "Equipment", "Other goods/services",
    "Internally invoiced", "FSTP", "Procurement", "Indirect costs (override)",
    "Funding rate override", "Income generated", "Financial contributions", "Own resources",
    "Requested EU contribution",
  ];
  const data: any[][] = [header];
  const totals = new Array(header.length - 3).fill(0);
  for (const p of parts) {
    const r = byPart.get(p.id) ?? {};
    const vals = [
      Number(r.personnel_costs ?? 0),
      Number(r.subcontracting_costs ?? 0),
      Number(r.purchase_travel ?? 0),
      Number(r.purchase_equipment ?? 0),
      Number(r.purchase_other_goods ?? 0),
      Number(r.internally_invoiced ?? 0),
      Number(r.financial_support_third_parties ?? 0),
      Number(r.procurement ?? 0),
      Number(r.indirect_costs_override ?? 0),
      r.funding_rate_override !== null && r.funding_rate_override !== undefined ? Number(r.funding_rate_override) : "",
      Number(r.income_generated ?? 0),
      Number(r.financial_contributions ?? 0),
      Number(r.own_resources ?? 0),
      Number(r.requested_eu_contribution ?? 0),
    ];
    data.push([p.participant_number, p.organisation_short_name ?? "", p.organisation_name ?? "", ...vals]);
    vals.forEach((v, i) => { if (typeof v === "number" && !isNaN(v)) totals[i] += v; });
  }
  data.push(["", "TOTAL", "", ...totals.map((t, i) => (i === 9 ? "" : t))]);
  const ws = XLSX.utils.aoa_to_sheet(data);
  const range = XLSX.utils.decode_range(ws["!ref"] as string);
  for (let R = 1; R <= range.e.r; R++) {
    for (let C = 3; C <= range.e.c; C++) {
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
      if (cell && typeof cell.v === "number") cell.z = "#,##0.00";
    }
  }
  ws["!cols"] = header.map((h) => ({ wch: Math.max(12, h.length + 2) }));
  XLSX.utils.book_append_sheet(wb, ws, "Budget Overview");

  // ─── Sheet 3: Cost justifications (if any) ───
  const { data: justs } = await supabase
    .from("budget_cost_justifications").select("*, participant:participant_id(organisation_short_name)").eq("proposal_id", proposal.id);
  if (justs?.length) {
    const j: any[][] = [["Participant", "Category", "Justification"]];
    for (const x of justs) j.push([x.participant?.organisation_short_name ?? "", x.category ?? "", x.justification ?? ""]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(j), "Cost justifications");
  }

  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Uint8Array(buf as ArrayBuffer);
}


// Group ethics_assessment fields into sections by prefix.
const ETHICS_SECTIONS: { title: string; prefix: string }[] = [
  { title: "Human embryonic stem cells & embryos", prefix: "human_embryonic" },
  { title: "Human embryonic stem cells (continued)", prefix: "hesc_" },
  { title: "Human embryos", prefix: "human_embryos" },
  { title: "Human participants", prefix: "human_participants" },
  { title: "Human volunteers", prefix: "human_volunteers" },
  { title: "Human patients & vulnerable", prefix: "human_patients" },
  { title: "Human vulnerable", prefix: "human_vulnerable" },
  { title: "Children & unable to consent", prefix: "human_children" },
  { title: "Unable to consent", prefix: "human_unable" },
  { title: "Human interventions", prefix: "human_interventions" },
  { title: "Invasive procedures", prefix: "human_invasive" },
  { title: "Human biological samples", prefix: "human_biological" },
  { title: "Clinical studies & trials", prefix: "clinical_" },
  { title: "Low intervention trials", prefix: "low_intervention" },
  { title: "Human cells / tissues", prefix: "human_cells" },
  { title: "Personal data", prefix: "personal_data" },
  { title: "Animals", prefix: "animals" },
  { title: "Third countries", prefix: "third_countries" },
  { title: "Environment & health", prefix: "environment" },
  { title: "Dual use", prefix: "dual_use" },
  { title: "Misuse", prefix: "misuse" },
  { title: "Other ethics", prefix: "other_ethics" },
  { title: "Security (EU classified / dual use / misuse / defence)", prefix: "security_" },
];

async function buildA4(supabase: any, proposal: any): Promise<Uint8Array> {
  const { data: ethics } = await supabase
    .from("ethics_assessment").select("*").eq("proposal_id", proposal.id).maybeSingle();
  const children: (Paragraph | Table)[] = [H(HeadingLevel.HEADING_1, "Part A4 — Ethics & security")];
  if (!ethics) {
    children.push(P("(no ethics data captured)", { italics: true }));
    return await packDocx(children);
  }

  // Build per-section tables of Item / Yes-No / Page.
  // The freeform "_details" fields are intentionally omitted — they belong in
  // the proposal text, not in the A4 backup summary.
  const entries = Object.entries(ethics).filter(([k]) => !["id", "proposal_id", "created_at", "updated_at"].includes(k));
  const used = new Set<string>();
  for (const sec of ETHICS_SECTIONS) {
    const matched = entries.filter(([k]) => k.startsWith(sec.prefix));
    if (!matched.length) continue;
    const rows: string[][] = [];
    const bools = matched.filter(([k]) => typeof ethics[k] === "boolean" || ethics[k] === null);
    for (const [k] of bools) {
      const base = k;
      const pageKey = `${base}_page`;
      const detailKey = `${base}_details`;
      // Skip rows with no answer AND no page reference (keeps the table compact).
      if ((ethics[base] === null || ethics[base] === undefined) && !ethics[pageKey]) {
        used.add(base); used.add(pageKey); used.add(detailKey);
        continue;
      }
      rows.push([
        base.replace(/_/g, " "),
        yn(ethics[base]),
        ethics[pageKey] ?? "",
      ]);
      used.add(base); used.add(pageKey); used.add(detailKey);
    }
    if (rows.length) {
      children.push(H(HeadingLevel.HEADING_2, sec.title));
      children.push(simpleTable(["Item", "Yes/No", "Page"], rows));
    }
    // mark any remaining matched fields as used so they don't reappear below
    for (const [k] of matched) used.add(k);
  }
  // Catch-all: any remaining yes/no flags not in a known section.
  const leftover = entries.filter(([k]) => !used.has(k));
  const leftoverBools = leftover.filter(([_, v]) => typeof v === "boolean");
  if (leftoverBools.length) {
    children.push(H(HeadingLevel.HEADING_2, "Other ethics items"));
    children.push(simpleTable(["Field", "Yes/No"], leftoverBools.map(([k, v]) => [k.replace(/_/g, " "), yn(v as boolean)])));
  }
  if (ethics.self_assessment_text) {
    children.push(H(HeadingLevel.HEADING_2, "Self-assessment"));
    children.push(...htmlToDocxChildren(ethics.self_assessment_text));
  }
  return await packDocx(children);
}

async function buildA5(supabase: any, proposal: any): Promise<Uint8Array> {
  const { data: participants } = await supabase
    .from("participants").select("id, participant_number, organisation_short_name").eq("proposal_id", proposal.id)
    .order("participant_number", { ascending: true });
  const partIds = (participants ?? []).map((p: any) => p.id);
  const { data: uploads } = partIds.length
    ? await supabase.from("participant_ocd_uploads").select("*").in("participant_id", partIds).order("created_at", { ascending: true })
    : { data: [] };
  const byPart = new Map<string, any[]>();
  for (const u of uploads ?? []) {
    if (!byPart.has(u.participant_id)) byPart.set(u.participant_id, []);
    byPart.get(u.participant_id)!.push(u);
  }
  const children: (Paragraph | Table)[] = [
    H(HeadingLevel.HEADING_1, "Part A5 — Ownership control declarations"),
    KV("Requires OCD", yn(proposal.requires_ocd)),
  ];
  if (!uploads?.length) {
    children.push(P("(no OCDs uploaded)", { italics: true }));
  } else {
    const rows: string[][] = [];
    for (const p of participants ?? []) {
      const ups = byPart.get(p.id) ?? [];
      if (!ups.length) {
        rows.push([`P${p.participant_number ?? "?"} ${p.organisation_short_name ?? ""}`, "—", "—"]);
      } else {
        for (const u of ups) {
          rows.push([
            `P${p.participant_number ?? "?"} ${p.organisation_short_name ?? ""}`,
            u.file_name ?? "",
            u.created_at ? new Date(u.created_at).toISOString().split("T")[0] : "",
          ]);
        }
      }
    }
    children.push(simpleTable(["Participant", "File", "Uploaded"], rows));
  }
  return await packDocx(children);
}

async function buildPartBSection(supabase: any, proposal: any, sectionId: string, label: string): Promise<Uint8Array> {
  const content = await latestSectionContent(supabase, proposal.id, sectionId);
  const children: (Paragraph | Table)[] = [
    H(HeadingLevel.HEADING_1, `Part ${label}`),
    ...htmlToDocxChildren(content),
  ];
  return await packDocx(children);
}

async function buildB31(supabase: any, proposal: any): Promise<Uint8Array> {
  const [intro, body] = await Promise.all([
    latestSectionContent(supabase, proposal.id, "b31-intro-text"),
    latestSectionContent(supabase, proposal.id, "b3-1"),
  ]);

  const { data: wps } = await supabase
    .from("wp_drafts")
    .select("id, number, short_name, title, color, lead_participant_id, b31_objectives, background_knowledge, approach_summary, methodologies_list, foreseen_challenges, b31_description_before_tasks")
    .eq("proposal_id", proposal.id)
    .order("number", { ascending: true });

  const wpIds = (wps ?? []).map((w: any) => w.id);
  const [{ data: b31Tasks }, { data: deliverables }, { data: milestones }, { data: risks }, { data: participants }] = await Promise.all([
    wpIds.length ? supabase.from("b31_tasks").select("*").in("wp_draft_id", wpIds).order("number", { ascending: true }) : { data: [] },
    supabase.from("b31_deliverables").select("*").eq("proposal_id", proposal.id).order("order_index", { ascending: true }),
    supabase.from("b31_milestones").select("*").eq("proposal_id", proposal.id).order("number", { ascending: true }),
    supabase.from("b31_risks").select("*").eq("proposal_id", proposal.id).order("number", { ascending: true }),
    supabase.from("participants").select("id, participant_number, organisation_short_name").eq("proposal_id", proposal.id).order("participant_number", { ascending: true }),
  ]);

  const partLabel = (id: string | null) => {
    if (!id) return "—";
    const p = (participants ?? []).find((x: any) => x.id === id);
    return p ? `P${p.participant_number} ${p.organisation_short_name ?? ""}` : "—";
  };

  const children: (Paragraph | Table)[] = [H(HeadingLevel.HEADING_1, "Part B3.1 — Work plan & work packages")];

  if (intro && intro.trim()) {
    children.push(H(HeadingLevel.HEADING_2, "Intro text"));
    children.push(...htmlToDocxChildren(intro));
  }
  if (body && body.trim()) {
    children.push(H(HeadingLevel.HEADING_2, "Section body"));
    children.push(...htmlToDocxChildren(body));
  }

  // Per-WP detail
  children.push(H(HeadingLevel.HEADING_2, "Work packages"));
  for (const w of wps ?? []) {
    children.push(H(HeadingLevel.HEADING_3, `WP${w.number} ${w.short_name ?? ""}${w.title ? ` — ${w.title}` : ""}`));
    children.push(KV("Lead participant", partLabel(w.lead_participant_id)));
    if (w.b31_objectives) { children.push(P("Objectives", { bold: true })); children.push(...htmlToDocxChildren(w.b31_objectives)); }
    if (w.background_knowledge) { children.push(P("Background knowledge", { bold: true })); children.push(...htmlToDocxChildren(w.background_knowledge)); }
    if (w.approach_summary) { children.push(P("Approach summary", { bold: true })); children.push(...htmlToDocxChildren(w.approach_summary)); }
    if (w.b31_description_before_tasks) { children.push(P("Description (before tasks)", { bold: true })); children.push(...htmlToDocxChildren(w.b31_description_before_tasks)); }
    if (w.foreseen_challenges) { children.push(P("Foreseen challenges", { bold: true })); children.push(...htmlToDocxChildren(w.foreseen_challenges)); }
    const wpTasks = (b31Tasks ?? []).filter((t: any) => t.wp_draft_id === w.id);
    if (wpTasks.length) {
      children.push(P("Tasks", { bold: true }));
      children.push(simpleTable(
        ["#", "Title", "Lead", "Start", "End", "Description"],
        wpTasks.map((t: any) => [t.number, t.title ?? "", partLabel(t.lead_participant_id), t.start_month ?? "", t.end_month ?? "", t.description ?? ""]),
      ));
    }
  }

  // Compulsory tables
  if (deliverables?.length) {
    children.push(H(HeadingLevel.HEADING_2, "Deliverables"));
    children.push(simpleTable(
      ["#", "Name", "WP", "Lead", "Type", "Diss.", "Due month"],
      deliverables.map((d: any) => [d.number, d.name ?? "", d.wp_number ?? "", partLabel(d.lead_participant_id), d.type ?? "", d.dissemination_level ?? "", d.due_month ?? ""]),
    ));
  }
  if (milestones?.length) {
    children.push(H(HeadingLevel.HEADING_2, "Milestones"));
    children.push(simpleTable(
      ["#", "Name", "WPs", "Due month", "Means of verification"],
      milestones.map((m: any) => [m.number, m.name ?? "", m.wps ?? "", m.due_month ?? "", m.means_of_verification ?? ""]),
    ));
  }
  if (risks?.length) {
    children.push(H(HeadingLevel.HEADING_2, "Risks"));
    children.push(simpleTable(
      ["#", "Description", "WPs", "Likelihood", "Severity", "Mitigation"],
      risks.map((r: any) => [r.number, r.description ?? "", r.wps ?? "", r.likelihood ?? "", r.severity ?? "", r.mitigation ?? ""]),
    ));
  }

  return await packDocx(children);
}

async function buildWpDraft(supabase: any, proposal: any, wp: any, participants: any[]): Promise<Uint8Array> {
  const partLabel = (id: string | null) => {
    if (!id) return "—";
    const p = participants.find((x: any) => x.id === id);
    return p ? `P${p.participant_number} ${p.organisation_short_name ?? ""}` : "—";
  };
  const monthRange = (s: any, e: any) => {
    if (s == null && e == null) return "—";
    if (s != null && e != null) return `M${s}–M${e}`;
    return s != null ? `M${s}` : `M${e}`;
  };

  const { data: tasks } = await supabase.from("wp_draft_tasks").select("*").eq("wp_draft_id", wp.id).order("number", { ascending: true });
  const taskIds = (tasks ?? []).map((t: any) => t.id);
  const [{ data: deliverables }, { data: milestones }, { data: risks }, { data: effort }, { data: taskParts }] = await Promise.all([
    supabase.from("wp_draft_deliverables").select("*").eq("wp_draft_id", wp.id).order("number", { ascending: true }),
    supabase.from("wp_draft_milestones").select("*").eq("wp_draft_id", wp.id).order("number", { ascending: true }),
    supabase.from("wp_draft_risks").select("*").eq("wp_draft_id", wp.id).order("number", { ascending: true }),
    supabase.from("wp_draft_effort").select("*, participant:participant_id(participant_number, organisation_short_name)").eq("wp_draft_id", wp.id),
    taskIds.length
      ? supabase.from("wp_draft_task_participants").select("task_id, participant_id").in("task_id", taskIds)
      : Promise.resolve({ data: [] }),
  ]);

  // ---- Build Table 3.1.b-style WP description table ----
  const SHADE = { fill: "E7E6E6", type: "clear", color: "auto" } as any;
  const SHADE_DARK = { fill: "BFBFBF", type: "clear", color: "auto" } as any;
  const cellOpts = (opts: { span?: number; shading?: any } = {}) => ({
    borders: CELL_BORDERS,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    columnSpan: opts.span,
    shading: opts.shading,
  });
  const txtCell = (text: string, opts: { span?: number; shading?: any; bold?: boolean } = {}) =>
    new TableCell({
      ...cellOpts(opts),
      children: [new Paragraph({ children: [new TextRun({ text: text ?? "", bold: opts.bold })] })],
    });
  const htmlCell = (html: string | null | undefined, opts: { span?: number; shading?: any } = {}) =>
    new TableCell({
      ...cellOpts(opts),
      children: htmlToDocxChildren(html) as Paragraph[],
    });
  const kvCell = (label: string, value: string, opts: { span?: number; shading?: any } = {}) =>
    new TableCell({
      ...cellOpts(opts),
      children: [new Paragraph({ children: [
        new TextRun({ text: `${label}: `, bold: true }),
        new TextRun({ text: value }),
      ] })],
    });

  const rows: TableRow[] = [];
  rows.push(new TableRow({
    children: [txtCell(`Work package ${wp.number}: ${wp.short_name ?? ""}${wp.title ? ` — ${wp.title}` : ""}`, { span: 6, shading: SHADE_DARK, bold: true })],
  }));
  rows.push(new TableRow({
    children: [
      kvCell("Lead participant", partLabel(wp.lead_participant_id), { span: 3 }),
      kvCell("Duration", wp.manual_duration ? String(wp.manual_duration) : "—", { span: 3 }),
    ],
  }));
  if (wp.objectives && String(wp.objectives).trim()) {
    rows.push(new TableRow({ children: [txtCell("Objectives", { span: 6, shading: SHADE, bold: true })] }));
    rows.push(new TableRow({ children: [htmlCell(wp.objectives, { span: 6 })] }));
  }
  if (wp.description_before_tasks && String(wp.description_before_tasks).trim()) {
    rows.push(new TableRow({ children: [txtCell("Description", { span: 6, shading: SHADE, bold: true })] }));
    rows.push(new TableRow({ children: [htmlCell(wp.description_before_tasks, { span: 6 })] }));
  }
  if (wp.methodology && String(wp.methodology).trim()) {
    rows.push(new TableRow({ children: [txtCell("Methodology", { span: 6, shading: SHADE, bold: true })] }));
    rows.push(new TableRow({ children: [htmlCell(wp.methodology, { span: 6 })] }));
  }
  for (const t of tasks ?? []) {
    const taskParticipantIds = (taskParts ?? []).filter((tp: any) => tp.task_id === t.id).map((tp: any) => tp.participant_id);
    const participantsLabel = taskParticipantIds.length
      ? taskParticipantIds.map((id: string) => partLabel(id)).join(", ")
      : "—";
    rows.push(new TableRow({
      children: [txtCell(`Task ${wp.number}.${t.number}: ${t.title ?? ""}`, { span: 6, shading: SHADE, bold: true })],
    }));
    rows.push(new TableRow({
      children: [
        kvCell("Task leader", partLabel(t.lead_participant_id), { span: 2 }),
        kvCell("Participants", participantsLabel, { span: 2 }),
        kvCell("Duration", monthRange(t.start_month, t.end_month), { span: 2 }),
      ],
    }));
    const desc = t.description ?? t.b31_description ?? "";
    if (desc && String(desc).trim()) {
      rows.push(new TableRow({ children: [htmlCell(desc, { span: 6 })] }));
    }
  }
  const extras: [string, string][] = ([
    ["Inputs", wp.inputs_question],
    ["Outputs", wp.outputs_question],
    ["Bottlenecks", wp.bottlenecks_question],
  ] as [string, string][]).filter(([, v]) => v && String(v).trim());
  for (const [label, value] of extras) {
    rows.push(new TableRow({ children: [txtCell(label, { span: 6, shading: SHADE, bold: true })] }));
    rows.push(new TableRow({ children: [htmlCell(value, { span: 6 })] }));
  }

  const wpTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [1500, 1500, 1500, 1500, 1500, 1500],
    rows,
  });

  const children: (Paragraph | Table)[] = [
    H(HeadingLevel.HEADING_1, `WP${wp.number} ${wp.short_name ?? ""}${wp.title ? ` — ${wp.title}` : ""}`),
    wpTable,
  ];

  if (deliverables?.length) {
    children.push(H(HeadingLevel.HEADING_2, "Deliverables"));
    children.push(simpleTable(
      ["#", "Title", "Type", "Diss.", "Lead", "Due month", "Description"],
      deliverables.map((d: any) => [d.number, d.title ?? "", d.type ?? "", d.dissemination_level ?? "", partLabel(d.responsible_participant_id), d.due_month ?? "", d.description ?? ""]),
    ));
  }
  if (milestones?.length) {
    children.push(H(HeadingLevel.HEADING_2, "Milestones"));
    children.push(simpleTable(
      ["#", "Title", "Related WPs", "Due month", "Means of verification"],
      milestones.map((m: any) => [m.number, m.title ?? "", m.related_wps ?? "", m.due_month ?? "", m.means_of_verification ?? ""]),
    ));
  }
  if (risks?.length) {
    children.push(H(HeadingLevel.HEADING_2, "Risks"));
    children.push(simpleTable(
      ["#", "Title", "Related WPs", "Likelihood", "Severity", "Mitigation"],
      risks.map((r: any) => [r.number, r.title ?? "", r.related_wps ?? "", r.likelihood ?? "", r.severity ?? "", r.mitigation ?? ""]),
    ));
  }
  if (effort?.length) {
    children.push(H(HeadingLevel.HEADING_2, "Effort (person-months)"));
    children.push(simpleTable(
      ["Participant", "PM"],
      effort.map((e: any) => [e.participant ? `P${e.participant.participant_number} ${e.participant.organisation_short_name ?? ""}` : "—", e.person_months ?? ""]),
    ));
  }
  return await packDocx(children);
}

async function buildCaseDraft(_supabase: any, _proposal: any, cd: any, participants: any[]): Promise<Uint8Array> {
  const lead = cd.lead_participant_id ? participants.find((p) => p.id === cd.lead_participant_id) : null;
  const children: (Paragraph | Table)[] = [
    H(HeadingLevel.HEADING_1, `Case ${cd.number} ${cd.short_name ?? ""}${cd.title ? ` — ${cd.title}` : ""}`),
    KV("Type", cd.custom_type_name || cd.case_type),
    KV("Lead participant", lead ? `P${lead.participant_number} ${lead.organisation_short_name ?? ""}` : "—"),
  ];
  if (cd.description) { children.push(H(HeadingLevel.HEADING_2, "Description")); children.push(...htmlToDocxChildren(cd.description)); }
  const sections: [string, string, string][] = [
    [cd.heading_background ?? "Background context", cd.background_context, cd.guideline_background],
    [cd.heading_stakeholders ?? "Key stakeholders", cd.key_stakeholders, cd.guideline_stakeholders],
    [cd.heading_solutions ?? "Proposed solutions", cd.proposed_solutions, cd.guideline_solutions],
    [cd.heading_outcomes ?? "Expected outcomes", cd.expected_outcomes, cd.guideline_outcomes],
    [cd.heading_replicability ?? "Replicability", cd.replicability, cd.guideline_replicability],
  ];
  for (const [heading, content] of sections) {
    if (!content || !String(content).trim()) continue;
    children.push(H(HeadingLevel.HEADING_2, heading));
    children.push(...htmlToDocxChildren(content));
  }
  return await packDocx(children);
}

// ---------- SharePoint upload ----------

async function pushToSharePoint(
  cfg: any,
  acronym: string,
  files: { name: string; bytes: Uint8Array; mime: string }[],
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
        },
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

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const now = new Date();
  const url = new URL(req.url);
  let bodyForce = false;
  let bodyProposalId: string | null = null;
  if (req.method === "POST") {
    try {
      const b = await req.clone().json();
      if (b?.force === true || b?.trigger === "manual") bodyForce = true;
      if (typeof b?.proposal_id === "string") bodyProposalId = b.proposal_id;
    } catch (_) { /* no body */ }
  }
  const force = url.searchParams.get("force") === "1" || bodyForce;
  const proposalId = bodyProposalId ?? url.searchParams.get("proposal_id");
  const helsinkiH = helsinkiHour(now);
  if (!force && helsinkiH !== 6) {
    return new Response(
      JSON.stringify({ skipped: true, helsinki_hour: helsinkiH }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const stamp = helsinkiStamp(now);

  async function backupOne(proposal: any, cfg: any) {
    const acr = safeAcronym(proposal.acronym);
    try {
      const files: { name: string; bytes: Uint8Array; mime: string }[] = [];
      const { data: participants } = await supabase
        .from("participants").select("id, participant_number, organisation_short_name")
        .eq("proposal_id", proposal.id).order("participant_number", { ascending: true });

      files.push({ name: `${acr} Part A1 ${stamp}.docx`, bytes: await buildA1(supabase, proposal), mime: DOCX_MIME });
      files.push({ name: `${acr} Part A2 ${stamp}.docx`, bytes: await buildA2(supabase, proposal), mime: DOCX_MIME });
      files.push({ name: `${acr} Part A3 ${stamp}.xlsx`, bytes: await buildA3Xlsx(supabase, proposal), mime: XLSX_MIME });
      files.push({ name: `${acr} Part A4 ${stamp}.docx`, bytes: await buildA4(supabase, proposal), mime: DOCX_MIME });
      files.push({ name: `${acr} Part A5 ${stamp}.docx`, bytes: await buildA5(supabase, proposal), mime: DOCX_MIME });
      for (const sec of PART_B_SECTIONS) {
        files.push({
          name: `${acr} Part ${sec.label} ${stamp}.docx`,
          bytes: await buildPartBSection(supabase, proposal, sec.id, sec.label),
          mime: DOCX_MIME,
        });
      }
      files.push({ name: `${acr} Part B3.1 ${stamp}.docx`, bytes: await buildB31(supabase, proposal), mime: DOCX_MIME });

      const { data: wps } = await supabase.from("wp_drafts").select("*").eq("proposal_id", proposal.id).order("number", { ascending: true });
      for (const w of wps ?? []) {
        files.push({
          name: `${acr} WP${w.number} Draft ${stamp}.docx`,
          bytes: await buildWpDraft(supabase, proposal, w, participants ?? []),
          mime: DOCX_MIME,
        });
      }

      const { data: cases } = await supabase.from("case_drafts").select("*").eq("proposal_id", proposal.id).order("number", { ascending: true });
      for (const c of cases ?? []) {
        const rawCaseName = (c.short_name ?? c.title ?? `${c.number}`).toString().trim();
        const caseName = rawCaseName.replace(/[\/\\:*?"<>|]/g, "_").replace(/\s+/g, " ").slice(0, 80) || `${c.number}`;
        files.push({
          name: `${acr} Case ${caseName} ${stamp}.docx`,
          bytes: await buildCaseDraft(supabase, proposal, c, participants ?? []),
          mime: DOCX_MIME,
        });
      }

      files.sort((a, b) => a.name.localeCompare(b.name));

      const bucketPaths: string[] = [];
      let totalBytes = 0;
      for (const f of files) {
        const path = `${proposal.id}/${stamp}/${f.name}`;
        const { error: upErr } = await supabase.storage.from("proposal-backups").upload(path, f.bytes, {
          contentType: f.mime, upsert: true,
        });
        if (upErr) throw upErr;
        bucketPaths.push(path);
        totalBytes += f.bytes.length;
      }

      const sp = await pushToSharePoint(cfg, acr, files);
      await supabase.from("proposal_backups").insert({
        proposal_id: proposal.id,
        backup_timestamp: now.toISOString(),
        sharepoint_status: sp.status,
        sharepoint_path: sp.path ?? null,
        bucket_paths: bucketPaths,
        size_bytes: totalBytes,
        error: sp.error ?? null,
      });
      return { acronym: acr, files: bucketPaths.length, bytes: totalBytes };
    } catch (e) {
      console.error(`Backup failed for ${acr}:`, e);
      await supabase.from("proposal_backups").insert({
        proposal_id: proposal.id,
        backup_timestamp: now.toISOString(),
        sharepoint_status: "failed",
        bucket_paths: [],
        size_bytes: 0,
        error: (e as Error).message,
      });
      return { acronym: acr, error: (e as Error).message };
    }
  }

  // Single-proposal mode: one proposal fits the CPU budget; run inline.
  if (proposalId) {
    const { data: cfg } = await supabase.from("sharepoint_backup_config").select("*").maybeSingle();
    const { data: proposal, error } = await supabase.from("proposals").select("*").eq("id", proposalId).maybeSingle();
    if (error || !proposal) {
      return new Response(JSON.stringify({ error: "Proposal not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const result = await backupOne(proposal, cfg);
    return new Response(JSON.stringify({ ok: !result.error, ran_at: now.toISOString(), result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: result.error ? 500 : 200,
    });
  }

  // Bulk (scheduled) mode: iterate in background.
  const work = (async () => {
    const { data: cfg } = await supabase.from("sharepoint_backup_config").select("*").maybeSingle();
    const { data: proposals, error: pErr } = await supabase.from("proposals").select("*");
    if (pErr) { console.error("proposals fetch failed", pErr); return; }
    for (const p of proposals ?? []) {
      await backupOne(p, cfg);
    }
    try {
      const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const { data: old } = await supabase.from("proposal_backups").select("id, bucket_paths").lt("backup_timestamp", cutoff);
      if (old?.length) {
        const allPaths = old.flatMap((r: any) => (r.bucket_paths ?? []) as string[]);
        for (let i = 0; i < allPaths.length; i += 100) {
          await supabase.storage.from("proposal-backups").remove(allPaths.slice(i, i + 100));
        }
        await supabase.from("proposal_backups").delete().in("id", old.map((r: any) => r.id));
      }
    } catch (e) { console.warn("cleanup failed", e); }
  })();

  // @ts-ignore
  if (typeof EdgeRuntime !== "undefined" && (EdgeRuntime as any).waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(work);
  } else {
    work.catch((e) => console.error("background work failed", e));
  }

  return new Response(
    JSON.stringify({ started: true, ran_at: now.toISOString(), helsinki_stamp: stamp, forced: force }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 202 },
  );
});
