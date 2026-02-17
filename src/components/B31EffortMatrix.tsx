import { useState, useCallback } from 'react';
import { computeAutoFitSmart } from '@/lib/autoFitColumns';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getContrastingTextColor } from '@/lib/wpColors';
import type { B31WPData, B31Participant } from '@/hooks/useB31SectionData';
import { useUserRole } from '@/hooks/useUserRole';
import { useColumnResize } from '@/hooks/useColumnResize';
import { ColumnResizer } from '@/components/ColumnResizer';
import { Columns3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const tableStyles = "font-['Times_New_Roman',Times,serif] text-[11pt]";
const cellStyles = "px-[1pt] py-0 font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight text-center align-middle";
const headerCellStyles = "px-[1pt] py-0 font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight text-center align-middle";
const editableCellStyles = `${cellStyles} cursor-text hover:bg-muted/30`;

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

  // Build effort matrix: participant -> wp -> person months
  const matrix = new Map<string, Map<string, number>>();
  const effortEntries = new Map<string, Map<string, { taskId: string; effortPM: number }[]>>();
  
  participants.forEach(p => {
    matrix.set(p.id, new Map());
    effortEntries.set(p.id, new Map());
  });

  wpData.forEach(wp => {
    wp.tasks.forEach(task => {
      task.effort?.forEach(e => {
        const pMap = matrix.get(e.participant_id);
        if (pMap) {
          pMap.set(wp.id, (pMap.get(wp.id) || 0) + (e.person_months || 0));
        }
        const eMap = effortEntries.get(e.participant_id);
        if (eMap) {
          if (!eMap.has(wp.id)) eMap.set(wp.id, []);
          eMap.get(wp.id)!.push({ taskId: task.id, effortPM: e.person_months || 0 });
        }
      });
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
    const newTotal = parseFloat(editValue) || 0;
    const entries = effortEntries.get(participantId)?.get(wpId) || [];
    const currentTotal = matrix.get(participantId)?.get(wpId) || 0;

    if (entries.length === 0 && newTotal > 0) {
      const wp = wpData.find(w => w.id === wpId);
      if (wp && wp.tasks.length > 0) {
        await supabase.from('wp_draft_task_effort').insert({
          task_id: wp.tasks[0].id,
          participant_id: participantId,
          person_months: newTotal,
        });
      }
    } else if (entries.length === 1) {
      await supabase
        .from('wp_draft_task_effort')
        .update({ person_months: newTotal })
        .eq('task_id', entries[0].taskId)
        .eq('participant_id', participantId);
    } else if (entries.length > 1 && currentTotal > 0) {
      const scale = newTotal / currentTotal;
      for (const entry of entries) {
        await supabase
          .from('wp_draft_task_effort')
          .update({ person_months: Math.round(entry.effortPM * scale * 100) / 100 })
          .eq('task_id', entry.taskId)
          .eq('participant_id', participantId);
      }
    } else if (entries.length > 1 && currentTotal === 0 && newTotal > 0) {
      await supabase
        .from('wp_draft_task_effort')
        .update({ person_months: newTotal })
        .eq('task_id', entries[0].taskId)
        .eq('participant_id', participantId);
    }

    queryClient.invalidateQueries({ queryKey: ['b31-wp-data', proposalId] });
    setEditingCell(null);
  }, [editingCell, editValue, proposalId, queryClient, effortEntries, matrix, wpData]);

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

  if (wpData.length === 0 || participants.length === 0 || !hasData) return null;

  return (
    <div>
      {isAdminOrOwner && (
        <div className="print:hidden flex justify-end gap-1 mb-1">
          <Button variant="outline" size="sm" onClick={autoFitColumns} className="text-xs h-6 px-2 py-0">
            <Columns3 className="h-3 w-3 mr-1" /> Auto-resize columns
          </Button>
        </div>
      )}
      <p className={`${tableStyles} italic mb-0`}>
        <span className="font-bold italic">Table 3.1.f.</span> Person months per participant per work package
      </p>
      <table className={`${tableStyles} border-collapse [&_th]:border-x-0 [&_th]:border-t-0 [&_th]:border-b [&_th]:border-black [&_td]:border-x-0 [&_td]:border-y [&_td]:border-gray-200 [&_tr]:border-0 [&_tr:last-child_td]:border-b-0 [&_tbody_tr:first-child_td]:border-t-0`} style={{ tableLayout: colWidths.length > 0 ? 'fixed' : 'auto', width: colWidths.length > 0 ? `${colWidths.reduce((s, w) => s + w, 0)}px` : '100%' }} ref={tableRef}>
        <thead>
          <tr>
            <th className={`${headerCellStyles} relative`} style={{ textAlign: 'left', fontWeight: 'bold', ...(colWidths.length > 0 ? { width: colWidths[0] } : {}) }}>
              Participant
              {isAdminOrOwner && <ColumnResizer onMouseDown={handleColResizeStart(0)} />}
            </th>
            {wpData.map((wp, i) => {
              const wpColor = wp.color || '#2563EB';
              return (
                <th key={wp.id} className={`${headerCellStyles} relative`} style={{ ...(colWidths.length > 0 ? { width: colWidths[i + 1] } : {}) }}>
                  <span
                    className="inline-flex items-center rounded-full px-1.5 text-[9pt] font-bold whitespace-nowrap"
                    style={{ backgroundColor: wpColor, color: '#FFFFFF', lineHeight: 1, paddingTop: '2px', paddingBottom: '2px' }}
                  >
                    WP{wp.number}
                  </span>
                  {isAdminOrOwner && <ColumnResizer onMouseDown={handleColResizeStart(i + 1)} />}
                </th>
              );
            })}
            <th className={headerCellStyles} style={{ fontWeight: 'bold' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {participants.map(p => {
            const pMap = matrix.get(p.id)!;
            const rowTotal = wpData.reduce((sum, wp) => sum + (pMap.get(wp.id) || 0), 0);
            return (
              <tr key={p.id}>
                <td className="px-[1pt] py-0 font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight align-middle border-y border-gray-200" style={{ textAlign: 'left' }}>
                  <span
                    className="inline-flex items-center rounded-full px-1.5 text-[9pt] font-bold italic whitespace-nowrap"
                    style={{ backgroundColor: '#000000', color: '#FFFFFF', lineHeight: 1, paddingTop: '2px', paddingBottom: '2px' }}
                  >
                    {p.participant_number}. {p.organisation_short_name || p.organisation_name}
                  </span>
                </td>
                {wpData.map(wp => {
                  const val = pMap.get(wp.id) || 0;
                  const isEditing = editingCell?.participantId === p.id && editingCell?.wpId === wp.id;
                  return (
                    <td
                      key={wp.id}
                      className={editableCellStyles}
                      onClick={() => !isEditing && startEdit(p.id, wp.id, val)}
                    >
                      {isEditing ? (
                        <input
                          type="text"
                          className="w-full bg-transparent outline-none border-none p-0 m-0 font-['Times_New_Roman',Times,serif] text-[11pt] text-center"
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onBlur={saveEdit}
                          onKeyDown={handleKeyDown}
                          autoFocus
                          style={{ minWidth: '30px' }}
                        />
                      ) : (
                        val || '—'
                      )}
                    </td>
                  );
                })}
                <td className={`${cellStyles} font-bold`}>{rowTotal || '—'}</td>
              </tr>
            );
          })}
          {/* Total row */}
          <tr>
            <td className="px-[1pt] py-0 font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight align-middle font-bold border-y border-gray-200" style={{ textAlign: 'left' }}>Total</td>
            {wpData.map(wp => {
              const colTotal = participants.reduce((sum, p) => sum + (matrix.get(p.id)!.get(wp.id) || 0), 0);
              return <td key={wp.id} className={`${cellStyles} font-bold`}>{colTotal || '—'}</td>;
            })}
            <td className={`${cellStyles} font-bold`}>
              {participants.reduce((sum, p) => {
                const pMap = matrix.get(p.id)!;
                return sum + wpData.reduce((s, wp) => s + (pMap.get(wp.id) || 0), 0);
              }, 0) || '—'}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
