import type { B31WPData, B31Participant } from '@/hooks/useB31SectionData';
import { getContrastingTextColor } from '@/lib/wpColors';

const tableStyles = "font-['Times_New_Roman',Times,serif] text-[11pt]";
const cellStyles = "border border-black px-1 py-0.5 font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight align-top";
const headerCellStyles = "border border-black px-1 py-0.5 font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight font-bold text-white bg-black";

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
        <span className="font-bold italic">Table 3.1.a.</span> List of work packages
      </p>
      <table className={`${tableStyles} w-full border-collapse`}>
        <thead>
          <tr>
            <th className={headerCellStyles}>Work package</th>
            <th className={`${headerCellStyles} w-[120px]`}>Lead participant</th>
            <th className={`${headerCellStyles} w-[80px] text-center`}>Person months</th>
            <th className={`${headerCellStyles} w-[90px] text-center`}>Duration</th>
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
                <td className={cellStyles}>{wpLabel}</td>
                <td className={cellStyles}>
                  {lead ? (
                    <span className="inline-flex items-center gap-1">
                      <span
                        className="inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[9pt] font-bold whitespace-nowrap"
                        style={{
                          backgroundColor: wp.color,
                          color: getContrastingTextColor(wp.color),
                        }}
                      >
                        {lead.participant_number}. {lead.organisation_short_name || lead.organisation_name}
                      </span>
                    </span>
                  ) : '—'}
                </td>
                <td className={`${cellStyles} text-center`}>{pm > 0 ? pm : '—'}</td>
                <td className={`${cellStyles} text-center`}>{duration}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
