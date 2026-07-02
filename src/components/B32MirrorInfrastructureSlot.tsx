import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ParticipantBubble } from './B31Pill';
import { EditableCaption } from '@/components/EditableCaption';

interface Props {
  proposalId: string;
}

type ParticipantRow = {
  id: string;
  participant_number: number | null;
  organisation_short_name: string | null;
};

type InfraRow = {
  id: string;
  participant_id: string;
  name: string;
  description: string | null;
  order_index: number | null;
};

type MergedRow = {
  key: string;
  name: string;
  description: string | null;
  participants: ParticipantRow[];
  minPartNum: number;
};

const SEP = '\u241E';

export function B32MirrorInfrastructureSlot({ proposalId }: Props) {
  const qc = useQueryClient();

  const toggleQ = useQuery({
    queryKey: ['b32-mirror-toggles', proposalId],
    enabled: !!proposalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposals')
        .select(
          'mirror_contribution_resources, mirror_infrastructure, mirror_value_chain, mirror_industrial_involvement, mirror_participation_justification',
        )
        .eq('id', proposalId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const enabled = toggleQ.data ? Boolean(toggleQ.data.mirror_infrastructure) : false;

  const dataQ = useQuery({
    queryKey: ['b32-mirror-infrastructure', proposalId],
    enabled: !!proposalId && enabled,
    queryFn: async () => {
      const partsR = await supabase
        .from('participants')
        .select('id, participant_number, organisation_short_name')
        .eq('proposal_id', proposalId);
      if (partsR.error) throw partsR.error;
      const participants = (partsR.data || []) as ParticipantRow[];
      const partIds = participants.map((p) => p.id);
      if (partIds.length === 0) {
        return { participants, items: [] as InfraRow[] };
      }
      const infraR = await supabase
        .from('participant_infrastructure')
        .select('id, participant_id, name, description, order_index')
        .in('participant_id', partIds);
      if (infraR.error) throw infraR.error;
      return { participants, items: (infraR.data || []) as InfraRow[] };
    },
  });

  useEffect(() => {
    const handler = () => {
      qc.invalidateQueries({ queryKey: ['b32-mirror-infrastructure', proposalId] });
      qc.invalidateQueries({ queryKey: ['b32-mirror-toggles', proposalId] });
    };
    window.addEventListener('cross-ref-data-changed', handler);
    return () => window.removeEventListener('cross-ref-data-changed', handler);
  }, [qc, proposalId]);

  const rows = useMemo<MergedRow[]>(() => {
    if (!dataQ.data) return [];
    const partById = new Map(dataQ.data.participants.map((p) => [p.id, p]));
    const groups = new Map<string, MergedRow>();
    for (const item of dataQ.data.items) {
      const nameTrim = (item.name || '').trim();
      if (nameTrim.length === 0) continue; // blank-name items omitted
      const descTrim = (item.description || '').trim();
      const key = nameTrim.toLowerCase() + SEP + descTrim.toLowerCase();
      const participant = partById.get(item.participant_id);
      if (!participant) continue;
      let group = groups.get(key);
      if (!group) {
        group = {
          key,
          name: nameTrim,
          description: descTrim.length > 0 ? item.description : null,
          participants: [],
          minPartNum: 9999,
        };
        groups.set(key, group);
      }
      if (!group.participants.some((p) => p.id === participant.id)) {
        group.participants.push(participant);
        const n = participant.participant_number ?? 9999;
        if (n < group.minPartNum) group.minPartNum = n;
      }
    }
    // Sort participants inside each row by participant_number asc.
    for (const g of groups.values()) {
      g.participants.sort(
        (a, b) => (a.participant_number ?? 9999) - (b.participant_number ?? 9999),
      );
    }
    return Array.from(groups.values()).sort(
      (a, b) => a.minPartNum - b.minPartNum || a.name.localeCompare(b.name),
    );
  }, [dataQ.data]);

  if (!enabled) return null;
  if (rows.length === 0) return null;

  return (
    <div
      data-b32-mirror-infrastructure-slot=""
      className="b31-tables-container space-y-1 [&_p]:!my-0 mt-[2px]"
    >
      <EditableCaption
        proposalId={proposalId}
        tableKey="b32-infrastructure"
        label="Table 3.2.b."
        defaultCaption="Access to critical infrastructure"
      />
      <table
        data-table-key="b32-infrastructure"
        className="platform-table platform-table--tight"
        style={{ tableLayout: 'fixed', borderCollapse: 'collapse', width: '100%' }}
      >
        <colgroup>
          <col style={{ width: '75%' }} />
          <col style={{ width: '25%' }} />
        </colgroup>
        <thead>
          <tr>
            <th className="cell-pl-0 py-0 text-[11pt] text-left align-bottom">Infrastructure</th>
            <th className="cell-pl-0 py-0 text-[11pt] text-left align-bottom">Access</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="align-top cell-pl-0 py-0 leading-tight text-[11pt]">
                <strong>{r.name}</strong>
                {r.description ? <>: {r.description}</> : null}
              </td>
              <td className="align-top cell-pl-0 py-0 leading-tight text-[11pt]">
                <span
                  style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}
                >
                  {r.participants.map((p) => (
                    <ParticipantBubble
                      key={p.id}
                      number={p.participant_number ?? undefined}
                      shortName={p.organisation_short_name ?? ''}
                    />
                  ))}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default B32MirrorInfrastructureSlot;
