import { supabase } from '@/integrations/supabase/client';

/**
 * Stage B – Populate selected case drafts into B1.2.
 *
 * Generates the cases block: an H3 type-derived subheading, a single editable
 * caption ("Table 1.2.x. {Cases}"), and one TipTap-compatible <table> per case.
 * Tables carry data-case-id so re-populates and reorder operations can locate
 * and update them in place. Tables are inserted directly above the
 * "Linked research & innovation activities" subheading (or top of section).
 */

const CASE_TYPE_HEADINGS: Record<string, string> = {
  case_study: 'Case study descriptions',
  use_case: 'Use case descriptions',
  living_lab: 'Living lab descriptions',
  pilot: 'Pilot descriptions',
  demonstration: 'Demonstration descriptions',
  challenge: 'Challenge descriptions',
};

const CASE_TYPE_PLURAL: Record<string, string> = {
  case_study: 'Case studies',
  use_case: 'Use cases',
  living_lab: 'Living labs',
  pilot: 'Pilots',
  demonstration: 'Demonstrations',
  challenge: 'Challenges',
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
  return CASE_TYPE_HEADINGS[caseType] || 'Case descriptions';
}

function getCaseTypePlural(caseType: string, customName: string | null): string {
  if (caseType === 'other') {
    return customName ? `${customName}s` : 'Cases';
  }
  return CASE_TYPE_PLURAL[caseType] || 'Cases';
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

/** Crown SVG inline (lucide-style) so it renders inside ProseMirror as static HTML. */
const CROWN_SVG = `<svg width="11" height="11" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:3px; vertical-align:-1px; display:inline-block;"><path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/></svg>`;

function buildParticipantBubbleHTML(name: string, withCrown: boolean): string {
  return `<span class="participant-bubble" style="display:inline-flex; align-items:center; padding:1px 8px; border-radius:9999px; background:#000000; color:#ffffff; font-family:'Times New Roman',serif; font-weight:700; font-size:11pt; line-height:1.2;">${withCrown ? CROWN_SVG : ''}${esc(name)}</span>`;
}

function buildCaseTableHTML(args: {
  caseId: string;
  badgeText: string;
  leadName: string | null;
  subsections: { heading: string; content: string }[];
}): string {
  const { caseId, badgeText, leadName, subsections } = args;

  // Title pill row — black border on the cell-bottom so adjacent rows are separated by the cell border, NOT by an under-pill divider
  // Actually we want NO divider under the title pill. Achieve by making this cell borderless on all sides except continuing the table outer black border via collapse.
  // Solution: table has 1px outer black border (border-collapse), all cells get 1px black border, BUT we override the title cell border-bottom to none.
  const titleCell = `<tr><td class="he-table-cell" style="border:1px solid #000; border-bottom:none; padding:4px 6px; text-align:center;">
    <span style="display:inline-block; width:100%; padding:2px 10px; border:1.5px solid #000; border-radius:9999px; background:#ffffff; color:#000000; font-family:'Times New Roman',serif; font-weight:700; font-size:11pt; text-align:center; box-sizing:border-box;">${esc(badgeText)}</span>
  </td></tr>`;

  const leadRow = `<tr><td class="he-table-cell" style="border:1px solid #000; border-top:none; padding:4px 6px; text-align:center;">
    ${leadName ? buildParticipantBubbleHTML(leadName, true) : '<em style="color:#777;">Lead not set</em>'}
  </td></tr>`;

  const subRows = subsections
    .map((s) => {
      const body = (s.content && s.content.replace(/<[^>]*>/g, '').trim())
        ? s.content
        : '<em style="color:#999;">No content yet.</em>';
      // Inline: bold-italic heading + colon, content follows on the same line
      // s.content is HTML often wrapped in <p>…</p>; strip outermost <p> so inline flow works
      let inlineBody = body;
      const pMatch = inlineBody.match(/^\s*<p[^>]*>([\s\S]*)<\/p>\s*$/i);
      if (pMatch) inlineBody = pMatch[1];
      return `<tr><td class="he-table-cell" style="border:1px solid #000; padding:4px 6px; vertical-align:top; font-family:'Times New Roman',serif; font-size:11pt;">
        <strong><em>${esc(s.heading)}:</em></strong> ${inlineBody}
      </td></tr>`;
    })
    .join('');

  return `<table class="he-table b12-case-table" data-case-id="${caseId}" style="width:100%; border-collapse:collapse;"><tbody>${titleCell}${leadRow}${subRows}</tbody></table>`;
}

export interface PopulateB12Options {
  /** If provided, only populate these case IDs (others are removed from the block). If omitted, all cases. */
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

  // 2. Fetch subsection templates
  const { data: templates, error: tplError } = await supabase
    .from('case_subsection_templates')
    .select('key, heading, order_index')
    .eq('proposal_id', proposalId)
    .order('order_index', { ascending: true });
  if (tplError) throw tplError;
  const templateList = (templates || []) as { key: string; heading: string; order_index: number }[];

  // 3. Fetch participants for lead names
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

  // 4. Fetch proposal flags
  const { data: proposal } = await supabase
    .from('proposals')
    .select('case_include_number, case_include_abbreviation')
    .eq('id', proposalId)
    .single();
  const includeNumber = (proposal as any)?.case_include_number !== false;
  const includeAbbreviation = (proposal as any)?.case_include_abbreviation !== false;

  // 5. Heading / type derived from first selected case
  const firstType = cases[0].case_type;
  const firstCustom = cases[0].custom_type_name;
  const subheadingText = getCaseTypeHeading(firstType, firstCustom);
  const captionTypeWord = getCaseTypePlural(firstType, firstCustom);

  // 6. Build the cases block HTML
  const blocks: string[] = [];
  blocks.push(`<h3 data-b12-cases-heading="true">${esc(subheadingText)}</h3>`);

  // Single caption above the whole cases block — letter is auto-renumbered by renumberCaptionsInEditor
  blocks.push(
    `<p class="table-caption" data-b12-cases-caption="true" style="text-align:left;"><span data-caption-label="" contenteditable="false" style="user-select: none; font-weight: bold; font-style: italic;">Table 1.2.a. </span><em>${esc(captionTypeWord)}</em></p>`,
  );

  cases.forEach((c) => {
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

    blocks.push(buildCaseTableHTML({ caseId: c.id, badgeText, leadName, subsections }));
    blocks.push('<p></p>');
  });

  const newBlockHTML = `<div data-b12-cases-block="true">${blocks.join('')}</div>`;

  // 7. Load existing b1-2 section content
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

  // Remove any existing cases block(s)
  root.querySelectorAll('[data-b12-cases-block="true"]').forEach((n) => n.remove());

  // Find insertion point: subheading containing "Linked research"
  let inserted = false;
  const headings = Array.from(root.querySelectorAll('h1, h2, h3, h4'));
  for (const h of headings) {
    if (/linked\s+research/i.test(h.textContent || '')) {
      const wrapper = doc.createElement('div');
      wrapper.innerHTML = newBlockHTML;
      const node = wrapper.firstElementChild!;
      h.parentNode!.insertBefore(node, h);
      inserted = true;
      break;
    }
  }
  if (!inserted) {
    const wrapper = doc.createElement('div');
    wrapper.innerHTML = newBlockHTML;
    root.insertBefore(wrapper.firstElementChild!, root.firstChild);
  }

  const finalHtml = root.innerHTML;

  // 8. Save
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

  // 9. Lock cases + mark b12_populated (only those just populated)
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
 * Reorder the case tables in the B1.2 section content to match the given case ID order.
 * Preserves all in-place edits (since it just shuffles the DOM nodes by data-case-id).
 * No-op if the cases block is not present.
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
  const block = root.querySelector('[data-b12-cases-block="true"]');
  if (!block) return false;

  const tables = Array.from(block.querySelectorAll('table.b12-case-table')) as HTMLTableElement[];
  if (tables.length === 0) return false;

  // Build a map by id, and capture each table's following spacer paragraph (if any)
  const groups = new Map<string, HTMLElement[]>();
  tables.forEach((t) => {
    const id = t.getAttribute('data-case-id') || '';
    const group: HTMLElement[] = [t];
    let next = t.nextElementSibling;
    if (next && next.tagName === 'P' && (next.textContent || '').trim() === '') {
      group.push(next as HTMLElement);
    }
    groups.set(id, group);
  });

  // Find anchor: the element BEFORE the first table (which is the caption — kept in place)
  const firstTable = tables[0];
  const anchor = firstTable.previousElementSibling;
  if (!anchor) return false;

  // Detach all groups, then re-append in desired order after the anchor
  groups.forEach((group) => group.forEach((el) => el.remove()));

  let cursor: Element = anchor;
  orderedCaseIds.forEach((id) => {
    const group = groups.get(id);
    if (!group) return;
    group.forEach((el) => {
      cursor.after(el);
      cursor = el;
    });
  });

  // Any tables for ids NOT in the orderedCaseIds list — append at the end (preserves them)
  groups.forEach((group, id) => {
    if (!orderedCaseIds.includes(id)) {
      group.forEach((el) => {
        cursor.after(el);
        cursor = el;
      });
    }
  });

  const finalHtml = root.innerHTML;
  await supabase
    .from('section_content')
    .update({ content: finalHtml, updated_at: new Date().toISOString() })
    .eq('id', existing.id);
  return true;
}
