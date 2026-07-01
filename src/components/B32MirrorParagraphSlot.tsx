import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import DOMPurify from 'dompurify';
import { supabase } from '@/integrations/supabase/client';
import { ParticipantBubble } from './B31Pill';

/** Sanitiser preset — mirrors PrefixedInlineEditor. */
const SANITIZE_CONFIG = {
  ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 's', 'ul', 'ol', 'li', 'span', 'a', 'sub', 'sup', 'div'],
  ALLOWED_ATTR: ['class', 'style', 'href', 'target', 'rel'],
};

export type B32ParagraphSlotKey =
  | 'capacity'
  | 'value-chain'
  | 'industrial'
  | 'international';

interface SlotConfig {
  field:
    | 'contribution_resources'
    | 'value_chain'
    | 'industrial_involvement'
    | 'participation_justification';
  toggle:
    | 'mirror_contribution_resources'
    | 'mirror_value_chain'
    | 'mirror_industrial_involvement'
    | 'mirror_participation_justification';
  prefixWithWill?: boolean;
}

const SLOT_MAP: Record<B32ParagraphSlotKey, SlotConfig> = {
  capacity: {
    field: 'contribution_resources',
    toggle: 'mirror_contribution_resources',
    prefixWithWill: true,
  },
  'value-chain': { field: 'value_chain', toggle: 'mirror_value_chain' },
  industrial: { field: 'industrial_involvement', toggle: 'mirror_industrial_involvement' },
  international: {
    field: 'participation_justification',
    toggle: 'mirror_participation_justification',
  },
};

interface Props {
  proposalId: string;
  slotKey: B32ParagraphSlotKey;
}

type ParticipantRow = {
  id: string;
  participant_number: number | null;
  organisation_short_name: string | null;
};

type DescRow = {
  participant_id: string;
  contribution_resources: string | null;
  value_chain: string | null;
  industrial_involvement: string | null;
  participation_justification: string | null;
};

function isBlank(html: string | null | undefined): boolean {
  if (!html) return true;
  // Strip tags & entities; if only whitespace, treat as empty.
  const text = html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, '')
    .trim();
  return text.length === 0;
}

export function B32MirrorParagraphSlot({ proposalId, slotKey }: Props) {
  const qc = useQueryClient();
  const config = SLOT_MAP[slotKey];

  const toggleQ = useQuery({
    queryKey: ['b32-mirror-toggles', proposalId],
    enabled: !!proposalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposals')
        .select(
          'mirror_contribution_resources, mirror_value_chain, mirror_industrial_involvement, mirror_participation_justification',
        )
        .eq('id', proposalId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const enabled = toggleQ.data ? Boolean(toggleQ.data[config.toggle]) : false;

  const dataQ = useQuery({
    queryKey: ['b32-mirror-paragraph', proposalId],
    enabled: !!proposalId && enabled,
    queryFn: async () => {
      const [partsR, descR] = await Promise.all([
        supabase
          .from('participants')
          .select('id, participant_number, organisation_short_name')
          .eq('proposal_id', proposalId),
        supabase
          .from('participant_descriptions')
          .select(
            'participant_id, contribution_resources, value_chain, industrial_involvement, participation_justification',
          )
          .eq('proposal_id', proposalId),
      ]);
      if (partsR.error) throw partsR.error;
      if (descR.error) throw descR.error;
      return {
        participants: (partsR.data || []) as ParticipantRow[],
        descriptions: (descR.data || []) as DescRow[],
      };
    },
  });

  useEffect(() => {
    const handler = () => {
      qc.invalidateQueries({ queryKey: ['b32-mirror-paragraph', proposalId] });
      qc.invalidateQueries({ queryKey: ['b32-mirror-toggles', proposalId] });
    };
    window.addEventListener('cross-ref-data-changed', handler);
    return () => window.removeEventListener('cross-ref-data-changed', handler);
  }, [qc, proposalId]);

  const rows = useMemo(() => {
    if (!dataQ.data) return [];
    const byId = new Map(dataQ.data.descriptions.map((d) => [d.participant_id, d]));
    return dataQ.data.participants
      .map((p) => {
        const desc = byId.get(p.id);
        const raw = desc ? (desc[config.field] as string | null) : null;
        return { participant: p, html: raw };
      })
      .filter((r) => !isBlank(r.html))
      .sort(
        (a, b) =>
          (a.participant.participant_number ?? 999) -
          (b.participant.participant_number ?? 999),
      );
  }, [dataQ.data, config.field]);

  if (!enabled) return null;
  if (rows.length === 0) return null;

  return (
    <div
      data-b32-mirror-paragraph-slot=""
      data-b32-slot-key={slotKey}
      style={{
        fontFamily: "'Times New Roman', Times, serif",
        fontSize: '11pt',
      }}
    >
      {rows.map(({ participant, html }) => {
        const safe = DOMPurify.sanitize(html || '', SANITIZE_CONFIG);
        return (
          <div
            key={participant.id}
            style={{ margin: '0 0 8pt 0', lineHeight: 1.3, textAlign: 'justify' }}
          >
            <span
              contentEditable={false}
              style={{ userSelect: 'none', marginRight: 4 }}
            >
              <ParticipantBubble
                number={participant.participant_number ?? undefined}
                shortName={participant.organisation_short_name ?? ''}
              />
              {config.prefixWithWill ? <span style={{ marginLeft: 4 }}>will</span> : null}
            </span>
            <span
              data-b32-mirror-body=""
              dangerouslySetInnerHTML={{ __html: safe }}
            />
          </div>
        );
      })}
    </div>
  );
}

export default B32MirrorParagraphSlot;
