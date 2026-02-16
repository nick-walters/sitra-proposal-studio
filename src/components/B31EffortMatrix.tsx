import type { B31WPData, B31Participant } from '@/hooks/useB31SectionData';

const tableStyles = "font-['Times_New_Roman',Times,serif] text-[11pt]";
const cellStyles = "border border-black px-1 py-0.5 font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight text-center";
const headerCellStyles = "border border-black px-1 py-0.5 font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight font-bold text-white bg-black text-center";

interface Props {
  wpData: B31WPData[];
  participants: B31Participant[];
}

export function B31EffortMatrix({ wpData, participants }: Props) {
  if (wpData.length === 0 || participants.length === 0) return null;

  // Build effort matrix: participant -> wp -> person months
  const matrix = new Map<string, Map<string, number>>();
  participants.forEach(p => matrix.set(p.id, new Map()));

  wpData.forEach(wp => {
    wp.tasks.forEach(task => {
      task.effort?.forEach(e => {
        const pMap = matrix.get(e.participant_id);
        if (pMap) {
          pMap.set(wp.id, (pMap.get(wp.id) || 0) + (e.person_months || 0));
        }
      });
    });
  });

  // Check if there's any effort data at all
  let hasData = false;
  matrix.forEach(pMap => { if (pMap.size > 0) hasData = true; });
  if (!hasData) return null;

  return (
    <div>
      <p className={`${tableStyles} italic mb-0`}>
        <span className="font-bold italic">Table 3.1.f.</span> Person months per participant per work package
      </p>
      <table className={`${tableStyles} w-full border-collapse`}>
        <thead>
          <tr>
            <th className={`${headerCellStyles} text-left`}>Participant</th>
            {wpData.map(wp => (
              <th key={wp.id} className={headerCellStyles}>WP{wp.number}</th>
            ))}
            <th className={headerCellStyles}>Total</th>
          </tr>
        </thead>
        <tbody>
          {participants.map(p => {
            const pMap = matrix.get(p.id)!;
            const rowTotal = wpData.reduce((sum, wp) => sum + (pMap.get(wp.id) || 0), 0);
            return (
              <tr key={p.id}>
                <td className={`${cellStyles} text-left font-bold`}>
                  {p.participant_number}. {p.organisation_short_name || p.organisation_name}
                </td>
                {wpData.map(wp => (
                  <td key={wp.id} className={cellStyles}>
                    {pMap.get(wp.id) || '—'}
                  </td>
                ))}
                <td className={`${cellStyles} font-bold`}>{rowTotal || '—'}</td>
              </tr>
            );
          })}
          {/* Total row */}
          <tr>
            <td className={`${cellStyles} text-left font-bold`}>Total</td>
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
