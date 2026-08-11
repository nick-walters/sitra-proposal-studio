import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { sanitizeEditorHtml } from '@/lib/editorContentSanitizer';
import { ParticipantBubble } from '@/components/B31Pill';
import {
  FUNDING_INSTRUMENTS,
  getInstrumentAbbreviation,
  formatDurationShort,
} from '@/lib/fundingInstruments';

/**
 * B1.2 mirror — 'linked_activities' slot.
 *
 * Read-only three-column mirror of methodology_linked_activities, merging
 * acronym + instrument + duration into one "Project" column, followed by a
 * legend row expanding only the instruments actually used.
 */

interface ActivityRow {
  id: string;
  acronym: string;
  instrumentCode: string | null;
  instrumentCustom: string | null;
  durationStart: number | null;
  durationEnd: number | null;
  linkDescriptionHtml: string | null;
  responsibleParticipantId: string | null;
}

interface ParticipantRow {
  id: string;
  participant_number: number | null;
  organisation_short_name: string | null;
  organisation_name: string | null;
}

/** Same query key as the Methodologies page, so edits propagate live. */
function useLinkedActivitiesMirror(proposalId: string) {
  return useQuery({
    queryKey: ['methodology-linked-activities', proposalId],
    enabled: !!proposalId,
    queryFn: async (): Promise<ActivityRow[]> => {
      if (!proposalId) return [];
      const { data, error } = await supabase
        .from('methodology_linked_activities')
        .select(
          'id, proposal_id, acronym, instrument_code, instrument_custom, duration_start, duration_end, link_description_html, responsible_participant_id, order_index',
        )
        .eq('proposal_id', proposalId)
        .order('order_index');
      if (error) throw error;
      return (data || []).map((r) => ({
        id: r.id,
        acronym: r.acronym,
        instrumentCode: r.instrument_code,
        instrumentCustom: r.instrument_custom,
        durationStart: r.duration_start,
        durationEnd: r.duration_end,
        linkDescriptionHtml: r.link_description_html,
        responsibleParticipantId: r.responsible_participant_id,
      }));
    },
  });
}

function useMirrorParticipants(proposalId: string) {
  return useQuery({
    queryKey: ['b12-linked-activities-participants', proposalId],
    enabled: !!proposalId,
    queryFn: async (): Promise<ParticipantRow[]> => {
      const { data, error } = await supabase
        .from('participants')
        .select('id, participant_number, organisation_short_name, organisation_name')
        .eq('proposal_id', proposalId)
        .order('participant_number');
      if (error) throw error;
      return (data || []) as ParticipantRow[];
    },
  });
}

function projectLabel(a: ActivityRow): string {
  const parts = [
    (a.acronym || '').trim(),
    getInstrumentAbbreviation(a.instrumentCode, a.instrumentCustom).trim(),
    formatDurationShort(a.durationStart, a.durationEnd).trim(),
  ].filter((p) => p.length > 0);
  return parts.join(', ');
}

/** Instruments used in this table that have a full name to expand. */
function buildLegend(activities: ActivityRow[]): string {
  const used = new Set(
    activities.map((a) => a.instrumentCode).filter((c): c is string => !!c),
  );
  const parts = FUNDING_INSTRUMENTS.filter(
    (i) => used.has(i.code) && i.abbreviation && i.fullName,
  )
    .slice()
    .sort((a, b) =>
      a.abbreviation.localeCompare(b.abbreviation, undefined, { sensitivity: 'base' }),
    )
    .map((i) => `${i.abbreviation} = ${i.fullName}`);
  return parts.join('; ');
}

export interface B12LinkedActivitiesSlotContentProps {
  proposalId: string;
}

export function B12LinkedActivitiesSlotContent({
  proposalId,
}: B12LinkedActivitiesSlotContentProps) {
  const { data: activities = [] } = useLinkedActivitiesMirror(proposalId);
  const { data: participants = [] } = useMirrorParticipants(proposalId);

  if (activities.length === 0) return null;

  const legend = buildLegend(activities);
  const partById = new Map(participants.map((p) => [p.id, p]));

  return (
    <div
      data-b12-linked-activities-mirror=""
      className="b31-tables-container space-y-1 [&_p]:!my-0 mt-[2px]"
    >
      <table
        data-table-key="b12-linked-activities"
        className="platform-table platform-table--tight"
        style={{ tableLayout: 'fixed', borderCollapse: 'collapse', width: '100%' }}
      >
        <colgroup>
          <col style={{ width: '22%' }} />
          <col style={{ width: '53%' }} />
          <col style={{ width: '25%' }} />
        </colgroup>
        <thead>
          <tr>
            <th className="cell-pl-0 py-0 text-[11pt] text-left align-bottom">Project</th>
            <th className="cell-pl-0 py-0 text-[11pt] text-left align-bottom">
              How the project will be linked
            </th>
            <th className="cell-pl-0 py-0 text-[11pt] text-left align-bottom">
              Participant responsible for establishing the link
            </th>
          </tr>
        </thead>
        <tbody>
          {activities.map((a) => {
            const participant = a.responsibleParticipantId
              ? partById.get(a.responsibleParticipantId)
              : undefined;
            return (
              <tr key={a.id}>
                <td className="align-top cell-pl-0 py-0 leading-tight text-[11pt]">
                  {projectLabel(a)}
                </td>
                <td className="align-top cell-pl-0 py-0 leading-tight text-[11pt]">
                  <div
                    dangerouslySetInnerHTML={{
                      __html: sanitizeEditorHtml((a.linkDescriptionHtml ?? '').toString()),
                    }}
                  />
                </td>
                <td className="align-top cell-pl-0 py-0 leading-tight text-[11pt]">
                  {participant ? (
                    <ParticipantBubble
                      number={participant.participant_number}
                      shortName={
                        participant.organisation_short_name ||
                        participant.organisation_name ||
                        ''
                      }
                      style={{ fontStyle: 'normal' }}
                    />
                  ) : null}
                </td>
              </tr>
            );
          })}
          {legend ? (
            <tr data-b12-linked-activities-legend="">
              <td colSpan={3} className="cell-pl-0 py-0 leading-tight text-[9pt] align-top">
                {legend}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

export default B12LinkedActivitiesSlotContent;
