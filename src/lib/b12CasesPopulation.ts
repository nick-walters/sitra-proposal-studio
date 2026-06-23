import { supabase } from '@/integrations/supabase/client';

/**
 * Stage B – Populate selected case drafts into B1.2.
 *
 * Produces ONE combined table containing all selected cases. Each case
 * occupies a group of rows (title pill, lead participant, then one row per
 * subsection). Cases are separated by a thick black divider row.
 *
 * The table is tagged with data-b12-cases-table="true" so it can be located
 * later (for reorders / re-populates). Each row carries data-case-id +
 * data-role so styling and reorder logic can target them.
 */

const CASE_TYPE_PLURAL: Record<string, string> = {
  case_study: 'Case study',
  use_case: 'Use case',
  living_lab: 'Living lab',
  pilot: 'Pilot',
  demonstration: 'Demonstration',
  challenge: 'Challenge',
};

const CASE_TYPE_HEADING: Record<string, string> = {
  case_study: 'Case study descriptions',
  use_case: 'Use case descriptions',
  living_lab: 'Living lab descriptions',
  pilot: 'Pilot descriptions',
  demonstration: 'Demonstration descriptions',
  challenge: 'Challenge descriptions',
};

const CASE_TYPE_PREFIX: Record<string, string> = {
  case_study: 'CS',
  use_case: 'UC',
  living_lab: 'LL',
  pilot: 'P',
  demonstration: 'D',
  challenge: 'CH',
};

function esc(str: string | null | undefined): string {
  return (str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getCasePrefix(caseType: string, customName: string | null): string {
  if (caseType === 'other') return (customName || '').toUpperCase();
  return CASE_TYPE_PREFIX[caseType] || '';
}

function getCaseTypeHeading(caseType: string, customName: string | null): string {
  if (caseType === 'other') {
    return customName ? `${customName} descriptions` : 'Case descriptions';
  }
  return CASE_TYPE_HEADING[caseType] || 'Case descriptions';
}

function getCaseTypeCaption(caseType: string, customName: string | null): string {
  // Caption text per user spec: "Case_type descriptions" e.g. "Challenge descriptions".
  return getCaseTypeHeading(caseType, customName);
}

function caseLabel(opts: {
  prefix: string;
  number: number;
  shortName: string | null;
  title: string | null;
  includeNumber: boolean;
  includeAbbreviation: boolean;
}): string {
  const { prefix, number, shortName, title, includeNumber, includeAbbreviation } = opts;
  const showAbbrev = (includeNumber || includeAbbreviation) && !!prefix;
  const showNumber = includeNumber;
  const prefixPart = `${showAbbrev ? prefix : ''}${showNumber ? number : ''}`;
  const nameBit = shortName || '';
  if (prefixPart && nameBit) return `${prefixPart}: ${nameBit}${title ? ` \u2013 ${title}` : ''}`;
  if (prefixPart) return prefixPart;
  return nameBit || title || `${number}`;
}

function stripOuterParagraph(html: string): string {
  const m = html.match(/^\s*<p[^>]*>([\s\S]*)<\/p>\s*$/i);
  return m ? m[1] : html;
}

/** Render one case as a sequence of <tr> rows inside the combined table. */
function buildCaseRows(args: {
  caseId: string;
  isFirst: boolean;
  badgeText: string;
  leadName: string | null;
  subsections: { heading: string; content: string }[];
}): string {
  const { caseId, isFirst, badgeText, leadName, subsections } = args;
  const startAttr = isFirst ? '' : ' data-case-start="true"';

  const titleRow = `<tr data-case-id="${caseId}" data-role="title-row"><td data-role="title" data-case-id="${caseId}"${startAttr}>${esc(badgeText)}</td></tr>`;

  const leadText = leadName ? `\u2654 ${esc(leadName)}` : 'Lead not set';
  const leadRow = `<tr data-case-id="${caseId}" data-role="lead-row"><td data-role="lead" data-case-id="${caseId}">${leadText}</td></tr>`;

  const subRows = subsections
    .map((s) => {
      const bodyHtml = (s.content && s.content.replace(/<[^>]*>/g, '').trim())
        ? stripOuterParagraph(s.content)
        : '<em style="color:#999;">No content yet.</em>';
      return `<tr data-case-id="${caseId}" data-role="sub-row"><td data-role="sub" data-case-id="${caseId}"><p><strong><em>${esc(s.heading)}:</em></strong> ${bodyHtml}</p></td></tr>`;
    })
    .join('');

  return titleRow + leadRow + subRows;
}

export interface PopulateB12Options {
  /** If provided, only populate these case IDs. If omitted, all cases. */
  caseIds?: string[];
}

export interface PopulateB12Result {
  insertedOrUpdated: number;
  caseCount: number;
}

export async function populateCasesToB12(
  proposalId: string,
  options: PopulateB12Options = {},
): Promise<PopulateB12Result> {
  // 1. Fetch case drafts
  const { data: allCases, error: casesError } = await supabase
    .from('case_drafts')
    .select('id, number, short_name, title, color, case_type, custom_type_name, lead_participant_id, subsection_content, order_index')
    .eq('proposal_id', proposalId)
    .order('order_index', { ascending: true });
  if (casesError) throw casesError;
  if (!allCases || allCases.length === 0) {
    return { insertedOrUpdated: 0, caseCount: 0 };
  }

  const cases = options.caseIds
    ? allCases.filter((c) => options.caseIds!.includes(c.id))
    : allCases;
  if (cases.length === 0) return { insertedOrUpdated: 0, caseCount: 0 };

  // 2. Subsection templates
  const { data: templates, error: tplError } = await supabase
    .from('case_subsection_templates')
    .select('key, heading, order_index')
    .eq('proposal_id', proposalId)
    .order('order_index', { ascending: true });
  if (tplError) throw tplError;
  const templateList = (templates || []) as { key: string; heading: string; order_index: number }[];

  // 3. Lead participant names
  const leadIds = Array.from(new Set(cases.map((c) => c.lead_participant_id).filter(Boolean) as string[]));
  const leadMap = new Map<string, string>();
  if (leadIds.length > 0) {
    const { data: ps } = await supabase
      .from('participants')
      .select('id, organisation_short_name, organisation_name')
      .in('id', leadIds);
    (ps || []).forEach((p: any) => {
      leadMap.set(p.id, p.organisation_short_name || p.organisation_name || '');
    });
  }

  // 4. Flags
  const { data: proposal } = await supabase
    .from('proposals')
    .select('case_include_number, case_include_abbreviation')
    .eq('id', proposalId)
    .single();
  const includeNumber = (proposal as any)?.case_include_number !== false;
  const includeAbbreviation = (proposal as any)?.case_include_abbreviation !== false;

  // 5. Heading + caption text derived from first selected case
  const firstType = cases[0].case_type;
  const firstCustom = cases[0].custom_type_name;
  const subheadingText = getCaseTypeHeading(firstType, firstCustom);
  const captionText = getCaseTypeCaption(firstType, firstCustom);

  // 6. Build combined table
  const allRows = cases
    .map((c, idx) => {
      const prefix = getCasePrefix(c.case_type, c.custom_type_name);
      const badgeText = caseLabel({
        prefix,
        number: c.number,
        shortName: c.short_name,
        title: c.title,
        includeNumber,
        includeAbbreviation,
      });
      const leadName = c.lead_participant_id ? leadMap.get(c.lead_participant_id) || null : null;
      const contentMap = (c.subsection_content as Record<string, string> | null) || {};
      const subsections = templateList.map((t) => ({
        heading: t.heading,
        content: contentMap[t.key] || '',
      }));
      return buildCaseRows({
        caseId: c.id,
        isFirst: idx === 0,
        badgeText,
        leadName,
        subsections,
      });
    })
    .join('');

  const tableHtml = `<table data-b12-cases-table="true"><tbody>${allRows}</tbody></table>`;

  const blocks: string[] = [];
  blocks.push(`<h3 data-b12-cases-heading="true">${esc(subheadingText)}</h3>`);
  blocks.push(
    `<p class="table-caption" data-b12-cases-caption="true" style="text-align:left;"><span data-caption-label="" contenteditable="false" style="user-select: none; font-weight: bold; font-style: italic;">Table 1.2.a. </span><em>${esc(captionText)}</em></p>`,
  );
  blocks.push(tableHtml);

  const blockInnerHTML = blocks.join('');

  // 7. Load existing b1-2 content
  const { data: existing } = await supabase
    .from('section_content')
    .select('id, content')
    .eq('proposal_id', proposalId)
    .eq('section_id', 'b1-2')
    .maybeSingle();

  const existingHtml: string = (existing?.content as string) || '';
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div id="root">${existingHtml}</div>`, 'text/html');
  const root = doc.getElementById('root')!;

  // Remove any previous cases block — match the wrapper div if present, OR
  // (when the wrapper has been stripped by the editor) find the cases table
  // and also remove the heading + caption sitting directly before it.
  root.querySelectorAll('[data-b12-cases-block="true"]').forEach((n) => n.remove());
  root.querySelectorAll('table[data-b12-cases-table="true"]').forEach((tbl) => {
    const prevCaption = tbl.previousElementSibling;
    const prevHeading =
      prevCaption?.previousElementSibling &&
      /^H[1-6]$/.test(prevCaption.previousElementSibling.tagName)
        ? prevCaption.previousElementSibling
        : null;
    tbl.remove();
    if (prevCaption && prevCaption.classList?.contains('table-caption')) prevCaption.remove();
    if (prevHeading) prevHeading.remove();
  });

  // Insert just before "Linked research" subheading; else top
  const insertBlock = (beforeNode: Element | null) => {
    const tmp = doc.createElement('div');
    tmp.innerHTML = blockInnerHTML;
    const nodes = Array.from(tmp.childNodes);
    if (beforeNode) {
      nodes.forEach((n) => beforeNode.parentNode!.insertBefore(n, beforeNode));
    } else {
      nodes.forEach((n) => root.insertBefore(n, root.firstChild));
    }
  };

  let inserted = false;
  const headings = Array.from(root.querySelectorAll('h1, h2, h3, h4'));
  for (const h of headings) {
    if (/linked\s+research/i.test(h.textContent || '')) {
      insertBlock(h);
      inserted = true;
      break;
    }
  }
  if (!inserted) {
    // Insert at top, in reverse order so they end up in correct order
    const tmp = doc.createElement('div');
    tmp.innerHTML = blockInnerHTML;
    const nodes = Array.from(tmp.childNodes).reverse();
    nodes.forEach((n) => root.insertBefore(n, root.firstChild));
  }

  const finalHtml = root.innerHTML;

  if (existing?.id) {
    await supabase
      .from('section_content')
      .update({ content: finalHtml, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
  } else {
    await supabase.from('section_content').insert({
      proposal_id: proposalId,
      section_id: 'b1-2',
      content: finalHtml,
    });
  }

  // 8. Lock populated cases
  const caseIdsToLock = cases.map((c) => c.id);
  const { data: userData } = await supabase.auth.getUser();
  const lockedBy = userData?.user?.id || null;
  await supabase
    .from('case_drafts')
    .update({ is_locked: true, locked_by: lockedBy, b12_populated: true } as any)
    .in('id', caseIdsToLock);

  return { insertedOrUpdated: cases.length, caseCount: cases.length };
}

/**
 * Reorder cases within the combined B1.2 cases table to match orderedCaseIds.
 * Operates on rows tagged data-case-id; preserves in-place edits.
 */
export async function reorderB12CaseTablesInSection(
  proposalId: string,
  orderedCaseIds: string[],
): Promise<boolean> {
  const { data: existing } = await supabase
    .from('section_content')
    .select('id, content')
    .eq('proposal_id', proposalId)
    .eq('section_id', 'b1-2')
    .maybeSingle();
  if (!existing?.id || !existing.content) return false;

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div id="root">${existing.content}</div>`, 'text/html');
  const root = doc.getElementById('root')!;

  const table = root.querySelector('table[data-b12-cases-table="true"]');
  if (!table) return false;
  const tbody = table.querySelector('tbody');
  if (!tbody) return false;

  const rows = Array.from(tbody.querySelectorAll('tr[data-case-id]')) as HTMLTableRowElement[];
  if (rows.length === 0) return false;

  const groups = new Map<string, HTMLTableRowElement[]>();
  rows.forEach((r) => {
    const id = r.getAttribute('data-case-id') || '';
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id)!.push(r);
  });

  rows.forEach((r) => r.remove());

  const orderedKnown = orderedCaseIds.filter((id) => groups.has(id));
  const trailing = Array.from(groups.keys()).filter((id) => !orderedKnown.includes(id));
  const finalOrder = [...orderedKnown, ...trailing];

  finalOrder.forEach((id, idx) => {
    const group = groups.get(id)!;
    group.forEach((row, i) => {
      // Refresh data-case-start on title cell so the divider is only between cases
      if (i === 0) {
        const titleCell = row.querySelector('td[data-role="title"]') as HTMLTableCellElement | null;
        if (titleCell) {
          if (idx === 0) titleCell.removeAttribute('data-case-start');
          else titleCell.setAttribute('data-case-start', 'true');
        }
      }
      tbody.appendChild(row);
    });
  });

  const finalHtml = root.innerHTML;
  await supabase
    .from('section_content')
    .update({ content: finalHtml, updated_at: new Date().toISOString() })
    .eq('id', existing.id);
  return true;
}
