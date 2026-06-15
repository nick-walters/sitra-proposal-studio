import { useState, useCallback, useEffect } from 'react';
import { computeAutoFitSmart } from '@/lib/autoFitColumns';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getContrastingTextColor } from '@/lib/wpColors';
import type { B31WPData, B31Participant } from '@/hooks/useB31SectionData';
import { useUserRole } from '@/hooks/useUserRole';
import { useColumnResize } from '@/hooks/useColumnResize';
import { ColumnResizer } from '@/components/ColumnResizer';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { EditableCaption } from '@/components/EditableCaption';
import { ParticipantBubble } from '@/components/B31Pill';

const tableStyles = "font-['Times_New_Roman',Times,serif] text-[11pt]";
const cellStyles = "px-[1pt] py-[1pt] font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight text-center align-middle border-none";
const headerCellStyles = "px-[1pt] py-[1pt] font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight text-center align-middle border-none";

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
  const queryClient = useQueryClient();
  const { isAdminOrOwner } = useUserRole();
  const { colWidths, setColWidths, tableRef, handleColResizeStart, saveWidths } = useColumnResize({ proposalId, tableKey: 'effort-matrix', canResize: isAdminOrOwner });
  const [editingCell, setEditingCell] = useState<{ participantId: string; wpId: string } | null>(null);
  const [editValue, setEditValue] = useState('');
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

  let hasData = false;
  matrix.forEach(pMap => { if (pMap.size > 0) hasData = true; });

  const startEdit = (participantId: string, wpId: string, currentValue: number) => {
    setEditingCell({ participantId, wpId });
    setEditValue(currentValue > 0 ? String(currentValue) : '');
  };

  const saveEdit = useCallback(async () => {
    if (!editingCell || !proposalId) return;
    const { participantId, wpId } = editingCell;
    const parsed = parseFloat(editValue) || 0;
    const newTotal = Math.round(parsed * 10) / 10;

    await supabase
      .from('wp_draft_effort')
      .upsert({
        wp_draft_id: wpId,
        participant_id: participantId,
        person_months: newTotal,
      }, {
        onConflict: 'wp_draft_id,participant_id',
      });

    queryClient.invalidateQueries({ queryKey: ['b31-wp-data', proposalId] });
    setEditingCell(null);
  }, [editingCell, editValue, proposalId, queryClient]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); saveEdit(); }
    if (e.key === 'Escape') setEditingCell(null);
  };

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

  if (wpData.length === 0 || participants.length === 0 || !hasData) return null;

  const totalColCount = wpData.length + 2; // participant col + wp cols + total col
  const hasCustomWidths = colWidths.length === totalColCount;
  const tableWidth = hasCustomWidths ? `${colWidths.reduce((sum, width) => sum + width, 0)}px` : '100%';

  return (
    <div onFocusCapture={dispatchToolbarFocus}>
      <EditableCaption
        proposalId={proposalId}
        tableKey="table-3.1.f"
        label="Table 3.1.f."
        defaultCaption="Person months per participant per work package"
        className="mb-0"
      />
      <div className="relative">
         <table
            className={`${tableStyles} b31-effort-matrix first-col-flush`}
            style={{
             tableLayout: 'fixed',
              width: tableWidth,
             borderCollapse: 'separate',
             borderSpacing: '5pt 0',
           }}
           ref={tableRef}
         >
           <colgroup>
               <col style={{ width: hasCustomWidths ? `${colWidths[0]}px` : defaultParticipantWidth }} />
              {wpData.map((wp, i) => (
                 <col key={wp.id} style={{ width: hasCustomWidths ? `${colWidths[i + 1]}px` : defaultWpWidth }} />
             ))}
               <col style={{ width: hasCustomWidths ? `${colWidths[totalColCount - 1]}px` : defaultTotalWidth }} />
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
                 const wpColor = wp.color || '#2563EB';
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
                     {isAdminOrOwner && <ColumnResizer onMouseDown={handleColResizeStart(i + 1)} />}
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
                    <span
                      className="inline-flex items-center font-bold italic whitespace-nowrap rounded-full"
                      style={{
                        backgroundColor: '#000000',
                        color: '#FFFFFF',
                        fontFamily: "'Times New Roman', Times, serif",
                        fontSize: '11pt',
                        fontWeight: 700,
                        fontStyle: 'normal',
                        lineHeight: 1,
                        verticalAlign: 'baseline',
                        padding: '0px 5px',
                        border: '1.5px solid #000000',
                      }}
                    >
                      {p.participant_number}. {p.organisation_short_name || p.organisation_name}
                    </span>
                  </td>
                  {/* Data cells — WP column color behind */}
                  {wpData.map((wp) => {
                    const val = pMap.get(wp.id) || 0;
                    const wpColor = wp.color || '#2563EB';
                    const isEditing = editingCell?.participantId === p.id && editingCell?.wpId === wp.id;

                    return (
                      <td
                        key={wp.id}
                        className={`${cellStyles}`}
                        style={{
                          padding: 0,
                          backgroundColor: wpColor,
                        }}
                      >
                        <input
                          type="text"
                          className="w-full bg-transparent outline-none border-none p-0 m-0 font-['Times_New_Roman',Times,serif] text-[11pt] text-center"
                          style={{ minWidth: '30px', color: '#FFFFFF' }}
                          value={isEditing ? editValue : (val ? formatPM(val) : '')}
                          onChange={e => {
                            if (!isEditing) startEdit(p.id, wp.id, val);
                            setEditValue(e.target.value);
                          }}
                          onFocus={() => {
                            if (!isEditing) startEdit(p.id, wp.id, val);
                          }}
                          onBlur={saveEdit}
                          onKeyDown={handleKeyDown}
                          placeholder="—"
                        />
                      </td>
                    );
                  })}
                  <td className={`${cellStyles} font-bold`}>
                    {rowTotal ? formatPM(rowTotal) : '—'}
                  </td>
                </tr>
              );
            })}
            {/* Total row */}
            <tr>
              <td className="px-[1pt] py-0 font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight align-middle font-bold" style={{ textAlign: 'left' }}>Total</td>
              {wpData.map(wp => {
                const wpColor = wp.color || '#2563EB';
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
                    {colTotal ? formatPM(colTotal) : '—'}
                  </td>
                );
              })}
              <td className={`${cellStyles} font-bold`}>
                {(() => {
                  const grandTotal = participants.reduce((sum, p) => {
                    const pMap = matrix.get(p.id)!;
                    return sum + wpData.reduce((s, wp) => s + (pMap.get(wp.id) || 0), 0);
                  }, 0);
                  return grandTotal ? formatPM(grandTotal) : '—';
                })()}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
