import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { B31BudgetItem, B31Participant } from '@/hooks/useB31SectionData';
import { formatCurrency, parseFormattedNumber } from '@/lib/formatNumber';

const tableStyles = "font-['Times_New_Roman',Times,serif] text-[11pt]";
const cellStyles = "border border-black px-1 py-0.5 font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight align-top";
const headerCellStyles = "border border-black px-1 py-0.5 font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight font-bold text-white bg-black";
const editableCellStyles = `${cellStyles} cursor-text hover:bg-muted/30`;

interface Props {
  equipmentItems: B31BudgetItem[];
  participants: B31Participant[];
  personnelCostByParticipant: Map<string, number>;
  proposalId?: string;
}

export function B31EquipmentTable({ equipmentItems, participants, personnelCostByParticipant, proposalId }: Props) {
  const queryClient = useQueryClient();
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');

  const qualifyingItems = equipmentItems.filter(item => {
    const personnelCost = personnelCostByParticipant.get(item.participant_id) || 0;
    return personnelCost > 0 && item.amount > personnelCost * 0.15;
  });

  if (qualifyingItems.length === 0) return null;

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

  return (
    <div>
      <p className={`${tableStyles} italic mb-0`}>
        <span className="font-bold italic">Table 3.1.h.</span> Equipment purchase cost justifications
      </p>
      <table className={`${tableStyles} w-full border-collapse`}>
        <thead>
          <tr>
            <th className={headerCellStyles}>Participant</th>
            <th className={headerCellStyles}>Equipment description</th>
            <th className={`${headerCellStyles} w-[120px] text-right`}>Amount</th>
            <th className={headerCellStyles}>Justification</th>
          </tr>
        </thead>
        <tbody>
          {qualifyingItems.map(item => {
            const isEditingDesc = editingCell?.id === item.id && editingCell.field === 'description';
            const isEditingAmount = editingCell?.id === item.id && editingCell.field === 'amount';
            const isEditingJust = editingCell?.id === item.id && editingCell.field === 'justification';
            return (
              <tr key={item.id}>
                <td className={cellStyles}>{getName(item.participant_id)}</td>
                <td
                  className={editableCellStyles}
                  onClick={() => !isEditingDesc && startEdit(item.id, 'description', item.description || '')}
                >
                  {isEditingDesc ? (
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
                    item.description || '—'
                  )}
                </td>
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
