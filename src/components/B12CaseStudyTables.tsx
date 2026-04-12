import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { EditableCaption } from '@/components/EditableCaption';
import { useEffect, useRef, useCallback } from 'react';
import { Crown } from 'lucide-react';

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
  tableIndex?: number;
  sectionNumber?: string;
}

/** Build case bubble label matching the case manager logic */
function getCaseBubbleLabel(
  caseType: string,
  customTypeName: string | null,
  number: number,
  shortName: string | null,
  includeNumber: boolean,
  includeAbbreviation: boolean,
): string {
  const prefix = caseType === 'other'
    ? (customTypeName || '')
    : (CASE_TYPE_PREFIX[caseType] || '');

  let parts: string[] = [];
  if (includeAbbreviation && prefix) parts.push(prefix);
  if (includeNumber) parts.push(String(number));
  const base = parts.join('');

  if (base && shortName) return `${base}: ${shortName}`;
  if (base) return base;
  return shortName || String(number);
}

function CaseBubble({ label }: { label: string }) {
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

function ParticipantBubble({ name }: { name: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full font-bold whitespace-nowrap"
      style={{
        backgroundColor: '#000000',
        color: '#FFFFFF',
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
      <Crown className="h-2.5 w-2.5 mr-0.5 fill-white" strokeWidth={0} />
      {name}
    </span>
  );
}

/**
 * Inline editable cell for case draft content fields.
 * Renders as contentEditable div, syncs changes back to the DB.
 */
function EditableCaseCell({
  caseId,
  contentKey,
  value,
}: {
  caseId: string;
  contentKey: string;
  value: string;
}) {
  const editorRef = useRef<HTMLSpanElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const isFocusedRef = useRef(false);
  const queryClient = useQueryClient();

  // Set initial content
  useEffect(() => {
    if (editorRef.current && !isFocusedRef.current) {
      const current = editorRef.current.innerHTML;
      const next = value || '';
      if (current !== next) {
        editorRef.current.innerHTML = next;
      }
    }
  }, [value]);

  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      await supabase
        .from('case_drafts')
        .update({ [contentKey]: html, updated_at: new Date().toISOString() })
        .eq('id', caseId);
      // The realtime subscription will invalidate the case-drafts query
    }, 600);
  }, [caseId, contentKey]);

  return (
    <span
      ref={editorRef}
      contentEditable
      suppressContentEditableWarning
      className="b12-case-content outline-none"
      style={{
        fontFamily: "'Times New Roman', Times, serif",
        fontSize: '11pt',
        lineHeight: 1.2,
      }}
      onFocus={() => { isFocusedRef.current = true; }}
      onBlur={() => { isFocusedRef.current = false; }}
      onInput={handleInput}
      onKeyDown={(e) => {
        // Support bold, italic, underline
        if (e.metaKey || e.ctrlKey) {
          if (e.key === 'b') { e.preventDefault(); document.execCommand('bold'); handleInput(); }
          if (e.key === 'i') { e.preventDefault(); document.execCommand('italic'); handleInput(); }
          if (e.key === 'u') { e.preventDefault(); document.execCommand('underline'); handleInput(); }
        }
      }}
    />
  );
}

export function B12CaseStudyTables({ proposalId, tableIndex = 0, sectionNumber = '1.2' }: Props) {
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

  // Fetch case settings for bubble label
  const { data: caseSettings } = useQuery({
    queryKey: ['case-settings', proposalId],
    queryFn: async () => {
      const { data } = await supabase
        .from('proposals')
        .select('case_include_number, case_include_abbreviation')
        .eq('id', proposalId)
        .single();
      return data;
    },
  });

  const includeNumber = caseSettings?.case_include_number !== false;
  const includeAbbreviation = caseSettings?.case_include_abbreviation !== false;

  // Realtime subscription – also invalidates the case-drafts cache used by the editor
  useEffect(() => {
    const channel = supabase
      .channel('b12-case-drafts-realtime')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'case_drafts',
        filter: `proposal_id=eq.${proposalId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['b12-case-study-tables', proposalId] });
        queryClient.invalidateQueries({ queryKey: ['case-drafts', proposalId] });
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

  const getLeaderName = (leadId: string | null) => {
    if (!leadId || !participants) return null;
    const p = participants.find(pp => pp.id === leadId);
    return p ? (p.organisation_short_name || p.organisation_name) : null;
  };

  return (
    <div className="space-y-0 mt-4">
      <EditableCaption
        proposalId={proposalId}
        tableKey="b12-case-studies"
        label={`Table ${sectionNumber.replace(/^[A-Za-z]+/, '')}.${String.fromCharCode(97 + tableIndex)}.`}
        defaultCaption={pluralCaption}
      />

      {cases.map((c, idx) => {
        const bubbleLabel = getCaseBubbleLabel(
          c.case_type, c.custom_type_name, c.number, c.short_name,
          includeNumber, includeAbbreviation,
        );
        const leaderName = getLeaderName(c.lead_participant_id);

        return (
          <div key={c.id}>
            {idx > 0 && (
              <p className={`${tableStyles}`} style={{ fontSize: '11pt', lineHeight: 1.0 }}>&nbsp;</p>
            )}
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
                      <CaseBubble label={bubbleLabel} />
                      {leaderName && <ParticipantBubble name={leaderName} />}
                    </div>
                    {c.title && (
                      <div style={{ marginTop: '2px' }}>{c.title}</div>
                    )}
                  </td>
                </tr>
              </thead>
              <tbody>
                {FIELD_KEYS.map(({ headingKey, contentKey }, fieldIdx) => {
                  const heading = (c as any)[headingKey] || (DEFAULT_HEADINGS as any)[headingKey] || '';
                  const rawContent = (c as any)[contentKey] || '';
                  const isLast = fieldIdx === FIELD_KEYS.length - 1;
                  return (
                    <tr key={contentKey} style={{ borderBottom: isLast ? 'none' : '0.5px solid #d1d5db' }}>
                      <td style={{ fontFamily: "'Times New Roman', Times, serif", fontSize: '11pt', padding: '4px 0' }}>
                        <span className="font-bold italic">{heading}:</span>{' '}
                        <EditableCaseCell
                          caseId={c.id}
                          contentKey={contentKey}
                          value={rawContent}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
