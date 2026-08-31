import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { B31WPData, B31Participant } from '@/hooks/useB31SectionData';
import { useUserRole } from '@/hooks/useUserRole';
import { useColumnResize } from '@/hooks/useColumnResize';
import { ColumnResizer } from '@/components/ColumnResizer';
import { EditableCaption } from '@/components/EditableCaption';
import { ParticipantBubble, WPBubble } from '@/components/B31Pill';

const tableStyles = "font-['Times_New_Roman',Times,serif] text-[11pt]";
/** The shared cell spec every other B3.1 table uses. */
const cellStyles =
  "px-[3pt] py-[0.75pt] h-auto align-middle font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight";
const firstCellStyles = `${cellStyles} !pl-0 text-left`;
const dataCellStyles = `${cellStyles} text-center whitespace-nowrap`;
const lastCellStyles = `${dataCellStyles} !pr-0`;

/** The 18 cm text column, in CSS pixels — the hard cap for every table. */
const BLOCK_WIDTH = 768;

/** The pale band behind even-numbered rows. */
const BAND = '#f4f4f5';
const BAND_RADIUS = '999px';

function formatPM(value: number): string {
  if (value === 0) return '0';
  const fixed = value.toFixed(1);
  return fixed.endsWith('.0') ? Math.round(value).toString() : fixed;
}

interface Props {
  wpData: B31WPData[];
  participants: B31Participant[];
  proposalId?: string;
}

/**
 * Table 3.1.f — staff effort in person months.
 *
 * An ordinary table: shared 11pt Times cell spec, 18 cm cap, and column widths
 * persisted under `effort-matrix`. Its rules are just two — the thick rule
 * under the header and the same rule above the Total row. The pale rounded
 * pill behind even-numbered participant rows runs from behind the participant
 * badge to the END of the Total column.
 *
 * COLUMN WIDTHS: the participant column is not resizable — it sizes itself to
 * 3px wider than the widest participant badge. Every other column always
 * shares ONE width, so dragging any of them resizes them all, and the table
 * can never exceed 18 cm.
 */
export function B31EffortMatrix({ wpData, participants, proposalId }: Props) {
  const { isAdminOrOwner } = useUserRole();
  const { colWidths, setColWidths, tableRef, saveWidths } = useColumnResize({
    proposalId,
    tableKey: 'effort-matrix',
    canResize: isAdminOrOwner,
    maxTotalWidth: BLOCK_WIDTH,
  });

  const colCount = wpData.length + 2;
  /** Measured width of the participant column: widest badge + 3px. */
  const [firstWidth, setFirstWidth] = useState<number | null>(null);
  /** The single width shared by every WP column and the Total column. */
  const [otherWidth, setOtherWidth] = useState<number | null>(null);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    if (colWidths.length === colCount && colWidths[1] > 0) setOtherWidth(colWidths[1]);
  }, [colWidths, colCount]);

  useLayoutEffect(() => {
    const table = tableRef.current;
    if (!table) return;
    const badges = table.querySelectorAll<HTMLElement>('[data-effort-badge]');
    if (!badges.length) return;
    const widest = Math.max(...Array.from(badges, (b) => b.getBoundingClientRect().width));
    setFirstWidth(Math.ceil(widest) + 3);
  }, [tableRef, participants, wpData]);

  const maxOther = firstWidth != null ? (BLOCK_WIDTH - firstWidth) / (colCount - 1) : null;
  const resolvedOther =
    maxOther == null ? null : Math.min(otherWidth ?? maxOther, maxOther);

  const handleUniformResizeStart = useCallback(
    (event: React.MouseEvent) => {
      if (!isAdminOrOwner || resolvedOther == null || maxOther == null) return;
      event.preventDefault();
      event.stopPropagation();
      dragRef.current = { startX: event.clientX, startWidth: resolvedOther };
      const onMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const next = Math.min(
          maxOther,
          Math.max(24, dragRef.current.startWidth + (ev.clientX - dragRef.current.startX)),
        );
        setOtherWidth(next);
      };
      const onUp = () => {
        dragRef.current = null;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        setOtherWidth((width) => {
          if (width != null && firstWidth != null) {
            const widths = [firstWidth, ...Array(colCount - 1).fill(width)];
            setColWidths(widths);
            saveWidths(widths);
          }
          return width;
        });
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [isAdminOrOwner, resolvedOther, maxOther, firstWidth, colCount, setColWidths, saveWidths],
  );

  // Build effort matrix from WP-level effort data
  const matrix = new Map<string, Map<string, number>>();
  participants.forEach(p => matrix.set(p.id, new Map()));
  wpData.forEach(wp => {
    (wp.wp_effort || []).forEach(e => {
      const pMap = matrix.get(e.participant_id);
      if (pMap) pMap.set(wp.id, e.person_months || 0);
    });
  });

  let hasData = false;
  matrix.forEach(pMap => { if (pMap.size > 0) hasData = true; });

  const dispatchToolbarFocus = useCallback(() => {
    window.dispatchEvent(new CustomEvent('b31-table-focus', { detail: { tableId: 'b31-effort' } }));
  }, []);

  if (wpData.length === 0 || participants.length === 0 || !hasData) return null;

  const sized = firstWidth != null && resolvedOther != null;
  const totalWidth = sized ? firstWidth + resolvedOther * (colCount - 1) : null;
  const colWidth = (i: number) =>
    sized ? `${i === 0 ? firstWidth : resolvedOther}px` : undefined;

  /** The pale pill: contiguous cell fills, rounded at the two outer ends. */
  const bandStyle = (banded: boolean, i: number): React.CSSProperties => {
    if (!banded) return {};
    return {
      backgroundColor: BAND,
      borderTopLeftRadius: i === 0 ? BAND_RADIUS : undefined,
      borderBottomLeftRadius: i === 0 ? BAND_RADIUS : undefined,
      borderTopRightRadius: i === colCount - 1 ? BAND_RADIUS : undefined,
      borderBottomRightRadius: i === colCount - 1 ? BAND_RADIUS : undefined,
    };
  };

  return (
    <div className="w-full max-w-full" onFocusCapture={dispatchToolbarFocus}>
      <EditableCaption
        proposalId={proposalId}
        tableKey="table-3.1.f"
        label="Table 3.1.f."
        defaultCaption="Staff effort in person months"
        className="mb-0"
      />
      <table
        ref={tableRef}
        data-table-key="effort-matrix"
        className={`${tableStyles} b31-effort-matrix first-col-flush max-w-full [&_th]:border-x-0 [&_th]:border-t-0 [&_th]:border-b [&_th]:border-black [&_td]:border-0 [&_tr]:border-0`}
        style={{
          tableLayout: sized ? 'fixed' : 'auto',
          width: totalWidth != null ? `${Math.min(totalWidth, BLOCK_WIDTH)}px` : 'auto',
          maxWidth: `${BLOCK_WIDTH}px`,
          borderCollapse: 'collapse',
        }}
      >
        <colgroup>
          {Array.from({ length: colCount }, (_, i) => (
            <col key={i} style={{ width: colWidth(i) }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {/* The participant column sizes itself, so it carries no handle. */}
            <th className={`${firstCellStyles} relative font-bold`} />
            {wpData.map((wp) => (
              <th key={wp.id} className={`${dataCellStyles} relative font-bold`}>
                <WPBubble wpColor={wp.color || '#666'}>WP{wp.number}</WPBubble>
                {isAdminOrOwner && <ColumnResizer onMouseDown={handleUniformResizeStart} />}
              </th>
            ))}
            <th className={`${lastCellStyles} relative font-bold`}>
              Total
              {isAdminOrOwner && <ColumnResizer onMouseDown={handleUniformResizeStart} />}
            </th>
          </tr>
        </thead>
        <tbody>
          {participants.map((p, index) => {
            const pMap = matrix.get(p.id)!;
            const rowTotal = wpData.reduce((sum, wp) => sum + (pMap.get(wp.id) || 0), 0);
            // Rows 2, 4, 6 … as the reader counts them.
            const banded = index % 2 === 1;

            return (
              <tr key={p.id}>
                <td className={firstCellStyles} style={bandStyle(banded, 0)}>
                  <ParticipantBubble data-effort-badge>
                    {p.participant_number}. {p.organisation_short_name || p.organisation_name}
                  </ParticipantBubble>
                </td>
                {wpData.map((wp, i) => (
                  <td key={wp.id} className={dataCellStyles} style={bandStyle(banded, i + 1)}>
                    {formatPM(pMap.get(wp.id) || 0)}
                  </td>
                ))}
                <td
                  className={`${lastCellStyles} font-bold`}
                  style={bandStyle(banded, colCount - 1)}
                >
                  {formatPM(rowTotal)}
                </td>
              </tr>
            );
          })}
          <tr className="[&>td]:border-t-[1.5px] [&>td]:border-t-black">
            <td className={`${firstCellStyles} font-bold`}>Total</td>
            {wpData.map(wp => {
              const colTotal = participants.reduce(
                (sum, p) => sum + (matrix.get(p.id)!.get(wp.id) || 0),
                0,
              );
              return (
                <td key={wp.id} className={`${dataCellStyles} font-bold`}>
                  {formatPM(colTotal)}
                </td>
              );
            })}
            <td className={`${lastCellStyles} font-bold`}>
              {formatPM(
                participants.reduce(
                  (sum, p) =>
                    sum + wpData.reduce((s, wp) => s + (matrix.get(p.id)!.get(wp.id) || 0), 0),
                  0,
                ),
              )}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
