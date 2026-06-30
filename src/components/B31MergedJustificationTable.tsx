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

  const sortedBlocks = blocks
    .map(b => ({
      ...b,
      participants: [...b.participants].sort((a, c) => {
        const pa = getParticipant(a.participantId);
        const pc = getParticipant(c.participantId);
        return (pa?.participant_number || 0) - (pc?.participant_number || 0);
      }),
    }))
    .filter(b => b.participants.length > 0);

  if (sortedBlocks.length === 0) return null;

  const grandTotal = sortedBlocks.reduce(
    (s, b) => s + b.participants.reduce((ss, p) => ss + p.totalCost, 0),
    0,
  );

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
          <col style={{ width: colWidths.length > 0 ? `${colWidths[2]}px` : undefined }} />
          <col />
        </colgroup>
        <thead>
          <tr>
            <th className={`${headerCellStyles} text-left relative`} style={colWidths.length === 0 ? { width: '1%', whiteSpace: 'nowrap' } : undefined}>
              Category
              {isAdminOrOwner && <ColumnResizer onMouseDown={handleColResizeStart(0)} />}
            </th>
            <th className={`${headerCellStyles} text-left relative`} style={colWidths.length === 0 ? { width: '1%', whiteSpace: 'nowrap' } : undefined}>
              Participant
              {isAdminOrOwner && <ColumnResizer onMouseDown={handleColResizeStart(1)} />}
            </th>
            <th className={`${headerCellStyles} text-left relative`} style={colWidths.length === 0 ? { width: '1%', whiteSpace: 'nowrap' } : undefined}>
              Cost (€)
              {isAdminOrOwner && <ColumnResizer onMouseDown={handleColResizeStart(2)} />}
            </th>
            <th className={`${headerCellStyles} text-left relative`}>
              Justification
              {isAdminOrOwner && <ColumnResizer onMouseDown={handleColResizeStart(3)} />}
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedBlocks.map((block, blockIdx) => {
            const isFirstBlock = blockIdx === 0;
            const blockTopBorder = isFirstBlock ? '' : 'border-t border-black';
            // total rows for category rowSpan: sum over participants of (items + subtotal)
            const totalCategoryRows = block.participants.reduce(
              (s, p) => s + p.items.length + 1,
              0,
            );
            const blockTotal = block.participants.reduce((s, p) => s + p.totalCost, 0);

            const rendered: React.ReactNode[] = [];
            let categoryCellPlaced = false;

            block.participants.forEach((entry, entryIdx) => {
              const p = getParticipant(entry.participantId);
              const label = p
                ? `${p.participant_number}. ${p.organisation_short_name || p.organisation_name}`
                : 'Unknown';
              const isFirstParticipantInBlock = entryIdx === 0;
              const participantTopBorder = isFirstParticipantInBlock
                ? blockTopBorder
                : 'border-t border-black/40';

              entry.items.forEach((item, itemIdx) => {
                const isFirstItem = itemIdx === 0;
                const cells: React.ReactNode[] = [];
                if (!categoryCellPlaced) {
                  cells.push(
                    <td
                      key="cat"
                      className={`${cellStyles} ${blockTopBorder} font-bold`}
                      style={{ whiteSpace: 'nowrap', verticalAlign: 'top' }}
                      rowSpan={totalCategoryRows}
                    >
                      {block.categoryLabel}
                    </td>,
                  );
                  categoryCellPlaced = true;
                }
                if (isFirstItem) {
                  cells.push(
                    <td
                      key="part"
                      className={`${cellStyles} ${participantTopBorder}`}
                      style={{ whiteSpace: 'nowrap' }}
                      rowSpan={entry.items.length + 1}
                    >
                      <ParticipantBubble>{label}</ParticipantBubble>
                    </td>,
                  );
                }
                cells.push(
                  <td key="amt" className={`${cellStyles} text-right ${isFirstItem ? participantTopBorder : ''}`}>
                    {formatCurrency(item.amount)}
                  </td>,
                );
                cells.push(
                  <td key="just" className={`${cellStyles} ${isFirstItem ? participantTopBorder : ''}`}>
                    {item.justification || '—'}
                  </td>,
                );
                rendered.push(<tr key={`${block.categoryLabel}-${entry.participantId}-${itemIdx}`}>{cells}</tr>);
              });

              // Per-participant subtotal (sits inside the participant rowSpan group)
              rendered.push(
                <tr key={`${block.categoryLabel}-${entry.participantId}-subtotal`}>
                  <td className={`${cellStyles} text-right font-bold`}>{formatCurrency(entry.totalCost)}</td>
                  <td className={`${cellStyles} italic`}>Subtotal</td>
                </tr>,
              );
            });

            // Category subtotal (spans Participant + Cost + Justification)
            rendered.push(
              <tr key={`${block.categoryLabel}-cat-subtotal`}>
                <td className={`${cellStyles} text-right font-bold border-t border-black`} style={{ whiteSpace: 'nowrap' }}>
                  {block.categoryLabel} subtotal
                </td>
                <td className={`${cellStyles} text-right font-bold border-t border-black`}>{formatCurrency(blockTotal)}</td>
                <td className={`${cellStyles} border-t border-black`} />
              </tr>,
            );

            return <React.Fragment key={block.categoryLabel}>{rendered}</React.Fragment>;
          })}
          <tr>
            <td colSpan={4} className="p-0 border-0" style={{ height: '2px', backgroundColor: 'hsl(var(--foreground))' }} />
          </tr>
          <tr>
            <td className={`${cellStyles} font-bold`} colSpan={2}>Total</td>
            <td className={`${cellStyles} text-right font-bold`}>{formatCurrency(grandTotal)}</td>
            <td className={`${cellStyles}`} />
          </tr>
        </tbody>
      </table>
    </div>
  );
}
