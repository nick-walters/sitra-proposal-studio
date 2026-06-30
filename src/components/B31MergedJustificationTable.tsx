import React from 'react';
import type { B31SubcontractingParticipant, B31Participant } from '@/hooks/useB31SectionData';
import { formatCurrency } from '@/lib/formatNumber';
import { useUserRole } from '@/hooks/useUserRole';
import { useColumnResize } from '@/hooks/useColumnResize';
import { ColumnResizer } from '@/components/ColumnResizer';
import { EditableCaption } from '@/components/EditableCaption';
import { ParticipantBubble } from '@/components/B31Pill';

const tableStyles = "font-['Times_New_Roman',Times,serif] text-[11pt]";
const cellStyles = "px-[1pt] py-0 font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight align-middle";
const headerCellStyles = "px-[1pt] py-0 font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight font-bold align-middle";

export interface MergedBlock {
  categoryLabel: string; // "Travel" | "Equipment" | "Other" | "FSTP" | "Internally invoiced"
  participants: B31SubcontractingParticipant[];
}

interface Props {
  blocks: MergedBlock[];
  participants: B31Participant[];
  proposalId?: string;
  tableKey: string;      // 'purchase-costs' | 'other-direct-costs'
  tableLabel: string;    // 'Table 3.1.h.' etc.
  defaultCaption: string;
}

export function B31MergedJustificationTable({
  blocks, participants, proposalId, tableKey, tableLabel, defaultCaption,
}: Props) {
  const { isAdminOrOwner } = useUserRole();
  const { colWidths, tableRef, handleColResizeStart } = useColumnResize({
    proposalId, tableKey, canResize: isAdminOrOwner,
  });

  const getParticipant = (id: string) => participants.find(p => p.id === id);

  // Pivot: group by participant first, then by category (preserving the input block order as category order).
  interface PivotCategory {
    categoryLabel: string;
    items: { amount: number; justification: string }[];
  }
  interface PivotParticipant {
    participantId: string;
    participantNumber: number;
    categories: PivotCategory[];
    total: number;
  }

  const participantMap = new Map<string, PivotParticipant>();
  blocks.forEach(block => {
    block.participants.forEach(entry => {
      if (entry.items.length === 0) return;
      const p = getParticipant(entry.participantId);
      const num = p?.participant_number || 0;
      let pivot = participantMap.get(entry.participantId);
      if (!pivot) {
        pivot = { participantId: entry.participantId, participantNumber: num, categories: [], total: 0 };
        participantMap.set(entry.participantId, pivot);
      }
      pivot.categories.push({ categoryLabel: block.categoryLabel, items: entry.items });
      pivot.total += entry.totalCost;
    });
  });

  const pivotParticipants = Array.from(participantMap.values())
    .sort((a, b) => a.participantNumber - b.participantNumber);

  if (pivotParticipants.length === 0) return null;

  const grandTotal = pivotParticipants.reduce((s, p) => s + p.total, 0);

  return (
    <div>
      <EditableCaption
        proposalId={proposalId}
        tableKey={`table-${tableKey}`}
        label={tableLabel}
        defaultCaption={defaultCaption}
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
            <th className={`${headerCellStyles} text-left relative`} style={colWidths.length === 0 ? { width: '1%', whiteSpace: 'nowrap' } : undefined}>
              Participant
              {isAdminOrOwner && <ColumnResizer onMouseDown={handleColResizeStart(0)} />}
            </th>
            <th className={`${headerCellStyles} text-left relative`} style={colWidths.length === 0 ? { width: '1%', whiteSpace: 'nowrap' } : undefined}>
              Cost (€)
              {isAdminOrOwner && <ColumnResizer onMouseDown={handleColResizeStart(1)} />}
            </th>
            <th className={`${headerCellStyles} text-left relative`}>
              Category &amp; justification
              {isAdminOrOwner && <ColumnResizer onMouseDown={handleColResizeStart(2)} />}
            </th>
          </tr>
        </thead>
        <tbody>
          {pivotParticipants.map((pp, ppIdx) => {
            const p = getParticipant(pp.participantId);
            const label = p
              ? `${p.participant_number}. ${p.organisation_short_name || p.organisation_name}`
              : 'Unknown';
            const isFirstParticipant = ppIdx === 0;
            const partTopBorder = isFirstParticipant ? '' : 'border-t border-black';

            const totalItemRows = pp.categories.reduce((s, c) => s + c.items.length, 0);
            const rows: React.ReactNode[] = [];
            let itemCounter = 0;

            pp.categories.forEach((cat) => {
              cat.items.forEach((item, itemIdx) => {
                const isFirstItemOverall = itemCounter === 0;
                itemCounter += 1;
                const cells: React.ReactNode[] = [];
                if (isFirstItemOverall) {
                  cells.push(
                    <td
                      key="part"
                      className={`${cellStyles} ${partTopBorder}`}
                      style={{ whiteSpace: 'nowrap', verticalAlign: 'top' }}
                      rowSpan={totalItemRows + 1}
                    >
                      <ParticipantBubble>{label}</ParticipantBubble>
                    </td>,
                  );
                }
                cells.push(
                  <td key="amt" className={`${cellStyles} text-right ${isFirstItemOverall ? partTopBorder : ''}`}>
                    {formatCurrency(item.amount)}
                  </td>,
                );
                cells.push(
                  <td key="just" className={`${cellStyles} ${isFirstItemOverall ? partTopBorder : ''}`}>
                    {itemIdx === 0 && <strong><em>{cat.categoryLabel}:</em></strong>} {item.justification || '—'}
                  </td>,
                );
                rows.push(<tr key={`${pp.participantId}-${cat.categoryLabel}-${itemIdx}`}>{cells}</tr>);
              });
            });

            // Per-participant subtotal row
            rows.push(
              <tr key={`${pp.participantId}-subtotal`}>
                <td className={`${cellStyles} text-right font-bold`}>{formatCurrency(pp.total)}</td>
                <td className={`${cellStyles} italic`}>Subtotal</td>
              </tr>,
            );

            return <React.Fragment key={pp.participantId}>{rows}</React.Fragment>;
          })}
          <tr>
            <td colSpan={3} className="p-0 border-0" style={{ height: '2px', backgroundColor: 'hsl(var(--foreground))' }} />
          </tr>
          <tr>
            <td className={`${cellStyles} font-bold`}>Total</td>
            <td className={`${cellStyles} text-right font-bold`}>{formatCurrency(grandTotal)}</td>
            <td className={`${cellStyles}`} />
          </tr>
        </tbody>
      </table>
    </div>
  );
}
