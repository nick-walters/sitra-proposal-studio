import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { computeAutoFitSmart } from '@/lib/autoFitColumns';
import type { B31WPData, B31Participant } from '@/hooks/useB31SectionData';
import { useUserRole } from '@/hooks/useUserRole';
import { useColumnResize } from '@/hooks/useColumnResize';
import { ColumnResizer } from '@/components/ColumnResizer';
import { EditableCaption } from '@/components/EditableCaption';
import { ParticipantBubble } from '@/components/B31Pill';

const tableStyles = "font-['Times_New_Roman',Times,serif] text-[11pt]";
const cellStyles = "px-[1pt] py-[1pt] font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight align-middle border-none";
const headerCellStyles = cellStyles;
/**
 * Header and body cells must share IDENTICAL horizontal geometry, otherwise the
 * WP labels sit off-centre above their values and the participant badges are
 * indented relative to the header row. Applied inline so no cascading rule
 * (.document-content th/td, Tailwind utilities) can desynchronise the two rows.
 */
const firstColCell: React.CSSProperties = {
  textAlign: 'left',
  paddingLeft: 0,
  paddingRight: '1pt',
};
const dataColCell: React.CSSProperties = {
  textAlign: 'center',
  paddingLeft: '1pt',
  paddingRight: '1pt',
};


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

export function B31EffortMatrix({ wpData, participants, proposalId }: Props) {
  const { isAdminOrOwner } = useUserRole();
  const { colWidths, setColWidths, tableRef, handleColResizeStart, saveWidths } = useColumnResize({ proposalId, tableKey: 'effort-matrix', canResize: isAdminOrOwner });
  const defaultParticipantWidth = '22%';
  const defaultTotalWidth = '8%';
  const defaultWpWidth = `${(70 / Math.max(wpData.length, 1)).toFixed(2)}%`;

  // Build effort matrix from WP-level effort data
  const matrix = new Map<string, Map<string, number>>();

  participants.forEach(p => {
    matrix.set(p.id, new Map());
  });

  wpData.forEach(wp => {
    (wp.wp_effort || []).forEach(e => {
      const pMap = matrix.get(e.participant_id);
      if (pMap) {
        pMap.set(wp.id, e.person_months || 0);
      }
    });
  });

  const [fitWidths, setFitWidths] = useState<number[] | null>(null);

  let hasData = false;
  matrix.forEach(pMap => { if (pMap.size > 0) hasData = true; });


  // Measure natural content width of each column and hug it (Word-like auto-fit)
  const fitSignature = [
    participants.map(p => `${p.participant_number}.${p.organisation_short_name || p.organisation_name}`).join('|'),
    wpData.map(wp => wp.number).join('|'),
  ].join('#');

  useLayoutEffect(() => {
    const table = tableRef.current;
    if (!table) return;
    const rows = Array.from(table.querySelectorAll('tr'));
    if (rows.length === 0) return;
    const colCount = wpData.length + 2;
    const measured: number[] = new Array(colCount).fill(0);
    rows.forEach(row => {
      Array.from(row.children).forEach((cell, i) => {
        if (i >= colCount) return;
        const el = cell as HTMLElement;
        const w = Math.max(el.scrollWidth, ...Array.from(el.children).map(c => (c as HTMLElement).scrollWidth || 0));
        if (w > measured[i]) measured[i] = w;
      });
    });
    const padded = measured.map((w, i) => Math.ceil(w) + (i === 0 ? 2 : 8));
    setFitWidths(prev => {
      if (prev && prev.length === padded.length && prev.every((w, i) => Math.abs(w - padded[i]) <= 2)) return prev;
      return padded;
    });
  }, [fitSignature, tableRef, wpData.length]);

  const autoFitColumns = useCallback(() => {
    const table = tableRef.current;
    if (!table) return;
    const widths = computeAutoFitSmart(table);
    if (widths) {
      setColWidths(widths);
      saveWidths(widths);
    }
  }, [tableRef, setColWidths, saveWidths]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ tableId?: string }>).detail;
      if (detail?.tableId !== 'b31-effort') return;
      autoFitColumns();
    };
    window.addEventListener('b31-table-autoresize', handler as EventListener);
    return () => window.removeEventListener('b31-table-autoresize', handler as EventListener);
  }, [autoFitColumns]);

  const dispatchToolbarFocus = useCallback(() => {
    window.dispatchEvent(new CustomEvent('b31-table-focus', {
      detail: { tableId: 'b31-effort' },
    }));
  }, []);

  /**
   * WP columns are a uniform band: dragging any WP border resizes EVERY WP
   * column and the Total column to the same width, so the matrix stays a
   * regular grid. The participant column keeps its width.
   */
  const handleWpResizeStart = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const table = tableRef.current;
      if (!table) return;
      const headerCells = Array.from(
        table.querySelectorAll<HTMLElement>('thead > tr:first-child > th'),
      );
      if (headerCells.length === 0) return;
      const current = headerCells.map((c) => c.getBoundingClientRect().width);
      const colCount = current.length;
      const startX = event.clientX;
      const startW = current[1] ?? 40;

      const apply = (w: number) => {
        const next = current.map((cw, i) => (i === 0 ? Math.round(cw) : Math.round(w)));
        setColWidths(next);
        return next;
      };

      let latest = current.map((w) => Math.round(w));
      const onMove = (e: MouseEvent) => {
        const w = Math.max(24, Math.min(240, startW + (e.clientX - startX)));
        latest = apply(w);
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        if (latest.length === colCount) saveWidths(latest);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.body.style.cursor = 'col-resize';
    },
    [tableRef, setColWidths, saveWidths],
  );


  if (wpData.length === 0 || participants.length === 0 || !hasData) return null;

  const totalColCount = wpData.length + 2; // participant col + wp cols + total col
  const hasCustomWidths = colWidths.length === totalColCount;
  const hasFitWidths = !hasCustomWidths && !!fitWidths && fitWidths.length === totalColCount;
  const widthFor = (i: number) => {
    if (hasCustomWidths) return `${colWidths[i]}px`;
    if (hasFitWidths) return `${fitWidths![i]}px`;
    return i === 0 ? defaultParticipantWidth : i === totalColCount - 1 ? defaultTotalWidth : defaultWpWidth;
  };
  const tableWidth = hasCustomWidths
    ? `${colWidths.reduce((sum, width) => sum + width, 0)}px`
    : hasFitWidths
      ? 'auto'
      : '100%';

  return (
    <div onFocusCapture={dispatchToolbarFocus}>
      <EditableCaption
        proposalId={proposalId}
        tableKey="table-3.1.f"
        label="Table 3.1.f."
        defaultCaption="Staff effort in person months"
        className="mb-0"
      />
      <div className="relative">
         <table
            data-table-key="effort-matrix"
            className={`${tableStyles} b31-effort-matrix first-col-flush`}
            style={{
             tableLayout: 'fixed',
              width: tableWidth,
              maxWidth: '100%',
              whiteSpace: 'nowrap',
             borderCollapse: 'separate',
             borderSpacing: '5pt 0',
           }}
           ref={tableRef}
         >
           <colgroup>
               <col style={{ width: widthFor(0) }} />
              {wpData.map((wp, i) => (
                 <col key={wp.id} style={{ width: widthFor(i + 1) }} />
             ))}
               <col style={{ width: widthFor(totalColCount - 1) }} />
           </colgroup>
           <thead>
             <tr>
               <th
                 className={`${headerCellStyles} relative`}
                 style={{ textAlign: 'left', fontWeight: 'bold' }}
               >
                 {isAdminOrOwner && <ColumnResizer onMouseDown={handleColResizeStart(0)} />}
               </th>
               {wpData.map((wp, i) => {
                 const wpColor = wp.color || '#73C92D';
                 return (
                   <th
                     key={wp.id}
                     className={`${headerCellStyles} relative`}
                     style={{
                       backgroundColor: wpColor,
                       color: '#FFFFFF',
borderTopLeftRadius: '12px',
                           borderTopRightRadius: '12px',
                       fontWeight: 700,
                     }}
                   >
                     WP{wp.number}
                     {isAdminOrOwner && <ColumnResizer onMouseDown={handleWpResizeStart} />}
                   </th>
                 );
               })}
               <th className={headerCellStyles} style={{ fontWeight: 'bold' }}>Total</th>
             </tr>
           </thead>
          <tbody>
            {participants.map((p) => {
              const pMap = matrix.get(p.id)!;
              const rowTotal = wpData.reduce((sum, wp) => sum + (pMap.get(wp.id) || 0), 0);

              return (
                <tr key={p.id}>
                  {/* Participant bubble cell — standard participant badge, no elongation */}
                  <td
                    className="px-[1pt] py-0 font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight align-middle"
                    style={{ textAlign: 'left' }}
                  >
                    <ParticipantBubble>
                      {p.participant_number}. {p.organisation_short_name || p.organisation_name}
                    </ParticipantBubble>
                  </td>
                  {/* Data cells — read-only display in B3.1 mirror */}
                  {wpData.map((wp) => {
                    const val = pMap.get(wp.id) || 0;
                    const wpColor = wp.color || '#73C92D';

                    return (
                      <td
                        key={wp.id}
                        className={cellStyles}
                        style={{
                          backgroundColor: wpColor,
                          color: '#FFFFFF',
                        }}
                      >
                        {formatPM(val)}
                      </td>
                    );
                  })}
                  <td className={`${cellStyles} font-bold`}>
                    {formatPM(rowTotal)}
                  </td>
                </tr>
              );
            })}
            {/* Total row */}
            <tr>
              <td className="px-[1pt] py-0 font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight align-middle font-bold" style={{ textAlign: 'left' }}>Total</td>
              {wpData.map(wp => {
                const wpColor = wp.color || '#73C92D';
                const colTotal = participants.reduce((sum, p) => sum + (matrix.get(p.id)!.get(wp.id) || 0), 0);
                return (
                  <td
                    key={wp.id}
                    className={`${cellStyles} font-bold`}
                    style={{
                       borderBottomLeftRadius: '12px',
                       borderBottomRightRadius: '12px',
                      backgroundColor: wpColor,
                      color: '#FFFFFF',
                    }}
                  >
                    {formatPM(colTotal)}
                  </td>
                );
              })}
              <td className={`${cellStyles} font-bold`}>
                {(() => {
                  const grandTotal = participants.reduce((sum, p) => {
                    const pMap = matrix.get(p.id)!;
                    return sum + wpData.reduce((s, wp) => s + (pMap.get(wp.id) || 0), 0);
                  }, 0);
                  return formatPM(grandTotal);
                })()}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
