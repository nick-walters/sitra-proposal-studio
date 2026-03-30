import type { B31EquipmentParticipant, B31Participant } from '@/hooks/useB31SectionData';
import { formatCurrency } from '@/lib/formatNumber';
import { useUserRole } from '@/hooks/useUserRole';
import { useColumnResize } from '@/hooks/useColumnResize';
import { ColumnResizer } from '@/components/ColumnResizer';
import { EditableCaption } from '@/components/EditableCaption';

const tableStyles = "font-['Times_New_Roman',Times,serif] text-[11pt]";
const cellStyles = "border-y border-gray-200 px-[1pt] py-0 font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight align-middle";
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

  const totalCost = sorted.reduce((sum, i) => sum + i.equipmentCost, 0);

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
      <table className={`${tableStyles} border-collapse [&_th]:border-x-0 [&_th]:border-t-0 [&_th]:border-b [&_th]:border-black [&_td]:border-x-0 [&_td]:border-y [&_td]:border-gray-200 [&_tr]:border-0 [&_tr:last-child_td]:border-b-0 [&_tbody_tr:first-child_td]:border-t-0`} style={{ tableLayout: colWidths.length > 0 ? 'fixed' : 'auto', width: colWidths.length > 0 ? `${colWidths.reduce((s: number, w: number) => s + w, 0)}px` : '100%' }} ref={tableRef}>
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
          {sorted.map(item => {
            const p = getParticipant(item.participantId);
            const label = p ? `${p.participant_number}. ${p.organisation_short_name || p.organisation_name}` : 'Unknown';
            return (
              <tr key={item.participantId}>
                <td className={cellStyles}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'baseline', border: '1.5px solid #000000', borderRadius: '9999px', padding: '0px 5px', fontSize: '11pt', fontFamily: "'Times New Roman', Times, serif", fontWeight: 'bold', fontStyle: 'normal', lineHeight: 1, color: '#ffffff', backgroundColor: '#000000' }}>
                    {label}
                  </span>
                </td>
                <td className={`${cellStyles} text-right`}>{formatCurrency(item.equipmentCost)}</td>
                <td className={cellStyles}>{item.justification || '—'}</td>
              </tr>
            );
          })}
          <tr className="font-bold">
            <td className={`${cellStyles} font-bold`}>Total</td>
            <td className={`${cellStyles} text-right font-bold`}>{formatCurrency(totalCost)}</td>
            <td className={cellStyles}></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
