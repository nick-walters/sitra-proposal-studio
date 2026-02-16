import type { B31WPData, B31Participant } from '@/hooks/useB31SectionData';

const tableStyles = "font-['Times_New_Roman',Times,serif] text-[11pt]";
const cellStyles = "border border-black px-0.5 py-0 font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight align-top text-left";
const headerCellStyles = "border border-black px-0.5 py-0 font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight font-bold text-white bg-black text-left";

interface Props {
  wpData: B31WPData[];
  participants: B31Participant[];
}

export function B31WPListTable({ wpData, participants }: Props) {
  if (wpData.length === 0) return null;

  const getParticipant = (id: string | null) => participants.find(p => p.id === id);

  const getWPDuration = (wp: B31WPData) => {
    const months = wp.tasks.flatMap(t => [t.start_month, t.end_month]).filter((m): m is number => m != null);
    if (months.length === 0) return '—';
    const min = Math.min(...months);
    const max = Math.max(...months);
    return `M${String(min).padStart(2, '0')}–M${String(max).padStart(2, '0')}`;
  };

  const getWPPersonMonths = (wp: B31WPData) => {
    let total = 0;
    wp.tasks.forEach(t => t.effort?.forEach(e => { total += e.person_months || 0; }));
    return total;
  };

  return (
    <div>
      <p className={`${tableStyles} italic mb-0`}>
        <span className="font-bold italic">Table 3.1.a.</span> Work packages
      </p>
      <table className={`${tableStyles} w-full border-collapse`}>
        <thead>
          <tr>
            <th className={headerCellStyles}>Work package</th>
            <th className={`${headerCellStyles} w-[120px]`}>Lead</th>
            <th className={`${headerCellStyles} w-[80px]`}>Person months</th>
            <th className={`${headerCellStyles} w-[90px]`}>Duration</th>
          </tr>
        </thead>
        <tbody>
          {wpData.map(wp => {
            const lead = getParticipant(wp.lead_participant_id);
            const pm = getWPPersonMonths(wp);
            const duration = getWPDuration(wp);
            const shortName = wp.short_name || wp.title || `WP${wp.number}`;
            const title = wp.title || `Work Package ${wp.number}`;
            const wpLabel = shortName !== title
              ? `WP${wp.number}: ${shortName} – ${title}`
              : `WP${wp.number}: ${title}`;

            return (
              <tr key={wp.id}>
                <td className={cellStyles}>
                  <span className="font-bold">WP{wp.number}: {wp.short_name || `WP${wp.number}`}</span>
                  {title && shortName !== title && ` – ${title}`}
                </td>
                <td className={cellStyles}>
                  {lead ? (
                    <span
                      className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9pt] font-bold italic whitespace-nowrap"
                      style={{ backgroundColor: '#000000', color: '#FFFFFF' }}
                    >
                      {lead.participant_number}. {lead.organisation_short_name || lead.organisation_name}
                    </span>
                  ) : '—'}
                </td>
                <td className={cellStyles}>{pm > 0 ? pm : '—'}</td>
                <td className={cellStyles}>{duration}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
