/**
 * One canonical spelling for a Part B section number.
 *
 * The same section is written "1.1", "B1.1" and "b1.1" depending on which
 * table it came from, so anything keyed by section number normalises here
 * first. Used to key per-section page counts, which cannot be keyed by id:
 * the navigation carries `template_sections.id` and the compiled document
 * carries `proposal_template_sections.id`.
 */
export function normalizeSectionNumber(value: string | null | undefined): string {
  const bare = String(value ?? '').trim().replace(/^b/i, '').replace(/\.+$/, '');
  return bare ? `B${bare}` : '';
}
