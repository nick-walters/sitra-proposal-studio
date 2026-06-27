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
import xlsxNs from "npm:xlsx-js-style@1.2.0";
// xlsx-js-style ships as CJS; Deno's npm: interop sometimes nests it under `.default`.
// Reach the real module regardless of which shape we get.
// deno-lint-ignore no-explicit-any
const XLSX: any = (xlsxNs as any)?.utils ? xlsxNs : (xlsxNs as any)?.default ?? xlsxNs;
import { parse as parseHtml } from "npm:node-html-parser@6.1.13";
import { corsHeaders } from "../_shared/cors.ts";


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
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}

// Strip HTML to plain text (used for table cells, milestones, etc.)
function htmlToText(s: any): string {
  if (s == null) return "";
  return cleanHtml(String(s))
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => decodeEntities(line).replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n")
    .trim();
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
    children: r.map((c) => {
      const cleaned = c === null || c === undefined ? "" : (typeof c === "number" ? String(c) : htmlToText(c));
      const lines = cleaned ? cleaned.split("\n") : [""];
      return new TableCell({
        borders: CELL_BORDERS,
        margins: { top: 60, bottom: 60, left: 90, right: 90 },
        children: lines.map((line) => new Paragraph({ children: [new TextRun({ text: line })] })),
      });
    }),
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
    rows.push(new TableRow({ children: [kvCell("Task leader", t.leadLabel, { span: 6 })] }));
    rows.push(new TableRow({ children: [kvCell("Participants", t.participantsLabel, { span: 6 })] }));
    rows.push(new TableRow({ children: [kvCell("Duration", t.duration, { span: 6 })] }));
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

function mLabel(n: any): string {
  if (n == null) return "—";
  const v = Number(n);
  if (!isFinite(v)) return String(n);
  return `M${String(v).padStart(2, "0")}`;
}
function monthRange(s: any, e: any): string {
  if (s == null && e == null) return "—";
  if (s != null && e != null) return `${mLabel(s)}–${mLabel(e)}`;
  return s != null ? mLabel(s) : mLabel(e);
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
    children.push(KV("Organisation category", p.organisation_category));
    children.push(KV("Organisation type", p.organisation_type));
    
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

// Port of the in-app Budget Excel export (BudgetPortalSheet.handleExportXlsx).
// Produces the same 3-sheet workbook (Staff Effort, Summary by Participant,
// Budget Overview) with the same column structure, formulas and number formats.
async function buildA3Xlsx(supabase: any, proposal: any): Promise<Uint8Array> {
  const proposalType = proposal.type ?? null;

  // ----- Fetch source data -----
  const [
    { data: participantsRaw },
    { data: wpsRaw },
    { data: budgetRowsRaw },
    { data: effortRaw },
  ] = await Promise.all([
    supabase.from("participants")
      .select("id, participant_number, organisation_name, organisation_short_name, country, organisation_category")
      .eq("proposal_id", proposal.id)
      .order("participant_number", { ascending: true }),
    supabase.from("wp_drafts")
      .select("id, number, short_name, title")
      .eq("proposal_id", proposal.id)
      .order("number", { ascending: true }),
    supabase.from("budget_rows")
      .select("*, participants!inner(participant_number, organisation_name, organisation_short_name, country, organisation_category)")
      .eq("proposal_id", proposal.id),
    supabase.from("wp_draft_effort")
      .select("participant_id, person_months, wp_draft_id, wp_drafts!inner(proposal_id)")
      .eq("wp_drafts.proposal_id", proposal.id),
  ]);

  const cachedParticipants = participantsRaw ?? [];
  const cachedWps = wpsRaw ?? [];
  const cachedEffort = (effortRaw ?? []).map((e: any) => ({
    wp_draft_id: e.wp_draft_id, participant_id: e.participant_id, person_months: Number(e.person_months ?? 0),
  }));

  // Justification items (unified model) for note attachment on the budget summary sheet.
  const budgetRowIds = (budgetRowsRaw ?? []).map((r: any) => r.id);
  const { data: justItemsRaw } = budgetRowIds.length
    ? await supabase
        .from("budget_cost_justification_items")
        .select("*")
        .in("budget_row_id", budgetRowIds)
        .order("order_index")
    : { data: [] };
  const justificationItems = justItemsRaw ?? [];
  // Build a concatenated justification text per (row, category).
  const justByRowCat = new Map<string, string>();
  for (const it of justificationItems) {
    const key = `${it.budget_row_id}::${it.category}`;
    const piece = [it.description, it.justification].filter((s: any) => s && String(s).trim()).join(" — ");
    if (!piece) continue;
    justByRowCat.set(key, justByRowCat.has(key) ? `${justByRowCat.get(key)}\n${piece}` : piece);
  }


  // PM totals per participant (sum across all WPs)
  const pmTotals = new Map<string, number>();
  for (const e of cachedEffort) {
    pmTotals.set(e.participant_id, (pmTotals.get(e.participant_id) || 0) + e.person_months);
  }

  // Compute rows (mirrors useBudgetRows.computeRow)
  const rows = (budgetRowsRaw ?? []).map((r: any) => {
    const totalPMs = pmTotals.get(r.participant_id) || 0;
    const pmRate = r.pm_rate != null ? Number(r.pm_rate) : null;
    const personnelCosts = pmRate != null && pmRate > 0
      ? Math.round(pmRate * totalPMs)
      : Number(r.personnel_costs || 0);
    const subcontracting = Number(r.subcontracting_costs || 0);
    const travel = Number(r.purchase_travel || 0);
    const equipment = Number(r.purchase_equipment || 0);
    const otherGoods = Number(r.purchase_other_goods || 0);
    const fstp = Number(r.financial_support_third_parties || 0);
    const internally = Number(r.internally_invoiced || 0);
    const procurement = Number(r.procurement || 0);
    const directCosts = personnelCosts + subcontracting + travel + equipment + otherGoods + fstp + internally + procurement;
    const indirectBase = directCosts - subcontracting - fstp;
    const indirectOverride = r.indirect_costs_override != null ? Number(r.indirect_costs_override) : null;
    const indirectCosts = indirectOverride ?? Math.round(indirectBase * 0.25 * 100) / 100;
    const totalEligibleCosts = directCosts + indirectCosts;
    const fundingRateOverride = r.funding_rate_override != null ? Number(r.funding_rate_override) : null;
    let fundingRate = fundingRateOverride ?? 100;
    if (fundingRateOverride == null && proposalType === "IA" && r.participants?.organisation_category === "LE") {
      fundingRate = 70;
    }
    const maxEuContribution = Math.round(totalEligibleCosts * (fundingRate / 100) * 100) / 100;
    const hasInKind = r.has_in_kind ?? false;
    const reqOverride = r.requested_eu_contribution != null ? Number(r.requested_eu_contribution) : null;
    let requestedEuContribution: number;
    if (hasInKind) {
      const reqPersonnel = r.requested_personnel_costs != null ? Number(r.requested_personnel_costs) : personnelCosts;
      const reqSub = r.requested_subcontracting != null ? Number(r.requested_subcontracting) : subcontracting;
      const reqTravel = r.requested_travel != null ? Number(r.requested_travel) : travel;
      const reqEquip = r.requested_equipment != null ? Number(r.requested_equipment) : equipment;
      const reqOther = r.requested_other_goods != null ? Number(r.requested_other_goods) : otherGoods;
      const reqFstp = r.requested_fstp != null ? Number(r.requested_fstp) : fstp;
      const reqInternally = r.requested_internally_invoiced != null ? Number(r.requested_internally_invoiced) : internally;
      const reqDirectTotal = reqPersonnel + reqSub + reqTravel + reqEquip + reqOther + reqFstp + reqInternally;
      const reqIndirect = Math.round((reqDirectTotal - reqSub - reqFstp) * 0.25 * 100) / 100;
      requestedEuContribution = Math.min(reqDirectTotal + reqIndirect, maxEuContribution);
    } else {
      requestedEuContribution = reqOverride != null ? Math.min(reqOverride, maxEuContribution) : maxEuContribution;
    }
    return {
      id: r.id,
      participantId: r.participant_id,
      participantNumber: r.participants?.participant_number ?? 0,
      participantShortName: r.participants?.organisation_short_name ?? "",
      participantName: r.participants?.organisation_name ?? "",
      pmRate,
      totalPersonMonths: totalPMs,
      personnelCosts,
      subcontractingCosts: subcontracting,
      purchaseTravel: travel,
      purchaseEquipment: equipment,
      purchaseOtherGoods: otherGoods,
      financialSupportThirdParties: fstp,
      internallyInvoiced: internally,
      indirectCostsOverride: indirectOverride,
      totalEligibleCosts,
      fundingRate,
      maxEuContribution,
      requestedEuContribution,
      requestedEuContributionOverride: reqOverride,
      hasInKind,
      purchaseEquipmentJustification: r.purchase_equipment_justification || "",
    };
  });
  rows.sort((a: any, b: any) => a.participantNumber - b.participantNumber);

  // ----- Build workbook -----
  const wb = XLSX.utils.book_new();
  const colLetter = (c: number): string => {
    let s = ""; let n = c;
    while (n >= 0) { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; }
    return s;
  };
  const bold = { font: { bold: true } };
  const styleHeaders = (ws: any, rowNum: number, colCount: number) => {
    for (let c = 0; c < colCount; c++) {
      const ref = colLetter(c) + rowNum;
      if (ws[ref]) ws[ref].s = bold;
    }
  };
  const styleRow = (ws: any, rowNum: number, colCount: number, style: any) => {
    for (let c = 0; c < colCount; c++) {
      const ref = colLetter(c) + rowNum;
      if (ws[ref]) ws[ref].s = { ...(ws[ref].s || {}), ...style };
    }
  };
  const styleCol = (ws: any, colIdx: number, startRow: number, endRow: number) => {
    const cl = colLetter(colIdx);
    for (let r = startRow; r <= endRow; r++) {
      const ref = cl + r;
      if (ws[ref]) ws[ref].s = { ...(ws[ref].s || {}), font: { bold: true } };
    }
  };
  const autoFitCols = (ws: any, aoa: any[][]) => {
    const widths: number[] = [];
    for (const row of aoa) {
      row.forEach((cell: any, i: number) => {
        let len = 0;
        if (cell == null) len = 0;
        else if (typeof cell === "object" && cell.f) len = 12;
        else len = String(cell).length;
        widths[i] = Math.max(widths[i] || 0, len);
      });
    }
    ws["!cols"] = widths.map((w) => ({ wch: Math.max(w + 2, 8) }));
  };

  // ─── Sheet 1: Staff Effort ───
  const wpCount = cachedWps.length;
  const partCount = cachedParticipants.length;
  const effortTotalCol = colLetter(1 + wpCount);
  const effortHeaders: any[] = ["Participant", ...cachedWps.map((wp: any) => `WP${wp.number}`), "Total"];
  const effortAoa: any[][] = [effortHeaders];
  cachedParticipants.forEach((p: any, pIdx: number) => {
    const excelRow = pIdx + 2;
    const wpValues = cachedWps.map((wp: any) => {
      const entry = cachedEffort.find((e: any) => e.participant_id === p.id && e.wp_draft_id === wp.id);
      return entry?.person_months || 0;
    });
    const firstWpCol = colLetter(1);
    const lastWpCol = colLetter(wpCount);
    const totalFormula = wpCount > 0 ? `=SUM(${firstWpCol}${excelRow}:${lastWpCol}${excelRow})` : "0";
    effortAoa.push([`${p.participant_number}. ${p.organisation_short_name || p.organisation_name}`, ...wpValues, { f: totalFormula }]);
  });
  const totalRowIdx = partCount + 2;
  const effortTotalRow: any[] = ["Total"];
  for (let c = 1; c <= wpCount; c++) {
    const cl = colLetter(c);
    effortTotalRow.push({ f: `=SUM(${cl}2:${cl}${totalRowIdx - 1})` });
  }
  effortTotalRow.push({ f: `=SUM(${effortTotalCol}2:${effortTotalCol}${totalRowIdx - 1})` });
  effortAoa.push(effortTotalRow);
  const ws1 = XLSX.utils.aoa_to_sheet(effortAoa);
  const effortColCount = effortHeaders.length;
  styleHeaders(ws1, 1, effortColCount);
  for (let r = 2; r <= partCount + 1; r++) {
    const ref = `A${r}`; if (ws1[ref]) ws1[ref].s = bold;
  }
  styleRow(ws1, totalRowIdx, effortColCount, bold);
  for (let r = 2; r <= totalRowIdx; r++) {
    for (let c = 1; c < effortColCount; c++) {
      const ref = colLetter(c) + r;
      if (ws1[ref]) ws1[ref].s = { ...(ws1[ref].s || {}), numFmt: "0.0" };
    }
  }
  styleCol(ws1, effortColCount - 1, 1, totalRowIdx);
  autoFitCols(ws1, effortAoa);
  XLSX.utils.book_append_sheet(wb, ws1, "Staff Effort");

  // ─── Sheet 2: Summary by Participant ───
  const summaryHeaders = [
    "Participant", "PM rate (€)", "Total PMs",
    "A. Personnel costs (€)", "B. Subcontracting costs (€)",
    "C.1. Travel & subsistence (€)", "C.2. Equipment (€)", "C.3. Other goods (€)",
    "D.1. Financial support to third parties (€)", "D.2. Internally invoiced goods & services (€)",
    "E. Indirect costs (€)", "Total costs (€)",
    "Max. eligible funding rate (%)", "Max. EU contribution (€)",
    "Requested funding rate (%)", "Requested budget (€)",
    "Share of total budget (%)", "Share of requested budget (%)",
    "Share of requested budget, excl. FSTP (%)",
  ];
  const summaryAoa: any[][] = [summaryHeaders];
  const summaryTotalRowNum = partCount + 2;

  rows.forEach((row: any, rIdx: number) => {
    const r = rIdx + 2;
    const effortPIdx = cachedParticipants.findIndex((p: any) => p.id === row.participantId);
    const effortRow = effortPIdx >= 0 ? effortPIdx + 2 : -1;
    const totalPMsVal = effortRow > 0 ? { f: `='Staff Effort'!${effortTotalCol}${effortRow}` } : row.totalPersonMonths;
    const personnelFormula = row.pmRate != null && row.pmRate > 0
      ? { f: `=ROUND(B${r}*C${r},0)` } : row.personnelCosts;
    const indirectFormula = row.indirectCostsOverride != null
      ? row.indirectCostsOverride : { f: `=ROUND((D${r}+F${r}+G${r}+H${r}+J${r})*0.25,2)` };
    const totalCostsFormula = { f: `=D${r}+E${r}+F${r}+G${r}+H${r}+I${r}+J${r}+K${r}` };
    const fundingRate = row.fundingRate;
    const maxEuFormula = { f: `=ROUND(L${r}*M${r}/100,2)` };
    const hasCustomRequested = row.requestedEuContributionOverride != null || row.hasInKind;
    const requestedRate = hasCustomRequested
      ? { f: `=IF(L${r}>0,P${r}/L${r}*100,0)` } : fundingRate;
    const requestedBudget = hasCustomRequested ? row.requestedEuContribution : { f: `=N${r}` };
    const shareTotal = { f: `=IF(L$${summaryTotalRowNum}>0,L${r}/L$${summaryTotalRowNum}*100,0)` };
    const shareRequested = { f: `=IF(P$${summaryTotalRowNum}>0,P${r}/P$${summaryTotalRowNum}*100,0)` };
    const shareRequestedExclFstp = { f: `=IF((P$${summaryTotalRowNum}-I$${summaryTotalRowNum})>0,(P${r}-I${r})/(P$${summaryTotalRowNum}-I$${summaryTotalRowNum})*100,0)` };
    summaryAoa.push([
      `${row.participantNumber}. ${row.participantShortName || row.participantName}`,
      row.pmRate ?? "",
      totalPMsVal,
      personnelFormula,
      row.subcontractingCosts,
      row.purchaseTravel,
      row.purchaseEquipment,
      row.purchaseOtherGoods,
      row.financialSupportThirdParties,
      row.internallyInvoiced,
      indirectFormula,
      totalCostsFormula,
      fundingRate,
      maxEuFormula,
      requestedRate,
      requestedBudget,
      shareTotal,
      shareRequested,
      shareRequestedExclFstp,
    ]);
  });

  const sumCols = ["C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
  const totalRow: any[] = ["Total", ""];
  sumCols.forEach((cl) => totalRow.push({ f: `=SUM(${cl}2:${cl}${summaryTotalRowNum - 1})` }));
  totalRow.push("");
  totalRow.push({ f: `=SUM(N2:N${summaryTotalRowNum - 1})` });
  totalRow.push("");
  totalRow.push({ f: `=SUM(P2:P${summaryTotalRowNum - 1})` });
  totalRow.push(100); totalRow.push(100); totalRow.push(100);
  summaryAoa.push(totalRow);

  const ws2 = XLSX.utils.aoa_to_sheet(summaryAoa);
  const summaryColCount = summaryHeaders.length;
  styleHeaders(ws2, 1, summaryColCount);
  for (let r = 2; r <= partCount + 1; r++) {
    const ref = `A${r}`; if (ws2[ref]) ws2[ref].s = bold;
  }
  styleRow(ws2, summaryTotalRowNum, summaryColCount, bold);
  const currCols = [1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15];
  const pctCols = [12, 14, 16, 17, 18];
  const pmCols = [2];
  for (let r = 2; r <= summaryTotalRowNum; r++) {
    currCols.forEach((c) => {
      const ref = colLetter(c) + r;
      if (ws2[ref]) ws2[ref].s = { ...(ws2[ref].s || {}), numFmt: "#,##0.00" };
    });
    pctCols.forEach((c) => {
      const ref = colLetter(c) + r;
      if (ws2[ref]) ws2[ref].s = { ...(ws2[ref].s || {}), numFmt: "0.0" };
    });
    pmCols.forEach((c) => {
      const ref = colLetter(c) + r;
      if (ws2[ref]) ws2[ref].s = { ...(ws2[ref].s || {}), numFmt: "0.0" };
    });
  }
  styleCol(ws2, 11, 1, summaryTotalRowNum);
  styleCol(ws2, 15, 1, summaryTotalRowNum);
  autoFitCols(ws2, summaryAoa);

  // Cost-justification comments on the same cells the UI annotates.
  rows.forEach((row: any, rIdx: number) => {
    const excelRow = rIdx + 2;
    const addComment = (colIdx: number, text: string) => {
      if (!text || !text.trim()) return;
      const ref = colLetter(colIdx) + excelRow;
      if (!ws2[ref]) return;
      ws2[ref].c = [{ a: "Sitra", t: text.trim() }];
      (ws2[ref].c as any).hidden = true;
    };
    if (row.subcontractingCosts > 0) {
      const t = justByRowCat.get(`${row.id}::subcontracting`);
      if (t) addComment(4, t);
    }
    if (row.purchaseTravel > 0) {
      const t = justByRowCat.get(`${row.id}::travel`);
      if (t) addComment(5, t);
    }
    if (row.purchaseEquipment > 0) {
      const t = justByRowCat.get(`${row.id}::equipment`);
      if (t) addComment(6, t);
      else if (row.purchaseEquipmentJustification) addComment(6, row.purchaseEquipmentJustification);
    }
    if (row.purchaseOtherGoods > 0) {
      const t = justByRowCat.get(`${row.id}::other_goods`);
      if (t) addComment(7, t);
    }
  });

  XLSX.utils.book_append_sheet(wb, ws2, "Summary by Participant");

  // ─── Sheet 3: Budget Overview ───
  const sTotal = summaryTotalRowNum;
  const COST_CATEGORIES = [
    { key: "personnelCosts", code: "A." },
    { key: "subcontractingCosts", code: "B." },
    { key: null, code: "C.", isGroup: true },
    { key: "purchaseTravel", code: "C.1." },
    { key: "purchaseEquipment", code: "C.2." },
    { key: "purchaseOtherGoods", code: "C.3." },
    { key: null, code: "D.", isGroup: true },
    { key: "financialSupportThirdParties", code: "D.1." },
    { key: "internallyInvoiced", code: "D.2." },
    { key: "indirectCosts", code: "E." },
  ] as any[];
  const COST_NAMES: Record<string, string> = {
    "A.": "Personnel costs", "B.": "Subcontracting costs", "C.": "Purchase costs",
    "C.1.": "Travel & subsistence", "C.2.": "Equipment", "C.3.": "Other goods, works & services",
    "D.": "Other cost categories", "D.1.": "Financial support to third parties",
    "D.2.": "Internally invoiced goods & services", "E.": "Indirect costs",
  };
  const catToSummaryCol: Record<string, string> = {
    personnelCosts: "D", subcontractingCosts: "E",
    purchaseTravel: "F", purchaseEquipment: "G", purchaseOtherGoods: "H",
    financialSupportThirdParties: "I", internallyInvoiced: "J", indirectCosts: "K",
  };
  const overviewAoa: any[][] = [["Category", "Total budget (€)", "Share of total budget (%)", "Requested costs (€)", "Share of requested budget (%)"]];
  let overviewRowIdx = 2;
  const totalCostsRowTarget = 2 + COST_CATEGORIES.length;
  for (const cat of COST_CATEGORIES) {
    let amountCell: any;
    if (cat.isGroup) {
      if (cat.code === "C.") amountCell = { f: `='Summary by Participant'!F${sTotal}+'Summary by Participant'!G${sTotal}+'Summary by Participant'!H${sTotal}` };
      else if (cat.code === "D.") amountCell = { f: `='Summary by Participant'!I${sTotal}+'Summary by Participant'!J${sTotal}` };
    } else if (cat.key && catToSummaryCol[cat.key]) {
      amountCell = { f: `='Summary by Participant'!${catToSummaryCol[cat.key]}${sTotal}` };
    } else amountCell = 0;
    const pctFormula = { f: `=IF(B$${totalCostsRowTarget}>0,B${overviewRowIdx}/B$${totalCostsRowTarget}*100,0)` };
    const sFirstData = 2; const sLastData = sTotal - 1; const S = "'Summary by Participant'";
    let requestedFormula: any;
    if (cat.isGroup) requestedFormula = 0;
    else if (cat.key && catToSummaryCol[cat.key]) {
      const col = catToSummaryCol[cat.key];
      requestedFormula = { f: `=SUMPRODUCT(IFERROR(${S}!${col}${sFirstData}:${col}${sLastData}*${S}!P${sFirstData}:P${sLastData}/${S}!L${sFirstData}:L${sLastData},0))` };
    } else requestedFormula = 0;
    const requestedPctFormula = { f: `=IF(D$${totalCostsRowTarget}>0,D${overviewRowIdx}/D$${totalCostsRowTarget}*100,0)` };
    overviewAoa.push([`${cat.code} ${COST_NAMES[cat.code]}`, amountCell, pctFormula, requestedFormula, requestedPctFormula]);
    overviewRowIdx++;
  }
  for (let i = 1; i < overviewAoa.length; i++) {
    const label = String(overviewAoa[i][0]);
    if (label.startsWith("C. ")) {
      const excelRow = i + 1;
      overviewAoa[i][3] = { f: `=D${excelRow + 1}+D${excelRow + 2}+D${excelRow + 3}` };
    } else if (label.startsWith("D. ")) {
      const excelRow = i + 1;
      overviewAoa[i][3] = { f: `=D${excelRow + 1}+D${excelRow + 2}` };
    }
  }
  const totalCostsRowNum = overviewRowIdx;
  overviewAoa.push([
    "Total costs",
    { f: `='Summary by Participant'!L${sTotal}` }, 100,
    { f: `='Summary by Participant'!P${sTotal}` }, 100,
  ]);
  overviewAoa.push([
    "In-kind contributions",
    { f: `=B${totalCostsRowNum}-D${totalCostsRowNum}` },
    { f: `=IF(B${totalCostsRowNum}>0,B${totalCostsRowNum + 1}/B${totalCostsRowNum}*100,0)` },
    "", "",
  ]);
  const ws3 = XLSX.utils.aoa_to_sheet(overviewAoa);
  const overviewColCount = 5;
  styleHeaders(ws3, 1, overviewColCount);
  for (let r = 2; r < overviewAoa.length + 1; r++) {
    const ref = `A${r}`; if (ws3[ref]) ws3[ref].s = bold;
  }
  for (let r = totalCostsRowNum; r <= totalCostsRowNum + 1; r++) {
    styleRow(ws3, r, overviewColCount, bold);
  }
  for (let r = 2; r < overviewAoa.length + 1; r++) {
    ["B", "D"].forEach((cl) => {
      const ref = cl + r;
      if (ws3[ref]) ws3[ref].s = { ...(ws3[ref].s || {}), numFmt: "#,##0.00" };
    });
    ["C", "E"].forEach((cl) => {
      const ref = cl + r;
      if (ws3[ref]) ws3[ref].s = { ...(ws3[ref].s || {}), numFmt: "0.0" };
    });
  }
  const overviewLastRow = overviewAoa.length;
  styleCol(ws3, 1, 1, overviewLastRow);
  styleCol(ws3, 3, 1, overviewLastRow);
  autoFitCols(ws3, overviewAoa);
  XLSX.utils.book_append_sheet(wb, ws3, "Budget Overview");

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

  const SHADE_HDR = { fill: "BFBFBF", type: "clear", color: "auto" } as any;
  const SHADE_SUB = { fill: "E7E6E6", type: "clear", color: "auto" } as any;
  const SHADE_LIGHT = { fill: "F7F7F7", type: "clear", color: "auto" } as any;
  const cellOpts = (o: { span?: number; shading?: any } = {}) => ({
    borders: CELL_BORDERS,
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    columnSpan: o.span,
    shading: o.shading,
  });
  const txt = (text: string, o: { bold?: boolean; span?: number; shading?: any; italics?: boolean } = {}) =>
    new TableCell({
      ...cellOpts(o),
      children: [new Paragraph({ children: [new TextRun({ text: text ?? "", bold: o.bold, italics: o.italics })] })],
    });
  const htmlCellA4 = (html: string, o: { span?: number; shading?: any } = {}) =>
    new TableCell({ ...cellOpts(o), children: htmlToDocxChildren(html) as Paragraph[] });

  const tableRows: TableRow[] = [];

  // Single header row at the top.
  tableRows.push(new TableRow({
    tableHeader: true,
    children: [
      txt("Item", { bold: true, shading: SHADE_HDR }),
      txt("Yes/No", { bold: true, shading: SHADE_HDR }),
      txt("Page", { bold: true, shading: SHADE_HDR }),
    ],
  }));

  const entries = Object.entries(ethics).filter(([k]) => !["id", "proposal_id", "created_at", "updated_at"].includes(k));
  const used = new Set<string>();

  for (const sec of ETHICS_SECTIONS) {
    const matched = entries.filter(([k]) => k.startsWith(sec.prefix));
    if (!matched.length) continue;
    const bools = matched.filter(([k]) => typeof ethics[k] === "boolean" || ethics[k] === null);

    const itemRows: { base: string; yn: string; page: string }[] = [];
    for (const [k] of bools) {
      const base = k;
      const pageKey = `${base}_page`;
      const detailKey = `${base}_details`;
      if ((ethics[base] === null || ethics[base] === undefined) && !ethics[pageKey] && !ethics[detailKey]) {
        used.add(base); used.add(pageKey); used.add(detailKey);
        continue;
      }
      itemRows.push({ base, yn: yn(ethics[base]), page: ethics[pageKey] ?? "" });
      used.add(base); used.add(pageKey);
    }

    // Collect any *_details text fields for this section (self-evaluation)
    const detailFields = matched
      .filter(([k]) => k.endsWith("_details") && typeof ethics[k] === "string" && ethics[k].trim())
      .map(([k]) => k);
    for (const k of detailFields) used.add(k);
    // Also capture other free-text strings in this section that aren't pages/details (e.g. *_text)
    const otherText = matched.filter(([k, v]) =>
      !used.has(k) && typeof v === "string" && (v as string).trim() && !k.endsWith("_page")
    );
    for (const [k] of otherText) used.add(k);

    if (!itemRows.length && !detailFields.length && !otherText.length) {
      for (const [k] of matched) used.add(k);
      continue;
    }

    // Subsection heading row (spans all 3 cols)
    tableRows.push(new TableRow({
      children: [txt(sec.title, { bold: true, span: 3, shading: SHADE_SUB })],
    }));
    for (const r of itemRows) {
      tableRows.push(new TableRow({
        children: [txt(r.base.replace(/_/g, " ")), txt(r.yn), txt(r.page)],
      }));
    }
    for (const k of detailFields) {
      const label = k.replace(/_details$/, "").replace(/_/g, " ");
      tableRows.push(new TableRow({
        children: [txt(`${label} — details`, { italics: true, span: 3, shading: SHADE_LIGHT })],
      }));
      tableRows.push(new TableRow({ children: [htmlCellA4(String(ethics[k]), { span: 3 })] }));
    }
    for (const [k, v] of otherText) {
      tableRows.push(new TableRow({
        children: [txt(k.replace(/_/g, " "), { italics: true, span: 3, shading: SHADE_LIGHT })],
      }));
      tableRows.push(new TableRow({ children: [htmlCellA4(String(v), { span: 3 })] }));
    }

    for (const [k] of matched) used.add(k);
  }

  // Catch-all bool flags not in any known section.
  const leftover = entries.filter(([k]) => !used.has(k));
  const leftoverBools = leftover.filter(([_, v]) => typeof v === "boolean");
  if (leftoverBools.length) {
    tableRows.push(new TableRow({
      children: [txt("Other ethics items", { bold: true, span: 3, shading: SHADE_SUB })],
    }));
    for (const [k, v] of leftoverBools) {
      tableRows.push(new TableRow({
        children: [txt(k.replace(/_/g, " ")), txt(yn(v as boolean)), txt("")],
      }));
      used.add(k);
    }
  }

  // Overall self-assessment text (always last)
  if (ethics.self_assessment_text && String(ethics.self_assessment_text).trim()) {
    tableRows.push(new TableRow({
      children: [txt("Overall self-assessment", { bold: true, span: 3, shading: SHADE_SUB })],
    }));
    tableRows.push(new TableRow({
      children: [htmlCellA4(String(ethics.self_assessment_text), { span: 3 })],
    }));
    used.add("self_assessment_text");
  }

  // Any other free-text fields on ethics_assessment not yet shown
  const remainingText = entries.filter(([k, v]) =>
    !used.has(k) && typeof v === "string" && (v as string).trim() && !k.endsWith("_page")
  );
  if (remainingText.length) {
    tableRows.push(new TableRow({
      children: [txt("Additional self-evaluation text", { bold: true, span: 3, shading: SHADE_SUB })],
    }));
    for (const [k, v] of remainingText) {
      tableRows.push(new TableRow({
        children: [txt(k.replace(/_/g, " "), { italics: true, span: 3, shading: SHADE_LIGHT })],
      }));
      tableRows.push(new TableRow({ children: [htmlCellA4(String(v), { span: 3 })] }));
    }
  }

  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [6000, 1500, 1500],
    rows: tableRows,
  }));
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
    .select("id, number, short_name, title, color, lead_participant_id, manual_duration, b31_objectives, background_knowledge, approach_summary, methodologies_list, foreseen_challenges, b31_description_before_tasks")
    .eq("proposal_id", proposal.id)
    .order("number", { ascending: true });

  const wpIds = (wps ?? []).map((w: any) => w.id);
  const [
    { data: b31Tasks },
    { data: deliverables },
    { data: milestones },
    { data: risks },
    { data: participants },
    { data: effortRows },
  ] = await Promise.all([
    wpIds.length ? supabase.from("b31_tasks").select("*").in("wp_draft_id", wpIds).order("number", { ascending: true }) : { data: [] },
    supabase.from("b31_deliverables").select("*").eq("proposal_id", proposal.id).order("order_index", { ascending: true }),
    supabase.from("b31_milestones").select("*").eq("proposal_id", proposal.id).order("number", { ascending: true }),
    supabase.from("b31_risks").select("*").eq("proposal_id", proposal.id).order("number", { ascending: true }),
    supabase.from("participants").select("id, participant_number, organisation_short_name").eq("proposal_id", proposal.id).order("participant_number", { ascending: true }),
    wpIds.length ? supabase.from("wp_draft_effort").select("wp_draft_id, participant_id, person_months").in("wp_draft_id", wpIds) : { data: [] },
  ]);

  // Subcontracting & equipment justification items for 3.1.g/3.1.h via budget_rows joined to participants
  const { data: budgetRows } = await supabase
    .from("budget_rows")
    .select("id, participant_id, pm_rate, personnel_costs")
    .eq("proposal_id", proposal.id);
  const brIds = (budgetRows ?? []).map((r: any) => r.id);
  const { data: justItemsRaw } = brIds.length
    ? await supabase
        .from("budget_cost_justification_items")
        .select("*")
        .in("budget_row_id", brIds)
        .in("category", ["subcontracting", "equipment"])
        .order("order_index")
    : { data: [] };
  const subItems = (justItemsRaw ?? []).filter((it: any) => it.category === "subcontracting");
  const equipItemsAll = (justItemsRaw ?? []).filter((it: any) => it.category === "equipment");

  const brToPart = new Map<string, string>();
  for (const br of budgetRows ?? []) brToPart.set(br.id, br.participant_id);

  const taskIds = (b31Tasks ?? []).map((t: any) => t.id);
  const { data: b31TaskParts } = taskIds.length
    ? await supabase.from("b31_task_participants").select("task_id, participant_id").in("task_id", taskIds)
    : { data: [] };

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

  // Effort totals per (wp, participant) and per WP
  const effortMap = new Map<string, number>();
  const wpEffortTotal = new Map<string, number>();
  for (const e of effortRows ?? []) {
    const v = Number(e.person_months ?? 0);
    effortMap.set(`${e.wp_draft_id}::${e.participant_id}`, v);
    wpEffortTotal.set(e.wp_draft_id, (wpEffortTotal.get(e.wp_draft_id) || 0) + v);
  }

  // ─── Table 3.1.a — List of work packages ───
  if ((wps ?? []).length) {
    children.push(H(HeadingLevel.HEADING_2, "Table 3.1.a — List of work packages"));
    children.push(simpleTable(
      ["WP #", "WP title", "Lead participant", "Person-months", "Start month", "End month"],
      (wps ?? []).map((w: any) => {
        const wpTasks = (b31Tasks ?? []).filter((t: any) => t.wp_draft_id === w.id);
        const starts = wpTasks.map((t: any) => t.start_month).filter((v: any) => v != null);
        const ends = wpTasks.map((t: any) => t.end_month).filter((v: any) => v != null);
        const wpStart = starts.length ? Math.min(...starts) : null;
        const wpEnd = ends.length ? Math.max(...ends) : (w.manual_duration ?? null);
        return [
          `WP${w.number}${w.short_name ? ` ${w.short_name}` : ""}`,
          w.title ?? "",
          partLabel(w.lead_participant_id),
          wpEffortTotal.get(w.id) ?? 0,
          mLabel(wpStart),
          mLabel(wpEnd),
        ];
      }),
    ));
  }

  // Per-WP detail using the shared Table 3.1.b structure.
  children.push(H(HeadingLevel.HEADING_2, "Table 3.1.b — Work package descriptions"));
  for (const w of wps ?? []) {
    const wpTasks = (b31Tasks ?? []).filter((t: any) => t.wp_draft_id === w.id);
    children.push(buildWpDescriptionTable({
      wpNumber: w.number,
      shortName: w.short_name,
      title: w.title,
      leadLabel: partLabel(w.lead_participant_id),
      duration: w.manual_duration ? String(w.manual_duration) : null,
      objectives: w.b31_objectives,
      description: w.b31_description_before_tasks,
      methodology: w.approach_summary,
      tasks: wpTasks.map((t: any) => {
        const ids = (b31TaskParts ?? []).filter((tp: any) => tp.task_id === t.id).map((tp: any) => tp.participant_id);
        return {
          number: t.number,
          title: t.title,
          leadLabel: partLabel(t.lead_participant_id),
          participantsLabel: ids.length ? ids.map((id: string) => partLabel(id)).join(", ") : "—",
          duration: monthRange(t.start_month, t.end_month),
          description: t.description,
        };
      }),
      extras: [
        ["Background knowledge", w.background_knowledge],
        ["Methodologies", w.methodologies_list],
        ["Foreseen challenges", w.foreseen_challenges],
      ],
    }));
    children.push(P("")); // spacer between WP tables
  }

  // ─── Tables 3.1.c/d/e ───
  if (deliverables?.length) {
    children.push(H(HeadingLevel.HEADING_2, "Table 3.1.c — Deliverables"));
    children.push(simpleTable(
      ["#", "Name", "WP", "Lead", "Type", "Diss.", "Due month"],
      deliverables.map((d: any) => [d.number, d.name ?? "", d.wp_number ?? "", partLabel(d.lead_participant_id), d.type ?? "", d.dissemination_level ?? "", mLabel(d.due_month)]),
    ));
  }
  if (milestones?.length) {
    children.push(H(HeadingLevel.HEADING_2, "Table 3.1.d — Milestones"));
    children.push(simpleTable(
      ["#", "Name", "WPs", "Due month", "Means of verification"],
      milestones.map((m: any) => [m.number, m.name ?? "", m.wps ?? "", mLabel(m.due_month), m.means_of_verification ?? ""]),
    ));
  }
  if (risks?.length) {
    children.push(H(HeadingLevel.HEADING_2, "Table 3.1.e — Critical risks"));
    children.push(simpleTable(
      ["#", "Description", "WPs", "Likelihood", "Severity", "Mitigation"],
      risks.map((r: any) => [r.number, r.description ?? "", r.wps ?? "", r.likelihood ?? "", r.severity ?? "", r.mitigation ?? ""]),
    ));
  }

  // ─── Table 3.1.f — Effort matrix (Participants × WPs) ───
  if ((wps ?? []).length && (participants ?? []).length) {
    children.push(H(HeadingLevel.HEADING_2, "Table 3.1.f — Summary of staff effort"));
    const wpCols = (wps ?? []);
    const headers = ["Participant", ...wpCols.map((w: any) => `WP${w.number}`), "Total PMs"];
    const matrixRows: (string | number)[][] = [];
    const wpTotals = new Array(wpCols.length).fill(0);
    for (const p of participants ?? []) {
      const row: (string | number)[] = [`P${p.participant_number} ${p.organisation_short_name ?? ""}`];
      let rowTotal = 0;
      wpCols.forEach((w: any, i: number) => {
        const v = effortMap.get(`${w.id}::${p.id}`) ?? 0;
        row.push(v || 0);
        wpTotals[i] += v;
        rowTotal += v;
      });
      row.push(rowTotal);
      matrixRows.push(row);
    }
    matrixRows.push(["Total", ...wpTotals, wpTotals.reduce((a, b) => a + b, 0)]);
    children.push(simpleTable(headers, matrixRows));
  }

  // ─── Table 3.1.g — Subcontracting ───
  if ((subItems ?? []).length) {
    children.push(H(HeadingLevel.HEADING_2, "Table 3.1.g — Subcontracting"));
    children.push(simpleTable(
      ["Participant", "Description", "Cost (€)", "Justification"],
      (subItems ?? []).map((s: any) => [
        partLabel(brToPart.get(s.budget_row_id) ?? null),
        s.description ?? "",
        eur(s.amount),
        s.justification ?? "",
      ]),
    ));
  }

  // ─── Table 3.1.h — Purchase costs / equipment ───
  if ((equipItems ?? []).length) {
    children.push(H(HeadingLevel.HEADING_2, "Table 3.1.h — Purchase costs (equipment, infrastructure or other assets)"));
    children.push(simpleTable(
      ["Participant", "Description", "Cost (€)", "Justification"],
      (equipItems ?? []).map((e: any) => [
        partLabel(brToPart.get(e.budget_row_id) ?? null),
        e.description ?? "",
        eur(e.amount),
        e.justification ?? "",
      ]),
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

  const wpTable = buildWpDescriptionTable({
    wpNumber: wp.number,
    shortName: wp.short_name,
    title: wp.title,
    leadLabel: partLabel(wp.lead_participant_id),
    duration: wp.manual_duration ? String(wp.manual_duration) : null,
    objectives: wp.objectives,
    description: wp.description_before_tasks,
    methodology: wp.methodology,
    tasks: (tasks ?? []).map((t: any) => {
      const ids = (taskParts ?? []).filter((tp: any) => tp.task_id === t.id).map((tp: any) => tp.participant_id);
      return {
        number: t.number,
        title: t.title,
        leadLabel: partLabel(t.lead_participant_id),
        participantsLabel: ids.length ? ids.map((id: string) => partLabel(id)).join(", ") : "—",
        duration: monthRange(t.start_month, t.end_month),
        description: t.description ?? t.b31_description ?? "",
      };
    }),
    extras: [
      ["Inputs", wp.inputs_question],
      ["Outputs", wp.outputs_question],
      ["Bottlenecks", wp.bottlenecks_question],
    ],
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

  // Auth: accept either (a) Bearer == service role key OR Bearer == CRON_SECRET
  // (cron / server-to-server), or (b) a valid user JWT belonging to an
  // owner/admin/coordinator (manual UI trigger).
  const authHeader = req.headers.get("Authorization") || "";
  const cronSecret = Deno.env.get("CRON_SECRET");
  const isServiceCall =
    authHeader === `Bearer ${SERVICE_KEY}` ||
    (!!cronSecret && authHeader === `Bearer ${cronSecret}`);
  let isAuthorizedUser = false;
  let callerUserId: string | null = null;
  if (!isServiceCall) {
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    try {
      const userClient = createClient(
        SUPABASE_URL,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const token = authHeader.replace("Bearer ", "");
      const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
      if (claimsErr || !claimsData?.claims?.sub) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Capture caller id once — reused below for per-proposal authorization checks
      // so we don't re-validate the JWT (extra network round-trip + silent-failure risk).
      callerUserId = claimsData.claims.sub;
      const adminClient = createClient(SUPABASE_URL, SERVICE_KEY);
      const { data: roles } = await adminClient
        .from("user_roles")
        .select("role, proposal_id")
        .eq("user_id", callerUserId);
      isAuthorizedUser = !!roles?.some((r: any) =>
        (r.proposal_id === null && (r.role === "owner" || r.role === "admin")) ||
        r.role === "coordinator"
      );
      if (!isAuthorizedUser) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } catch (_e) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

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

  // Per-proposal / full-fleet authorization (user-authenticated calls only).
  // Uses callerUserId captured during the first getClaims() above — no second JWT validation.
  if (!isServiceCall) {
    // When a specific proposal is targeted, require admin/owner/coordinator on THAT proposal
    // (or a global owner/admin). Prevents cross-proposal data exfiltration via backup trigger.
    if (proposalId && callerUserId) {
      const adminClient = createClient(SUPABASE_URL, SERVICE_KEY);
      const { data: allowed, error: rpcErr } = await adminClient.rpc("is_proposal_admin", {
        _user_id: callerUserId,
        _proposal_id: proposalId,
      });
      if (rpcErr || !allowed) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else if (!proposalId) {
      // Full-fleet backup runs (no proposal_id) require global owner/admin, not just any coordinator.
      const adminClient = createClient(SUPABASE_URL, SERVICE_KEY);
      const { data: roles } = await adminClient
        .from("user_roles")
        .select("role, proposal_id")
        .eq("user_id", callerUserId);
      const isGlobalAdmin = !!roles?.some((r: any) =>
        r.proposal_id === null && (r.role === "owner" || r.role === "admin")
      );
      if (!isGlobalAdmin) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
  }

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

      // ---- Figures (PNG) ----
      // Uploaded image/AI figures live in `proposal-files` (path in content.imageUrl).
      // PERT/Gantt figures are cached client-side at
      // `proposal-backups/{proposal_id}/_figures-cache/{figure_id}.png`.
      const { data: figures } = await supabase
        .from("figures")
        .select("id, figure_number, figure_type, content, title, caption")
        .eq("proposal_id", proposal.id)
        .order("figure_number", { ascending: true });

      for (const fig of figures ?? []) {
        const num = String(fig.figure_number || fig.id).replace(/[\/\\:*?"<>|]/g, "_");
        let bytes: Uint8Array | null = null;
        let ext = "png";
        const imageUrl: string | undefined = fig.content?.imageUrl;

        if (imageUrl) {
          // Strip query string and bucket prefix to derive storage path.
          const cleaned = String(imageUrl).split("?")[0];
          const m = cleaned.match(/proposal-files\/(.+)$/);
          const path = m ? m[1] : cleaned;
          const { data: blob, error } = await supabase.storage
            .from("proposal-files").download(path);
          if (!error && blob) {
            bytes = new Uint8Array(await blob.arrayBuffer());
            const extMatch = path.match(/\.([a-zA-Z0-9]+)$/);
            if (extMatch) ext = extMatch[1].toLowerCase();
          }
        } else if (fig.figure_type === "pert" || fig.figure_type === "gantt") {
          const cachePath = `${proposal.id}/_figures-cache/${fig.id}.png`;
          const { data: blob, error } = await supabase.storage
            .from("proposal-backups").download(cachePath);
          if (!error && blob) {
            bytes = new Uint8Array(await blob.arrayBuffer());
          }
        }

        if (bytes) {
          const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg"
            : ext === "gif" ? "image/gif"
            : ext === "svg" ? "image/svg+xml"
            : ext === "webp" ? "image/webp"
            : "image/png";
          files.push({
            name: `${acr} Figure ${num} ${stamp}.${ext}`,
            bytes,
            mime,
          });
        }
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
