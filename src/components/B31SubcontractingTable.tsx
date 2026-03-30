import React from 'react';
import type { B31SubcontractingParticipant, B31Participant } from '@/hooks/useB31SectionData';
import { formatCurrency } from '@/lib/formatNumber';
import { useUserRole } from '@/hooks/useUserRole';
import { useColumnResize } from '@/hooks/useColumnResize';
import { ColumnResizer } from '@/components/ColumnResizer';
import { EditableCaption } from '@/components/EditableCaption';

const tableStyles = "font-['Times_New_Roman',Times,serif] text-[11pt]";
const cellStyles = "border-y border-gray-200 px-[1pt] py-0 font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight align-middle";
const headerCellStyles = "px-[1pt] py-0 font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight font-bold align-middle";

interface Props {
  items: B31SubcontractingParticipant[];
  participants: B31Participant[];
  proposalId?: string;
}

export function B31SubcontractingTable({ items, participants, proposalId }: Props) {
  const { isAdminOrOwner } = useUserRole();
  const { colWidths, tableRef, handleColResizeStart } = useColumnResize({ proposalId, tableKey: 'subcontracting', canResize: isAdminOrOwner });

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
        tableKey="table-3.1.g"
        label="Table 3.1.g."
        defaultCaption="Subcontracting cost items"
        className="mb-0"
      />
      <table className={`${tableStyles} border-collapse [&_th]:border-x-0 [&_th]:border-t-0 [&_th]:border-b [&_th]:border-black [&_td]:border-x-0 [&_tr]:border-0`} style={{ tableLayout: colWidths.length > 0 ? 'fixed' : 'auto', width: colWidths.length > 0 ? `${colWidths.reduce((s: number, w: number) => s + w, 0)}px` : '100%' }} ref={tableRef}>
        <thead>
          <tr>
            <th className={`${headerCellStyles} relative`} style={colWidths.length > 0 ? { width: colWidths[0] } : undefined}>
              Participant
              {isAdminOrOwner && <ColumnResizer onMouseDown={handleColResizeStart(0)} />}
            </th>
            <th className={`${headerCellStyles} text-right relative`} style={colWidths.length > 0 ? { width: colWidths[1] } : { width: '120px' }}>
              Cost (€)
              {isAdminOrOwner && <ColumnResizer onMouseDown={handleColResizeStart(1)} />}
            </th>
            <th className={`${headerCellStyles} relative`}>
              Justification
              {isAdminOrOwner && <ColumnResizer onMouseDown={handleColResizeStart(2)} />}
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((entry, entryIdx) => {
            const p = getParticipant(entry.participantId);
            const label = p ? `${p.participant_number}. ${p.organisation_short_name || p.organisation_name}` : 'Unknown';
            const itemRows = entry.items.length > 0 ? entry.items : [{ description: '', amount: entry.totalCost, justification: '' }];

            return (
              <React.Fragment key={entry.participantId}>
                {/* Thin divider between participants */}
                {entryIdx > 0 && (
                  <tr>
                    <td colSpan={3} className="p-0 border-0" style={{ height: '2px', backgroundColor: 'hsl(var(--border))' }} />
                  </tr>
                )}
                {itemRows.map((item, idx) => (
                  <tr key={`${entry.participantId}-${idx}`}>
                    <td className={`${cellStyles} border-y-0`}>
                      {idx === 0 && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'baseline', border: '1.5px solid #000000', borderRadius: '9999px', padding: '0px 5px', fontSize: '11pt', fontFamily: "'Times New Roman', Times, serif", fontWeight: 'bold', fontStyle: 'normal', lineHeight: 1, color: '#ffffff', backgroundColor: '#000000' }}>
                          {label}
                        </span>
                      )}
                    </td>
                    <td className={`${cellStyles} text-right border-y-0`}>{formatCurrency(item.amount)}</td>
                    <td className={`${cellStyles} border-y-0`}>
                      {item.description && item.justification
                        ? `${item.description}: ${item.justification}`
                        : item.justification || item.description || '—'}
                    </td>
                  </tr>
                ))}
                {/* Participant total */}
                {itemRows.length > 1 && (
                  <tr>
                    <td className={`${cellStyles} border-y-0 font-bold italic`} style={{ textAlign: 'right', paddingRight: '4pt' }}>Total</td>
                    <td className={`${cellStyles} text-right border-y-0 font-bold`}>{formatCurrency(entry.totalCost)}</td>
                    <td className={`${cellStyles} border-y-0`}></td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
          {/* Grand total */}
          <tr>
            <td colSpan={3} className="p-0 border-0" style={{ height: '2px', backgroundColor: 'hsl(var(--foreground))' }} />
          </tr>
          <tr>
            <td className={`${cellStyles} font-bold border-y-0`}>Total</td>
            <td className={`${cellStyles} text-right font-bold border-y-0`}>{formatCurrency(grandTotal)}</td>
            <td className={`${cellStyles} border-y-0`}></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

import React from 'react';
