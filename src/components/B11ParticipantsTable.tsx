import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ORGANISATION_CATEGORY_LABELS, OrganisationCategory } from '@/types/proposal';
import { useStorageUrl } from '@/hooks/useStorageUrl';

interface Props {
  proposalId: string;
}

interface ParticipantRow {
  id: string;
  participant_number: number | null;
  organisation_short_name: string | null;
  organisation_name: string;
  english_name: string | null;
  organisation_category: string | null;
  country: string | null;
  logo_url: string | null;
}

function ParticipantLogo({ src }: { src: string | null }) {
  const url = useStorageUrl(src);
  if (!url) return <span>—</span>;
  return (
    <img
      src={url}
      alt=""
      style={{ maxWidth: 60, maxHeight: 30, objectFit: 'contain', display: 'inline-block' }}
    />
  );
}

export function B11ParticipantsTable({ proposalId }: Props) {
  const queryClient = useQueryClient();
  const queryKey = ['b11-participants', proposalId];

  const { data: participants = [] } = useQuery({
    queryKey,
    queryFn: async (): Promise<ParticipantRow[]> => {
      const { data, error } = await supabase
        .from('participants')
        .select('id, participant_number, organisation_short_name, organisation_name, english_name, organisation_category, country, logo_url')
        .eq('proposal_id', proposalId)
        .order('participant_number', { ascending: true });
      if (error) throw error;
      return (data || []) as ParticipantRow[];
    },
  });

  // Realtime: refetch on any participant change for this proposal
  useEffect(() => {
    const channel = supabase
      .channel(`b11-participants-${proposalId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'participants', filter: `proposal_id=eq.${proposalId}` },
        () => queryClient.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [proposalId, queryClient]);

  const baseFont = "'Times New Roman', Times, serif";
  const borderColor = '#999';
  const accentColor = '#1F2A44';

  return (
    <div
      contentEditable={false}
      style={{
        userSelect: 'none',
        fontFamily: baseFont,
        fontSize: '11pt',
        lineHeight: 1.15,
        color: '#000',
        margin: '0 0 12pt 0',
      }}
    >
      <div
        style={{
          fontStyle: 'italic',
          fontFamily: baseFont,
          fontSize: '11pt',
          color: accentColor,
          marginBottom: '3pt',
        }}
      >
        List of participants
      </div>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          tableLayout: 'fixed',
          fontFamily: baseFont,
          fontSize: '11pt',
        }}
      >
        <colgroup>
          <col style={{ width: '16%' }} />
          <col style={{ width: '38%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '20%' }} />
          <col style={{ width: '14%' }} />
        </colgroup>
        <thead>
          <tr style={{ borderBottom: `1px solid ${borderColor}` }}>
            <th style={{ textAlign: 'left', fontWeight: 'bold', padding: '4pt 6pt' }}>№ &amp; short name</th>
            <th style={{ textAlign: 'left', fontWeight: 'bold', padding: '4pt 6pt' }}>
              Participant organisation legal name &amp; <em style={{ fontWeight: 'bold' }}>English name</em>
            </th>
            <th style={{ padding: '4pt 6pt' }} />
            <th style={{ textAlign: 'left', fontWeight: 'bold', padding: '4pt 6pt' }}>Type</th>
            <th style={{ textAlign: 'left', fontWeight: 'bold', padding: '4pt 6pt' }}>Country</th>
          </tr>
        </thead>
        <tbody>
          {participants.map((p) => {
            const legalName = p.organisation_name || '';
            const englishName =
              p.english_name && p.english_name.trim().toLowerCase() !== legalName.trim().toLowerCase()
                ? p.english_name
                : '';
            const typeLabel = p.organisation_category
              ? ORGANISATION_CATEGORY_LABELS[p.organisation_category as OrganisationCategory] || p.organisation_category
              : '—';
            return (
              <tr key={p.id} style={{ borderBottom: `1px solid ${borderColor}` }}>
                <td style={{ padding: '6pt', verticalAlign: 'middle', fontStyle: 'italic', fontWeight: 'bold', color: accentColor }}>
                  {p.participant_number ?? '—'}. {p.organisation_short_name || ''}
                </td>
                <td style={{ padding: '6pt', verticalAlign: 'middle' }}>
                  {legalName}
                  {englishName ? (
                    <>
                      <br />
                      <span style={{ fontStyle: 'italic' }}>{englishName}</span>
                    </>
                  ) : null}
                </td>
                <td style={{ padding: '6pt', verticalAlign: 'middle', textAlign: 'center' }}>
                  <ParticipantLogo src={p.logo_url} />
                </td>
                <td style={{ padding: '6pt', verticalAlign: 'middle' }}>{typeLabel}</td>
                <td style={{ padding: '6pt', verticalAlign: 'middle' }}>{p.country || '—'}</td>
              </tr>
            );
          })}
          {participants.length === 0 && (
            <tr>
              <td colSpan={5} style={{ padding: '6pt', fontStyle: 'italic', color: '#666' }}>
                No participants added yet. Add them in section A2.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
