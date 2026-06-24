import { supabase } from '@/integrations/supabase/client';

/**
 * Stage 1b — insert a `casesTable` NodeView placeholder into B1.2,
 * preceded by a "Table 1.2.a. <Case-type> descriptions" caption paragraph.
 *
 * The caption is a normal <p class="table-caption"> directly above the
 * node placeholder so existing caption styling applies and the NodeView
 * itself stays caption-free.
 */

const CASE_TYPE_HEADING: Record<string, string> = {
  case_study: 'Case study descriptions',
  use_case: 'Use case descriptions',
  living_lab: 'Living lab descriptions',
  pilot: 'Pilot descriptions',
  demonstration: 'Demonstration descriptions',
  challenge: 'Challenge descriptions',
};

function esc(str: string | null | undefined): string {
  return (str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getCaseTypeHeading(caseType: string, customName: string | null): string {
  if (caseType === 'other') {
    return customName ? `${customName} descriptions` : 'Case descriptions';
  }
  return CASE_TYPE_HEADING[caseType] || 'Case descriptions';
}

export interface PopulateCasesNodeOptions {
  caseIds: string[];
}

export interface PopulateCasesNodeResult {
  insertedOrUpdated: number;
  caseCount: number;
}

export async function populateCasesNodeToB12(
  proposalId: string,
  options: PopulateCasesNodeOptions,
): Promise<PopulateCasesNodeResult> {
  const caseIds = (options.caseIds || []).filter(Boolean);
  if (caseIds.length === 0) return { insertedOrUpdated: 0, caseCount: 0 };

  // Fetch case types so caption text matches the established format.
  const { data: caseRows } = await supabase
    .from('case_drafts')
    .select('id, case_type, custom_type_name, number')
    .in('id', caseIds);
  const ordered = caseIds
    .map((id) => (caseRows || []).find((c: any) => c.id === id))
    .filter(Boolean) as any[];
  const first = ordered[0];
  const captionText = first
    ? getCaseTypeHeading(first.case_type, first.custom_type_name)
    : 'Case descriptions';

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

  // Remove any previous casesTable nodes AND their preceding caption paragraphs
  // so re-populating doesn't accumulate captions or nodes.
  root.querySelectorAll('div[data-cases-table-node]').forEach((n) => {
    const prev = n.previousElementSibling;
    if (
      prev &&
      prev.tagName === 'P' &&
      (prev.getAttribute('data-b12-cases-node-caption') === 'true' ||
        prev.classList.contains('table-caption'))
    ) {
      prev.remove();
    }
    n.remove();
  });

  const captionHtml =
    `<p class="table-caption" data-b12-cases-node-caption="true" style="text-align:left;">` +
    `<span data-caption-label="" contenteditable="false" style="user-select: none; font-weight: bold; font-style: italic;">Table 1.2.a. </span>` +
    `<em>${esc(captionText)}</em>` +
    `</p>`;
  const nodeHtml = `<div data-cases-table-node="" data-case-ids="${esc(caseIds.join(','))}"></div>`;

  const fragment = parser.parseFromString(`<div id="frag">${captionHtml}${nodeHtml}</div>`, 'text/html');
  const fragRoot = fragment.getElementById('frag')!;
  const captionEl = fragRoot.children[0];
  const nodeEl = fragRoot.children[1];

  const headings = Array.from(root.querySelectorAll('h1, h2, h3, h4'));
  let target: Element | null = null;
  for (const h of headings) {
    const text = (h.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (/linked\s+research\s+&\s+innovation\s+activities/i.test(text)) {
      target = h;
      break;
    }
  }
  if (target) {
    target.parentNode!.insertBefore(captionEl, target);
    target.parentNode!.insertBefore(nodeEl, target);
  } else {
    root.insertBefore(nodeEl, root.firstChild);
    root.insertBefore(captionEl, nodeEl);
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

  const { data: userData } = await supabase.auth.getUser();
  const lockedBy = userData?.user?.id || null;
  await supabase
    .from('case_drafts')
    .update({ is_locked: true, locked_by: lockedBy, b12_populated: true } as any)
    .in('id', caseIds);

  return { insertedOrUpdated: caseIds.length, caseCount: caseIds.length };
}
