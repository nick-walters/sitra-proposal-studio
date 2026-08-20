import { describe, expect, it } from 'vitest';
import {
  emptySnapshot,
  resolveChipLabel,
  type RefSnapshotServer,
} from '../../supabase/functions/_shared/referenceResolution';
import {
  formatAcronymLabel,
  formatCaseLabel,
  formatDeliverableLabel,
  formatFigureLabel,
  formatMilestoneLabel,
  formatParticipantLabel,
  formatTableLabel,
  formatTaskLabel,
  formatWPLabel,
} from '@/lib/referenceLabels';

function fixture(): RefSnapshotServer {
  const snap = emptySnapshot();
  snap.wpById.set('wp', { id: 'wp', number: 2, short_name: 'Foundations' });
  snap.taskById.set('task', { id: 'task', number: 3, wp_number: 2 });
  snap.deliverableById.set('deliverable', { id: 'deliverable', number: 'D2.4' });
  snap.milestoneById.set('milestone', { id: 'milestone', number: 5 });
  snap.caseById.set('case', { id: 'case', number: 6, case_type: 'living_lab', short_name: 'Lab', custom_type_name: null, include_number: true, include_abbreviation: true });
  snap.participantById.set('participant', { id: 'participant', organisation_short_name: 'SITRA' });
  snap.figureById.set('figure', { id: 'figure', figure_number: '2.1' });
  snap.tableCaptionKeys.add('table-3.1.a');
  snap.acronymSegments = [{ text: 'SUSIE', color: '#000000' }, { text: '-Q', color: '#ffffff' }];
  return snap;
}

describe('backup/client reference label parity', () => {
  it('uses the canonical client labels for every chip type and preserves dead ids', () => {
    const snap = fixture();
    const checks: Array<[Record<string, string>, string]> = [
      [{ 'data-wp-id': 'wp' }, formatWPLabel(snap.wpById.get('wp')!)],
      [{ 'data-task-id': 'task' }, formatTaskLabel(snap.taskById.get('task')!)],
      [{ 'data-deliverable-id': 'deliverable' }, formatDeliverableLabel(snap.deliverableById.get('deliverable')!)],
      [{ 'data-milestone-id': 'milestone' }, formatMilestoneLabel(snap.milestoneById.get('milestone')!)],
      [{ 'data-case-id': 'case' }, formatCaseLabel(snap.caseById.get('case')!, { includeNumber: true, includeAbbreviation: true })],
      [{ 'data-participant-id': 'participant' }, formatParticipantLabel(snap.participantById.get('participant')!)],
      [{ 'data-fig-table-ref': '', 'data-figure-id': 'figure' }, formatFigureLabel(snap.figureById.get('figure')!)],
      [{ 'data-fig-table-ref': '', 'data-table-key': 'table-3.1.a' }, formatTableLabel({ table_key: 'table-3.1.a' })],
      [{ 'data-acronym-reference': '' }, formatAcronymLabel(snap.acronymSegments)],
    ];
    for (const [attrs, expected] of checks) expect(resolveChipLabel(attrs, snap)).toBe(expected);
    expect(resolveChipLabel({ 'data-deliverable-id': 'dead' }, snap)).toBeNull();
  });
});