import { supabase } from '@/integrations/supabase/client';

/**
 * Stage 1c — insert/refresh the B1.2 cases block:
 *
 *   <h3 data-default-subheading="true" data-b12-cases-subheading="true">{Plural}</h3>
 *   <p></p>                                          (empty spacer line)
 *   <p class="table-caption" ...>Table 1.2.a. <em>{Plural} descriptions</em></p>
 *   <div data-cases-table-node data-case-ids="..."></div>
 *
 * Re-populate UPDATES the text of the subheading and the caption descriptive
 * portion in place — it never replaces the heading element or changes the
 * caption's "Table 1.2.x." numbering, so existing cross-references stay valid.
 *
 * Pluralisation rule (kept deliberately simple, per spec):
 *   take the singular display label for the case type and append 's' unless
 *   it already ends in 's'.
 */

const CASE_TYPE_SINGULAR: Record<string, string> = {
  case_study: 'Case study',
  use_case: 'Use case',
  living_lab: 'Living lab',
  pilot: 'Pilot',
  demonstration: 'Demonstration',
  challenge: 'Challenge',
};

function esc(str: string | null | undefined): string {
  return (str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pluralise(singular: string): string {
  const s = (singular || '').trim();
  if (!s) return 'Cases';
  return /s$/i.test(s) ? s : s + 's';
}

function getSingularLabel(caseType: string, customName: string | null): string {
  if (caseType === 'other') return (customName && customName.trim()) || 'Case';
  return CASE_TYPE_SINGULAR[caseType] || 'Case';
}

export interface PopulateCasesNodeOptions {
  caseIds: string[];
}

export interface PopulateCasesNodeResult {
  insertedOrUpdated: number;
  caseCount: number;
}

/**
 * Stage 3a — snapshot the selected case drafts into b12_cases + b12_case_subsections.
 * Replace strategy (mirrors b31Population for tasks): delete any existing
 * snapshot rows for this proposal whose case_draft_id is in the selection,
 * then insert fresh rows.
 */
async function writeCasesSnapshot(proposalId: string, caseIds: string[]): Promise<void> {
  if (caseIds.length === 0) return;

  const [{ data: caseRows }, { data: templates }] = await Promise.all([
    supabase
      .from('case_drafts')
      .select(
        'id, number, case_type, custom_type_name, short_name, title, color, lead_participant_id, order_index, subsection_content',
      )
      .in('id', caseIds),
    supabase
      .from('case_subsection_templates')
      .select('key, heading, order_index')
      .eq('proposal_id', proposalId)
      .order('order_index'),
  ]);

  const drafts = (caseRows || []) as any[];
  const tmpls = (templates || []) as { key: string; heading: string; order_index: number }[];

  // Replace existing snapshot rows for the selected drafts.
  await supabase
    .from('b12_cases')
    .delete()
    .eq('proposal_id', proposalId)
    .in('case_draft_id', caseIds);

  for (const d of drafts) {
    const { data: inserted, error: insErr } = await supabase
      .from('b12_cases')
      .insert({
        proposal_id: proposalId,
        case_draft_id: d.id,
        number: d.number,
        case_type: d.case_type,
        custom_type_name: d.custom_type_name,
        short_name: d.short_name,
        title: d.title,
        color: d.color,
        lead_participant_id: d.lead_participant_id,
        order_index: d.order_index,
      })
      .select('id')
      .single();
    if (insErr || !inserted) continue;

    const subContent: Record<string, string> = (d.subsection_content || {}) as any;
    const subRows = tmpls.map((t, i) => ({
      b12_case_id: inserted.id,
      subsection_key: t.key,
      heading: t.heading,
      body: subContent[t.key] || '',
      order_index: i,
    }));
    if (subRows.length > 0) {
      await supabase.from('b12_case_subsections').insert(subRows);
    }
  }
}

/**
 * Stage 3a — return true if the snapshot for the given case ids differs from
 * what a fresh populate would produce (i.e. the user has edited B1.2 since
 * last populate). If no snapshot exists yet for a selected id, that counts
 * as "no edits to lose" for that id (fresh populate is silent).
 */
export async function hasSnapshotEdits(proposalId: string, caseIds: string[]): Promise<boolean> {
  if (caseIds.length === 0) return false;

  const [{ data: snapRows }, { data: caseRows }, { data: templates }] = await Promise.all([
    supabase
      .from('b12_cases')
      .select(
        'id, case_draft_id, title, short_name, lead_participant_id, b12_case_subsections(subsection_key, body)',
      )
      .eq('proposal_id', proposalId)
      .in('case_draft_id', caseIds),
    supabase
      .from('case_drafts')
      .select('id, title, short_name, lead_participant_id, subsection_content')
      .in('id', caseIds),
    supabase
      .from('case_subsection_templates')
      .select('key')
      .eq('proposal_id', proposalId),
  ]);

  const snapshots = (snapRows || []) as any[];
  if (snapshots.length === 0) return false; // nothing to overwrite

  const draftsById = new Map<string, any>((caseRows || []).map((c: any) => [c.id, c]));
  const tmplKeys = ((templates || []) as any[]).map((t) => t.key);

  for (const snap of snapshots) {
    const draft = draftsById.get(snap.case_draft_id);
    if (!draft) return true; // draft gone but snapshot exists → user-visible mismatch
    if ((snap.title || '') !== (draft.title || '')) return true;
    if ((snap.short_name || '') !== (draft.short_name || '')) return true;
    if ((snap.lead_participant_id || null) !== (draft.lead_participant_id || null)) return true;

    const snapSubs: Record<string, string> = {};
    for (const s of snap.b12_case_subsections || []) snapSubs[s.subsection_key] = s.body || '';
    const draftSubs: Record<string, string> = (draft.subsection_content || {}) as any;

    for (const k of tmplKeys) {
      if ((snapSubs[k] || '') !== (draftSubs[k] || '')) return true;
    }
  }
  return false;
}


export async function populateCasesNodeToB12(
  proposalId: string,
  options: PopulateCasesNodeOptions,
): Promise<PopulateCasesNodeResult> {
  const caseIds = (options.caseIds || []).filter(Boolean);
  if (caseIds.length === 0) return { insertedOrUpdated: 0, caseCount: 0 };

  const { data: caseRows } = await supabase
    .from('case_drafts')
    .select('id, case_type, custom_type_name, number')
    .in('id', caseIds);
  const ordered = caseIds
    .map((id) => (caseRows || []).find((c: any) => c.id === id))
    .filter(Boolean) as any[];
  const first = ordered[0];
  const singular = first ? getSingularLabel(first.case_type, first.custom_type_name) : 'Case';
  const plural = pluralise(singular);
  const captionDescriptive = `${plural} descriptions`;

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

  // ---- Locate an existing block (node + caption + optional subheading) ----
  const existingNode = root.querySelector('div[data-cases-table-node]');

  const isCaption = (el: Element | null): boolean =>
    !!el &&
    el.tagName === 'P' &&
    (el.getAttribute('data-b12-cases-node-caption') === 'true' ||
      el.classList.contains('table-caption'));

  const isSubheading = (el: Element | null): boolean =>
    !!el &&
    /^H[1-6]$/.test(el.tagName) &&
    el.getAttribute('data-b12-cases-subheading') === 'true';

  if (existingNode) {
    // Refresh case ids on the node placeholder.
    existingNode.setAttribute('data-case-ids', caseIds.join(','));

    // Find the caption directly above the node (skip empty paragraphs).
    let cursor: Element | null = existingNode.previousElementSibling;
    let captionEl: Element | null = null;
    if (isCaption(cursor)) captionEl = cursor;

    if (captionEl) {
      // Update ONLY the descriptive text, preserving the "Table 1.2.x." label span.
      const labelSpan = captionEl.querySelector('span[data-caption-label]');
      // Remove every direct child that is NOT the label span.
      Array.from(captionEl.childNodes).forEach((n) => {
        if (n.nodeType === 1 && (n as Element) === labelSpan) return;
        captionEl!.removeChild(n);
      });
      const em = doc.createElement('em');
      em.textContent = captionDescriptive;
      captionEl.appendChild(em);
    }

    // Find subheading above caption (or above node if no caption), allowing
    // an empty <p> spacer in between.
    const startFrom: Element = captionEl || existingNode;
    let probe: Element | null = startFrom.previousElementSibling;
    if (probe && probe.tagName === 'P' && (probe.textContent || '').trim() === '') {
      probe = probe.previousElementSibling;
    }
    let subheadingEl: Element | null = isSubheading(probe) ? probe : null;

    // Fallback: marker may have been lost (e.g. user converted heading to
    // numbered via the heading-number extension and the data-attr was
    // stripped). If the element immediately above the caption/spacer is any
    // heading, treat it as the case-type subheading and re-apply the marker.
    if (!subheadingEl && probe && /^H[1-6]$/.test(probe.tagName)) {
      probe.setAttribute('data-b12-cases-subheading', 'true');
      subheadingEl = probe;
    }


    if (subheadingEl) {
      // Update ONLY the text label — preserve any number-label child the
      // numbering extension may have injected (e.g. span[data-heading-number]).
      const preserved: Node[] = [];
      Array.from(subheadingEl.childNodes).forEach((n) => {
        if (
          n.nodeType === 1 &&
          ((n as Element).hasAttribute('data-heading-number') ||
            (n as Element).getAttribute('contenteditable') === 'false')
        ) {
          preserved.push(n);
        }
      });
      while (subheadingEl.firstChild) subheadingEl.removeChild(subheadingEl.firstChild);
      preserved.forEach((n) => subheadingEl!.appendChild(n));
      subheadingEl.appendChild(doc.createTextNode(plural));
    } else if (captionEl) {
      // Subheading missing — create it (unnumbered) + spacer above the caption.
      const h = doc.createElement('h3');
      h.setAttribute('data-default-subheading', 'true');
      h.setAttribute('data-b12-cases-subheading', 'true');
      h.textContent = plural;
      const spacer = doc.createElement('p');
      captionEl.parentNode!.insertBefore(h, captionEl);
      captionEl.parentNode!.insertBefore(spacer, captionEl);
    }
  } else {
    // ---- Fresh insert ----
    // Strip any stale orphan captions tagged for this block to avoid duplicates.
    root.querySelectorAll('p[data-b12-cases-node-caption="true"]').forEach((p) => p.remove());

    const captionHtml =
      `<p class="table-caption" data-b12-cases-node-caption="true" style="text-align:left;">` +
      `<span data-caption-label="" contenteditable="false" style="user-select: none; font-weight: bold; font-style: italic;">Table 1.2.a. </span>` +
      `<em>${esc(captionDescriptive)}</em>` +
      `</p>`;
    const nodeHtml = `<div data-cases-table-node="" data-case-ids="${esc(caseIds.join(','))}"></div>`;
    const subheadingHtml = `<h3 data-default-subheading="true" data-b12-cases-subheading="true">${esc(plural)}</h3>`;
    const spacerHtml = `<p></p>`;

    const fragment = parser.parseFromString(
      `<div id="frag">${subheadingHtml}${spacerHtml}${captionHtml}${nodeHtml}</div>`,
      'text/html',
    );
    const fragRoot = fragment.getElementById('frag')!;
    const els = Array.from(fragRoot.children); // [h3, p, caption, node]

    // Find insertion target: just before the "Linked R&I activities" heading.
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
      els.forEach((el) => target!.parentNode!.insertBefore(el, target!));
    } else {
      els
        .slice()
        .reverse()
        .forEach((el) => root.insertBefore(el, root.firstChild));
    }
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

  // Stage 3a: snapshot the selected case drafts into the b12_cases tables.
  await writeCasesSnapshot(proposalId, caseIds);

  return { insertedOrUpdated: caseIds.length, caseCount: caseIds.length };
}

