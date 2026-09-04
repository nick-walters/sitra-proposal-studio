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
import {
  emptySnapshot,
  isRefChip,
  resolveChipLabel,
  resolveCitationNumber,
  type RefSnapshotServer,
} from "../_shared/referenceResolution.ts";
import { buildCitationNumberMap } from "../_shared/citationSources.ts";
import { computeFigureNumbers } from "../_shared/figureNumbering.ts";


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
  const stripped = String(html)
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<o:p\b[^>]*>[\s\S]*?<\/o:p>/gi, "")
    .replace(/<\/?o:[^>]+>/gi, "");
  // Single choke point: every html→docx / html→text path goes through here,
  // so chips resolve once, consistently, for the whole backup.
  return resolveChipsInHtml(stripped);
}

// ---------- cross-reference resolution ----------

/**
 * Live reference snapshot for the proposal currently being backed up. Set once
 * per proposal in `backupOne`; every html→docx conversion resolves chips
 * against it, so a backup shows the SAME numbers the app shows rather than the
 * (possibly stale) labels baked into stored markup.
 */
let CURRENT_REF_SNAPSHOT: RefSnapshotServer | null = null;
let CURRENT_REF_STATS = { passes: 0, found: 0, resolved: 0, unresolved: 0 };

/** One 7-way fetch per proposal, mirroring the client's fetchReferenceData. */
async function loadRefSnapshot(supabase: any, proposalId: string): Promise<RefSnapshotServer> {
  const snap = emptySnapshot();
  try {
    const wpRes = await supabase.from("wp_drafts").select("id, number, short_name").eq("proposal_id", proposalId);
    for (const wp of wpRes.data ?? []) snap.wpById.set(wp.id, wp);
    const wpIds = [...snap.wpById.keys()];
    const noRows = Promise.resolve({ data: [], error: null });
    const [taskRes, delRes, msRes, caseRes, caseTypeRes, partRes, figRes, capRes, proposalRes] = await Promise.all([
      wpIds.length ? supabase.from("wp_draft_tasks").select("id, number, wp_draft_id").in("wp_draft_id", wpIds) : noRows,
      wpIds.length ? supabase.from("wp_draft_deliverables").select("id, number, wp_draft_id").in("wp_draft_id", wpIds) : noRows,
      supabase.from("proposal_milestones").select("id, number").eq("proposal_id", proposalId),
      supabase.from("case_drafts").select("id, number, case_type, case_type_id, short_name").eq("proposal_id", proposalId),
      supabase.from("proposal_case_types").select("id, custom_type_name, include_number, include_abbreviation").eq("proposal_id", proposalId),
      supabase.from("participants").select("id, organisation_short_name").eq("proposal_id", proposalId),
      supabase.from("figures").select("id").eq("proposal_id", proposalId),
      supabase.from("table_captions").select("table_key").eq("proposal_id", proposalId),
      supabase.from("proposals").select("acronym, acronym_segments").eq("id", proposalId).maybeSingle(),
    ]);

    for (const t of taskRes.data ?? []) {
      const wp = snap.wpById.get(t.wp_draft_id);
      if (wp) snap.taskById.set(t.id, { id: t.id, number: t.number, wp_number: wp.number });
    }
    for (const d of delRes.data ?? []) {
      const wp = snap.wpById.get(d.wp_draft_id);
      if (wp) snap.deliverableById.set(d.id, { id: d.id, number: `D${wp.number}.${d.number}` });
    }
    for (const m of msRes.data ?? []) snap.milestoneById.set(m.id, m);
    const caseTypes = new Map((caseTypeRes.data ?? []).map((type: any) => [type.id, type]));
    for (const c of caseRes.data ?? []) {
      const type = c.case_type_id ? caseTypes.get(c.case_type_id) as any : null;
      snap.caseById.set(c.id, {
        ...c,
        custom_type_name: type?.custom_type_name ?? null,
        include_number: type?.include_number !== false,
        include_abbreviation: type?.include_abbreviation !== false,
      });
    }
    for (const p of partRes.data ?? []) snap.participantById.set(p.id, p);
    // Figure numbers are DERIVED from the placing block, exactly as the client
    // does. Unplaced figures get no entry, so their chips keep stored labels.
    const figureNumbers = await deriveFigureNumbers(supabase, proposalId);
    for (const f of figRes.data ?? []) {
      const derived = figureNumbers.get(f.id);
      if (derived) snap.figureById.set(f.id, { id: f.id, figure_number: derived });
    }
    for (const c of capRes.data ?? []) snap.tableCaptionKeys.add(c.table_key);
    // Citation numbers are derived the same way the app derives them, from
    // first-citation order across visible, non-binned content — including the
    // legacy `section_content` bodies, which is where most citations still live.
    const [allCardRes, fieldRes, legacyRes] = await Promise.all([
      supabase.from("proposal_cards").select("id, section_id, order_index, anchor, is_visible, deleted_at").eq("proposal_id", proposalId),
      supabase.from("card_fields").select("id, card_id, order_index, content_html, deleted_at").eq("proposal_id", proposalId),
      supabase.from("section_content").select("section_id, content").eq("proposal_id", proposalId),
    ]);
    // Sections are template-owned, so they are reached through the template of
    // the sections this proposal's cards sit in — legacy bodies need the whole
    // template's ordering, not just the sections that happen to hold cards.
    const citeSectionIds = [...new Set(((allCardRes.data ?? []) as any[]).map((c) => c.section_id).filter(Boolean))];
    const seedSectionRes = citeSectionIds.length
      ? await supabase.from("proposal_template_sections").select("id, section_number, order_index, proposal_template_id").in("id", citeSectionIds)
      : { data: [] };
    const templateId = ((seedSectionRes.data ?? [])[0] as any)?.proposal_template_id ?? null;
    const allSectionRes = templateId
      ? await supabase.from("proposal_template_sections").select("id, section_number, order_index").eq("proposal_template_id", templateId)
      : seedSectionRes;
    snap.citationNumbers = buildCitationNumberMap({
      sections: (allSectionRes.data ?? []) as any[],
      cards: (allCardRes.data ?? []) as any[],
      fields: (fieldRes.data ?? []) as any[],
      legacySections: (legacyRes.data ?? []) as any[],
    });
    const proposal = proposalRes.data;
    snap.acronymSegments = proposal?.acronym_segments?.length
      ? proposal.acronym_segments
      : (proposal?.acronym ? [{ text: proposal.acronym, color: "#000000" }] : []);
  } catch (e) {
    console.error("Reference snapshot fetch failed; backing up stored labels", e);
  }
  return snap;
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Rewrites the visible text of every cross-reference chip to its resolved
 * label. Unresolvable ids (deleted items, chips copied from another proposal)
 * are left untouched so the stored label survives.
 */
function resolveChipsInHtml(html: string): string {
  const snap = CURRENT_REF_SNAPSHOT;
  CURRENT_REF_STATS.passes += 1;
  if (!snap || !html.includes("data-")) return html;
  try {
    const root = parseHtml(html, { lowerCaseTagName: true });
    let changed = false;
    for (const el of root.querySelectorAll("*")) {
      // deno-lint-ignore no-explicit-any
      const attrs = ((el as any).rawAttributes ?? {}) as Record<string, string>;
      const citation = resolveCitationNumber(attrs, snap);
      if (citation != null) {
        if ((el.textContent ?? "").trim() !== citation) {
          // deno-lint-ignore no-explicit-any
          (el as any).set_content(escapeText(citation));
          changed = true;
        }
        continue;
      }
      if (!isRefChip(attrs)) continue;
      CURRENT_REF_STATS.found += 1;
      const label = resolveChipLabel(attrs, snap);
      if (label == null) {
        CURRENT_REF_STATS.unresolved += 1;
        continue;
      }
      CURRENT_REF_STATS.resolved += 1;
      if ((el.textContent ?? "").trim() === label) continue;
      // deno-lint-ignore no-explicit-any
      (el as any).set_content(escapeText(label));
      changed = true;
    }
    return changed ? root.toString() : html;
  } catch (e) {
    console.error("Chip resolution failed; using stored labels", e);
    return html;
  }
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

// ---------- shared card-block reader (Part B modular editors) ----------

/**
 * One block of a card-based section: the card row plus its authored fields,
 * already concatenated in field order. This is the single reader used by every
 * Part B section, including B3.1 (prompt 90).
 */
interface CardBlock {
  id: string;
  kind: string;
  templateKey: string | null;
  sourceKey: string | null;
  title: string | null;
  titleMode: string;
  isVisible: boolean;
  isSourceFed: boolean;
  orderIndex: number;
  html: string;
}

/**
 * Loads visible, non-deleted cards with their authored field HTML.
 * Filter by `sectionId` (the proposal_template_sections uuid) or by
 * `templateKeyPrefix` (B3.1's "b31." board, which is addressed by key).
 */
async function loadCardBlocks(
  supabase: any,
  proposalId: string,
  opts: { sectionId?: string; templateKeyPrefix?: string },
): Promise<CardBlock[]> {
  let q = supabase
    .from("proposal_cards")
    .select("id, kind, template_key, source_key, title, title_mode, is_visible, is_source_fed, order_index")
    .eq("proposal_id", proposalId)
    .is("deleted_at", null);
  if (opts.sectionId) q = q.eq("section_id", opts.sectionId);
  if (opts.templateKeyPrefix) q = q.like("template_key", `${opts.templateKeyPrefix}%`);
  const { data: cards, error: cardsErr } = await q.order("order_index", { ascending: true });
  if (cardsErr) throw cardsErr;
  const rows = (cards ?? []) as any[];
  if (!rows.length) return [];

  const { data: fields, error: fieldsErr } = await supabase
    .from("card_fields")
    .select("card_id, content_html, order_index")
    .in("card_id", rows.map((c) => c.id))
    .is("deleted_at", null)
    .order("order_index", { ascending: true });
  if (fieldsErr) throw fieldsErr;
  const byCard = new Map<string, string[]>();
  for (const f of (fields ?? []) as any[]) {
    const arr = byCard.get(f.card_id) ?? [];
    arr.push(f.content_html ?? "");
    byCard.set(f.card_id, arr);
  }

  return rows.map((c) => ({
    id: c.id,
    kind: c.kind ?? "text",
    templateKey: c.template_key ?? null,
    sourceKey: c.source_key ?? null,
    title: c.title ?? null,
    titleMode: c.title_mode ?? "mirrored",
    isVisible: c.is_visible !== false,
    isSourceFed: !!c.is_source_fed,
    orderIndex: c.order_index ?? 0,
    html: (byCard.get(c.id) ?? []).join("\n"),
  }));
}

/** The reference list a `references` block renders, in derived citation order. */
async function referenceListParagraphs(supabase: any, proposalId: string): Promise<Paragraph[]> {
  const { data, error } = await supabase
    .from("proposal_references")
    .select("ref_key, formatted_citation, authors, year, title, journal")
    .eq("proposal_id", proposalId);
  if (error) { console.error("references fetch failed", error); return []; }
  const numbers = CURRENT_REF_SNAPSHOT?.citationNumbers ?? new Map<number, number>();
  const rows = ((data ?? []) as any[])
    .map((r) => ({ ...r, n: numbers.get(r.ref_key) ?? null }))
    .filter((r) => r.n != null)
    .sort((a, b) => (a.n as number) - (b.n as number));
  return rows.map((r) => {
    const text = (r.formatted_citation ?? "").trim() ||
      [r.authors, r.year ? `(${r.year})` : null, r.title, r.journal].filter(Boolean).join(" ");
    return P(`${r.n}. ${htmlToText(text)}`);
  });
}

/**
 * Renders card blocks to DOCX children exactly in board order. Blocks whose
 * content the app generates live (tables, charts) cannot be reproduced here, so
 * they are named explicitly rather than dropped silently.
 */
async function cardBlocksToChildren(
  supabase: any,
  proposalId: string,
  blocks: CardBlock[],
): Promise<(Paragraph | Table)[]> {
  const out: (Paragraph | Table)[] = [];
  for (const b of blocks) {
    if (!b.isVisible) continue;
    const titleText = htmlToText(b.title ?? "").trim();
    // 'mirrored' is the only mode the app shows in the document itself;
    // 'editor_only' and 'off' headers exist for the writer's board only.
    if (titleText && b.titleMode === "mirrored" && b.kind !== "figure") {
      out.push(H(HeadingLevel.HEADING_2, titleText));
    }
    if (b.kind === "references") {
      const refs = await referenceListParagraphs(supabase, proposalId);
      if (refs.length) out.push(...refs);
      else out.push(P("No references recorded.", { italics: true }));
      continue;
    }
    if (b.html.trim()) {
      out.push(...htmlToDocxChildren(b.html));
      continue;
    }
    if (b.isSourceFed || b.kind === "figure") {
      out.push(P(
        `[${titleText || b.templateKey || b.kind}: generated in the application (${b.kind === "figure" ? "figure" : "live table/list"}) and not reproducible in this DOCX backup.]`,
        { italics: true },
      ));
    }
  }
  return out;
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
    KV("Expertise matrix enabled", yn(proposal.expertise_matrix_enabled)),
    KV("Indicative budget per project", proposal.indicative_budget_per_project),
    KV("FSTP budget", proposal.fstp_budget),
    KV("FSTP budget per third party", proposal.fstp_budget_per_third_party),
    KV("Total budget text", proposal.total_budget_text),
  ];

  // part_a1 content: abstract (plain text paragraphs), keywords, previous submission, declarations.
  const { data: a1 } = await supabase
    .from("part_a1")
    .select("abstract, fixed_keywords, free_keywords, previous_submission, previous_submission_reference, declarations")
    .eq("proposal_id", proposal.id)
    .maybeSingle();

  if (a1) {
    if (a1.abstract && String(a1.abstract).trim()) {
      children.push(H(HeadingLevel.HEADING_2, "Abstract"));
      for (const line of String(a1.abstract).split(/\r?\n/)) {
        children.push(P(line));
      }
    }
    const fixedKw = Array.isArray(a1.fixed_keywords) ? a1.fixed_keywords.filter((s: any) => s && String(s).trim()) : [];
    if (fixedKw.length || (a1.free_keywords && String(a1.free_keywords).trim())) {
      children.push(H(HeadingLevel.HEADING_2, "Keywords"));
      if (fixedKw.length) children.push(KV("Fixed keywords", fixedKw.join(", ")));
      if (a1.free_keywords && String(a1.free_keywords).trim()) children.push(KV("Free keywords", a1.free_keywords));
    }
    if ((a1.previous_submission && String(a1.previous_submission).trim())
      || (a1.previous_submission_reference && String(a1.previous_submission_reference).trim())) {
      children.push(H(HeadingLevel.HEADING_2, "Previous submission"));
      if (a1.previous_submission && String(a1.previous_submission).trim()) {
        for (const line of String(a1.previous_submission).split(/\r?\n/)) children.push(P(line));
      }
      if (a1.previous_submission_reference && String(a1.previous_submission_reference).trim()) {
        children.push(KV("Reference", a1.previous_submission_reference));
      }
    }
    const decl = (a1.declarations && typeof a1.declarations === "object") ? a1.declarations as Record<string, any> : null;
    if (decl && Object.keys(decl).length) {
      children.push(H(HeadingLevel.HEADING_2, "Declarations"));
      const declLabels: Record<string, string> = {
        eligibility: "Eligibility",
        ethics: "Ethics",
        consent: "Consent",
        outsideEU: "Activities outside the EU",
        termsPrivacy: "Terms & privacy",
        communication: "Communication",
        correctComplete: "Information correct & complete",
        civilApplications: "Civil applications only",
        prohibitedResearch: "No prohibited research",
      };
      for (const [k, v] of Object.entries(decl)) {
        children.push(KV(declLabels[k] ?? k, yn(v)));
      }
    }
  }

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
function roundLumpSumCents(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function lumpSumParticipantLabel(participant: any): string {
  if (!participant) return "";
  return `P${participant.participant_number ?? "?"} ${participant.organisation_short_name || participant.organisation_name || ""}`.trim();
}

function lumpSumWpLabel(wp: any): string {
  return `WP${wp?.number ?? "?"}`;
}

const LUMP_SUM_CATEGORY_LABELS: Record<string, string> = {
  senior_scientist: "Senior expert",
  junior_scientist: "Junior expert",
  technical: "Technical role",
  administrative: "Administrative role",
  others: "Others",
};

async function appendLumpSumSheets(
  wb: any,
  supabase: any,
  proposal: any,
  participants: any[],
  workPackages: any[],
): Promise<{ names: string[]; rowCounts: Record<string, number> }> {
  const [rolesResult, effortResult, costsResult, depreciationResult, participantBudgetsResult, wpBudgetsResult, overridesResult] = await Promise.all([
    supabase.from("ls_personnel_roles").select("id, participant_id, cost_line, role_name, he_category, pm_rate").eq("proposal_id", proposal.id),
    supabase.from("ls_personnel_effort").select("role_id, wp_draft_id, person_months").eq("proposal_id", proposal.id),
    supabase.from("ls_cost_items").select("participant_id, wp_draft_id, cost_line, quantity, unit_cost, amount, justification, order_index").eq("proposal_id", proposal.id).order("order_index"),
    supabase.from("ls_depreciation_items").select("participant_id, wp_draft_id, resource_type, short_name, purchase_date, purchase_cost, pct_project, pct_useful_life, charged_depreciation, include_in_c2, comments, order_index").eq("proposal_id", proposal.id).order("order_index"),
    supabase.from("ls_participant_budget").select("participant_id, a4_unit_cost, funding_rate_override").eq("proposal_id", proposal.id),
    supabase.from("ls_wp_budget").select("participant_id, wp_draft_id, requested_eu_contribution, comments").eq("proposal_id", proposal.id),
    supabase.from("ls_budget_permission_overrides").select("id").eq("proposal_id", proposal.id),
  ]);
  const results = [rolesResult, effortResult, costsResult, depreciationResult, participantBudgetsResult, wpBudgetsResult, overridesResult];
  const failed = results.find((result: any) => result.error);
  if (failed?.error) throw failed.error;

  const roles = rolesResult.data ?? [];
  const efforts = effortResult.data ?? [];
  const costs = costsResult.data ?? [];
  const depreciation = depreciationResult.data ?? [];
  const participantBudgets = participantBudgetsResult.data ?? [];
  const wpBudgets = wpBudgetsResult.data ?? [];
  const overrides = overridesResult.data ?? [];
  const hasLumpSumRows = [roles, efforts, costs, depreciation, participantBudgets, wpBudgets, overrides].some((rows: any[]) => rows.length > 0);
  if (proposal.budget_type !== "lump_sum" && !hasLumpSumRows) return { names: [], rowCounts: {} };

  const participantById = new Map(participants.map((participant: any) => [participant.id, participant]));
  const wpById = new Map(workPackages.map((wp: any) => [wp.id, wp]));
  const budgetByParticipant = new Map(participantBudgets.map((row: any) => [row.participant_id, row]));
  const effortByRoleWp = new Map(efforts.map((row: any) => [`${row.role_id}|${row.wp_draft_id}`, Number(row.person_months ?? 0)]));
  const roleById = new Map(roles.map((role: any) => [role.id, role]));
  const wpBudgetByParticipantWp = new Map(wpBudgets.map((row: any) => [`${row.participant_id}|${row.wp_draft_id}`, row]));
  const rateForRole = (role: any): number => role.cost_line === "A.4"
    ? Number(budgetByParticipant.get(role.participant_id)?.a4_unit_cost ?? 0)
    : Number(role.pm_rate ?? 0);
  const groupKeyForRole = (role: any): string => `${role.participant_id}|${role.cost_line}|${role.cost_line === "A.1" ? (role.he_category || "blank") : "all"}`;
  const groupStats = new Map<string, { personMonths: number; trueCost: number }>();
  for (const effort of efforts) {
    const role = roleById.get(effort.role_id);
    if (!role) continue;
    const pm = Number(effort.person_months ?? 0);
    const key = groupKeyForRole(role);
    const existing = groupStats.get(key) ?? { personMonths: 0, trueCost: 0 };
    existing.personMonths += pm;
    existing.trueCost += pm * rateForRole(role);
    groupStats.set(key, existing);
  }
  const roundedRateForGroup = (key: string): number => {
    const stats = groupStats.get(key);
    return stats && stats.personMonths > 0 ? roundLumpSumCents(stats.trueCost / stats.personMonths) : 0;
  };
  const personnelCost = (role: any, wpId: string): number => {
    const pm = effortByRoleWp.get(`${role.id}|${wpId}`) ?? 0;
    return roundLumpSumCents(roundedRateForGroup(groupKeyForRole(role)) * pm);
  };
  const participantLabel = (id: string) => lumpSumParticipantLabel(participantById.get(id));
  const participantByIdOrNumber = new Map(participants.map((participant: any) => [participant.id, participant]));
  const wpLabel = (id: string) => lumpSumWpLabel(wpById.get(id));
  const dateLabel = (value: string | null | undefined) => value ? String(value).slice(0, 10) : "";

  const styleHeaders = (ws: any, rowNum: number, colCount: number) => {
    for (let c = 0; c < colCount; c++) {
      const ref = `${String.fromCharCode(65 + c)}${rowNum}`;
      if (ws[ref]) ws[ref].s = { font: { bold: true } };
    }
  };
  const styleNumberColumns = (ws: any, colIndexes: number[], firstRow: number, lastRow: number, format: string) => {
    for (let row = firstRow; row <= lastRow; row++) {
      for (const col of colIndexes) {
        let n = col;
        let letters = "";
        while (n >= 0) { letters = String.fromCharCode(65 + (n % 26)) + letters; n = Math.floor(n / 26) - 1; }
        const ref = `${letters}${row}`;
        if (ws[ref]) ws[ref].s = { ...(ws[ref].s || {}), numFmt: format };
      }
    }
  };
  const autoFit = (ws: any, rows: any[][]) => {
    const widths: number[] = [];
    for (const row of rows) row.forEach((cell: any, index: number) => {
      const length = cell == null ? 0 : typeof cell === "object" && cell.f ? 12 : String(cell).length;
      widths[index] = Math.max(widths[index] || 0, length);
    });
    ws["!cols"] = widths.map((width) => ({ wch: Math.max(width + 2, 8) }));
  };

  const personnelHeaders = ["Participant", "Role name", "F&TP category", "PM rate (€)", "Work package", "Person-months", "Cost (€)"];
  const personnelRows: any[][] = [personnelHeaders];
  for (const role of roles) {
    for (const wp of workPackages) {
      personnelRows.push([
        participantLabel(role.participant_id),
        role.role_name ?? "",
        role.cost_line === "A.1" ? (LUMP_SUM_CATEGORY_LABELS[role.he_category] ?? role.he_category ?? "") : "",
        rateForRole(role),
        wpLabel(wp.id),
        effortByRoleWp.get(`${role.id}|${wp.id}`) ?? 0,
        personnelCost(role, wp.id),
      ]);
    }
  }
  const personnelSheet = XLSX.utils.aoa_to_sheet(personnelRows);
  styleHeaders(personnelSheet, 1, personnelHeaders.length);
  styleNumberColumns(personnelSheet, [3, 5], 2, personnelRows.length, "0.0");
  styleNumberColumns(personnelSheet, [6], 2, personnelRows.length, "#,##0.00");
  autoFit(personnelSheet, personnelRows);
  XLSX.utils.book_append_sheet(wb, personnelSheet, "Lump sum personnel");

  const costHeaders = ["Participant", "Cost line", "Work package", "Quantity", "Unit cost (€)", "Amount (€)", "Justification"];
  const costRows: any[][] = [costHeaders, ...costs.map((item: any) => [
    participantLabel(item.participant_id), item.cost_line ?? "", wpLabel(item.wp_draft_id),
    Number(item.quantity ?? 0), Number(item.unit_cost ?? 0), Number(item.amount ?? 0), item.justification ?? "",
  ])];
  const costSheet = XLSX.utils.aoa_to_sheet(costRows);
  styleHeaders(costSheet, 1, costHeaders.length);
  styleNumberColumns(costSheet, [3], 2, costRows.length, "0.00");
  styleNumberColumns(costSheet, [4, 5], 2, costRows.length, "#,##0.00");
  autoFit(costSheet, costRows);
  XLSX.utils.book_append_sheet(wb, costSheet, "Lump sum costs");

  const depreciationHeaders = ["Participant", "Work package", "Resource type", "Short name", "Purchase date", "Purchase cost (€)", "% project", "% life", "Charged depreciation (€)", "Included in C.2", "Comments"];
  const depreciationRows: any[][] = [depreciationHeaders, ...depreciation.map((item: any) => [
    participantLabel(item.participant_id), wpLabel(item.wp_draft_id), item.resource_type ?? "", item.short_name ?? "", dateLabel(item.purchase_date),
    Number(item.purchase_cost ?? 0), Number(item.pct_project ?? 0), Number(item.pct_useful_life ?? 0), Number(item.charged_depreciation ?? 0),
    item.include_in_c2 ? "Yes" : "No", item.comments ?? "",
  ])];
  const depreciationSheet = XLSX.utils.aoa_to_sheet(depreciationRows);
  styleHeaders(depreciationSheet, 1, depreciationHeaders.length);
  styleNumberColumns(depreciationSheet, [5, 8], 2, depreciationRows.length, "#,##0.00");
  styleNumberColumns(depreciationSheet, [6, 7], 2, depreciationRows.length, "0.00");
  autoFit(depreciationSheet, depreciationRows);
  XLSX.utils.book_append_sheet(wb, depreciationSheet, "Lump sum depreciation");

  const costsByParticipantWpLine = new Map<string, number>();
  for (const item of costs) {
    const key = `${item.participant_id}|${item.wp_draft_id}|${item.cost_line}`;
    costsByParticipantWpLine.set(key, (costsByParticipantWpLine.get(key) ?? 0) + Number(item.amount ?? 0));
  }
  for (const item of depreciation) {
    if (!item.include_in_c2) continue;
    const key = `${item.participant_id}|${item.wp_draft_id}|C.2.${item.resource_type}`;
    costsByParticipantWpLine.set(key, (costsByParticipantWpLine.get(key) ?? 0) + Number(item.charged_depreciation ?? 0));
  }
  const totalsHeaders = ["Participant", "Work package", "A (€)", "B (€)", "C (€)", "D (€)", "E (€)", "F (€)", "G (€)", "H (€)", "Work-package comment"];
  const totalsRows: any[][] = [totalsHeaders];
  const totalByWp = (participantId: string, wpId: string) => {
    let a = 0;
    for (const role of roles.filter((candidate: any) => candidate.participant_id === participantId)) a += personnelCost(role, wpId);
    let b = 0; let c = 0; let d = 0;
    for (const [key, amount] of costsByParticipantWpLine) {
      const [p, w, line] = key.split("|");
      if (p !== participantId || w !== wpId) continue;
      if (line === "B.1") b += amount;
      else if (line.startsWith("C.")) c += amount;
      else if (line === "D.1" || line === "D.2") d += amount;
    }
    a = roundLumpSumCents(a); b = roundLumpSumCents(b); c = roundLumpSumCents(c); d = roundLumpSumCents(d);
    const e = roundLumpSumCents((a + c) * Number(proposal.ls_indirect_cost_rate ?? 0) / 100);
    const f = roundLumpSumCents(a + b + c + d + e);
    const participantBudget = budgetByParticipant.get(participantId);
    const fundingRate = participantBudget?.funding_rate_override != null
      ? Number(participantBudget.funding_rate_override)
      : Number(proposal.ls_default_funding_rate ?? 0);
    const g = roundLumpSumCents(f * fundingRate / 100);
    const wpBudget = wpBudgetByParticipantWp.get(`${participantId}|${wpId}`);
    const h = wpBudget?.requested_eu_contribution != null ? Number(wpBudget.requested_eu_contribution) : g;
    return { a, b, c, d, e, f, g: roundLumpSumCents(g), h: roundLumpSumCents(h), comment: wpBudget?.comments ?? "" };
  };
  for (const participant of participants) for (const wp of workPackages) {
    const total = totalByWp(participant.id, wp.id);
    totalsRows.push([lumpSumParticipantLabel(participant), wpLabel(wp.id), total.a, total.b, total.c, total.d, total.e, total.f, total.g, total.h, total.comment]);
  }
  const totalsSheet = XLSX.utils.aoa_to_sheet(totalsRows);
  styleHeaders(totalsSheet, 1, totalsHeaders.length);
  styleNumberColumns(totalsSheet, [2, 3, 4, 5, 6, 7, 8, 9], 2, totalsRows.length, "#,##0.00");
  autoFit(totalsSheet, totalsRows);
  XLSX.utils.book_append_sheet(wb, totalsSheet, "Lump sum totals");

  return {
    names: ["Lump sum personnel", "Lump sum costs", "Lump sum depreciation", "Lump sum totals"],
    rowCounts: {
      "Lump sum personnel": personnelRows.length - 1,
      "Lump sum costs": costRows.length - 1,
      "Lump sum depreciation": depreciationRows.length - 1,
      "Lump sum totals": totalsRows.length - 1,
    },
  };
}

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
    // 25% flat rate on A + C only (excludes B, D.1 and D.2).
    const indirectBase = personnelCosts + travel + equipment + otherGoods + procurement;
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
      const reqIndirect = Math.round((reqPersonnel + reqTravel + reqEquip + reqOther) * 0.25 * 100) / 100;
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
      ? row.indirectCostsOverride : { f: `=ROUND((D${r}+F${r}+G${r}+H${r})*0.25,2)` };
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

  await appendLumpSumSheets(wb, supabase, proposal, cachedParticipants, cachedWps);

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
    ? await supabase.from("participant_ocd_uploads").select("*").in("participant_id", partIds).order("uploaded_at", { ascending: true })
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

/**
 * Maps a legacy section label ("b1-1") to the proposal_template_sections uuid
 * the modular card board is keyed by ("B1.1"), for the sections that have
 * cards. Cached per proposal for the lifetime of the run.
 */
const SECTION_UUID_CACHE = new Map<string, Map<string, string>>();
async function sectionUuidByNumber(supabase: any, proposalId: string): Promise<Map<string, string>> {
  const cached = SECTION_UUID_CACHE.get(proposalId);
  if (cached) return cached;
  const map = new Map<string, string>();
  const { data: cardSecs, error: secErr } = await supabase
    .from("proposal_cards").select("section_id").eq("proposal_id", proposalId).is("deleted_at", null);
  if (secErr) { console.error("card section lookup failed", secErr); SECTION_UUID_CACHE.set(proposalId, map); return map; }
  const ids = [...new Set(((cardSecs ?? []) as any[]).map((c) => c.section_id).filter(Boolean))];
  if (ids.length) {
    const { data: secs, error: tsErr } = await supabase
      .from("proposal_template_sections").select("id, section_number").in("id", ids);
    if (tsErr) console.error("template section lookup failed", tsErr);
    for (const s of (secs ?? []) as any[]) {
      if (s.section_number) map.set(String(s.section_number).toUpperCase(), s.id);
    }
  }
  SECTION_UUID_CACHE.set(proposalId, map);
  return map;
}

/** "b1-1" -> "B1.1" */
function sectionNumberFromLabel(label: string): string {
  return label.toUpperCase();
}

async function buildPartBSection(supabase: any, proposal: any, sectionId: string, label: string): Promise<Uint8Array> {
  const children: (Paragraph | Table)[] = [H(HeadingLevel.HEADING_1, `Part ${label}`)];

  // Part B moved to modular card boards. Cards are the live document; the
  // legacy section_versions body is only the pre-cutover fallback (prompt 90).
  const uuidByNumber = await sectionUuidByNumber(supabase, proposal.id);
  const sectionUuid = uuidByNumber.get(sectionNumberFromLabel(label));
  const blocks = sectionUuid
    ? await loadCardBlocks(supabase, proposal.id, { sectionId: sectionUuid })
    : [];
  if (blocks.length) {
    children.push(...(await cardBlocksToChildren(supabase, proposal.id, blocks)));
    console.log(`Part ${label} sourced from cards`, { proposal_id: proposal.id, blocks: blocks.length });
  } else {
    const content = await latestSectionContent(supabase, proposal.id, sectionId);
    children.push(...htmlToDocxChildren(content));
    console.log(`Part ${label} sourced from section_versions (no cards)`, { proposal_id: proposal.id });
  }


  // ── B1.2: append structured ongoing-projects table ──
  if (sectionId === "b1-2") {
    const { data: projects } = await supabase
      .from("b12_ongoing_projects")
      .select("id, project_info, shared_data, order_index")
      .eq("proposal_id", proposal.id)
      .order("order_index", { ascending: true });
    const projIds = (projects ?? []).map((p: any) => p.id);
    const [{ data: links }, { data: parts }] = await Promise.all([
      projIds.length
        ? supabase.from("b12_ongoing_project_participants")
            .select("ongoing_project_id, participant_id").in("ongoing_project_id", projIds)
        : Promise.resolve({ data: [] }),
      supabase.from("participants")
        .select("id, participant_number, organisation_short_name")
        .eq("proposal_id", proposal.id),
    ]);
    const partById = new Map<string, any>();
    for (const p of parts ?? []) partById.set(p.id, p);
    const linkMap = new Map<string, string[]>();
    for (const l of links ?? []) {
      const arr = linkMap.get(l.ongoing_project_id) ?? [];
      arr.push(l.participant_id);
      linkMap.set(l.ongoing_project_id, arr);
    }
    if ((projects ?? []).length) {
      children.push(H(HeadingLevel.HEADING_2, "Ongoing projects"));
      children.push(simpleTable(
        ["Project info", "Data / results shared", "Participants"],
        (projects ?? []).map((pr: any) => {
          const partLabels = (linkMap.get(pr.id) ?? [])
            .map((id) => partById.get(id))
            .filter(Boolean)
            .sort((a, b) => (a.participant_number ?? 0) - (b.participant_number ?? 0))
            .map((p) => `P${p.participant_number} ${p.organisation_short_name ?? ""}`);
          return [
            htmlToText(pr.project_info ?? ""),
            htmlToText(pr.shared_data ?? ""),
            partLabels.join(", ") || "—",
          ];
        }),
      ));
    }
  }

  // ── B3.2: append expertise matrix (if enabled) ──
  if (sectionId === "b3-2" && proposal.expertise_matrix_enabled) {
    const [{ data: cols }, { data: rows }, { data: cells }, { data: parts }] = await Promise.all([
      supabase.from("expertise_matrix_columns")
        .select("id, kind, participant_id, header_text, order_index")
        .eq("proposal_id", proposal.id).order("order_index", { ascending: true }),
      supabase.from("expertise_matrix_rows")
        .select("id, label, order_index")
        .eq("proposal_id", proposal.id).order("order_index", { ascending: true }),
      supabase.from("expertise_matrix_cells").select("row_id, column_id, checked"),
      supabase.from("participants")
        .select("id, participant_number, organisation_short_name")
        .eq("proposal_id", proposal.id),
    ]);
    const partById = new Map<string, any>();
    for (const p of parts ?? []) partById.set(p.id, p);
    const rowIds = new Set((rows ?? []).map((r: any) => r.id));
    const checkKey = new Set<string>();
    for (const c of cells ?? []) {
      if (c.checked && rowIds.has(c.row_id)) checkKey.add(`${c.row_id}::${c.column_id}`);
    }
    if ((rows ?? []).length && (cols ?? []).length) {
      children.push(H(HeadingLevel.HEADING_2, "Expertise matrix"));
      const colLabels = (cols ?? []).map((c: any) => {
        if (c.kind === "participant") {
          const p = c.participant_id ? partById.get(c.participant_id) : null;
          return p ? `P${p.participant_number} ${p.organisation_short_name ?? ""}` : (c.header_text ?? "—");
        }
        return c.header_text ?? "—";
      });
      const matrixRows = (rows ?? []).map((r: any) => [
        r.label ?? "",
        ...(cols ?? []).map((c: any) => checkKey.has(`${r.id}::${c.id}`) ? "✓" : ""),
      ]);
      children.push(simpleTable(["Expertise", ...colLabels], matrixRows));
    }
  }

  return await packDocx(children);
}

async function buildB31(supabase: any, proposal: any): Promise<Uint8Array> {
  const [intro, body] = await Promise.all([
    latestSectionContent(supabase, proposal.id, "b31-intro-text"),
    latestSectionContent(supabase, proposal.id, "b3-1"),
  ]);

  // Read B3.1 justification toggle flags from the proposal (b31_show_*)
  const { data: propFlags } = await supabase
    .from("proposals")
    .select(
      "b31_show_purchase_costs, b31_show_travel_justification, b31_show_equipment_justification, b31_show_other_goods_justification"
    )
    .eq("id", proposal.id)
    .maybeSingle();
  const toggles = {
    purchase_costs: !!propFlags?.b31_show_purchase_costs,
    travel: !!propFlags?.b31_show_travel_justification,
    equipment: !!propFlags?.b31_show_equipment_justification,
    other_goods: !!propFlags?.b31_show_other_goods_justification,
  };

  // Block visibility from the B3.1 block board, read through the shared card
  // reader (prompt 90). The board is the preview the writer sees, so a hidden
  // block must not appear in the DOCX. When a proposal has no B3.1 blocks yet
  // (pre-cutover), every block counts as visible and the b31_show_* booleans
  // alone decide, exactly as before.
  const b31Blocks = await loadCardBlocks(supabase, proposal.id, { templateKeyPrefix: "b31." });
  const cardVisible = new Map<string, boolean>();
  for (const b of b31Blocks) if (b.templateKey) cardVisible.set(b.templateKey, b.isVisible);
  const blockVisible = (key: string) => cardVisible.get(key) !== false;

  // Authored text now lives on the b31.intro block. Once the board exists it
  // supersedes the legacy `section_content` bodies, which stay untouched as the
  // rollback path.
  const introCard = b31Blocks.find((b) => b.templateKey === "b31.intro");
  let introHtml = intro;
  let bodyHtml = body;
  if (introCard) {
    introHtml = introCard.html;
    bodyHtml = "";
  }


  const { data: wps } = await supabase
    .from("wp_drafts")
    .select("id, number, short_name, title, color, lead_participant_id, manual_duration, b31_objectives, b31_description_before_tasks")
    .eq("proposal_id", proposal.id)
    .order("number", { ascending: true });

  const wpIds = (wps ?? []).map((w: any) => w.id);

  // Live tables replacing the deleted b31_* snapshot tables.
  const [
    { data: tasks },
    { data: deliverables },
    { data: milestones },
    { data: risks },
    { data: msLinks },
    { data: riskLinks },
    { data: participants },
    { data: wpEffortRows },
  ] = await Promise.all([
    wpIds.length
      ? supabase.from("wp_draft_tasks")
          .select("id, wp_draft_id, number, title, description, lead_participant_id, start_month, end_month, order_index")
          .in("wp_draft_id", wpIds)
          .order("number", { ascending: true })
      : Promise.resolve({ data: [] }),
    wpIds.length
      ? supabase.from("wp_draft_deliverables")
          .select("id, wp_draft_id, number, title, type, dissemination_level, responsible_participant_id, due_month, description, order_index")
          .in("wp_draft_id", wpIds)
      : Promise.resolve({ data: [] }),
    supabase.from("proposal_milestones")
      .select("id, number, title, due_month, means_of_verification, order_index")
      .eq("proposal_id", proposal.id)
      .order("number", { ascending: true }),
    supabase.from("proposal_risks")
      .select("id, number, title, likelihood, severity, mitigation, order_index, created_at")
      .eq("proposal_id", proposal.id)
      .order("order_index", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase.from("proposal_milestone_wps").select("milestone_id, wp_draft_id"),
    supabase.from("proposal_risk_wps").select("risk_id, wp_draft_id"),
    supabase.from("participants").select("id, participant_number, organisation_short_name")
      .eq("proposal_id", proposal.id)
      .order("participant_number", { ascending: true }),
    wpIds.length
      ? supabase.from("wp_draft_effort").select("wp_draft_id, participant_id, person_months").in("wp_draft_id", wpIds)
      : Promise.resolve({ data: [] }),
  ]);

  // Per-task effort for aggregating participant PMs where needed.
  const taskIds = (tasks ?? []).map((t: any) => t.id);
  const [{ data: taskParts }, { data: taskEffort }] = await Promise.all([
    taskIds.length
      ? supabase.from("wp_draft_task_participants").select("task_id, participant_id").in("task_id", taskIds)
      : Promise.resolve({ data: [] }),
    taskIds.length
      ? supabase.from("wp_draft_task_effort").select("task_id, participant_id, person_months").in("task_id", taskIds)
      : Promise.resolve({ data: [] }),
  ]);

  const wpIdSet = new Set(wpIds);
  const msLinkMap = new Map<string, string[]>();
  for (const l of msLinks ?? []) {
    if (!wpIdSet.has(l.wp_draft_id)) continue;
    const arr = msLinkMap.get(l.milestone_id) ?? [];
    arr.push(l.wp_draft_id);
    msLinkMap.set(l.milestone_id, arr);
  }
  const riskLinkMap = new Map<string, string[]>();
  for (const l of riskLinks ?? []) {
    if (!wpIdSet.has(l.wp_draft_id)) continue;
    const arr = riskLinkMap.get(l.risk_id) ?? [];
    arr.push(l.wp_draft_id);
    riskLinkMap.set(l.risk_id, arr);
  }

  const wpById = new Map<string, any>();
  for (const w of wps ?? []) wpById.set(w.id, w);

  // ── Justification items (subcontracting / equipment / travel / other_goods) ──
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
        .order("order_index")
    : { data: [] };
  const itemsByCat = (cat: string) => (justItemsRaw ?? []).filter((it: any) => it.category === cat);
  let subItems = itemsByCat("subcontracting");
  const equipItemsAll = itemsByCat("equipment");
  let travelItems = itemsByCat("travel");
  let otherGoodsItems = itemsByCat("other_goods");

  const brToPart = new Map<string, string>();
  for (const br of budgetRows ?? []) brToPart.set(br.id, br.participant_id);

  // Aggregate PMs per participant (from wp-level effort) for 15% personnel rule.
  const pmByPart = new Map<string, number>();
  for (const e of wpEffortRows ?? []) {
    pmByPart.set(e.participant_id, (pmByPart.get(e.participant_id) || 0) + Number(e.person_months ?? 0));
  }
  const personnelCostFor = (partId: string): number => {
    const br = (budgetRows ?? []).find((r: any) => r.participant_id === partId);
    if (!br) return 0;
    const pmRate = br.pm_rate != null ? Number(br.pm_rate) : null;
    if (pmRate != null && pmRate > 0) return Math.round(pmRate * (pmByPart.get(partId) || 0));
    return Number(br.personnel_costs || 0);
  };
  // Apply 15%-of-personnel rule per participant for equipment.
  const equipTotalsByPart = new Map<string, number>();
  for (const it of equipItemsAll) {
    const partId = brToPart.get(it.budget_row_id);
    if (!partId) continue;
    equipTotalsByPart.set(partId, (equipTotalsByPart.get(partId) || 0) + Number(it.amount || 0));
  }
  const partsForced = new Set<string>();
  for (const [partId, total] of equipTotalsByPart) {
    const pers = personnelCostFor(partId);
    if (pers > 0 ? total > 0.15 * pers : total > 0) partsForced.add(partId);
  }
  const c2ForcedOn = partsForced.size > 0;
  const includeEquipmentCategory = (toggles.purchase_costs || c2ForcedOn) && (c2ForcedOn || toggles.equipment);
  let equipItems = equipItemsAll.filter((it: any) => {
    if (!includeEquipmentCategory) return false;
    const partId = brToPart.get(it.budget_row_id);
    if (!partId) return false;
    return partsForced.has(partId); // below-15% participants are never justified
  });
  let includeTravel = toggles.purchase_costs && toggles.travel && travelItems.length > 0;
  let includeOtherGoods = toggles.purchase_costs && toggles.other_goods && otherGoodsItems.length > 0;

  // ── LUMP-SUM PATH ──────────────────────────────────────────────────────────
  // An edge function cannot import src/lib/budgetSourceAdapter.ts, so the
  // adapter's lump-sum decision is re-implemented here against the same tables
  // and with the same rules, and this branch REPLACES the traditional
  // `budget_rows` items above. The traditional branch is left byte-identical.
  //   * C.1 travel  → mirrored when ls_mirror_settings['C.1'] is on
  //   * C.3 sub-lines → mirrored per their own cost_line flag
  //   * C.2 sub-lines → mirrored per flag (legacy 'C.2' parent only when no
  //     sub-line flag exists at all), OR forced when a participant's total C.2
  //     (all sub-lines + depreciation charged into C.2) exceeds 15% of their
  //     personnel cost
  //   * B.1 subcontracting → always included
  if (proposal.budget_type === "lump_sum") {
    const [
      { data: lsRoles },
      { data: lsEffort },
      { data: lsBudget },
      { data: lsItems },
      { data: lsDepr },
      { data: lsMirrors },
    ] = await Promise.all([
      supabase.from("ls_personnel_roles").select("id, participant_id, cost_line, pm_rate").eq("proposal_id", proposal.id),
      supabase.from("ls_personnel_effort").select("role_id, person_months").eq("proposal_id", proposal.id),
      supabase.from("ls_participant_budget").select("participant_id, a4_unit_cost").eq("proposal_id", proposal.id),
      supabase.from("ls_cost_items").select("participant_id, cost_line, amount, justification, order_index").eq("proposal_id", proposal.id).order("order_index"),
      supabase.from("ls_depreciation_items").select("participant_id, resource_type, include_in_c2, charged_depreciation, short_name, comments, order_index").eq("proposal_id", proposal.id).order("order_index"),
      supabase.from("ls_mirror_settings").select("cost_line, is_mirrored").eq("proposal_id", proposal.id),
    ]);

    const mirror: Record<string, boolean> = {};
    for (const m of lsMirrors ?? []) mirror[m.cost_line] = !!m.is_mirrored;

    const pmByRole = new Map<string, number>();
    for (const e of lsEffort ?? []) {
      pmByRole.set(e.role_id, (pmByRole.get(e.role_id) || 0) + Number(e.person_months ?? 0));
    }
    const a4ByPart = new Map<string, number>();
    for (const b of lsBudget ?? []) a4ByPart.set(b.participant_id, Number(b.a4_unit_cost ?? 0));

    // Personnel cost per participant: PM × the role's rate (A.4 uses the
    // participant's A.4 unit cost), the same inputs the canonical helper uses.
    const lsPersonnelCost = new Map<string, number>();
    for (const r of lsRoles ?? []) {
      if (!/^A\.[1-4]$/.test(r.cost_line)) continue;
      const rate = r.cost_line === "A.4" ? (a4ByPart.get(r.participant_id) ?? 0) : Number(r.pm_rate ?? 0);
      const cost = rate * (pmByRole.get(r.id) || 0);
      lsPersonnelCost.set(r.participant_id, (lsPersonnelCost.get(r.participant_id) || 0) + cost);
    }

    // C.2 exposure per participant: every C.2 sub-line plus depreciation
    // charged into C.2.
    const c2ByPart = new Map<string, number>();
    for (const it of lsItems ?? []) {
      if (!String(it.cost_line).startsWith("C.2")) continue;
      c2ByPart.set(it.participant_id, (c2ByPart.get(it.participant_id) || 0) + Number(it.amount ?? 0));
    }
    for (const d of lsDepr ?? []) {
      if (!d.include_in_c2) continue;
      c2ByPart.set(d.participant_id, (c2ByPart.get(d.participant_id) || 0) + Number(d.charged_depreciation ?? 0));
    }
    const lsForced = new Set<string>();
    for (const [partId, total] of c2ByPart) {
      if (total <= 0) continue;
      const pers = lsPersonnelCost.get(partId) || 0;
      if (pers > 0 ? total > 0.15 * pers : true) lsForced.add(partId);
    }

    const hasC2Sublines = ["C.2.infrastructure", "C.2.equipment", "C.2.other_assets"]
      .some((k) => mirror[k] !== undefined);
    const c2MirroredFor = (partId: string, costLine: string) =>
      Boolean(mirror[costLine] || (!hasC2Sublines && mirror["C.2"])) || lsForced.has(partId);

    // Synthetic items reuse the traditional renderer: `budget_row_id` carries
    // the participant id and `brToPart` maps it back to itself.
    for (const p of participants ?? []) brToPart.set(p.id, p.id);
    const mk = (partId: string, amount: number, text: string) => ({
      budget_row_id: partId,
      amount,
      justification: text,
      description: "",
    });

    const lsSub: any[] = [];
    const lsTravel: any[] = [];
    const lsEquip: any[] = [];
    const lsOther: any[] = [];
    for (const it of lsItems ?? []) {
      const line = String(it.cost_line);
      const amount = Number(it.amount ?? 0);
      const text = it.justification || "";
      if (amount === 0 && !text.trim()) continue;
      if (line === "B.1") lsSub.push(mk(it.participant_id, amount, text));
      else if (line === "C.1") { if (mirror["C.1"]) lsTravel.push(mk(it.participant_id, amount, text)); }
      else if (line.startsWith("C.2")) { if (c2MirroredFor(it.participant_id, line)) lsEquip.push(mk(it.participant_id, amount, text)); }
      else if (line.startsWith("C.3")) { if (mirror[line]) lsOther.push(mk(it.participant_id, amount, text)); }
    }
    for (const d of lsDepr ?? []) {
      if (!d.include_in_c2 || !c2MirroredFor(d.participant_id, `C.2.${d.resource_type}`)) continue;
      const amount = Number(d.charged_depreciation ?? 0);
      const text = [d.short_name || "", d.comments || ""].filter((s: string) => s.trim()).join(" — ");
      if (amount === 0 && !text) continue;
      lsEquip.push(mk(d.participant_id, amount, text));
    }

    subItems = lsSub;
    travelItems = lsTravel;
    equipItems = lsEquip;
    otherGoodsItems = lsOther;
    // Mirror settings are the ONLY gate on this path; the legacy b31_show_*
    // switches are deliberately bypassed.
    includeTravel = lsTravel.length > 0;
    includeOtherGoods = lsOther.length > 0;
  }


  const partLabel = (id: string | null) => {
    if (!id) return "—";
    const p = (participants ?? []).find((x: any) => x.id === id);
    return p ? `P${p.participant_number} ${p.organisation_short_name ?? ""}` : "—";
  };
  const wpLabel = (id: string): string => {
    const w = wpById.get(id);
    return w ? `WP${w.number}` : "";
  };

  const children: (Paragraph | Table)[] = [H(HeadingLevel.HEADING_1, "Part B3.1 — Work plan & work packages")];

  if (introHtml && introHtml.trim() && blockVisible("b31.intro")) {
    children.push(H(HeadingLevel.HEADING_2, "Overall structure of the work plan"));
    children.push(...htmlToDocxChildren(introHtml));
  }
  if (bodyHtml && bodyHtml.trim()) {
    children.push(H(HeadingLevel.HEADING_2, "Section body"));
    children.push(...htmlToDocxChildren(bodyHtml));
  }

  // Effort per (wp, participant); WP totals from wp_draft_effort.
  const effortMap = new Map<string, number>();
  const wpEffortTotal = new Map<string, number>();
  for (const e of wpEffortRows ?? []) {
    const v = Number(e.person_months ?? 0);
    effortMap.set(`${e.wp_draft_id}::${e.participant_id}`, v);
    wpEffortTotal.set(e.wp_draft_id, (wpEffortTotal.get(e.wp_draft_id) || 0) + v);
  }

  // ─── Table 3.1.a — List of work packages ───
  if ((wps ?? []).length && blockVisible("b31.table_a")) {
    children.push(H(HeadingLevel.HEADING_2, "Table 3.1.a — List of work packages"));
    children.push(simpleTable(
      ["WP #", "WP title", "Lead participant", "Person-months", "Start month", "End month"],
      (wps ?? []).map((w: any) => {
        const wpTasks = (tasks ?? []).filter((t: any) => t.wp_draft_id === w.id);
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

  // ─── Table 3.1.b — Per-WP description tables ───
  if (blockVisible("b31.table_b")) {
  children.push(H(HeadingLevel.HEADING_2, "Table 3.1.b — Work package descriptions"));
  for (const w of wps ?? []) {
    const wpTasks = (tasks ?? []).filter((t: any) => t.wp_draft_id === w.id);
    children.push(buildWpDescriptionTable({
      wpNumber: w.number,
      shortName: w.short_name,
      title: w.title,
      leadLabel: partLabel(w.lead_participant_id),
      duration: w.manual_duration ? String(w.manual_duration) : null,
      objectives: w.b31_objectives,
      description: w.b31_description_before_tasks,
      tasks: wpTasks.map((t: any) => {
        const ids = (taskParts ?? []).filter((tp: any) => tp.task_id === t.id).map((tp: any) => tp.participant_id);
        return {
          number: t.number,
          title: t.title,
          leadLabel: partLabel(t.lead_participant_id),
          participantsLabel: ids.length ? ids.map((id: string) => partLabel(id)).join(", ") : "—",
          duration: monthRange(t.start_month, t.end_month),
          description: t.description,
        };
      }),
    }));
    children.push(P(""));
  }
  }

  // ─── Table 3.1.c — Deliverables (WP-scoped D{wp}.{n} labels) ───
  const visibleDeliverables = (deliverables ?? []).filter((d: any) => {
    const empty = !(d.title ?? "").toString().trim()
      && !(d.type ?? "").toString().trim()
      && !(d.dissemination_level ?? "").toString().trim()
      && !d.responsible_participant_id
      && d.due_month == null;
    return !empty;
  }).sort((a: any, b: any) => {
    const wa = wpById.get(a.wp_draft_id)?.number ?? 999;
    const wb = wpById.get(b.wp_draft_id)?.number ?? 999;
    if (wa !== wb) return wa - wb;
    const da = a.due_month ?? Number.POSITIVE_INFINITY;
    const db = b.due_month ?? Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    return (a.order_index ?? a.number ?? 0) - (b.order_index ?? b.number ?? 0);
  });
  if (visibleDeliverables.length && blockVisible("b31.table_c")) {
    children.push(H(HeadingLevel.HEADING_2, "Table 3.1.c — Deliverables"));
    children.push(simpleTable(
      ["No.", "Deliverable title", "WP", "Lead", "Type", "Diss.", "Due"],
      visibleDeliverables.map((d: any) => {
        const w = wpById.get(d.wp_draft_id);
        const label = w ? `D${w.number}.${d.number}` : `D?.${d.number}`;
        return [
          label,
          d.title ?? "",
          w ? `WP${w.number}` : "—",
          partLabel(d.responsible_participant_id),
          d.type ?? "",
          d.dissemination_level ?? "",
          mLabel(d.due_month),
        ];
      }),
    ));
  }

  // ─── Table 3.1.d — Milestones (proposal-level + WP links) ───
  const sortedMilestones = [...(milestones ?? [])].sort((a: any, b: any) => {
    const da = a.due_month ?? Number.POSITIVE_INFINITY;
    const db = b.due_month ?? Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    const wa = Math.min(...(msLinkMap.get(a.id) ?? []).map((id) => wpById.get(id)?.number ?? Infinity), Infinity);
    const wb = Math.min(...(msLinkMap.get(b.id) ?? []).map((id) => wpById.get(id)?.number ?? Infinity), Infinity);
    if (wa !== wb) return wa - wb;
    return (a.number ?? 0) - (b.number ?? 0);
  });
  if (sortedMilestones.length && blockVisible("b31.table_d")) {
    children.push(H(HeadingLevel.HEADING_2, "Table 3.1.d — Milestones"));
    children.push(simpleTable(
      ["No.", "Milestone", "WP(s)", "Due", "Means of verification"],
      sortedMilestones.map((m: any) => {
        const wpIdsForMs = (msLinkMap.get(m.id) ?? [])
          .map((id) => wpById.get(id))
          .filter(Boolean)
          .sort((a: any, b: any) => a.number - b.number)
          .map((w: any) => `WP${w.number}`);
        return [
          `MS${m.number}`,
          htmlToText(m.title ?? ""),
          wpIdsForMs.join(", ") || "—",
          mLabel(m.due_month),
          htmlToText(m.means_of_verification ?? ""),
        ];
      }),
    ));
  }

  // ─── Table 3.1.e — Critical risks ───
  if ((risks ?? []).length && blockVisible("b31.table_e")) {
    children.push(H(HeadingLevel.HEADING_2, "Table 3.1.e — Critical risks"));
    children.push(simpleTable(
      ["Risk", "Likelihood", "Severity", "WP(s)", "Mitigation & adaptation measures"],
      (risks ?? []).map((r: any) => {
        const wpIdsForRisk = (riskLinkMap.get(r.id) ?? [])
          .map((id) => wpById.get(id))
          .filter(Boolean)
          .sort((a: any, b: any) => a.number - b.number)
          .map((w: any) => `WP${w.number}`);
        return [
          htmlToText(r.title ?? ""),
          r.likelihood ?? "",
          r.severity ?? "",
          wpIdsForRisk.join(", ") || "—",
          htmlToText(r.mitigation ?? ""),
        ];
      }),
    ));
  }

  // ─── Table 3.1.f — Effort matrix (Participants × WPs) ───
  if ((wps ?? []).length && (participants ?? []).length && blockVisible("b31.table_f")) {
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

  // Helper: render a justification-items table grouped by participant with subtotals + grand total.
  const renderJustItemsTable = (items: any[]) => {
    const rowsOut: any[][] = [];
    const byPart = new Map<string, any[]>();
    for (const it of items) {
      const partId = brToPart.get(it.budget_row_id) ?? null;
      if (!partId) continue;
      const arr = byPart.get(partId) ?? [];
      arr.push(it);
      byPart.set(partId, arr);
    }
    const partIdsSorted = Array.from(byPart.keys()).sort((a, b) => {
      const pa = (participants ?? []).find((p: any) => p.id === a)?.participant_number ?? 999;
      const pb = (participants ?? []).find((p: any) => p.id === b)?.participant_number ?? 999;
      return pa - pb;
    });
    let grand = 0;
    for (const partId of partIdsSorted) {
      const its = byPart.get(partId) ?? [];
      let subtotal = 0;
      its.forEach((it: any, idx: number) => {
        const amt = Number(it.amount || 0);
        subtotal += amt;
        rowsOut.push([
          idx === 0 ? partLabel(partId) : "",
          eur(amt),
          [it.description, it.justification].filter((s: any) => s && String(s).trim()).join(" — "),
        ]);
      });
      rowsOut.push(["", eur(subtotal), "Subtotal"]);
      grand += subtotal;
    }
    rowsOut.push(["", eur(grand), "Total"]);
    return simpleTable(["Participant", "Cost (€)", "Justification"], rowsOut);
  };

  // ─── Table 3.1.g — Subcontracting (auto-included when items exist) ───
  if ((subItems ?? []).length && blockVisible("b31.table_g")) {
    children.push(H(HeadingLevel.HEADING_2, "Table 3.1.g — Subcontracting"));
    children.push(renderJustItemsTable(subItems));
  }

  // ─── Table 3.1.h — Purchase costs (equipment / travel / other goods per toggles + 15% rule) ───
  if ((equipItems.length || includeTravel || includeOtherGoods) && blockVisible("b31.table_h")) {
    children.push(H(HeadingLevel.HEADING_2, "Table 3.1.h — Purchase costs (equipment, infrastructure or other assets)"));
    if (equipItems.length) {
      children.push(H(HeadingLevel.HEADING_3, "Equipment"));
      children.push(renderJustItemsTable(equipItems));
    }
    if (includeTravel) {
      children.push(H(HeadingLevel.HEADING_3, "Travel and subsistence"));
      children.push(renderJustItemsTable(travelItems));
    }
    if (includeOtherGoods) {
      children.push(H(HeadingLevel.HEADING_3, "Other goods, works and services"));
      children.push(renderJustItemsTable(otherGoodsItems));
    }
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
  const [
    { data: deliverables },
    { data: msLinks },
    { data: riskLinks },
    { data: effort },
    { data: taskParts },
    { data: taskEffort },
    { data: delTaskLinks },
  ] = await Promise.all([
    supabase.from("wp_draft_deliverables").select("*").eq("wp_draft_id", wp.id).order("number", { ascending: true }),
    supabase
      .from("proposal_milestone_wps")
      .select("is_primary, milestone:milestone_id(number, title, due_month, means_of_verification, proposal_id)")
      .eq("wp_draft_id", wp.id),
    supabase
      .from("proposal_risk_wps")
      .select("risk:risk_id(number, title, mitigation, likelihood, severity, proposal_id)")
      .eq("wp_draft_id", wp.id),
    supabase.from("wp_draft_effort").select("*, participant:participant_id(participant_number, organisation_short_name)").eq("wp_draft_id", wp.id),
    taskIds.length
      ? supabase.from("wp_draft_task_participants").select("task_id, participant_id").in("task_id", taskIds)
      : Promise.resolve({ data: [] }),
    taskIds.length
      ? supabase.from("wp_draft_task_effort").select("task_id, participant_id, person_months").in("task_id", taskIds)
      : Promise.resolve({ data: [] }),
    taskIds.length
      ? supabase.from("wp_draft_deliverable_tasks").select("deliverable_id, wp_draft_task_id").in("wp_draft_task_id", taskIds)
      : Promise.resolve({ data: [] }),
  ]);

  // Filter to this proposal and dedupe by number.
  const milestones = (msLinks ?? [])
    .map((l: any) => l.milestone ? { ...l.milestone, is_primary: l.is_primary } : null)
    .filter((m: any) => m && m.proposal_id === wp.proposal_id)
    .sort((a: any, b: any) => (a.number ?? 0) - (b.number ?? 0));
  const risks = (riskLinks ?? [])
    .map((l: any) => l.risk)
    .filter((r: any) => r && r.proposal_id === wp.proposal_id)
    .sort((a: any, b: any) => (a.number ?? 0) - (b.number ?? 0));

  const wpTable = buildWpDescriptionTable({
    wpNumber: wp.number,
    shortName: wp.short_name,
    title: wp.title,
    leadLabel: partLabel(wp.lead_participant_id),
    duration: wp.manual_duration ? String(wp.manual_duration) : null,
    objectives: wp.objectives,
    description: wp.description_before_tasks,
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
  if (milestones.length) {
    children.push(H(HeadingLevel.HEADING_2, "Milestones"));
    children.push(simpleTable(
      ["#", "Title", "Primary WP?", "Due month", "Means of verification"],
      milestones.map((m: any) => [m.number, m.title ?? "", m.is_primary ? "Yes" : "No", m.due_month ?? "", m.means_of_verification ?? ""]),
    ));
  }
  if (risks.length) {
    children.push(H(HeadingLevel.HEADING_2, "Risks"));
    children.push(simpleTable(
      ["#", "Title", "Likelihood", "Severity", "Mitigation"],
      risks.map((r: any) => [r.number, r.title ?? "", r.likelihood ?? "", r.severity ?? "", r.mitigation ?? ""]),
    ));
  }
  if (effort?.length) {
    children.push(H(HeadingLevel.HEADING_2, "Effort (person-months)"));
    children.push(simpleTable(
      ["Participant", "PM"],
      effort.map((e: any) => [e.participant ? `P${e.participant.participant_number} ${e.participant.organisation_short_name ?? ""}` : "—", e.person_months ?? ""]),
    ));
  }

  // ── Per-task effort matrix (tasks × participants) ──
  if ((taskEffort ?? []).length) {
    children.push(H(HeadingLevel.HEADING_2, "Per-task effort (person-months)"));
    const partIdsInEffort = Array.from(new Set((taskEffort ?? []).map((e: any) => e.participant_id)));
    const orderedParts = partIdsInEffort
      .map((id) => participants.find((p) => p.id === id))
      .filter(Boolean)
      .sort((a: any, b: any) => (a.participant_number ?? 0) - (b.participant_number ?? 0));
    const key = (tid: string, pid: string) => `${tid}::${pid}`;
    const map = new Map<string, number>();
    for (const e of taskEffort ?? []) map.set(key(e.task_id, e.participant_id), Number(e.person_months ?? 0));
    const headers = ["Task", ...orderedParts.map((p: any) => `P${p.participant_number} ${p.organisation_short_name ?? ""}`), "Total"];
    const rowsOut = (tasks ?? []).map((t: any) => {
      const row: (string | number)[] = [`T${wp.number}.${t.number} ${t.title ?? ""}`];
      let total = 0;
      for (const p of orderedParts as any[]) {
        const v = map.get(key(t.id, p.id)) ?? 0;
        row.push(v || 0);
        total += v;
      }
      row.push(total);
      return row;
    });
    children.push(simpleTable(headers, rowsOut));
  }

  // ── Deliverable → task links ──
  if ((delTaskLinks ?? []).length) {
    const tById = new Map<string, any>();
    for (const t of tasks ?? []) tById.set(t.id, t);
    const dById = new Map<string, any>();
    for (const d of deliverables ?? []) dById.set(d.id, d);
    const grouped = new Map<string, string[]>();
    for (const l of delTaskLinks ?? []) {
      const t = tById.get(l.wp_draft_task_id);
      if (!t) continue;
      const arr = grouped.get(l.deliverable_id) ?? [];
      arr.push(`T${wp.number}.${t.number}`);
      grouped.set(l.deliverable_id, arr);
    }
    if (grouped.size) {
      children.push(H(HeadingLevel.HEADING_2, "Deliverable ↔ task links"));
      children.push(simpleTable(
        ["Deliverable", "Contributing tasks"],
        Array.from(grouped.entries())
          .map(([delId, taskLabels]) => {
            const d = dById.get(delId);
            const delLabel = d ? `D${wp.number}.${d.number} ${d.title ?? ""}` : "—";
            return [delLabel, taskLabels.sort().join(", ")];
          })
          .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
      ));
    }
  }
  return await packDocx(children);
}

/** Derives every figure number of a proposal from the block that places it. */
async function deriveFigureNumbers(supabase: any, proposalId: string): Promise<Map<string, string>> {
  const [placementRes, cardRes] = await Promise.all([
    supabase.from("card_figure").select("card_id, figure_id").eq("proposal_id", proposalId),
    supabase.from("proposal_cards").select("id, section_id, order_index").eq("proposal_id", proposalId).is("deleted_at", null),
  ]);
  const sectionIds = [...new Set((cardRes.data ?? []).map((c: any) => c.section_id).filter(Boolean))];
  const sectionRes = sectionIds.length
    ? await supabase.from("proposal_template_sections").select("id, section_number, order_index").in("id", sectionIds)
    : { data: [] };
  return computeFigureNumbers(
    (placementRes.data ?? []) as any[],
    (cardRes.data ?? []) as any[],
    (sectionRes.data ?? []) as any[],
  );
}

async function buildCaseDraft(_supabase: any, _proposal: any, cd: any, participants: any[]): Promise<Uint8Array> {
  const lead = cd.lead_participant_id ? participants.find((p) => p.id === cd.lead_participant_id) : null;
  const children: (Paragraph | Table)[] = [
    H(HeadingLevel.HEADING_1, `Case ${cd.number} ${cd.short_name ?? ""}${cd.title ? ` — ${cd.title}` : ""}`),
    KV("Type", cd.custom_type_name || cd.case_type),
    KV("Lead participant", lead ? `P${lead.participant_number} ${lead.organisation_short_name ?? ""}` : "—"),
  ];
  if (cd.description) { children.push(H(HeadingLevel.HEADING_2, "Description")); children.push(...htmlToDocxChildren(cd.description)); }

  // Subsections live as rows in case_draft_subsections. The legacy
  // `subsection_content` jsonb is no longer written or read (prompt 179); the
  // named columns below remain only for pre-subsection cases.
  const { data: subRows } = await _supabase
    .from("case_draft_subsections")
    .select("subsection_key, content_html, heading, order_index")
    .eq("case_id", cd.id)
    .order("order_index");
  const { data: subTpls } = await _supabase
    .from("case_subsection_templates")
    .select("key, heading, order_index")
    .eq("proposal_id", cd.proposal_id)
    .order("order_index");
  if (subRows && subRows.length) {
    const headingFor = (key: string, stored: string) =>
      stored || (subTpls ?? []).find((t: any) => t.key === key)?.heading || key;
    for (const r of subRows) {
      const body = r.content_html ?? "";
      if (!String(body).trim()) continue;
      children.push(H(HeadingLevel.HEADING_2, headingFor(r.subsection_key, r.heading)));
      children.push(...htmlToDocxChildren(body));
    }
    return await packDocx(children);
  }

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
      // One snapshot per proposal — every chip in every file resolves from it.
      CURRENT_REF_SNAPSHOT = await loadRefSnapshot(supabase, proposal.id);
      CURRENT_REF_STATS = { passes: 0, found: 0, resolved: 0, unresolved: 0 };
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
      // `figures.order_index` was dropped; the table carries no ordering column.
      // Order by created_at (stable creation order), with id as a deterministic
      // tie-break. Output file names come from the derived figure number below,
      // so ordering only affects processing order, not naming.
      const { data: figures, error: figuresErr } = await supabase
        .from("figures")
        .select("id, figure_type, content, title, caption, created_at")
        .eq("proposal_id", proposal.id)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
      if (figuresErr) console.error("[backup] figures query failed", figuresErr);

      // File names use the DERIVED figure number (prompt 179). The stored
      // `figures.figure_number` column is dead and blank on newer figures.
      const figureFileNumbers = await deriveFigureNumbers(supabase, proposal.id);

      for (const fig of figures ?? []) {
        const num = String(figureFileNumbers.get(fig.id) || fig.id).replace(/[\/\\:*?"<>|]/g, "_");
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
      const refSummary = { proposal_id: proposal.id, ...CURRENT_REF_STATS };
      if (CURRENT_REF_STATS.found === 0) {
        console.warn("Reference resolution completed with zero chips found", refSummary);
      } else {
        console.log("Reference resolution completed", refSummary);
      }
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
