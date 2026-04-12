import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { EditableCaption } from '@/components/EditableCaption';
import { useEffect } from 'react';

const tableStyles = "font-['Times_New_Roman',Times,serif] text-[11pt]";

const CASE_TYPE_PLURALS: Record<string, string> = {
  case_study: 'Case studies',
  use_case: 'Use cases',
  living_lab: 'Living Labs',
  pilot: 'Pilots',
  demonstration: 'Demonstrations',
  challenge: 'Challenges',
};

const CASE_TYPE_PREFIX: Record<string, string> = {
  case_study: 'CS',
  use_case: 'UC',
  living_lab: 'LL',
  pilot: 'P',
  demonstration: 'D',
  challenge: 'CH',
};

const DEFAULT_HEADINGS = {
  heading_background: 'Background context',
  heading_stakeholders: 'Key stakeholders',
  heading_solutions: 'Proposed solutions',
  heading_outcomes: 'Expected outcomes',
  heading_replicability: 'Replicability',
};

const FIELD_KEYS = [
  { headingKey: 'heading_background', contentKey: 'background_context' },
  { headingKey: 'heading_stakeholders', contentKey: 'key_stakeholders' },
  { headingKey: 'heading_solutions', contentKey: 'proposed_solutions' },
  { headingKey: 'heading_outcomes', contentKey: 'expected_outcomes' },
  { headingKey: 'heading_replicability', contentKey: 'replicability' },
] as const;

interface Props {
  proposalId: string;
}

function CaseBubble({ number, caseType }: { number: number; caseType: string }) {
  const prefix = CASE_TYPE_PREFIX[caseType] || '';
  const label = prefix ? `${prefix}${number}` : `${number}`;
  return (
    <span
      className="inline-flex items-center rounded-full font-bold whitespace-nowrap"
      style={{
        backgroundColor: '#ffffff',
        color: '#000000',
        border: '1.5px solid #000000',
        fontFamily: "'Times New Roman', Times, serif",
        fontSize: '11pt',
        fontWeight: 700,
        fontStyle: 'normal',
        lineHeight: 1,
        verticalAlign: 'baseline',
        padding: '0px 5px',
      }}
    >
      {label}
    </span>
  );
}

export function B12CaseStudyTables({ proposalId }: Props) {
  const queryClient = useQueryClient();

  const { data: cases } = useQuery({
    queryKey: ['b12-case-study-tables', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('case_drafts')
        .select(`
          id, number, short_name, title, case_type, custom_type_name,
          lead_participant_id, order_index, is_hidden, color,
          background_context, key_stakeholders, proposed_solutions,
          expected_outcomes, replicability,
          heading_background, heading_stakeholders, heading_solutions,
          heading_outcomes, heading_replicability
        `)
        .eq('proposal_id', proposalId)
        .eq('is_hidden', false)
        .order('order_index');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: participants } = useQuery({
    queryKey: ['b12-participants', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('participants')
        .select('id, organisation_short_name, organisation_name, participant_number')
        .eq('proposal_id', proposalId)
        .order('participant_number');
      if (error) throw error;
      return data || [];
    },
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('b12-case-drafts-realtime')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'case_drafts',
        filter: `proposal_id=eq.${proposalId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['b12-case-study-tables', proposalId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [proposalId, queryClient]);

  if (!cases || cases.length === 0) return null;

  const caseType = cases[0].case_type;
  const customName = cases[0].custom_type_name;
  const pluralCaption = caseType === 'other'
    ? (customName ? `${customName}s` : 'Cases')
    : (CASE_TYPE_PLURALS[caseType] || 'Cases');

  return (
    <div className="space-y-0 mt-4">
      <EditableCaption
        proposalId={proposalId}
        tableKey="b12-case-studies"
        label="Table 1.2.x."
        defaultCaption={pluralCaption}
      />

      {cases.map((c, idx) => (
        <div key={c.id}>
          {idx > 0 && <p className={`${tableStyles}`}>&nbsp;</p>}
          <table
            className={`${tableStyles} w-full border-collapse`}
            style={{ maxWidth: '18cm', tableLayout: 'fixed', lineHeight: 1.0 }}
          >
            <thead>
              <tr style={{ borderBottom: '1.5px solid #000000' }}>
                <td
                  className="font-bold"
                  style={{ fontFamily: "'Times New Roman', Times, serif", fontSize: '11pt', padding: '4px 0' }}
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <CaseBubble number={c.number} caseType={c.case_type} />
                      <span>{c.title || ''}</span>
                    </span>
                  </div>
                </td>
              </tr>
            </thead>
            <tbody>
              {FIELD_KEYS.map(({ headingKey, contentKey }) => {
                const heading = (c as any)[headingKey] || (DEFAULT_HEADINGS as any)[headingKey] || '';
                const content = (c as any)[contentKey] || '';
                return (
                  <tr key={contentKey} style={{ borderBottom: '0.5px solid #d1d5db' }}>
                    <td style={{ fontFamily: "'Times New Roman', Times, serif", fontSize: '11pt', padding: '4px 0' }}>
                      <span className="font-bold italic">{heading}</span>
                      {content ? ` ${content}` : ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
