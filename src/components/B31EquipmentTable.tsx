import React from 'react';
import type { B31EquipmentParticipant, B31Participant } from '@/hooks/useB31SectionData';
import { formatCurrency } from '@/lib/formatNumber';
import { useUserRole } from '@/hooks/useUserRole';
import { useColumnResize } from '@/hooks/useColumnResize';
import { ColumnResizer } from '@/components/ColumnResizer';
import { EditableCaption } from '@/components/EditableCaption';
import { ParticipantBubble } from '@/components/B31Pill';

const tableStyles = "font-['Times_New_Roman',Times,serif] text-[11pt]";
const cellStyles = "px-[1pt] py-0 font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight align-middle";
const headerCellStyles = "px-[1pt] py-0 font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight font-bold align-middle";

interface Props {
  items: B31EquipmentParticipant[];
  participants: B31Participant[];
  proposalId?: string;
}

export function B31EquipmentTable({ items, participants, proposalId }: Props) {
  const { isAdminOrOwner } = useUserRole();
  const { colWidths, tableRef, handleColResizeStart } = useColumnResize({ proposalId, tableKey: 'equipment', canResize: isAdminOrOwner });

  const getParticipant = (id: string) => participants.find(p => p.id === id);

  const sorted = [...items].sort((a, b) => {
    const pa = getParticipant(a.participantId);
    const pb = getParticipant(b.participantId);
    return (pa?.participant_number || 0) - (pb?.participant_number || 0);
  });

  const grandTotal = sorted.reduce((sum, i) => sum + i.totalCost, 0);

  if (sorted.length === 0) return null;

  return (
    <div>
      <EditableCaption
        proposalId={proposalId}
        tableKey="table-3.1.h"
        label="Table 3.1.h."
        defaultCaption="Major equipment purchase cost items"
        className="mb-0"
      />
      <table
        className={`${tableStyles} border-collapse [&_th]:border-x-0 [&_th]:border-t-0 [&_th]:border-b-2 [&_th]:border-black [&_td]:border-x-0`}
        style={{
          tableLayout: colWidths.length > 0 ? 'fixed' : 'auto',
          width: colWidths.length > 0 ? `${colWidths.reduce((s: number, w: number) => s + w, 0)}px` : '100%',
        }}
        ref={tableRef}
      >
        <colgroup>
          <col style={{ width: colWidths.length > 0 ? `${colWidths[0]}px` : undefined }} />
          <col style={{ width: colWidths.length > 0 ? `${colWidths[1]}px` : undefined }} />
          <col />
        </colgroup>
        <thead>
          <tr>
            <th
              className={`${headerCellStyles} text-left relative`}
              style={colWidths.length === 0 ? { width: '1%', whiteSpace: 'nowrap' } : undefined}
            >
              Participant
              {isAdminOrOwner && <ColumnResizer onMouseDown={handleColResizeStart(0)} />}
            </th>
            <th
              className={`${headerCellStyles} text-left relative`}
              style={colWidths.length === 0 ? { width: '1%', whiteSpace: 'nowrap' } : undefined}
            >
              Cost (€)
              {isAdminOrOwner && <ColumnResizer onMouseDown={handleColResizeStart(1)} />}
            </th>
            <th className={`${headerCellStyles} text-left relative`}>
              Justification
              {isAdminOrOwner && <ColumnResizer onMouseDown={handleColResizeStart(2)} />}
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((entry, entryIdx) => {
            const p = getParticipant(entry.participantId);
            const label = p ? `${p.participant_number}. ${p.organisation_short_name || p.organisation_name}` : 'Unknown';
            const isFirstBlock = entryIdx === 0;
            const topBorder = isFirstBlock ? '' : 'border-t border-black';
            const itemRows = entry.items.map((item, itemIdx) => {
              const isFirstItem = itemIdx === 0;
              return (
                <tr key={`${entry.participantId}-${itemIdx}`}>
                  {isFirstItem && (
                    <td
                      className={`${cellStyles} ${topBorder}`}
                      style={{ whiteSpace: 'nowrap' }}
                      rowSpan={entry.items.length + 1}
                    >
                      <ParticipantBubble>{label}</ParticipantBubble>
                    </td>
                  )}
                  <td className={`${cellStyles} text-right ${isFirstItem ? topBorder : ''}`}>
                    {formatCurrency(item.amount)}
                  </td>
                  <td className={`${cellStyles} ${isFirstItem ? topBorder : ''}`}>{item.justification || '—'}</td>
                </tr>
              );
            });
            itemRows.push(
              <tr key={`${entry.participantId}-subtotal`}>
                <td className={`${cellStyles} text-right font-bold`}>{formatCurrency(entry.totalCost)}</td>
                <td className={`${cellStyles} italic`}>Subtotal</td>
              </tr>,
            );
            return <React.Fragment key={entry.participantId}>{itemRows}</React.Fragment>;
          })}
          {/* Grand total */}
          <tr>
            <td colSpan={3} className="p-0 border-0" style={{ height: '2px', backgroundColor: 'hsl(var(--foreground))' }} />
          </tr>
          <tr>
            <td className={`${cellStyles} font-bold`}>Total</td>
            <td className={`${cellStyles} text-right font-bold`}>{formatCurrency(grandTotal)}</td>
            <td className={`${cellStyles}`}></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
