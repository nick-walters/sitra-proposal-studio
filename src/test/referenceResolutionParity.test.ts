import { describe, expect, it } from 'vitest';
import {
  emptySnapshot,
  resolveChipLabel,
  type RefSnapshotServer,
} from '../../supabase/functions/_shared/referenceResolution';
import { computeFigureNumbers } from '../../supabase/functions/_shared/figureNumbering';
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
  formatWPChipLabel,
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
      // A WP chip without the flag is bare; with it, labelled. Both forms must
      // agree with the client formatter.
      [{ 'data-wp-id': 'wp' }, formatWPChipLabel(snap.wpById.get('wp')!, null)],
      [
        { 'data-wp-id': 'wp', 'data-wp-show-short-name': 'true' },
        formatWPChipLabel(snap.wpById.get('wp')!, 'true'),
      ],
      [{ 'data-wp-id': 'wp', 'data-wp-show-short-name': 'false' }, formatWPLabel({ number: 2 })],
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
describe('derived figure numbering parity', () => {
  it('numbers figures by block position per section, and leaves unplaced figures unnumbered', () => {
    const sections = [
      { id: 's1', section_number: 'B1.1', order_index: 0 },
      { id: 's2', section_number: '3.1', order_index: 1 },
    ];
    const cards = [
      { id: 'c2', section_id: 's1', order_index: 5 },
      { id: 'c1', section_id: 's1', order_index: 1 },
      { id: 'c3', section_id: 's2', order_index: 0 },
      { id: 'c4', section_id: null, order_index: 0 },
    ];
    const placements = [
      { card_id: 'c2', figure_id: 'fB' },
      { card_id: 'c1', figure_id: 'fA' },
      { card_id: 'c3', figure_id: 'fC' },
      { card_id: 'c4', figure_id: 'fOrphanBlock' },
      { card_id: 'c1', figure_id: null },
    ];

    const numbers = computeFigureNumbers(placements, cards, sections);
    expect(numbers.get('fA')).toBe('1.1.a');
    expect(numbers.get('fB')).toBe('1.1.b');
    expect(numbers.get('fC')).toBe('3.1.a');
    // No section on the block, and a figure in no block at all: no number.
    expect(numbers.has('fOrphanBlock')).toBe(false);
    expect(numbers.has('fUnplaced')).toBe(false);

    // Reordering the blocks swaps the numbers with no write to `figures`.
    const swapped = computeFigureNumbers(
      placements,
      cards.map((c) => (c.id === 'c1' ? { ...c, order_index: 9 } : c)),
      sections,
    );
    expect(swapped.get('fB')).toBe('1.1.a');
    expect(swapped.get('fA')).toBe('1.1.b');

    // The chip label formatter is shared with every other surface.
    expect(formatFigureLabel({ figure_number: numbers.get('fA') })).toBe('Figure 1.1.a');
  });
});
