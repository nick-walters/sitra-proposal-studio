import { supabase } from '@/integrations/supabase/client';

/**
 * Default unnumbered subheadings to seed at the top of each B-section
 * for proposals that haven't been seeded yet. Idempotent per (proposal, section).
 */
const DEFAULT_SUBHEADINGS: Record<string, string[]> = {
  'b1-1': ['Objectives', 'Ambition'],
  'b1-2': [
    'Methodologies',
    'Linked research & innovation activities',
    'Ongoing projects table',
    'Open science practices',
    'Data management',
    'Gender dimension',
    'Case studies & open calls',
  ],
  'b2-1': [
    'Pathway to impact',
    'Scale & significance of expected impacts',
    'Key performance indicators',
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

/**
 * Seed default unnumbered subheadings at the top of a B-section.
 * - Runs at most once per (proposal, section) — tracked via proposals.b_subheadings_seeded jsonb.
 * - Preserves all existing content; inserts missing subheadings (case-insensitive text match) at the top.
 * - Returns the new HTML if changes were made; otherwise the original HTML.
 */
export async function seedBSectionSubheadings(
  proposalId: string,
  sectionId: string,
  existingHtml: string,
  existingContentRowId: string | null,
): Promise<string> {
  const subheadings = DEFAULT_SUBHEADINGS[sectionId];
  if (!subheadings) return existingHtml;

  // Check flag
  const { data: proposal } = await supabase
    .from('proposals')
    .select('b_subheadings_seeded')
    .eq('id', proposalId)
    .maybeSingle();
  const seeded = ((proposal as any)?.b_subheadings_seeded || {}) as Record<string, boolean>;
  if (seeded[sectionId]) return existingHtml;

  // Parse existing content to find which subheadings already exist (case-insensitive)
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div id="r">${existingHtml || ''}</div>`, 'text/html');
  const root = doc.getElementById('r')!;
  const existingHeadingTexts = new Set(
    Array.from(root.querySelectorAll('h1, h2, h3, h4'))
      .map((h) => (h.textContent || '').trim().toLowerCase())
      .filter(Boolean),
  );

  const missing = subheadings.filter((h) => !existingHeadingTexts.has(h.toLowerCase()));

  let finalHtml = existingHtml || '';
  if (missing.length > 0) {
    const headingsHtml = missing
      .map((h) => `<h3 data-default-subheading="true">${esc(h)}</h3><p></p>`)
      .join('');
    finalHtml = headingsHtml + finalHtml;
  }

  // Persist (only if we actually need to write) — either inserted headings or first-time mark
  if (missing.length > 0) {
    if (existingContentRowId) {
      const { error } = await supabase
        .from('section_content')
        .update({ content: finalHtml, updated_at: new Date().toISOString() })
        .eq('id', existingContentRowId);
      if (error) {
        // Likely RLS — viewer; skip seeding & don't mark flag so an editor can do it later
        return existingHtml;
      }
    } else {
      const { error } = await supabase.from('section_content').insert({
        proposal_id: proposalId,
        section_id: sectionId,
        content: finalHtml,
      });
      if (error) return existingHtml;
    }
  }

  // Mark this section as seeded
  const newSeeded = { ...seeded, [sectionId]: true };
  await supabase
    .from('proposals')
    .update({ b_subheadings_seeded: newSeeded as any })
    .eq('id', proposalId);

  return finalHtml;
}
