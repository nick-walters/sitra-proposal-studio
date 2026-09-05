/**
 * Display rule for task participants, shared by every surface that draws them:
 * the task editor's collapsed participants field, the read-only B3.1 mirror
 * (also used as the B3.1 preview) and the Typst PDF builder.
 *
 * THE RULE: when the participants selected on a task cover every participant on
 * the proposal EXCEPT the task leader, the individual badges collapse into a
 * single "All participants" badge. The leader's own badge is untouched.
 *
 * Nothing about storage changes — this is derived from the CURRENT selection at
 * render time, so hand-picking everyone and using select-all look identical.
 *
 * Leader changed after selecting everyone: the former leader may still sit in
 * the stored selection and the new leader may be absent from it. We only ask
 * whether every NON-leader participant is selected, so both of those are
 * harmless and the badge still reads "All participants".
 */
export const ALL_PARTICIPANTS_LABEL = 'All participants';

export function coversAllParticipants(
  allParticipantIds: string[],
  leaderId: string | null | undefined,
  selectedIds: string[],
): boolean {
  const others = allParticipantIds.filter((id) => id !== leaderId);
  if (others.length === 0) return false;
  const selected = new Set(selectedIds);
  return others.every((id) => selected.has(id));
}
