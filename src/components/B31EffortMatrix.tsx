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
 * An ordinary table: shared 11pt Times cell spec, header rule, row hairlines,
 * 18 cm cap, and column widths persisted under `effort-matrix` exactly like
 * every other table. The only two departures are the WP chips in the header
 * row and the pale rounded pill behind even-numbered participant rows, which
 * runs from behind the participant badge to the end of the last WP column.
 */
export function B31EffortMatrix({ wpData, participants, proposalId }: Props) {
  const { isAdminOrOwner } = useUserRole();
  const { colWidths, setColWidths, tableRef, saveWidths } = useColumnResize({
    proposalId,
    tableKey: 'effort-matrix',
    canResize: isAdminOrOwner,
    maxTotalWidth: BLOCK_WIDTH,
  });

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

  const colCount = wpData.length + 2; // participant col + wp cols + total col
  const sized = colWidths.length === colCount;
  // Default proportions when the table has never been resized — mirrored by
  // the Typst emitter so both renderers land on the same geometry.
  const defaultWidth = (i: number) =>
    i === 0 ? '22%' : i === colCount - 1 ? '8%' : `${(70 / wpData.length).toFixed(2)}%`;

  /** The pale pill: contiguous cell fills, rounded at the two outer ends. */
  const bandStyle = (banded: boolean, i: number): React.CSSProperties => {
    if (!banded || i > wpData.length) return {};
    return {
      backgroundColor: BAND,
      borderTopLeftRadius: i === 0 ? BAND_RADIUS : undefined,
      borderBottomLeftRadius: i === 0 ? BAND_RADIUS : undefined,
      borderTopRightRadius: i === wpData.length ? BAND_RADIUS : undefined,
      borderBottomRightRadius: i === wpData.length ? BAND_RADIUS : undefined,
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
        className={`${tableStyles} b31-effort-matrix first-col-flush w-full max-w-full [&_th]:border-x-0 [&_th]:border-t-0 [&_th]:border-b [&_th]:border-black [&_td]:border-x-0 [&_td]:border-y [&_td]:border-gray-200 [&_tr]:border-0 [&_tr:last-child_td]:border-b-0 [&_tbody_tr:first-child_td]:border-t-0`}
        style={{
          tableLayout: 'fixed',
          width: sized ? `${Math.min(colWidths.reduce((s, w) => s + w, 0), BLOCK_WIDTH)}px` : '100%',
          maxWidth: `${BLOCK_WIDTH}px`,
          borderCollapse: 'collapse',
        }}
      >
        <colgroup>
          {Array.from({ length: colCount }, (_, i) => (
            <col key={i} style={{ width: sized ? `${colWidths[i]}px` : defaultWidth(i) }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th className={`${firstCellStyles} relative font-bold`}>
              {isAdminOrOwner && <ColumnResizer onMouseDown={handleColResizeStart(0)} />}
            </th>
            {wpData.map((wp, i) => (
              <th key={wp.id} className={`${dataCellStyles} relative font-bold`}>
                <WPBubble wpColor={wp.color || '#666'}>WP{wp.number}</WPBubble>
                {isAdminOrOwner && <ColumnResizer onMouseDown={handleColResizeStart(i + 1)} />}
              </th>
            ))}
            <th className={`${lastCellStyles} relative font-bold`}>
              Total
              {isAdminOrOwner && <ColumnResizer onMouseDown={handleColResizeStart(colCount - 1)} />}
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
                  <ParticipantBubble>
                    {p.participant_number}. {p.organisation_short_name || p.organisation_name}
                  </ParticipantBubble>
                </td>
                {wpData.map((wp, i) => (
                  <td key={wp.id} className={dataCellStyles} style={bandStyle(banded, i + 1)}>
                    {formatPM(pMap.get(wp.id) || 0)}
                  </td>
                ))}
                <td className={`${lastCellStyles} font-bold`}>{formatPM(rowTotal)}</td>
              </tr>
            );
          })}
          <tr>
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
