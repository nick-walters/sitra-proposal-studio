import type { B31WPData, B31Participant } from '@/hooks/useB31SectionData';
import { getContrastingTextColor } from '@/lib/wpColors';

const tableStyles = "font-['Times_New_Roman',Times,serif] text-[11pt]";
const cellStyles = "border border-black px-1 py-0.5 font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight align-top";

interface Props {
  wpData: B31WPData[];
  participants: B31Participant[];
}

export function B31WPDescriptionTables({ wpData, participants }: Props) {
  const populatedWPs = wpData.filter(wp =>
    wp.objectives || wp.methodology || (wp.tasks && wp.tasks.length > 0)
  );

  if (populatedWPs.length === 0) return null;

  const getParticipantName = (id: string | null) => {
    const p = participants.find(p => p.id === id);
    return p ? `${p.participant_number}. ${p.organisation_short_name || p.organisation_name}` : '—';
  };

  return (
    <div>
      <p className={`${tableStyles} italic mb-0`}>
        <span className="font-bold italic">Table 3.1.b.</span> Work package descriptions
      </p>
      {populatedWPs.map((wp, idx) => {
        const shortName = wp.short_name || wp.title || `WP${wp.number}`;
        const title = wp.title || `Work Package ${wp.number}`;

        // Compute WP duration
        const months = wp.tasks.flatMap(t => [t.start_month, t.end_month]).filter((m): m is number => m != null);
        const startMonth = months.length > 0 ? Math.min(...months) : null;
        const endMonth = months.length > 0 ? Math.max(...months) : null;

        return (
          <div key={wp.id}>
            {idx > 0 && <div style={{ height: '1.5em' }} />}
            <table className={`${tableStyles} w-full border-collapse`}>
              <tbody>
                {/* Header row with WP color */}
                <tr>
                  <td
                    colSpan={4}
                    className="border border-black px-1 py-1 font-bold text-[11pt] font-['Times_New_Roman',Times,serif]"
                    style={{
                      backgroundColor: wp.color,
                      color: getContrastingTextColor(wp.color),
                    }}
                  >
                    WP{wp.number}: {shortName} – {title}
                  </td>
                </tr>
                {/* Lead & Duration row */}
                <tr>
                  <td className={`${cellStyles} font-bold w-[120px]`}>Lead participant</td>
                  <td className={cellStyles}>{getParticipantName(wp.lead_participant_id)}</td>
                  <td className={`${cellStyles} font-bold w-[80px]`}>Duration</td>
                  <td className={cellStyles}>
                    {startMonth != null && endMonth != null
                      ? `M${String(startMonth).padStart(2, '0')}–M${String(endMonth).padStart(2, '0')}`
                      : '—'}
                  </td>
                </tr>
                {/* Objectives */}
                {wp.objectives && (
                  <tr>
                    <td className={`${cellStyles} font-bold`} colSpan={1}>Objectives</td>
                    <td className={cellStyles} colSpan={3}
                      dangerouslySetInnerHTML={{ __html: wp.objectives }}
                    />
                  </tr>
                )}
                {/* Methodology */}
                {wp.methodology && (
                  <tr>
                    <td className={`${cellStyles} font-bold`} colSpan={1}>Methodology</td>
                    <td className={cellStyles} colSpan={3}
                      dangerouslySetInnerHTML={{ __html: wp.methodology }}
                    />
                  </tr>
                )}
                {/* Tasks */}
                {wp.tasks.length > 0 && wp.tasks.map(task => (
                  <tr key={task.id}>
                    <td className={`${cellStyles} font-bold`}>
                      T{wp.number}.{task.number}
                    </td>
                    <td className={cellStyles} colSpan={3}>
                      <span className="font-bold">{task.title || `Task ${task.number}`}</span>
                      {task.lead_participant_id && (
                        <span className="text-muted-foreground"> [Lead: {getParticipantName(task.lead_participant_id)}]</span>
                      )}
                      {task.start_month != null && task.end_month != null && (
                        <span className="text-muted-foreground"> [M{String(task.start_month).padStart(2, '0')}–M{String(task.end_month).padStart(2, '0')}]</span>
                      )}
                      {task.description && <div className="mt-0.5">{task.description}</div>}
                    </td>
                  </tr>
                ))}
                {/* Deliverables */}
                {wp.deliverables.length > 0 && (
                  <tr>
                    <td className={`${cellStyles} font-bold`}>Deliverables</td>
                    <td className={cellStyles} colSpan={3}>
                      {wp.deliverables.map(d => (
                        <div key={d.id}>
                          <span className="font-bold">D{wp.number}.{d.number}</span>{' '}
                          {d.title || 'Untitled'}{d.due_month != null && ` [M${String(d.due_month).padStart(2, '0')}]`}
                        </div>
                      ))}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
