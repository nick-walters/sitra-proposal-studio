import { supabase } from '@/integrations/supabase/client';

/**
 * Stage B – Populate case drafts into B1.2 section.
 *
 * Generates one TipTap-compatible <table> per case draft, each preceded by
 * a Table 1.2.x. caption paragraph and (collectively) by an H3 subheading
 * derived from the case type. Inserts/replaces these blocks above the
 * "Linked research & innovation activities" subheading, or at the top of
 * the section otherwise. Each table carries `data-case-id` so subsequent
 * populates replace the same block in place.
 */

const CASE_TYPE_HEADINGS: Record<string, string> = {
  case_study: 'Case study descriptions',
  use_case: 'Use case descriptions',
  living_lab: 'Living lab descriptions',
  pilot: 'Pilot descriptions',
  demonstration: 'Demonstration descriptions',
};

const CASE_TYPE_PREFIX: Record<string, string> = {
  case_study: 'CS',
  use_case: 'UC',
  living_lab: 'LL',
  pilot: 'P',
  demonstration: 'D',
};

function esc(str: string): string {
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
  const nameBit = shortName || title || '';
  if (prefixPart && nameBit) return `${prefixPart}: ${nameBit}${title && shortName ? ` – ${title}` : ''}`;
  if (prefixPart) return prefixPart;
  return nameBit || `${number}`;
}

function buildCaseTableHTML(args: {
  caseId: string;
  badgeText: string;
  leadName: string | null;
  subsections: { heading: string; content: string }[];
}): string {
  const { caseId, badgeText, leadName, subsections } = args;

  const badgeCell = `
    <td class="he-table-cell" colspan="1" style="border:1.5px solid #000; padding:6px; text-align:center;">
      <span style="display:inline-block; padding:2px 14px; border:1.5px solid #000; border-radius:9999px; background:#ffffff; color:#000000; font-family:'Times New Roman',serif; font-weight:700; font-size:11pt;">
        ${esc(badgeText)}
      </span>
    </td>`;

  const leadRow = leadName
    ? `<tr><td class="he-table-cell" style="border:1.5px solid #000; padding:6px;"><p style="margin:0; text-align:center;"><strong>Lead participant:</strong> ${esc(leadName)}</p></td></tr>`
    : `<tr><td class="he-table-cell" style="border:1.5px solid #000; padding:6px;"><p style="margin:0; text-align:center; color:#777;"><em>Lead participant not set</em></p></td></tr>`;

  const subRows = subsections
    .map((s) => {
      const headingHtml = `<strong><em>${esc(s.heading)}:</em></strong> `;
      // s.content is already sanitized HTML from subsection_content; if empty, leave a paragraph
      const body = (s.content && s.content.trim()) || '<em style="color:#999;">No content yet.</em>';
      return `<tr><td class="he-table-cell" style="border:1.5px solid #000; padding:6px; vertical-align:top;"><p style="margin:0;">${headingHtml}${body}</p></td></tr>`;
    })
    .join('');

  return `<table class="he-table b12-case-table" data-case-id="${caseId}" style="width:100%; border-collapse:collapse; border:1.5px solid #000;"><tbody><tr>${badgeCell}</tr>${leadRow}${subRows}</tbody></table>`;
}

export interface PopulateB12Result {
  insertedOrUpdated: number;
  caseCount: number;
}

export async function populateCasesToB12(proposalId: string): Promise<PopulateB12Result> {
  // 1. Fetch case drafts (order by order_index)
  const { data: cases, error: casesError } = await supabase
    .from('case_drafts')
    .select('id, number, short_name, title, color, case_type, custom_type_name, lead_participant_id, subsection_content, order_index')
    .eq('proposal_id', proposalId)
    .order('order_index', { ascending: true });
  if (casesError) throw casesError;
  if (!cases || cases.length === 0) {
    return { insertedOrUpdated: 0, caseCount: 0 };
  }

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
  let leadMap = new Map<string, string>();
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

  // 5. Determine common heading from first case's type (use the proposal-level type)
  const firstType = cases[0].case_type;
  const firstCustom = cases[0].custom_type_name;
  const subheadingText = getCaseTypeHeading(firstType, firstCustom);

  // 6. Build the cases block HTML
  const blocks: string[] = [];
  // Wrapper subheading (H3)
  blocks.push(
    `<h3 data-b12-cases-heading="true">${esc(subheadingText)}</h3>`,
  );
  cases.forEach((c, idx) => {
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

    // Caption above the table — letter will be renumbered automatically by renumberCaptionsInEditor
    const caption = `<p data-b12-case-caption="${c.id}"><span data-caption-label="true"><strong><em>Table 1.2.${String.fromCharCode(
      97 + idx,
    )}.</em></strong></span><em> ${esc(badgeText)} description.</em></p>`;

    blocks.push(caption);
    blocks.push(
      buildCaseTableHTML({
        caseId: c.id,
        badgeText,
        leadName,
        subsections,
      }),
    );
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

  // Remove any existing cases block
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
    // Insert at the top
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

  // 9. Lock cases + mark b12_populated
  const caseIds = cases.map((c) => c.id);
  const { data: userData } = await supabase.auth.getUser();
  const lockedBy = userData?.user?.id || null;
  await supabase
    .from('case_drafts')
    .update({ is_locked: true, locked_by: lockedBy, b12_populated: true } as any)
    .in('id', caseIds);

  return { insertedOrUpdated: cases.length, caseCount: cases.length };
}
