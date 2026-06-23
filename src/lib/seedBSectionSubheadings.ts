import { supabase } from '@/integrations/supabase/client';

/**
 * Default unnumbered subheadings to seed at the top of each B-section.
 * Versioned: when SEED_VERSION changes, existing default subheadings
 * (marked data-default-subheading="true") are removed and replaced.
 * User-added headings are never touched.
 */
const SEED_VERSION = 'v3';

const DEFAULT_SUBHEADINGS: Record<string, string[]> = {
  'b1-1': [
    'Objectives',
    'Advance beyond the state-of-the-art & ambition',
    'Research & innovation maturity',
  ],
  'b1-2': [
    'Methodologies',
    'Linked research & innovation activities',
    'Interdisciplinarity',
    'Social sciences & humanities',
    'Gender dimension',
    'Open science practices',
  ],
  'b2-1': [
    'Contributions towards expected outcomes of topic',
    'Contributions towards expected impacts of destination',
  ],
  'b2-2': [
    'Key exploitable results',
    'Draft plan for the dissemination & exploitation of results, including communication plan',
    'Intellectual property management',
  ],
  'b3-2': [
    'Interdisciplinarity & complementarity of the consortium for addressing the project\u2019s objectives',
    'Participants\u2019 capacity, contributions & resources',
    'Value chain coverage & industrial involvement',
    'Justification of the participation of international organisations & third countries',
  ],
};

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function seedBSectionSubheadings(
  proposalId: string,
  sectionId: string,
  existingHtml: string,
  existingContentRowId: string | null,
): Promise<string> {
  const subheadings = DEFAULT_SUBHEADINGS[sectionId];
  if (!subheadings) return existingHtml;

  const { data: proposal } = await supabase
    .from('proposals')
    .select('b_subheadings_seeded')
    .eq('id', proposalId)
    .maybeSingle();
  const seeded = ((proposal as any)?.b_subheadings_seeded || {}) as Record<string, unknown>;
  const currentVersion = seeded[sectionId];
  if (currentVersion === SEED_VERSION) return existingHtml;

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div id="r">${existingHtml || ''}</div>`, 'text/html');
  const root = doc.getElementById('r')!;

  const defaultsLower = new Set(subheadings.map((h) => h.toLowerCase()));

  // Remove every existing heading that matches a default — either flagged or by
  // text — so the canonical default order is enforced. (Headings the user has
  // added that aren't in the defaults list are preserved.)
  const toRemove: Element[] = [];
  root.querySelectorAll('h1, h2, h3, h4').forEach((el) => {
    const text = (el.textContent || '').trim().toLowerCase();
    if (el.getAttribute('data-default-subheading') === 'true' || defaultsLower.has(text)) {
      toRemove.push(el);
    }
  });
  toRemove.forEach((el) => {
    const next = el.nextElementSibling;
    if (next && next.tagName === 'P' && (next.textContent || '').trim() === '') {
      next.remove();
    }
    el.remove();
  });

  // Always prepend the full canonical list in the declared order
  const headingsHtml = subheadings
    .map((h) => `<h3 data-default-subheading="true">${esc(h)}</h3><p></p>`)
    .join('');
  const finalHtml = headingsHtml + root.innerHTML;

  // Persist content (if there were any changes — either removals or additions)
  if (finalHtml !== existingHtml) {
    if (existingContentRowId) {
      const { error } = await supabase
        .from('section_content')
        .update({ content: finalHtml, updated_at: new Date().toISOString() })
        .eq('id', existingContentRowId);
      if (error) return existingHtml;
    } else {
      const { error } = await supabase.from('section_content').insert({
        proposal_id: proposalId,
        section_id: sectionId,
        content: finalHtml,
      });
      if (error) return existingHtml;
    }
  }

  // Mark this section as seeded at the current version
  const newSeeded = { ...seeded, [sectionId]: SEED_VERSION };
  await supabase
    .from('proposals')
    .update({ b_subheadings_seeded: newSeeded as any })
    .eq('id', proposalId);

  return finalHtml;
}
