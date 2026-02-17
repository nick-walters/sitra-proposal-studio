import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { B31BudgetItem, B31Participant } from '@/hooks/useB31SectionData';
import { formatCurrency, parseFormattedNumber } from '@/lib/formatNumber';
import { useUserRole } from '@/hooks/useUserRole';
import { useColumnResize } from '@/hooks/useColumnResize';
import { ColumnResizer } from '@/components/ColumnResizer';

const tableStyles = "font-['Times_New_Roman',Times,serif] text-[11pt]";
const cellStyles = "border-y border-gray-200 px-[0.1pt] py-0 font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight align-middle";
const headerCellStyles = "px-[0.1pt] py-0 font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight font-bold align-middle";
const editableCellStyles = `${cellStyles} cursor-text hover:bg-muted/30`;

interface Props {
  items: B31BudgetItem[];
  participants: B31Participant[];
  proposalId?: string;
}

export function B31SubcontractingTable({ items, participants, proposalId }: Props) {
  const queryClient = useQueryClient();
  const { isAdminOrOwner } = useUserRole();
  const { colWidths, tableRef, handleColResizeStart } = useColumnResize({ proposalId, tableKey: 'subcontracting', canResize: isAdminOrOwner });
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');

  const getName = (id: string) => {
    const p = participants.find(p => p.id === id);
    return p ? `${p.participant_number}. ${p.organisation_short_name || p.organisation_name}` : 'Unknown';
  };

  const startEdit = (id: string, field: string, currentValue: string) => {
    setEditingCell({ id, field });
    setEditValue(currentValue);
  };

  const saveEdit = useCallback(async () => {
    if (!editingCell || !proposalId) return;
    const { id, field } = editingCell;
    const update: Record<string, any> = {};
    
    if (field === 'amount') {
      update.amount = parseFormattedNumber(editValue) || 0;
    } else {
      update[field] = editValue.trim() || null;
    }

    await supabase.from('budget_items').update(update).eq('id', id);
    queryClient.invalidateQueries({ queryKey: ['b31-budget', proposalId] });
    setEditingCell(null);
  }, [editingCell, editValue, proposalId, queryClient]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); saveEdit(); }
    if (e.key === 'Escape') setEditingCell(null);
  };

  if (items.length === 0) return null;

  return (
    <div>
      <p className={`${tableStyles} italic mb-0`}>
        <span className="font-bold italic">Table 3.1.g.</span> Subcontracting cost justifications
      </p>
      <table className={`${tableStyles} w-full border-collapse [&_th]:border-x-0 [&_th]:border-t-0 [&_th]:border-b [&_th]:border-black [&_td]:border-x-0 [&_td]:border-y [&_td]:border-gray-200 [&_tr]:border-0 [&_tr:last-child_td]:border-b-0 [&_tbody_tr:first-child_td]:border-t-0`} style={{ tableLayout: colWidths.length > 0 ? 'fixed' : 'auto' }} ref={tableRef}>
        <thead>
          <tr>
            <th className={`${headerCellStyles} relative`} style={colWidths.length > 0 ? { width: colWidths[0] } : undefined}>
              Participant
              {isAdminOrOwner && <ColumnResizer onMouseDown={handleColResizeStart(0)} />}
            </th>
            <th className={`${headerCellStyles} text-right relative`} style={colWidths.length > 0 ? { width: colWidths[1] } : { width: '120px' }}>
              Amount
              {isAdminOrOwner && <ColumnResizer onMouseDown={handleColResizeStart(1)} />}
            </th>
            <th className={`${headerCellStyles} relative`}>
              Justification
              {isAdminOrOwner && <ColumnResizer onMouseDown={handleColResizeStart(2)} />}
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => {
            const isEditingAmount = editingCell?.id === item.id && editingCell.field === 'amount';
            const isEditingJust = editingCell?.id === item.id && editingCell.field === 'justification';
            return (
              <tr key={item.id}>
                <td className={cellStyles}>{getName(item.participant_id)}</td>
                <td
                  className={`${editableCellStyles} text-right`}
                  onClick={() => !isEditingAmount && startEdit(item.id, 'amount', String(item.amount))}
                >
                  {isEditingAmount ? (
                    <input
                      type="text"
                      className="w-full bg-transparent outline-none border-none p-0 m-0 font-['Times_New_Roman',Times,serif] text-[11pt] text-right"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onBlur={saveEdit}
                      onKeyDown={handleKeyDown}
                      autoFocus
                    />
                  ) : (
                    formatCurrency(item.amount)
                  )}
                </td>
                <td
                  className={editableCellStyles}
                  onClick={() => !isEditingJust && startEdit(item.id, 'justification', item.justification || '')}
                >
                  {isEditingJust ? (
                    <input
                      type="text"
                      className="w-full bg-transparent outline-none border-none p-0 m-0 font-['Times_New_Roman',Times,serif] text-[11pt]"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onBlur={saveEdit}
                      onKeyDown={handleKeyDown}
                      autoFocus
                    />
                  ) : (
                    item.justification || '—'
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
