import { supabase } from '@/integrations/supabase/client';

/**
 * Stage 1 — insert a `casesTable` NodeView placeholder into B1.2.
 *
 * Writes a tiny wrapper div (data-cases-table-node + data-case-ids) into
 * the b1-2 section_content. When the editor loads, TipTap parses the
 * wrapper into the `casesTable` block node, which renders the real cases
 * via its React NodeView.
 *
 * Position: directly above the "Linked research & innovation activities"
 * subheading; fallback = top of the section.
 *
 * Locking behaviour mirrors the legacy populate path so users can still
 * unlock/edit case drafts via the existing UI.
 */

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

  // Remove any previous casesTable nodes so we don't stack duplicates.
  root.querySelectorAll('div[data-cases-table-node]').forEach((n) => n.remove());

  const wrapper = doc.createElement('div');
  wrapper.setAttribute('data-cases-table-node', '');
  wrapper.setAttribute('data-case-ids', caseIds.join(','));

  const headings = Array.from(root.querySelectorAll('h1, h2, h3, h4'));
  let target: Element | null = null;
  for (const h of headings) {
    const text = (h.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (
      text === 'linked research & innovation activities' ||
      /linked\s+research\s+&\s+innovation\s+activities/i.test(text)
    ) {
      target = h;
      break;
    }
  }
  if (target) {
    target.parentNode!.insertBefore(wrapper, target);
  } else {
    root.insertBefore(wrapper, root.firstChild);
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

  // Lock the selected drafts (mirrors legacy populate behaviour).
  const { data: userData } = await supabase.auth.getUser();
  const lockedBy = userData?.user?.id || null;
  await supabase
    .from('case_drafts')
    .update({ is_locked: true, locked_by: lockedBy, b12_populated: true } as any)
    .in('id', caseIds);

  return { insertedOrUpdated: caseIds.length, caseCount: caseIds.length };
}
