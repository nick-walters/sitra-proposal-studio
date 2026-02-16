import type { B31BudgetItem, B31Participant } from '@/hooks/useB31SectionData';
import { formatCurrency } from '@/lib/formatNumber';

const tableStyles = "font-['Times_New_Roman',Times,serif] text-[11pt]";
const cellStyles = "border border-black px-1 py-0.5 font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight align-top";
const headerCellStyles = "border border-black px-1 py-0.5 font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight font-bold text-white bg-black";

interface Props {
  items: B31BudgetItem[];
  participants: B31Participant[];
}

export function B31SubcontractingTable({ items, participants }: Props) {
  if (items.length === 0) return null;

  const getName = (id: string) => {
    const p = participants.find(p => p.id === id);
    return p ? `${p.participant_number}. ${p.organisation_short_name || p.organisation_name}` : 'Unknown';
  };

  return (
    <div>
      <p className={`${tableStyles} italic mb-0`}>
        <span className="font-bold italic">Table 3.1.g.</span> Subcontracting cost justifications
      </p>
      <table className={`${tableStyles} w-full border-collapse`}>
        <thead>
          <tr>
            <th className={headerCellStyles}>Participant</th>
            <th className={`${headerCellStyles} w-[120px] text-right`}>Amount</th>
            <th className={headerCellStyles}>Justification</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id}>
              <td className={cellStyles}>{getName(item.participant_id)}</td>
              <td className={`${cellStyles} text-right`}>{formatCurrency(item.amount)}</td>
              <td className={cellStyles}>{item.justification || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
