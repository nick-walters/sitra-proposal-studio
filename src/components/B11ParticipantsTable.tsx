import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ORGANISATION_CATEGORY_LABELS, OrganisationCategory } from '@/types/proposal';
import { useStorageUrl } from '@/hooks/useStorageUrl';
import { useColumnResize } from '@/hooks/useColumnResize';
import { useProposalRole } from '@/hooks/useProposalRole';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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

function ParticipantBubble({ number, shortName }: { number: number | null; shortName: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        backgroundColor: '#000000',
        color: '#FFFFFF',
        border: '1.5px solid #000000',
        borderRadius: '9999px',
        fontFamily: baseFont,
        fontSize: '11pt',
        fontWeight: 700,
        fontStyle: 'normal',
        lineHeight: 1,
        padding: '0px 5px',
        whiteSpace: 'nowrap',
      }}
    >
      {number ?? '—'}. {shortName}
    </span>
  );
}

const roleBadgeBase: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0px 5px',
  borderRadius: 9999,
  fontFamily: baseFont,
  fontSize: '9pt',
  fontWeight: 700,
  lineHeight: 1.2,
  whiteSpace: 'nowrap',
};

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
              <ResizableTh index={0} canResize={canResize} onResize={handleColResizeStart} style={{ whiteSpace: 'nowrap', width: '1%', textAlign: 'left' }}>
                № &amp; short name
              </ResizableTh>
              <ResizableTh index={1} canResize={canResize} onResize={handleColResizeStart} colSpan={3} style={{ textAlign: 'left' }}>
                Participant organisation legal name, <em style={{ fontWeight: 'bold' }}>English name</em> &amp; roles
              </ResizableTh>
              <ResizableTh index={4} canResize={canResize} onResize={handleColResizeStart} style={{ whiteSpace: 'nowrap', width: '1%', textAlign: 'left' }}>
                Type
              </ResizableTh>
              <ResizableTh index={5} canResize={canResize} onResize={handleColResizeStart} style={{ whiteSpace: 'nowrap', width: '1%', textAlign: 'left' }}>
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
}

function ParticipantRowView({ p, isCoord, wpLed, caseLed }: RowProps) {
  const legalName = p.organisation_name || '';
  const englishName =
    p.english_name && p.english_name.trim().toLowerCase() !== legalName.trim().toLowerCase()
      ? p.english_name
      : '';
  const typeCode = p.organisation_category ? String(p.organisation_category).toUpperCase() : '—';

  const nameCellRef = useRef<HTMLTableCellElement>(null);
  const [grouped, setGrouped] = useState(false);

  // Detect whether the legal/english name column wraps to >2 lines when badges
  // are rendered on a single line. If so, fall back to grouped (max 2 lines).
  useLayoutEffect(() => {
    const el = nameCellRef.current;
    if (!el) return;
    const measure = () => {
      // Use a temp inline element to get accurate line height for current font.
      const probe = document.createElement('span');
      probe.style.visibility = 'hidden';
      probe.style.position = 'absolute';
      probe.textContent = 'M';
      el.appendChild(probe);
      const lineH = probe.getBoundingClientRect().height || 18;
      el.removeChild(probe);
      const maxAllowed = lineH * 2 + 2;
      const overflow = el.scrollHeight > maxAllowed;
      setGrouped((prev) => (prev !== overflow ? overflow : prev));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [legalName, englishName, isCoord, wpLed.length, caseLed.length]);

  const coordBadges = isCoord ? [
    <Tooltip key="coord">
      <TooltipTrigger asChild>
        <span style={{ ...roleBadgeBase, backgroundColor: '#000', color: '#fff', border: '1.5px solid #000' }}>Coord</span>
      </TooltipTrigger>
      <TooltipContent>Project coordinator</TooltipContent>
    </Tooltip>
  ] : [];
  const wpBadges = wpLed.map((wp) => (
    <Tooltip key={`wp-${wp.number}`}>
      <TooltipTrigger asChild>
        <span style={{ ...roleBadgeBase, backgroundColor: wp.color, color: '#fff' }}>WP{wp.number}</span>
      </TooltipTrigger>
      <TooltipContent>{wp.shortName ? `${wp.shortName} (Lead)` : `WP${wp.number} Lead`}</TooltipContent>
    </Tooltip>
  ));
  const caseBadges = caseLed.map((c) => (
    <Tooltip key={`case-${c.number}`}>
      <TooltipTrigger asChild>
        <span style={{ ...roleBadgeBase, backgroundColor: '#fff', color: '#000', border: '1.5px solid #000' }}>
          {c.prefix ? `${c.prefix}${c.number}` : (c.shortName || c.number)}
        </span>
      </TooltipTrigger>
      <TooltipContent>{c.shortName ? `${c.shortName} (Lead)` : `Lead`}</TooltipContent>
    </Tooltip>
  ));

  // Build line groups based on `grouped` flag.
  const groups: React.ReactNode[][] = [];
  if (!grouped) {
    const all = [...coordBadges, ...wpBadges, ...caseBadges];
    if (all.length) groups.push(all);
  } else {
    if (coordBadges.length) groups.push(coordBadges);
    if (wpBadges.length) groups.push(wpBadges);
    if (caseBadges.length) groups.push(caseBadges);
    while (groups.length > 2) {
      const last = groups.pop()!;
      groups[groups.length - 1] = [...groups[groups.length - 1], ...last];
    }
  }

  return (
    <tr>
      <ResizableTd index={0} style={{ verticalAlign: 'middle', whiteSpace: 'nowrap', width: '1%' }}>
        <ParticipantBubble
          number={p.participant_number}
          shortName={p.organisation_short_name || ''}
        />
      </ResizableTd>
      <ResizableTd index={1} cellRef={nameCellRef} style={{ verticalAlign: 'middle' }}>
        {legalName}
        {englishName ? (
          <>
            <br />
            <span style={{ fontStyle: 'italic' }}>{englishName}</span>
          </>
        ) : null}
      </ResizableTd>
      <ResizableTd index={2} style={{ verticalAlign: 'middle', textAlign: 'center', whiteSpace: 'nowrap', width: '1%' }}>
        <ParticipantLogo src={p.logo_url} />
      </ResizableTd>
      <ResizableTd index={3} style={{ verticalAlign: 'middle', whiteSpace: 'nowrap', width: '1%' }}>
        {groups.length === 0 ? null : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-start' }}>
            {groups.map((line, i) => (
              <div key={i} style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                {line}
              </div>
            ))}
          </div>
        )}
      </ResizableTd>
      <ResizableTd index={4} style={{ verticalAlign: 'middle', whiteSpace: 'nowrap', width: '1%' }}>
        {typeCode}
      </ResizableTd>
      <ResizableTd index={5} style={{ verticalAlign: 'middle', whiteSpace: 'nowrap', width: '1%' }}>
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
    <th {...rest} style={{ position: 'relative', textAlign: 'left', ...(rest.style || {}) }}>
      {children}
      {canResize && (
        <span
          onMouseDown={onResize(index)}
          style={{
            position: 'absolute',
            top: 0,
            right: -2,
            width: 4,
            height: '100%',
            cursor: 'col-resize',
            userSelect: 'none',
            zIndex: 2,
          }}
        />
      )}
    </th>
  );
}
