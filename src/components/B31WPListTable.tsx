import type { B31WPData, B31Participant } from '@/hooks/useB31SectionData';
import { WPBubble, ParticipantBubble } from '@/components/B31Pill';
import { EditableCaption } from '@/components/EditableCaption';
import { useUserRole } from '@/hooks/useUserRole';
import { useColumnResize } from '@/hooks/useColumnResize';
import { ColumnResizer } from '@/components/ColumnResizer';

const tableStyles = "font-['Times_New_Roman',Times,serif] text-[11pt]";
const cellStyles =
  "px-[3pt] py-[0.75pt] h-auto align-middle font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight text-left";
/** First column sits flush with the table edge — no left indent. */
const firstCellStyles = `${cellStyles} !pl-0`;
/** Last column sits flush with the right table edge. */
const lastCellStyles = `${cellStyles} !pr-0`;
/** The three metadata columns hug their content and never wrap. */
const tightCellStyles = `${cellStyles} whitespace-nowrap w-px`;

/** The 18 cm text column, in CSS pixels — the hard cap for every table. */
const BLOCK_WIDTH = 768;

interface Props {
  wpData: B31WPData[];
  participants: B31Participant[];
  proposalId?: string;
}

/**
 * Table 3.1.a — read-only live mirror of wp_drafts.
 * No editable fields. All edits happen in the WP manager / A3.
 *
 * The table never exceeds the block width: content wraps instead of scrolling.
 * Column widths are draggable and persist per proposal in
 * `table_column_widths` under the key `wp-list`.
 */
export function B31WPListTable({ wpData, participants, proposalId }: Props) {
  const { isAdminOrOwner } = useUserRole();
  const { colWidths, tableRef, handleColResizeStart } = useColumnResize({
    proposalId,
    tableKey: 'wp-list',
    canResize: isAdminOrOwner,
    maxTotalWidth: BLOCK_WIDTH,
  });

  const getComputedDuration = (wp: B31WPData) => {
    const months = wp.tasks.flatMap(t => [t.start_month, t.end_month]).filter((m): m is number => m != null);
    if (months.length === 0) return '';
    const min = Math.min(...months);
    const max = Math.max(...months);
    return `M${String(min).padStart(2, '0')}–M${String(max).padStart(2, '0')}`;
  };

  /** One decimal at most, as the Typst side prints it. */
  const formatPM = (value: number) =>
    Number.isInteger(value) ? String(value) : value.toFixed(1);

  const getComputedPM = (wp: B31WPData) => {
    // Auto-calculated from A3 staff effort total (wp_draft_effort) per WP.
    return (wp.wp_effort || []).reduce((sum, e) => sum + (e.person_months || 0), 0);
  };

  if (wpData.length === 0) return null;

  const sized = colWidths.length === 4;
  const headers = ['Work package', 'WP leader', 'PMs', 'Duration'];

  return (
    <div className="w-full max-w-full">
      <EditableCaption
        proposalId={proposalId}
        tableKey="table-3.1.a"
        label="Table 3.1.a."
        defaultCaption="List of work packages (PM = person month)"
        className="mb-0"
      />
      <table
        ref={tableRef}
        data-table-key="wp-list"
        className={`${tableStyles} w-full max-w-full [&_th]:border-x-0 [&_th]:border-t-0 [&_th]:border-b [&_th]:border-black [&_td]:border-x-0 [&_td]:border-y [&_td]:border-gray-200 [&_tr]:border-0 [&_tr:last-child_td]:border-b-0 [&_tbody_tr:first-child_td]:border-t-0`}
        style={{
          // Unsized: columns 2–4 shrink to their content (`auto` layout plus
          // `w-px`/`nowrap` cells) and the work-package column takes the rest.
          tableLayout: sized ? 'fixed' : 'auto',
          width: sized ? `${Math.min(colWidths.reduce((s, w) => s + w, 0), BLOCK_WIDTH)}px` : '100%',
          maxWidth: `${BLOCK_WIDTH}px`,
          borderCollapse: 'collapse',
        }}
      >
        {sized && (
          <colgroup>
            {colWidths.map((w, i) => (
              <col key={i} style={{ width: `${w}px` }} />
            ))}
          </colgroup>
        )}
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th
                key={h}
                className={`${
                  i === 0
                    ? firstCellStyles
                    : sized
                      ? i === 3 ? lastCellStyles : cellStyles
                      : i === 3 ? `${tightCellStyles} !pr-0` : tightCellStyles
                } relative font-bold`}
              >
                {h}
                {isAdminOrOwner && <ColumnResizer onMouseDown={handleColResizeStart(i)} />}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {wpData.map(wp => {
            const computedPM = getComputedPM(wp);
            const computedDuration = getComputedDuration(wp);
            const displayPM = computedPM > 0 ? formatPM(computedPM) : '';
            const displayDuration = wp.manual_duration || computedDuration || '';
            const shortName = wp.short_name || '';
            const title = wp.title || '';
            const leader = participants.find(p => p.id === wp.lead_participant_id);

            return (
              <tr key={wp.id}>
                <td className={`${firstCellStyles} break-words`}>
                  <WPBubble
                    wpColor={wp.color || '#666'}
                    style={{ whiteSpace: 'normal', height: 'auto', maxWidth: '100%', padding: '1px 5px', lineHeight: 1.15 }}
                  >
                    WP{wp.number}: {shortName}{shortName && title ? ' — ' : ''}{title}
                  </WPBubble>
                </td>
                <td className={`${sized ? cellStyles : tightCellStyles} break-words`}>
                  {leader ? (
                    <ParticipantBubble
                      style={{ whiteSpace: 'normal', height: 'auto', maxWidth: '100%', padding: '1px 5px', lineHeight: 1.15 }}
                    >
                      {leader.participant_number}. {leader.organisation_short_name || leader.organisation_name}
                    </ParticipantBubble>
                  ) : '—'}
                </td>
                <td className={sized ? cellStyles : tightCellStyles}>{displayPM || '—'}</td>
                <td className={`${sized ? cellStyles : tightCellStyles} !pr-0`}>{displayDuration || '—'}</td>
              </tr>
            );
          })}
          {(() => {
            const totalPM = wpData.reduce((sum, wp) => sum + getComputedPM(wp), 0);
            return (
              <tr>
                <td className={`${firstCellStyles} font-bold`}>Total</td>
                <td className={sized ? cellStyles : tightCellStyles} />
                <td className={`${sized ? cellStyles : tightCellStyles} font-bold`}>{totalPM > 0 ? formatPM(totalPM) : '—'}</td>
                <td className={`${sized ? cellStyles : tightCellStyles} !pr-0`} />
              </tr>
            );
          })()}
        </tbody>
      </table>
    </div>
  );
}
