import type { B31WPData, B31Participant } from '@/hooks/useB31SectionData';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { WPBubble, ParticipantBubble } from '@/components/B31Pill';
import { EditableCaption } from '@/components/EditableCaption';

const tableStyles = "font-['Times_New_Roman',Times,serif] text-[11pt]";
const cellStyles =
  "!px-[6pt] !py-[1pt] h-auto align-middle font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight";
/**
 * Columns that must never be wider than their content. `width: 1px` on an
 * auto-layout table is the shrink-to-content idiom: the browser widens the
 * cell to its minimum content width and gives every remaining pixel to the
 * unconstrained column (the work package titles).
 */
const shrinkCol = { width: '1px', whiteSpace: 'nowrap' as const };

interface Props {
  wpData: B31WPData[];
  participants: B31Participant[];
  proposalId?: string;
}

/**
 * Table 3.1.a — read-only live mirror of wp_drafts.
 * No editable fields. All edits happen in the WP manager / A3.
 *
 * Layout is derived from the content on every render rather than from stored
 * pixel widths: the work package column is left unconstrained so its pills sit
 * on one line, and the three metadata columns shrink to their content.
 */
export function B31WPListTable({ wpData, participants, proposalId }: Props) {
  const getComputedDuration = (wp: B31WPData) => {
    const months = wp.tasks.flatMap(t => [t.start_month, t.end_month]).filter((m): m is number => m != null);
    if (months.length === 0) return '';
    const min = Math.min(...months);
    const max = Math.max(...months);
    return `M${String(min).padStart(2, '0')}–M${String(max).padStart(2, '0')}`;
  };

  const getComputedPM = (wp: B31WPData) => {
    // Auto-calculated from A3 staff effort total (wp_draft_effort) per WP.
    return (wp.wp_effort || []).reduce((sum, e) => sum + (e.person_months || 0), 0);
  };

  if (wpData.length === 0) return null;

  return (
    <div>
      <EditableCaption
        proposalId={proposalId}
        tableKey="table-3.1.a"
        label="Table 3.1.a."
        defaultCaption="List of work packages"
        className="mb-0"
      />
      <Table
        data-table-key="wp-list"
        className={`${tableStyles} [&_th]:border-x-0 [&_th]:border-t-0 [&_th]:border-b [&_th]:border-black [&_td]:border-x-0 [&_td]:border-y [&_td]:border-gray-200 [&_tr]:border-0 [&_tr:last-child_td]:border-b-0 [&_tbody_tr:first-child_td]:border-t-0`}
        style={{ tableLayout: 'auto', width: 'auto', maxWidth: '100%', borderCollapse: 'collapse' }}
      >
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className={`${cellStyles} font-bold`}>Work package</TableHead>
            <TableHead className={`${cellStyles} font-bold`} style={shrinkCol}>WP leader</TableHead>
            <TableHead className={`${cellStyles} font-bold`} style={shrinkCol}>Person months</TableHead>
            <TableHead className={`${cellStyles} font-bold`} style={shrinkCol}>Duration</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {wpData.map(wp => {
            const computedPM = getComputedPM(wp);
            const computedDuration = getComputedDuration(wp);
            const displayPM = computedPM > 0 ? computedPM : '';
            const displayDuration = wp.manual_duration || computedDuration || '';
            const shortName = wp.short_name || '';
            const title = wp.title || '';
            const leader = participants.find(p => p.id === wp.lead_participant_id);

            return (
              <TableRow key={wp.id}>
                <TableCell className={`${cellStyles} whitespace-nowrap leading-[0]`}>
                  <WPBubble wpColor={wp.color || '#666'}>
                    WP{wp.number}: {shortName}{shortName && title ? ' – ' : ''}{title}
                  </WPBubble>
                </TableCell>
                <TableCell className={`${cellStyles} leading-[0]`} style={shrinkCol}>
                  {leader ? (
                    <ParticipantBubble>
                      {leader.participant_number}. {leader.organisation_short_name || leader.organisation_name}
                    </ParticipantBubble>
                  ) : '—'}
                </TableCell>
                <TableCell className={cellStyles} style={shrinkCol}>
                  {displayPM || '—'}
                </TableCell>
                <TableCell className={cellStyles} style={shrinkCol}>
                  {displayDuration || '—'}
                </TableCell>
              </TableRow>
            );
          })}
          {(() => {
            const totalPM = wpData.reduce((sum, wp) => sum + getComputedPM(wp), 0);
            return (
              <TableRow>
                <TableCell className={`${cellStyles} font-bold`}>Total</TableCell>
                <TableCell className={cellStyles} style={shrinkCol} />
                <TableCell className={`${cellStyles} font-bold`} style={shrinkCol}>
                  {totalPM > 0 ? totalPM : '—'}
                </TableCell>
                <TableCell className={cellStyles} style={shrinkCol} />
              </TableRow>
            );
          })()}
        </TableBody>
      </Table>
    </div>
  );
}
