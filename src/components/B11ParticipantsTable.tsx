import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ORGANISATION_CATEGORY_LABELS, OrganisationCategory } from '@/types/proposal';
import { useStorageUrl } from '@/hooks/useStorageUrl';
import { useColumnResize } from '@/hooks/useColumnResize';
import { useProposalRole } from '@/hooks/useProposalRole';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { B31Pill, WPBubble, ParticipantBubble } from './B31Pill';

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

interface WPLeadRow {
  number: number;
  short_name: string | null;
  lead_participant_id: string | null;
  color: string;
}

interface CaseLeadRow {
  number: number;
  short_name: string | null;
  lead_participant_id: string | null;
  color: string;
  case_type: string;
  custom_type_name: string | null;
}

function getCasePrefix(caseType: string, customTypeName: string | null): string {
  if (caseType === 'other') return customTypeName ? customTypeName.toUpperCase() : '';
  switch (caseType) {
    case 'case_study': return 'CS';
    case 'use_case': return 'UC';
    case 'living_lab': return 'LL';
    case 'pilot': return 'P';
    case 'demonstration': return 'D';
    default: return '';
  }
}

function ParticipantLogo({ src }: { src: string | null }) {
  const url = useStorageUrl(src);
  if (!url) return <span>—</span>;
  return (
    <img
      src={url}
      alt=""
      loading="eager"
      decoding="async"
      style={{ maxWidth: 60, maxHeight: 30, objectFit: 'contain', display: 'inline-block' }}
    />
  );
}

const baseFont = "'Times New Roman', Times, serif";

// ParticipantBubble is imported from './B31Pill'. roleBadgeBase removed in favour of B31Pill size="role".

export function B11ParticipantsTable({ proposalId }: Props) {
  const queryClient = useQueryClient();
  const { roleTier } = useProposalRole(proposalId);
  const canResize = roleTier === 'coordinator';

  const participantsKey = ['b11-participants', proposalId];
  const wpKey = ['b11-wp-leadership', proposalId];
  const caseKey = ['b11-case-leadership', proposalId];

  const { data: participants = [] } = useQuery({
    queryKey: participantsKey,
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

  const { data: wpLeads = [] } = useQuery({
    queryKey: wpKey,
    queryFn: async (): Promise<WPLeadRow[]> => {
      const { data, error } = await supabase
        .from('wp_drafts')
        .select('number, short_name, lead_participant_id, color')
        .eq('proposal_id', proposalId)
        .order('number');
      if (error) throw error;
      return (data || []) as WPLeadRow[];
    },
  });

  const { data: caseLeads = [] } = useQuery({
    queryKey: caseKey,
    queryFn: async (): Promise<CaseLeadRow[]> => {
      const { data, error } = await supabase
        .from('case_drafts')
        .select('number, short_name, lead_participant_id, color, case_type, custom_type_name')
        .eq('proposal_id', proposalId)
        .order('number');
      if (error) throw error;
      return (data || []) as CaseLeadRow[];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel(`b11-participants-${proposalId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'participants', filter: `proposal_id=eq.${proposalId}` },
        () => queryClient.invalidateQueries({ queryKey: participantsKey }))
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'wp_drafts', filter: `proposal_id=eq.${proposalId}` },
        () => queryClient.invalidateQueries({ queryKey: wpKey }))
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'case_drafts', filter: `proposal_id=eq.${proposalId}` },
        () => queryClient.invalidateQueries({ queryKey: caseKey }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [proposalId, queryClient]);

  const wpByPart = useMemo(() => {
    const m: Record<string, { number: number; shortName: string | null; color: string }[]> = {};
    for (const w of wpLeads) {
      if (!w.lead_participant_id) continue;
      (m[w.lead_participant_id] ||= []).push({ number: w.number, shortName: w.short_name, color: w.color });
    }
    return m;
  }, [wpLeads]);

  const caseByPart = useMemo(() => {
    const m: Record<string, { number: number; shortName: string | null; color: string; prefix: string }[]> = {};
    for (const c of caseLeads) {
      if (!c.lead_participant_id) continue;
      (m[c.lead_participant_id] ||= []).push({
        number: c.number, shortName: c.short_name, color: c.color,
        prefix: getCasePrefix(c.case_type, c.custom_type_name),
      });
    }
    return m;
  }, [caseLeads]);

  const { colWidths, tableRef, handleColResizeStart } = useColumnResize({
    proposalId,
    tableKey: 'b11-participants',
    canResize,
    resizeMode: 'adjacent',
  });

  const NUM_COLS = 6;

  return (
    <TooltipProvider>
      <div
        contentEditable={false}
        className="ProseMirror"
        style={{
          userSelect: 'none',
          fontFamily: baseFont,
          fontSize: '11pt',
          color: '#000',
          margin: '3pt 0 6pt 0',
          paddingBottom: '6pt',
        }}
      >
        <table
          ref={tableRef}
          className="first-col-flush"
          style={{
            width: '100%',
            maxWidth: '18cm',
            borderCollapse: 'collapse',
            tableLayout: colWidths.length === NUM_COLS ? 'fixed' : 'auto',
            fontFamily: baseFont,
            fontSize: '11pt',
            margin: 0,
          }}
        >
          {colWidths.length === NUM_COLS && (
            <colgroup>
              {colWidths.map((w, i) => <col key={i} style={{ width: `${w}px` }} />)}
            </colgroup>
          )}
          <thead>
            <tr>
              <ResizableTh index={0} canResize={canResize} onResize={handleColResizeStart} colSpan={4} style={{ textAlign: 'left' }}>
                Participant organisation №, short name, legal name, <em style={{ fontWeight: 'bold' }}>English name</em>, logo &amp; leadership roles
                {canResize && colWidths.length === NUM_COLS && [0, 1, 2].map((boundaryIndex) => (
                  <ColumnResizeGrip
                    key={boundaryIndex}
                    onMouseDown={handleColResizeStart(boundaryIndex)}
                    style={{ left: `${colWidths.slice(0, boundaryIndex + 1).reduce((sum, width) => sum + width, 0) - 2}px`, right: 'auto' }}
                  />
                ))}
              </ResizableTh>
              <ResizableTh index={4} canResize={canResize} onResize={handleColResizeStart} style={{ whiteSpace: 'nowrap', textAlign: 'left' }}>
                Type
              </ResizableTh>
              <ResizableTh index={5} canResize={canResize} onResize={handleColResizeStart} style={{ whiteSpace: 'nowrap', textAlign: 'left' }}>
                Country
              </ResizableTh>
            </tr>
          </thead>
          <tbody>
            {participants.map((p) => {
              const wpLed = wpByPart[p.id] || [];
              const caseLed = caseByPart[p.id] || [];
              const isCoord = p.participant_number === 1;
              return (
                <ParticipantRowView
                  key={p.id}
                  p={p}
                  isCoord={isCoord}
                  wpLed={wpLed}
                  caseLed={caseLed}
                  canResize={canResize}
                  onResize={handleColResizeStart}
                />
              );
            })}
            {participants.length === 0 && (
              <tr>
                <td colSpan={NUM_COLS} style={{ fontStyle: 'italic', color: '#666' }}>
                  No participants added yet. Add them in section A2.
                </td>
              </tr>
            )}
            {participants.length > 0 && (() => {
              const present = new Set(
                participants
                  .map(p => p.organisation_category ? String(p.organisation_category).toUpperCase() : null)
                  .filter((c): c is string => !!c && c in ORGANISATION_CATEGORY_LABELS)
              );
              const legend = (Object.keys(ORGANISATION_CATEGORY_LABELS) as OrganisationCategory[])
                .filter(code => present.has(code))
                .map(code => `${code}: ${ORGANISATION_CATEGORY_LABELS[code]}`)
                .join('; ');
              if (!legend) return null;
              return (
                <tr>
                  <td colSpan={NUM_COLS} style={{ fontStyle: 'italic', fontSize: '10pt', borderBottom: 'none', paddingTop: '4px' }}>
                    {legend}
                  </td>
                </tr>
              );
            })()}

          </tbody>
        </table>
      </div>
    </TooltipProvider>
  );
}

interface RowProps {
  p: ParticipantRow;
  isCoord: boolean;
  wpLed: { number: number; shortName: string | null; color: string }[];
  caseLed: { number: number; shortName: string | null; color: string; prefix: string }[];
  canResize: boolean;
  onResize: (i: number) => (e: React.MouseEvent) => void;
}

function ParticipantRowView({ p, isCoord, wpLed, caseLed, canResize, onResize }: RowProps) {
  const legalName = p.organisation_name || '';
  const englishName =
    p.english_name && p.english_name.trim().toLowerCase() !== legalName.trim().toLowerCase()
      ? p.english_name
      : '';
  const typeCode = p.organisation_category ? String(p.organisation_category).toUpperCase() : '—';

  // Badges all render on a single wrapping line; column width alone controls wrapping.

  const coordBadges = isCoord ? [
    <Tooltip key="coord">
      <TooltipTrigger asChild>
        <B31Pill variant="filled" color="#000" size="role" style={{ lineHeight: 1.2 }}>Coordinator</B31Pill>
      </TooltipTrigger>
      <TooltipContent>Project coordinator</TooltipContent>
    </Tooltip>
  ] : [];
  const wpBadges = wpLed.map((wp) => (
    <Tooltip key={`wp-${wp.number}`}>
      <TooltipTrigger asChild>
        <WPBubble wpNumber={wp.number} wpColor={wp.color} size="role" style={{ lineHeight: 1.2 }} />
      </TooltipTrigger>
      <TooltipContent>{wp.shortName ? `${wp.shortName} (Lead)` : `WP${wp.number} Lead`}</TooltipContent>
    </Tooltip>
  ));
  const caseBadges = caseLed.map((c) => (
    <Tooltip key={`case-${c.number}`}>
      <TooltipTrigger asChild>
        <B31Pill variant="outline" color="#000" size="role" style={{ lineHeight: 1.2 }}>
          {c.prefix ? `${c.prefix}${c.number}` : (c.shortName || c.number)}
        </B31Pill>
      </TooltipTrigger>
      <TooltipContent>{c.shortName ? `${c.shortName} (Lead)` : `Lead`}</TooltipContent>
    </Tooltip>
  ));

  const allBadges = [...coordBadges, ...wpBadges, ...caseBadges];

  return (
    <tr>
      <ResizableTd index={0} canResize={canResize} onResize={onResize} style={{ verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
        <ParticipantBubble>
          {p.participant_number ?? '—'}. {p.organisation_short_name || ''}
        </ParticipantBubble>
      </ResizableTd>
      <ResizableTd index={1} canResize={canResize} onResize={onResize} style={{ verticalAlign: 'middle' }}>
        {legalName}
        {englishName ? (
          <>
            <br />
            <span style={{ fontStyle: 'italic' }}>{englishName}</span>
          </>
        ) : null}
      </ResizableTd>
      <ResizableTd index={2} canResize={canResize} onResize={onResize} style={{ verticalAlign: 'middle', textAlign: 'center', whiteSpace: 'nowrap' }}>
        <ParticipantLogo src={p.logo_url} />
      </ResizableTd>
      <ResizableTd index={3} canResize={canResize} onResize={onResize} style={{ verticalAlign: 'middle' }}>
        {allBadges.length === 0 ? null : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', alignItems: 'center' }}>
            {allBadges}
          </div>
        )}
      </ResizableTd>
      <ResizableTd index={4} canResize={canResize} onResize={onResize} style={{ verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
        {typeCode}
      </ResizableTd>
      <ResizableTd index={5} canResize={canResize} onResize={onResize} style={{ verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
        {p.country || '—'}
      </ResizableTd>
    </tr>
  );
}

function ResizableTh({
  index, canResize, onResize, children, ...rest
}: {
  index: number;
  canResize: boolean;
  onResize: (i: number) => (e: React.MouseEvent) => void;
  children: React.ReactNode;
} & React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th {...rest} style={{ position: 'relative', textAlign: 'left', padding: '2px 10px', ...(rest.style || {}) }}>
      {children}
      {canResize && (
        <ColumnResizeGrip onMouseDown={onResize(index)} />
      )}
    </th>
  );
}

function ResizableTd({
  index, canResize, onResize, children, cellRef, ...rest
}: {
  index: number;
  canResize: boolean;
  onResize: (i: number) => (e: React.MouseEvent) => void;
  children: React.ReactNode;
  cellRef?: React.Ref<HTMLTableCellElement>;
} & React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td ref={cellRef} {...rest} style={{ position: 'relative', padding: '2px 10px', ...(rest.style || {}) }}>
      {children}
      {canResize && (
        <ColumnResizeGrip onMouseDown={onResize(index)} />
      )}
    </td>
  );
}

function ColumnResizeGrip({ onMouseDown, style }: { onMouseDown: React.MouseEventHandler<HTMLSpanElement>; style?: React.CSSProperties }) {
  return (
    <span
      onMouseDown={onMouseDown}
      className="column-resize-grip"
      style={{
        position: 'absolute',
        top: 0,
        right: -3,
        width: 6,
        height: '100%',
        cursor: 'col-resize',
        userSelect: 'none',
        zIndex: 5,
        background: 'transparent',
        transition: 'background 120ms ease',
        ...style,
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLSpanElement).style.background = 'rgba(37, 99, 235, 0.35)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLSpanElement).style.background = 'transparent'; }}
    />
  );
}
