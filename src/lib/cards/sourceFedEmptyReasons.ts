/**
 * Why a source-fed block will not appear in the produced proposal.
 *
 * A source-fed block has nothing to author — its content is assembled from
 * elsewhere in the proposal — so when the source is empty the block cannot
 * simply invite the author to type. Instead it stays on the board and states,
 * in plain words, which missing source keeps it out of the document.
 *
 * B3.1's tables keep their identity when empty because they are lettered per
 * the Commission template and a gap in the lettering is meaningful. B3.2's
 * conditional blocks are unnumbered and vanish entirely — they are not listed
 * here.
 */
export const SOURCE_FED_EMPTY_REASONS: Record<string, string> = {
  'b11.participants':
    'This table will not appear in the proposal because no participants have been added to the consortium.',
  'b31.table_a':
    'This table will not appear in the proposal because no work packages have been created.',
  'b31.table_b':
    'This table will not appear in the proposal because no work packages have been created.',
  'b31.table_c':
    'This table will not appear in the proposal because no deliverables have been created.',
  'b31.table_d':
    'This table will not appear in the proposal because no milestones have been recorded.',
  'b31.table_e':
    'This table will not appear in the proposal because no risks have been recorded.',
  'b31.table_f':
    'This table will not appear in the proposal because no staff effort has been allocated to participants.',
  'b31.table_g':
    'This table will not appear in the proposal because there are no subcontracting costs in the budget.',
  'b31.table_h':
    'This table will not appear in the proposal because no participant has purchase costs exceeding 15% of their personnel costs.',
  'b31.gantt':
    'This figure will not appear in the proposal because the Gantt chart has not been created on the figures page.',
  'b31.pert':
    'This figure will not appear in the proposal because the Pert chart has not been created on the figures page.',
  'b12.linked_activities':
    'This table will not appear in the proposal because no linked activities have been added.',
  'b11.references':
    'This list will not appear in the proposal because nothing in this section has been cited.',
  'b12.references':
    'This list will not appear in the proposal because nothing in this section has been cited.',
  'b21.references':
    'This list will not appear in the proposal because nothing in this section has been cited.',
  'b22.references':
    'This list will not appear in the proposal because nothing in this section has been cited.',
  'b31.references':
    'This list will not appear in the proposal because nothing in this section has been cited.',
  'b32.references':
    'This list will not appear in the proposal because nothing in this section has been cited.',
};

export function sourceFedEmptyReason(sourceKey: string | null | undefined): string {
  if (!sourceKey) return 'This block will not appear in the proposal because it has no source data.';
  return (
    SOURCE_FED_EMPTY_REASONS[sourceKey] ??
    'This block will not appear in the proposal because its source data is empty.'
  );
}
