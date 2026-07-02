/**
 * Print Renderer – creates a hidden container with editor-styled content
 * for capture by jsPDF.html(). All content renders via the browser's layout
 * engine so the PDF output matches the editor exactly.
 */
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/hooks/useAuth';
import DOMPurify from 'dompurify';
import { Participant, Section } from '@/types/proposal';
import { supabase } from '@/integrations/supabase/client';
import { resolveStorageUrl } from '@/hooks/useStorageUrl';
import { getCaseTypePrefix } from '@/lib/caseTypeLabels';
import { extractFilePathFromUrl } from '@/lib/proposalStorage';
import { SITRA_LOGO_BASE64 } from '@/lib/sitraLogo';
import { applyColumnWidthsToTable } from '@/lib/autoFitColumns';
import { computeBudgetRow } from '@/lib/budgetCompute';

/** Escape user-provided strings before interpolating into raw HTML templates. */
const escHtml = (s: string | number | null | undefined): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Sanitize a hex/CSS colour string so it can't break out of an HTML attribute. */
const safeColor = (c: string | null | undefined): string => {
  if (!c) return '#000000';
  return /^#[0-9a-fA-F]{3,8}$|^rgb\(|^rgba\(|^hsl\(|^hsla\(|^[a-zA-Z]+$/.test(c) ? c : '#000000';
};

/** Sanitiser config for rich-text content rendered into the export DOM. */
const PRINT_SANITIZE_CONFIG = {
  ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 's', 'ul', 'ol', 'li', 'span', 'a', 'h1', 'h2', 'h3', 'h4', 'sub', 'sup', 'table', 'colgroup', 'col', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'figure', 'figcaption', 'div', 'svg', 'path', 'g', 'rect', 'circle', 'line', 'polyline', 'polygon', 'text', 'tspan', 'defs', 'marker', 'use'],
  ALLOWED_ATTR: ['class', 'style', 'href', 'target', 'rel', 'src', 'alt', 'width', 'height', 'colwidth', 'colspan', 'rowspan', 'crossorigin', 'data-type', 'data-id', 'data-wp-number', 'data-wp-short-name', 'data-wp-color', 'data-task-number', 'data-deliverable-number', 'data-milestone-number', 'data-participant-number', 'data-short-name', 'data-case-number', 'data-case-short-name', 'data-case-color', 'data-case-type', 'data-include-number', 'data-include-abbreviation', 'data-figure-id', 'data-table-key', 'data-ref-type', 'data-ref-id', 'data-citation-id', 'data-acronym', 'data-figure-wrapper', 'data-block-id', 'data-section-name', 'data-proposal-banner', 'data-cases-table-node', 'data-case-ids', 'data-caption', 'data-case-type-id', 'data-case-type-heading-id', 'data-b32-mirror-slot', 'data-b32-slot-key', 'viewBox', 'fill', 'stroke', 'stroke-width', 'd', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'points', 'transform', 'opacity', 'fill-opacity', 'stroke-opacity', 'stroke-linejoin', 'stroke-linecap', 'text-anchor', 'font-family', 'font-size', 'font-weight'],
};

// ── Types ────────────────────────────────────────────────────────────────────

export interface SectionContent {
  id: string;
  sectionId: string;
  content: string;
}

export interface ExportData {
  proposal: import('@/types/proposal').Proposal;
  sectionContents: SectionContent[];
  sections: import('@/types/proposal').Section[];
  participants?: import('@/types/proposal').Participant[];
}

export interface PrintRenderOptions {
  proposal: {
    id: string;
    title: string;
    acronym: string;
    submissionStage?: string | null;
    topicId?: string | null;
    topicTitle?: string | null;
    type?: string | null;
  };
  sections: Section[];
  sectionContents: SectionContent[];
  participants: Participant[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isH1Container(section: Section): boolean {
  return !section.isPartA && !!section.number && /^B?\d+$/.test(section.number.replace(/^B/, ''));
}

function isContentSection(section: Section): boolean {
  return !section.isPartA && !!section.number && /^B?\d+\.\d+/.test(section.number);
}

function flattenSections(sections: Section[]): Section[] {
  const result: Section[] = [];
  const traverse = (section: Section) => {
    if (section.isPartA) return;
    if (section.id === 'figures' || section.id === 'assignments' || section.id === 'progress') return;
    if (isH1Container(section) || isContentSection(section)) {
      result.push(section);
    }
    if (section.subsections) {
      for (const sub of section.subsections) traverse(sub);
    }
  };
  for (const s of sections) traverse(s);
  return result;
}

// ── Resolve storage images in HTML ───────────────────────────────────────────

async function resolveImagesInHtml(html: string): Promise<string> {
  if (!html) return html;
  // Find all img src that are storage paths (not starting with http/data)
  const imgRegex = /<img([^>]*?)src=(["'])([^"']+)\2([^>]*?)>/gi;
  const matches = [...html.matchAll(imgRegex)];
  let result = html;
  for (const m of matches) {
    const src = m[3];
    if (src.startsWith('http') || src.startsWith('data:')) continue;
    try {
      const resolved = await resolveStorageUrl(src);
      if (resolved) {
        result = result.replace(src, resolved);
      }
    } catch { /* keep original */ }
  }
  return result;
}

/**
 * Refreshes all signed storage URLs in the rendered DOM container.
 * Handles images that already have signed URLs (starting with https://)
 * which may have expired since the editor loaded.
 * The existing resolveImagesInHtml handles raw storage paths;
 * this function handles the complementary case of stale signed URLs.
 */
async function refreshSignedUrls(container: HTMLElement): Promise<void> {
  const images = container.querySelectorAll('img');

  // Collect all storage paths that need refreshing
  const imageEntries: { img: HTMLImageElement; storagePath: string }[] = [];

  images.forEach((img) => {
    const src = img.getAttribute('src');
    if (!src) return;
    const storagePath = extractFilePathFromUrl(src);
    if (!storagePath) return;
    imageEntries.push({ img, storagePath });
  });

  if (imageEntries.length === 0) return;

  try {
    // Single batch call to Supabase for all signed URLs
    const { data, error } = await supabase.storage
      .from('proposal-files')
      .createSignedUrls(
        imageEntries.map((e) => e.storagePath),
        3600, // 1 hour expiry
      );

    if (error || !data) {
      console.warn('Batch signed URL refresh failed:', error);
      return;
    }

    // Apply the new URLs
    data.forEach((result, index) => {
      if (result?.signedUrl) {
        imageEntries[index].img.setAttribute('src', result.signedUrl);
      }
    });
  } catch (err) {
    console.warn('Error in batch signed URL refresh:', err);
  }
}

// ── Build participant list HTML ──────────────────────────────────────────────

async function buildParticipantListHtml(
  proposalId: string,
  participants: Participant[],
): Promise<string> {
  const sorted = [...participants].sort(
    (a, b) => (a.participantNumber || 999) - (b.participantNumber || 999),
  );

  // Fetch WP & Case leadership
  const [{ data: wpData }, { data: caseData }] = await Promise.all([
    supabase.from('wp_drafts').select('number, short_name, lead_participant_id, color').eq('proposal_id', proposalId).order('number'),
    supabase.from('case_drafts').select('number, short_name, lead_participant_id, color, case_type, custom_type_name').eq('proposal_id', proposalId).order('number'),
  ]);

  const wpLeadership = new Map<string, { num: number; color: string }[]>();
  for (const wp of wpData || []) {
    if (!wp.lead_participant_id) continue;
    if (!wpLeadership.has(wp.lead_participant_id)) wpLeadership.set(wp.lead_participant_id, []);
    wpLeadership.get(wp.lead_participant_id)!.push({ num: wp.number, color: wp.color });
  }

  // Case prefix resolution lives in @/lib/caseTypeLabels.

  const caseLeadership = new Map<string, { label: string; color: string }[]>();
  for (const c of caseData || []) {
    if (!c.lead_participant_id) continue;
    if (!caseLeadership.has(c.lead_participant_id)) caseLeadership.set(c.lead_participant_id, []);
    const prefix = getCaseTypePrefix(c.case_type, c.custom_type_name);
    caseLeadership.get(c.lead_participant_id)!.push({
      label: prefix ? `${prefix}${c.number}` : (c.short_name || `${c.number}`),
      color: c.color,
    });
  }

  // Build HTML rows
  let rows = '';
  for (const p of sorted) {
    const shortName = p.organisationShortName || '';
    const legalName = p.organisationName || '';
    const englishName = p.englishName && p.englishName.trim().toLowerCase() !== legalName.trim().toLowerCase() ? p.englishName : '';

    // Resolve logo
    let logoHtml = '<td class="print-td" style="text-align:center;vertical-align:middle;">—</td>';
    if (p.logoUrl) {
      try {
        const resolved = await resolveStorageUrl(p.logoUrl);
        if (resolved) {
          logoHtml = `<td class="print-td" style="text-align:center;vertical-align:middle;"><img src="${resolved}" crossorigin="anonymous" style="max-width:30px;max-height:30px;object-fit:contain;display:inline-block;" /></td>`;
        }
      } catch { /* skip */ }
    }

    // Roles
    let roleHtml = '';
    const isCoord = p.participantNumber === 1;
    if (isCoord) {
      roleHtml += `<span class="print-bubble" style="background:hsl(221.2,83.2%,53.3%);color:#fff;border-radius:4px;padding:0 5px;font-weight:bold;font-size:11pt;font-style:normal;font-family:'Times New Roman',Times,serif;line-height:1;white-space:nowrap;">Coord</span> `;
    }
    for (const wp of wpLeadership.get(p.id) || []) {
      roleHtml += `<span class="print-bubble" style="background:${safeColor(wp.color)};color:#fff;border-radius:9999px;padding:0 5px;font-weight:bold;font-size:11pt;font-style:normal;font-family:'Times New Roman',Times,serif;line-height:1;white-space:nowrap;">WP${escHtml(wp.num)}</span> `;
    }
    for (const c of caseLeadership.get(p.id) || []) {
      roleHtml += `<span class="print-bubble" style="background:#fff;color:#000;border:1.5px solid #000;border-radius:9999px;padding:0 5px;font-weight:bold;font-size:11pt;font-style:normal;font-family:'Times New Roman',Times,serif;line-height:1;white-space:nowrap;">${escHtml(c.label)}</span> `;
    }
    if (!isCoord && !wpLeadership.has(p.id) && !caseLeadership.has(p.id)) {
      roleHtml = '—';
    }

    // Short name bubble with participant number inside
    const shortBubble = shortName
      ? `<span class="print-bubble" style="background:#000;color:#fff;border-radius:9999px;padding:0 5px;font-weight:bold;font-size:11pt;font-style:normal;font-family:'Times New Roman',Times,serif;line-height:1;white-space:nowrap;">${escHtml(p.participantNumber)}. ${escHtml(shortName)}</span>`
      : '—';

    rows += `<tr>
      <td class="print-td" style="vertical-align:middle;">${shortBubble}</td>
      <td class="print-td" style="vertical-align:middle;">
        ${escHtml(legalName)}${englishName ? `<br/><span style="font-style:italic;color:#666;">${escHtml(englishName)}</span>` : ''}
      </td>
      ${logoHtml}
      <td class="print-td" style="vertical-align:middle;">${roleHtml}</td>
      <td class="print-td" style="vertical-align:middle;">${escHtml(p.country || '—')}</td>
    </tr>`;
  }

  return `
    <table class="print-table" style="width:100%;border-collapse:collapse;">
      <thead>
        <tr>
          <th class="print-th" style="width:15%;">Short name</th>
          <th class="print-th" style="width:40%;">Participant legal name | <em>English name, if different</em></th>
          <th class="print-th" style="width:8%;">Logo</th>
          <th class="print-th" style="width:20%;">Lead roles</th>
          <th class="print-th" style="width:17%;">Country</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ── Build Part A (A1 general info + A3 budget summary) HTML ──────────────────

interface PartA1Row {
  abstract: string | null;
  fixed_keywords: string[] | null;
  free_keywords: string | null;
  previous_submission: string | null;
  previous_submission_reference: string | null;
}

/**
 * Renders A1 (abstract + keywords + previous submission) from the typed
 * `part_a1` table. The abstract is sanitised HTML — NOT escaped — so
 * inline acronym/participant badges render as elements in the export.
 * The `declarations` object is intentionally excluded — it is not
 * evaluative content.
 */
function buildA1Html(a1: PartA1Row | null): string {
  if (!a1) return '';
  const abstractHtml = String(a1.abstract || '').trim();
  const rawFixed = Array.isArray(a1.fixed_keywords) ? a1.fixed_keywords : [];
  const fixedKeywords: string[] = [];
  for (const k of rawFixed) {
    if (typeof k !== 'string') continue;
    for (const piece of k.split(',')) {
      const trimmed = piece.trim();
      if (trimmed) fixedKeywords.push(trimmed);
    }
  }
  const freeKeywords = String(a1.free_keywords || '').trim();
  const previousSubmission: 'yes' | 'no' | '' =
    a1.previous_submission === 'yes' || a1.previous_submission === 'no'
      ? a1.previous_submission
      : '';
  const previousReference = String(a1.previous_submission_reference || '').trim();

  const parts: string[] = [];
  parts.push(
    `<h2 class="print-h2" data-section-name="A1. General information" style="font-size:12pt;font-weight:bold;margin-top:9pt;margin-bottom:0;">A1. General information</h2>`,
  );
  if (abstractHtml) {
    parts.push(`<h3 class="print-h3" style="font-size:11pt;font-weight:bold;margin-top:6pt;margin-bottom:0;">Abstract</h3>`);
    // Abstract is stored as plain text — render as escaped paragraphs.
    const paragraphs = abstractHtml
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `<p style="margin:3pt 0 0 0;">${escHtml(p).replace(/\n/g, '<br>')}</p>`)
      .join('');
    parts.push(`<div class="print-section-content">${paragraphs}</div>`);
  }
  const kw: string[] = [];
  if (fixedKeywords.length) kw.push(fixedKeywords.join(', '));
  if (freeKeywords) kw.push(freeKeywords);
  if (kw.length) {
    parts.push(`<p style="margin:6pt 0 0 0;"><strong>Keywords:</strong> ${escHtml(kw.join(' · '))}</p>`);
  }
  if (previousSubmission) {
    const label = previousSubmission === 'yes'
      ? `Previously submitted${previousReference ? `: ${previousReference}` : ''}`
      : 'Not previously submitted';
    parts.push(`<p style="margin:3pt 0 0 0;"><strong>Previous submission:</strong> ${escHtml(label)}</p>`);
  }
  return parts.join('\n');
}


function stripTags(html: string): string {
  return String(html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
}

/**
 * Build the A3 budget summary table from `budget_rows`. Read-only mirror —
 * one row per participant + a totals row. All figures are derived through
 * `computeBudgetRow` so the export matches the A3 portal exactly (the
 * `requested_eu_contribution` column is a manual override and usually NULL).
 */
async function buildA3BudgetHtml(
  proposalId: string,
  participants: Participant[],
  proposalType: string | null,
): Promise<string> {
  const [{ data: rows }, { data: effortData }] = await Promise.all([
    supabase
      .from('budget_rows')
      .select('participant_id, personnel_costs, subcontracting_costs, purchase_travel, purchase_equipment, purchase_other_goods, financial_support_third_parties, internally_invoiced, procurement, pm_rate, indirect_costs_override, funding_rate_override, requested_eu_contribution, has_in_kind, requested_personnel_costs, requested_subcontracting, requested_travel, requested_equipment, requested_other_goods, requested_fstp, requested_internally_invoiced')
      .eq('proposal_id', proposalId),
    supabase
      .from('wp_draft_effort')
      .select('participant_id, person_months, wp_drafts!inner(proposal_id)')
      .eq('wp_drafts.proposal_id', proposalId),
  ]);

  if (!rows || rows.length === 0) return '';

  const pmTotals = new Map<string, number>();
  (effortData || []).forEach((e: any) => {
    pmTotals.set(e.participant_id, (pmTotals.get(e.participant_id) || 0) + Number(e.person_months || 0));
  });

  const partById = new Map(participants.map((p) => [p.id, p]));
  const fmt = (n: number) =>
    n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const totals = {
    personnel: 0,
    subcontracting: 0,
    equipment: 0,
    otherGoods: 0,
    travel: 0,
    indirect: 0,
    requestedEu: 0,
  };

  const sorted = [...rows].sort((a: any, b: any) => {
    const pa = partById.get(a.participant_id);
    const pb = partById.get(b.participant_id);
    return (pa?.participantNumber || 999) - (pb?.participantNumber || 999);
  });

  let body = '';
  for (const r of sorted as any[]) {
    const p = partById.get(r.participant_id);
    const label = p
      ? `${p.participantNumber}. ${p.organisationShortName || p.organisationName || ''}`
      : '—';
    const out = computeBudgetRow({
      ...r,
      totalPersonMonths: pmTotals.get(r.participant_id) || 0,
      proposalType,
      organisationCategory: p?.organisationCategory ?? null,
    });
    totals.personnel += out.personnel;
    totals.subcontracting += Number(r.subcontracting_costs || 0);
    totals.equipment += Number(r.purchase_equipment || 0);
    totals.otherGoods += Number(r.purchase_other_goods || 0);
    totals.travel += Number(r.purchase_travel || 0);
    totals.indirect += out.indirect;
    totals.requestedEu += out.requestedEuContribution;
    body += `<tr>
      <td class="print-td">${escHtml(label)}</td>
      <td class="print-td" style="text-align:right;">${fmt(out.personnel)}</td>
      <td class="print-td" style="text-align:right;">${fmt(Number(r.subcontracting_costs || 0))}</td>
      <td class="print-td" style="text-align:right;">${fmt(Number(r.purchase_equipment || 0))}</td>
      <td class="print-td" style="text-align:right;">${fmt(Number(r.purchase_other_goods || 0))}</td>
      <td class="print-td" style="text-align:right;">${fmt(Number(r.purchase_travel || 0))}</td>
      <td class="print-td" style="text-align:right;">${fmt(out.indirect)}</td>
      <td class="print-td" style="text-align:right;"><strong>${fmt(out.requestedEuContribution)}</strong></td>
    </tr>`;
  }

  body += `<tr>
    <td class="print-td"><strong>Total</strong></td>
    <td class="print-td" style="text-align:right;"><strong>${fmt(totals.personnel)}</strong></td>
    <td class="print-td" style="text-align:right;"><strong>${fmt(totals.subcontracting)}</strong></td>
    <td class="print-td" style="text-align:right;"><strong>${fmt(totals.equipment)}</strong></td>
    <td class="print-td" style="text-align:right;"><strong>${fmt(totals.otherGoods)}</strong></td>
    <td class="print-td" style="text-align:right;"><strong>${fmt(totals.travel)}</strong></td>
    <td class="print-td" style="text-align:right;"><strong>${fmt(totals.indirect)}</strong></td>
    <td class="print-td" style="text-align:right;"><strong>${fmt(totals.requestedEu)}</strong></td>
  </tr>`;

  return `
    <h2 class="print-h2" data-section-name="A3. Budget" style="font-size:12pt;font-weight:bold;margin-top:9pt;margin-bottom:0;">A3. Budget</h2>
    <table class="print-table" style="width:100%;border-collapse:collapse;">
      <thead><tr>
        <th class="print-th">Participant</th>
        <th class="print-th">Personnel</th>
        <th class="print-th">Subcontracting</th>
        <th class="print-th">Equipment</th>
        <th class="print-th">Other goods</th>
        <th class="print-th">Travel</th>
        <th class="print-th">Indirect</th>
        <th class="print-th">Requested EU</th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}

async function buildPartAHtml(
  proposalId: string,
  _sectionContents: SectionContent[],
  participants: Participant[],
  proposalType: string | null,
): Promise<string> {
  const { data: a1Row } = await supabase
    .from('part_a1')
    .select('abstract, fixed_keywords, free_keywords, previous_submission, previous_submission_reference')
    .eq('proposal_id', proposalId)
    .maybeSingle();
  const a1Html = buildA1Html(a1Row as PartA1Row | null);
  const a3Html = await buildA3BudgetHtml(proposalId, participants, proposalType);
  // A2 (participants list + expertise matrix) is already covered by the
  // participant list table above and the B3.2 expertise-matrix mount.
  return [a1Html, a3Html].filter(Boolean).join('\n');
}

// ── Build the full print container HTML ──────────────────────────────────────


export async function buildPrintContainer(
  options: PrintRenderOptions,
): Promise<HTMLDivElement> {
  const { proposal, sections, sectionContents, participants } = options;

  const container = document.createElement('div');
  container.className = 'print-export-container';
  // Width is 100% — the @page margin handles the 1.5cm on each side
  container.style.width = '100%';
  container.style.maxWidth = '100%';
  container.style.overflow = 'hidden';
  container.style.fontFamily = "'Times New Roman', Times, serif";
  container.style.fontSize = '11pt';
  container.style.lineHeight = '1.0';
  container.style.color = '#000';
  container.style.background = '#fff';

  const sectionMap = new Map(sectionContents.map(sc => [sc.sectionId, sc.content]));
  const partBSections = flattenSections(sections);

  // ── Proposal banner (replaces document title) ──
  const escapeHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // Auto-computed fallbacks (mirrors ProposalBanner.tsx logic)
  const computedTopicLine = proposal.topicId || proposal.topicTitle || proposal.type
    ? `${proposal.topicId || ''}${proposal.topicId && proposal.topicTitle ? ': ' : ''}${proposal.topicTitle || ''}${proposal.type ? ` (${proposal.type})` : ''}`
    : '';

  // Fetch user's banner overrides — these contain the exact edited text
  // (with manual line breaks preserved as \n) shown in the online editor.
  let bannerTopicLine = computedTopicLine;
  let bannerTitle = proposal.title || '';
  try {
    const { data: bannerData } = await supabase
      .from('proposals')
      .select('banner_topic_line_override, banner_title_override')
      .eq('id', proposal.id)
      .maybeSingle();
    if (bannerData) {
      if (bannerData.banner_topic_line_override != null) {
        bannerTopicLine = bannerData.banner_topic_line_override;
      }
      if (bannerData.banner_title_override != null) {
        bannerTitle = bannerData.banner_title_override;
      }
    }
  } catch { /* fall back to computed values */ }
  

  const banner = document.createElement('div');
  banner.setAttribute('data-proposal-banner', 'true');
  banner.style.cssText =
    "background:#000;color:#fff;padding:1.5cm 1.5cm 12pt 1.5cm;" +
    "box-sizing:border-box;margin-bottom:12pt;overflow:hidden;";
  banner.innerHTML = `
    <div style="float:right;text-align:center;margin-left:0.5cm;margin-bottom:0.25cm;">
      <img src="${SITRA_LOGO_BASE64}" alt="Sitra" style="height:0.8cm !important;width:auto !important;max-width:none !important;max-height:0.8cm !important;display:block;margin:0;" />
      <div style="font-family:'Arial Black',Arial,sans-serif;font-size:10pt;line-height:1;color:#fff;text-align:center;margin-top:2pt;white-space:nowrap;">and partners</div>
    </div>
    ${bannerTopicLine ? `<div style="font-family:'Times New Roman',Times,serif;font-size:8pt;line-height:1.15;color:#fff;text-align:left;margin-top:0pt;margin-bottom:6pt;white-space:pre-line;">${escapeHtml(bannerTopicLine)}</div>` : ''}
    <div style="font-family:'Arial Black',Arial,sans-serif;font-weight:900;font-size:18pt;line-height:1.2;color:#fff;text-align:left;white-space:pre-line;">${escapeHtml(proposal.acronym || '')}</div>
    <div style="font-family:'Arial Black',Arial,sans-serif;font-weight:900;font-size:13pt;line-height:1.2;color:#fff;text-align:left;white-space:pre-line;">${escapeHtml(bannerTitle)}</div>
    <div style="clear:both;"></div>
  `;
  container.appendChild(banner);

  // ── Participant list ──
  const partListHeading = document.createElement('h2');
  partListHeading.className = 'print-h2';
  partListHeading.textContent = 'List of Participants';
  partListHeading.style.fontSize = '12pt';
  partListHeading.style.fontWeight = 'bold';
  partListHeading.style.marginTop = '6pt';
  partListHeading.style.marginBottom = '0';
  container.appendChild(partListHeading);

  const partListHtml = await buildParticipantListHtml(proposal.id, participants);
  const partListDiv = document.createElement('div');
  partListDiv.innerHTML = partListHtml;
  container.appendChild(partListDiv);

  // ── Part A (A1 general info + A3 budget summary) ──
  const partAHtml = await buildPartAHtml(proposal.id, sectionContents, participants, proposal.type ?? null);
  if (partAHtml) {
    const partADiv = document.createElement('div');
    partADiv.setAttribute('data-part-a-mirror', 'true');
    partADiv.innerHTML = partAHtml;
    container.appendChild(partADiv);
  }

  // ── Sections ──
  for (const section of partBSections) {
    const num = section.number.replace(/^B/, '');

    if (isH1Container(section)) {
      const h1 = document.createElement('h1');
      h1.className = 'print-h1';
      h1.textContent = `${num}. ${section.title}`;
      h1.style.fontSize = '13pt';
      h1.style.fontWeight = 'bold';
      h1.style.marginTop = '9pt';
      h1.style.marginBottom = '6pt';
      h1.setAttribute('data-section-name', `${num}. ${section.title}`);
      container.appendChild(h1);
    } else if (isContentSection(section)) {
      const h2 = document.createElement('h2');
      h2.className = 'print-h2';
      h2.textContent = `${num}. ${section.title}`;
      h2.style.fontSize = '12pt';
      h2.style.fontWeight = 'bold';
      h2.style.marginTop = '6pt';
      h2.style.marginBottom = '0';
      h2.setAttribute('data-section-name', `B${num}. ${section.title}`);
      container.appendChild(h2);

      const content = sectionMap.get(section.id) || '';
      if (content) {
        const resolved = await resolveImagesInHtml(content);
        const sectionDiv = document.createElement('div');
        sectionDiv.className = 'print-section-content ProseMirror';
        sectionDiv.innerHTML = DOMPurify.sanitize(resolved, PRINT_SANITIZE_CONFIG);
        container.appendChild(sectionDiv);
      } else {
        const placeholder = document.createElement('p');
        placeholder.style.fontStyle = 'italic';
        placeholder.style.color = '#999';
        placeholder.textContent = '[Section content to be completed]';
        container.appendChild(placeholder);
      }

      // B3.1 – render tables using an offscreen React mount
      if (num === '3.1') {
        const b31Marker = document.createElement('div');
        b31Marker.id = 'print-b31-mount';
        b31Marker.setAttribute('data-proposal-id', proposal.id);
        b31Marker.setAttribute('data-proposal-acronym', proposal.acronym);
        container.appendChild(b31Marker);
      }

      // B2.1 — impact canvas mount at the end of the section content.
      if (num === '2.1') {
        const impactMarker = document.createElement('div');
        impactMarker.id = 'print-impact-canvas-mount';
        impactMarker.setAttribute('data-proposal-id', proposal.id);
        container.appendChild(impactMarker);
      }

      // B3.2 — the expertise matrix now renders inside the interdisciplinarity
      // mirror slot (see B32MirrorSlotLiveView), so there is no separate mount.


    }
  }

  return container;
}

// ── Mount dynamic React components (B3.1, B3.2, B1.2 cases) ──────────────────

/**
 * Mounts the React-rendered subtrees the editor draws live (B3.1 mirror
 * tables, B3.2 expertise matrix, and B1.2 cases-table placeholders) into the
 * print container so PDF/Word export captures the same content the editor
 * shows. All mounts share a single QueryClient so they can reuse cached data.
 */
export async function mountDynamicComponents(
  container: HTMLElement,
  proposalId: string,
  proposalAcronym: string,
  appQueryClient?: QueryClient,
): Promise<void> {
  const b31Mount = container.querySelector('#print-b31-mount');
  const impactCanvasMount = container.querySelector('#print-impact-canvas-mount');
  const casesPlaceholders = Array.from(
    container.querySelectorAll<HTMLElement>('div[data-cases-table-node]'),
  );
  const b32SlotPlaceholders = Array.from(
    container.querySelectorAll<HTMLElement>('div[data-b32-mirror-slot]'),
  );

  if (!b31Mount && !impactCanvasMount && casesPlaceholders.length === 0 && b32SlotPlaceholders.length === 0) return;

  const [
    { B31IntroText },
    { B31SectionContent },
    { CasesTableLiveView },
    { B32MirrorSlotLiveView },
    { ImpactCanvasSection },
  ] = await Promise.all([
    import('@/components/B31IntroText'),
    import('@/components/B31SectionContent'),
    import('@/components/CasesTableNodeView'),
    import('@/components/B32MirrorSlotNodeView'),
    import('@/components/ImpactCanvasSection'),
  ]);

  // Reuse the app's QueryClient when available so the export tree reads from
  // the already-warm cache instead of refetching every query cold.
  const queryClient =
    appQueryClient ??
    new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

  // If the expertise matrix is disabled, drop the interdisciplinarity slot
  // placeholder so it exports as empty (matches the editor's hide behaviour).
  let matrixEnabled = true;
  try {
    const { data } = await supabase
      .from('proposals')
      .select('expertise_matrix_enabled')
      .eq('id', proposalId)
      .maybeSingle();
    matrixEnabled = data?.expertise_matrix_enabled !== false;
  } catch {
    matrixEnabled = true;
  }
  const slotPlaceholders = b32SlotPlaceholders.filter((el) => {
    if (!matrixEnabled && el.getAttribute('data-b32-slot-key') === 'interdisciplinarity') {
      el.remove();
      return false;
    }
    return true;
  });

  const roots: { root: ReturnType<typeof createRoot>; el: Element }[] = [];

  if (b31Mount) {
    const root = createRoot(b31Mount);
    root.render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(
          AuthProvider,
          null,
          createElement(
            'div',
            { className: 'print-b31-content' },
            createElement(B31IntroText, { proposalId, proposalAcronym }),
            createElement(B31SectionContent, { proposalId }),
          ),
        ),
      ),
    );
    roots.push({ root, el: b31Mount });
  }

  // Impact canvas mount (B2.1) — Phase 1a placeholder + caption.
  if (impactCanvasMount) {
    const root = createRoot(impactCanvasMount);
    root.render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(
          AuthProvider,
          null,
          createElement(ImpactCanvasSection, { proposalId }),
        ),
      ),
    );
    roots.push({ root, el: impactCanvasMount });
  }



  // Mount each B1.2 cases-table placeholder. The letterIndex is just the
  // index of the placeholder in document order — matches the editor's
  // global counter for typed cases tables (Table 1.2.a, 1.2.b, …).
  casesPlaceholders.forEach((placeholder, idx) => {
    const caseTypeId = placeholder.getAttribute('data-case-type-id') || null;
    const root = createRoot(placeholder);
    root.render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(
          AuthProvider,
          null,
          createElement(CasesTableLiveView, {
            proposalId,
            caseTypeId,
            letterIndex: idx,
          }),
        ),
      ),
    );
    roots.push({ root, el: placeholder });
  });

  // Mount each B3.2 mirror slot placeholder — the interdisciplinarity slot
  // renders the real expertise matrix; the others render dummy placeholders.
  slotPlaceholders.forEach((placeholder) => {
    const slotKey = (placeholder.getAttribute('data-b32-slot-key') || null) as any;
    const root = createRoot(placeholder);
    root.render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(
          AuthProvider,
          null,
          createElement(B32MirrorSlotLiveView, {
            proposalId,
            slotKey,
          }),
        ),
      ),
    );
    roots.push({ root, el: placeholder });
  });

  // Wait for queries to settle and at least one table/cases row to render.
  await new Promise<void>((resolve) => {
    let elapsed = 0;
    const interval = setInterval(() => {
      elapsed += 200;
      const isFetching = queryClient.isFetching() > 0;
      const b31Ready = !b31Mount || b31Mount.querySelector('table') !== null;
      const casesReady = casesPlaceholders.every(
        (p) => p.querySelector('[data-case-block]') !== null
            || p.querySelector('div') !== null,
      );
      const slotsReady = slotPlaceholders.every(
        (p) => p.querySelector('[data-b32-mirror-slot-nodeview]') !== null,
      );
      // Interdisciplinarity slot (when present + matrix enabled) must have
      // rendered the matrix's <table>.
      const interSlot = slotPlaceholders.find(
        (p) => p.getAttribute('data-b32-slot-key') === 'interdisciplinarity',
      );
      const matrixReady = !interSlot || interSlot.querySelector('table') !== null;
      if ((b31Ready && casesReady && slotsReady && matrixReady && !isFetching) || elapsed > 15000) {
        clearInterval(interval);
        setTimeout(resolve, 200);
      }
    }, 200);
  });


  const interactiveSelectors = [
    '.drag-handle',
    '[data-radix-popper-content-wrapper]',
    '.popover-content',
    '.resize-handle',
    '.column-resizer',
    '.tooltip-content',
  ];
  for (const { el } of roots) {
    for (const sel of interactiveSelectors) {
      el.querySelectorAll(sel).forEach((node) => node.remove());
    }
  }
}

/** @deprecated — use mountDynamicComponents. Kept for backward compatibility. */
export const mountB31Components = mountDynamicComponents;

// ── Figure → text-summary replacement (used by PDF/Word + eval payload) ──────

/**
 * Replaces visual figures in the export container with a structured text
 * block, so PDF/Word and the evaluation payload show the same human-readable
 * description. For PERT/Gantt charts (rendered inside the B3.1 mount) we emit
 * a one-paragraph structural summary derived from live proposal data. For
 * ordinary uploaded image figures inside section content we keep the figure
 * number + caption line and drop the image.
 */
/**
 * Replace PERT/Gantt charts and uploaded <img> figures with structured text
 * summaries. NOT used in the visual PDF/Word export path — figures must render
 * as real inline SVG / <img> there. Exported so the evaluation pipeline can run
 * it against a CLONE of the prepared export container to produce a
 * machine-readable text payload.
 */
export async function replaceFiguresWithText(
  container: HTMLElement,
  proposalId: string,
): Promise<void> {
  // ── PERT / Gantt: replace the chart bodies with a summary paragraph. ──
  const chartWrappers = Array.from(
    container.querySelectorAll<HTMLElement>('div[data-figure-type="pert"], div[data-figure-type="gantt"]'),
  );

  if (chartWrappers.length > 0) {
    // One batched data fetch covering both summaries.
    const wpsRes = await supabase
      .from('wp_drafts')
      .select('id, number, short_name, title')
      .eq('proposal_id', proposalId)
      .order('number');
    const wps = wpsRes.data || [];
    const wpIds = wps.map((w: any) => w.id);

    const [delsRes, msRes] = await Promise.all([
      wpIds.length
        ? supabase
            .from('wp_draft_deliverables')
            .select('number, due_month, title, wp_draft_id')
            .in('wp_draft_id', wpIds)
        : Promise.resolve({ data: [] as any[] }),
      supabase
        .from('proposal_milestones')
        .select('number, due_month, title')
        .eq('proposal_id', proposalId)
        .order('number'),
    ]);

    const wpById = new Map(wps.map((w: any) => [w.id, w]));
    const deliverables = (delsRes.data || []).map((d: any) => {
      const wp = wpById.get(d.wp_draft_id);
      return {
        label: wp ? `D${wp.number}.${d.number}` : `D?.${d.number}`,
        month: d.due_month,
      };
    });
    const milestones = msRes.data || [];

    const monthsArr = [
      ...deliverables.map((d: any) => d.month).filter((m: any) => typeof m === 'number'),
      ...milestones.map((m: any) => m.due_month).filter((m: any) => typeof m === 'number'),
    ];
    const maxMonth = monthsArr.length ? Math.max(...monthsArr) : 0;

    const delList = deliverables
      .filter((d: any) => typeof d.month === 'number')
      .sort((a: any, b: any) => a.month - b.month || a.label.localeCompare(b.label))
      .map((d: any) => `${d.label} at M${d.month}`)
      .join(', ');
    const msList = milestones
      .filter((m: any) => typeof m.due_month === 'number')
      .map((m: any) => `MS${m.number} at M${m.due_month}`)
      .join(', ');

    for (const wrapper of chartWrappers) {
      const kind = wrapper.getAttribute('data-figure-type') === 'pert' ? 'PERT' : 'Gantt';
      const chartLabel = kind === 'PERT' ? 'PERT diagram' : 'Gantt chart';

      // Caption text — keep the user-visible label rendered alongside the chart.
      const captionEl = wrapper.querySelector<HTMLElement>('[data-table-key]')
        || wrapper.querySelector<HTMLElement>('.figure-caption');
      const captionText = captionEl?.innerText?.trim() || chartLabel;

      const summaryParts: string[] = [];
      summaryParts.push(`${wps.length} WP${wps.length === 1 ? '' : 's'}`);
      if (maxMonth > 0) summaryParts.push(`spanning M1–M${maxMonth}`);
      if (delList) summaryParts.push(`deliverables ${delList}`);
      if (msList) summaryParts.push(`milestones ${msList}`);

      const replacement = document.createElement('p');
      replacement.setAttribute('data-figure-summary', kind.toLowerCase());
      replacement.style.cssText =
        "font-family:'Times New Roman',Times,serif;font-size:11pt;margin:6pt 0;text-align:left;";
      const head = `[${captionText} — ${chartLabel}]`;
      const tail = summaryParts.length
        ? ` (Structured summary: ${summaryParts.join('; ')}.)`
        : '';
      replacement.textContent = `${head}${tail}`;

      // Replace whole wrapper (chart + its caption) with the summary block.
      wrapper.replaceWith(replacement);
    }
  }

  // ── Uploaded image figures inside section content: keep label, drop image. ──
  const sectionImgs = Array.from(
    container.querySelectorAll<HTMLImageElement>('.print-section-content img'),
  );
  for (const img of sectionImgs) {
    // Look for an immediately following caption paragraph.
    let captionText = '';
    let nextEl: Element | null = img.parentElement;
    // The image is often wrapped in a paragraph/div — find the next sibling
    // of the nearest block ancestor inside the section.
    while (nextEl && !['P', 'DIV', 'FIGURE'].includes(nextEl.tagName)) {
      nextEl = nextEl.parentElement;
    }
    const candidate = nextEl?.nextElementSibling as HTMLElement | null;
    if (candidate && (candidate.classList.contains('figure-caption')
      || /^figure\s+/i.test(candidate.innerText.trim()))) {
      captionText = candidate.innerText.replace(/\s+/g, ' ').trim();
      candidate.remove();
    }
    const alt = img.getAttribute('alt') || '';
    const label = captionText || (alt ? `Figure — ${alt}` : 'Figure');
    const replacement = document.createElement('p');
    replacement.setAttribute('data-figure-summary', 'image');
    replacement.style.cssText =
      "font-family:'Times New Roman',Times,serif;font-size:11pt;margin:6pt 0;text-align:left;";
    replacement.textContent = `[${label}]`;
    img.replaceWith(replacement);
  }
}

// ── Post-process: replace interactive elements with static text ──────────────

function freezeInteractiveElements(container: HTMLElement): void {
  // 1. Replace <input> elements with their displayed value as static <span>
  container.querySelectorAll('input').forEach(input => {
    const span = document.createElement('span');
    // Copy computed styles for color, font, alignment
    const cs = window.getComputedStyle(input);
    span.style.color = cs.color;
    span.style.fontFamily = cs.fontFamily;
    span.style.fontSize = cs.fontSize;
    span.style.fontWeight = cs.fontWeight;
    span.style.textAlign = cs.textAlign;
    span.style.display = 'inline-block';
    span.style.width = '100%';
    span.textContent = input.value || input.placeholder || '';
    input.replaceWith(span);
  });

  // 2. Replace <select> elements with their selected option text
  container.querySelectorAll('select').forEach(select => {
    const span = document.createElement('span');
    const selected = select.options[select.selectedIndex];
    span.textContent = selected ? selected.textContent || '' : '';
    select.replaceWith(span);
  });

  // 3. Replace Radix Select triggers: find elements with role="combobox" or SelectTrigger
  //    These render the current value but are wrapped in a <button>
  //    The print CSS hides <button>, so extract their visible content first
  container.querySelectorAll('button[role="combobox"], [data-radix-select-trigger]').forEach(trigger => {
    const span = document.createElement('span');
    span.innerHTML = trigger.innerHTML;
    // Remove any chevron/icon SVGs from the cloned content
    span.querySelectorAll('svg.lucide-chevron-down, svg.lucide-chevrons-up-down, svg.lucide-chevron-up, svg.lucide-x, [data-radix-select-icon]').forEach(svg => svg.remove());
    // Copy inline styles
    const cs = window.getComputedStyle(trigger);
    span.style.display = 'inline-flex';
    span.style.alignItems = 'center';
    span.style.color = cs.color;
    span.style.fontFamily = cs.fontFamily;
    span.style.fontSize = cs.fontSize;
    span.style.fontWeight = cs.fontWeight;
    span.style.lineHeight = cs.lineHeight;
    trigger.replaceWith(span);
  });

  // 4. Replace all remaining buttons that contain visible text/bubbles
  //    but NOT structural buttons (drag handles etc. which should just be removed)
  container.querySelectorAll('button').forEach(btn => {
    const textContent = btn.textContent?.replace(/\s+/g, ' ').trim() || '';
    // Check if this button contains meaningful bubble content (not just icons)
    const hasBubble = btn.querySelector('[style*="background"]') || 
                      btn.querySelector('.print-bubble') ||
                      btn.querySelector('[class*="rounded-full"]');
    if (hasBubble || textContent.length > 0) {
      const span = document.createElement('span');
      span.innerHTML = btn.innerHTML;
      span.querySelectorAll('svg.lucide-chevron-down, svg.lucide-chevrons-up-down, svg.lucide-chevron-up, svg.lucide-x, [data-radix-select-icon]').forEach(svg => svg.remove());
      span.style.display = 'inline-flex';
      span.style.alignItems = 'center';
      span.style.flexWrap = 'wrap';
      span.style.gap = '2px';
      span.style.verticalAlign = 'middle';
      btn.replaceWith(span);
    }
    // Others will be hidden by CSS display:none
  });

  // 5. Replace textarea elements
  container.querySelectorAll('textarea').forEach(ta => {
    const div = document.createElement('div');
    div.textContent = ta.value;
    ta.replaceWith(div);
  });
}

// ── Persisted column-width application ───────────────────────────────────────

/**
 * Parse a TipTap colwidth attribute, which can be either a JSON array
 * (`"[120]"` / `"[120,80]"`) or a comma-separated list (`"120,80"`).
 */
function parseColwidthAttr(raw: string | null): number[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
    }
  } catch {
    // fall through to comma split
  }
  return trimmed
    .split(/[,\s]+/)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/**
 * For every <table> in the export container:
 *   1. If it has [data-table-key], fetch the persisted column widths from
 *      `table_column_widths` for (proposalId, tableKey) and apply them.
 *   2. Otherwise (TipTap content tables), if row-0 cells carry `colwidth`
 *      attrs, materialise them into a <colgroup><col width=…> so the print
 *      engine honours editor-resized columns instead of equal-distributing.
 *
 * Must run before the offscreen container width is reset to 100%, so that
 * the freshly-applied widths aren't blown away by a remount/measure cycle.
 */
async function applyPersistedColumnWidths(
  container: HTMLElement,
  proposalId: string,
): Promise<void> {
  const tables = Array.from(container.querySelectorAll('table')) as HTMLTableElement[];
  if (tables.length === 0) return;

  // 1) Batched fetch for all keyed tables.
  const keyed = tables.filter((t) => t.hasAttribute('data-table-key'));
  const tableKeys = Array.from(
    new Set(keyed.map((t) => t.getAttribute('data-table-key')!).filter(Boolean)),
  );

  const widthsByKey = new Map<string, number[]>();
  if (tableKeys.length > 0) {
    const { data, error } = await supabase
      .from('table_column_widths')
      .select('table_key, column_widths')
      .eq('proposal_id', proposalId)
      .in('table_key', tableKeys);
    if (!error && data) {
      for (const row of data) {
        const widths = row.column_widths;
        if (Array.isArray(widths) && widths.length > 0) {
          const nums = (widths as unknown[])
            .map((n) => Number(n))
            .filter((n) => Number.isFinite(n) && n > 0);
          if (nums.length > 0) widthsByKey.set(row.table_key as string, nums);
        }
      }
    }
  }

  for (const table of tables) {
    const key = table.getAttribute('data-table-key');
    if (key) {
      const widths = widthsByKey.get(key);
      if (widths && widths.length > 0) {
        // Match column count where possible; pad/trim defensively.
        const firstRow = table.querySelector('tbody tr, thead tr');
        const cellCount = firstRow
          ? Array.from(firstRow.querySelectorAll('th, td')).reduce(
              (sum, c) => sum + (parseInt(c.getAttribute('colspan') || '1', 10) || 1),
              0,
            )
          : widths.length;
        const adjusted =
          widths.length === cellCount
            ? widths
            : widths.length > cellCount
              ? widths.slice(0, cellCount)
              : [...widths, ...new Array(cellCount - widths.length).fill(widths[widths.length - 1] || 60)];
        applyColumnWidthsToTable(table, adjusted);
      } else {
        // No persisted widths — freeze the editor's currently-displayed column
        // widths so the 680px→100% container reset can't re-stretch them.
        // Measure tbody first row (same heuristic useColumnResize uses);
        // fall back to thead first row when tbody is empty.
        const measureRow =
          (table.querySelector('tbody tr:first-child') as HTMLTableRowElement | null) ||
          (table.querySelector('thead tr:first-child') as HTMLTableRowElement | null);
        if (measureRow) {
          const cells = Array.from(measureRow.querySelectorAll('th, td')) as HTMLElement[];
          const measured: number[] = [];
          let total = 0;
          for (const cell of cells) {
            const span = Math.max(1, parseInt(cell.getAttribute('colspan') || '1', 10) || 1);
            const w = Math.max(1, Math.round(cell.offsetWidth / span));
            for (let i = 0; i < span; i++) measured.push(w);
            total += cell.offsetWidth;
          }
          if (measured.length > 0 && total > 0) {
            applyColumnWidthsToTable(table, measured);
          }
        }
      }
      continue;
    }

    // 2) TipTap fallback: hoist per-cell colwidth → <colgroup>.
    if (table.querySelector('colgroup col')) continue;
    const firstRow = table.querySelector('tr');
    if (!firstRow) continue;
    const cells = Array.from(firstRow.querySelectorAll('th, td')) as HTMLTableCellElement[];
    const widths: number[] = [];
    let sawAny = false;
    for (const cell of cells) {
      const span = Math.max(1, parseInt(cell.getAttribute('colspan') || '1', 10) || 1);
      const cellWidths = parseColwidthAttr(cell.getAttribute('colwidth'));
      if (cellWidths.length > 0) sawAny = true;
      for (let i = 0; i < span; i++) {
        widths.push(cellWidths[i] ?? 0);
      }
    }
    if (!sawAny) continue;
    // Fill zeros with the average of the known widths so the print engine has
    // something concrete for every column.
    const known = widths.filter((w) => w > 0);
    if (known.length === 0) continue;
    const avg = Math.round(known.reduce((a, b) => a + b, 0) / known.length);
    const filled = widths.map((w) => (w > 0 ? w : avg));
    applyColumnWidthsToTable(table, filled);
  }
}

// ── Shared export container preparation ──────────────────────────────────────

/**
 * Build the print container, attach it to the DOM for layout,
 * mount B3.1 React components, and wait for images to load.
 * Returns the container and a cleanup function.
 */
export async function prepareExportContainer(
  options: PrintRenderOptions,
  statusMessage?: string,
  appQueryClient?: QueryClient,
): Promise<{ container: HTMLDivElement; cleanup: () => void }> {
  
  const container = await buildPrintContainer(options);
  

  // Attach to DOM — must be visible for layout capture
  // Use fixed pixel width (680px ≈ 18cm at 96dpi) for React rendering
  container.style.position = 'absolute';
  container.style.left = '0';
  container.style.top = '0';
  container.style.width = '680px';
  container.style.zIndex = '99999';
  container.style.pointerEvents = 'none';
  container.style.background = '#fff';
  container.style.overflow = 'visible';
  document.body.appendChild(container);

  // Mount B3.1 tables, B3.2 expertise matrix, and B1.2 cases-table placeholders
  await mountDynamicComponents(container, options.proposal.id, options.proposal.acronym, appQueryClient);


  // Refresh any expired signed URLs before waiting for images to load
  await refreshSignedUrls(container);


  // Wait for all images to load
  const images = container.querySelectorAll('img');
  await Promise.all(
    Array.from(images).map(
      img =>
        new Promise<void>(resolve => {
          if (img.complete) return resolve();
          img.onload = () => resolve();
          img.onerror = () => resolve();
        }),
    ),
  );


  // NOTE: Figure→text substitution (replaceFiguresWithText) is intentionally
  // NOT run here. The visual PDF/Word export must contain real inline SVG
  // (PERT/Gantt) and <img> figures. The evaluation pipeline imports
  // replaceFiguresWithText and runs it on a CLONE of this container.


  // Apply persisted column widths (B3.1 mirror tables, B3.2 expertise matrix,
  // and any other table marked with [data-table-key]) and convert TipTap
  // per-cell colwidth attrs into a <colgroup>. Must run BEFORE the container
  // width is reset so React mount measurements don't overwrite them.
  await applyPersistedColumnWidths(container, options.proposal.id);


  // Freeze interactive elements (inputs, selects, buttons) into static text
  // Must happen AFTER React mount but BEFORE detaching from DOM
  freezeInteractiveElements(container);

  // Reset to 100% width so it fills the print page properly
  container.style.width = '100%';
  container.style.maxWidth = '100%';
  container.style.position = 'static';
  container.style.left = 'auto';
  container.style.top = 'auto';
  container.style.zIndex = 'auto';
  container.style.pointerEvents = 'auto';

  // Allow a small delay for reflows
  await new Promise(r => setTimeout(r, 500));
  

  const cleanup = () => {
    if (container.parentNode) {
      document.body.removeChild(container);
    }
  };

  return { container, cleanup };
}
