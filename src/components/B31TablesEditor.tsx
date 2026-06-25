import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import DOMPurify from 'dompurify';
import { supabase } from '@/integrations/supabase/client';
import { EditableCaption } from '@/components/EditableCaption';
import { DEFAULT_WP_COLORS } from '@/lib/wpColors';
import { RICH_TEXT_CONFIG } from '@/lib/sanitizePresets';
import { WPBubble, ParticipantBubble, RiskBadge } from './B31Pill';

/**
 * B31TablesEditor — Stage 1 read-only mirrors.
 *
 * The three exported tables (3.1.c deliverables, 3.1.d milestones, 3.1.e risks)
 * are pure read-only displays of the LIVE source data in
 * wp_draft_deliverables / wp_draft_milestones / wp_draft_risks. There are no
 * inline edits, no dropdowns, no drag handles, no add/delete row controls.
 */

interface Props {
  proposalId: string;
}

const tableCls = "w-full border-collapse font-['Times_New_Roman',Times,serif] text-[11pt]";
const thCls = "text-left font-bold border-b border-black/30 px-2 py-1 text-[10pt] align-bottom";
const tdCls = "border-b border-black/10 px-2 py-1 align-top";

function useWPLookup(proposalId: string) {
  return useQuery({
    queryKey: ['wp-drafts-for-b31-mirror', proposalId],
    enabled: !!proposalId,
    queryFn: async () => {
      const { data } = await supabase
        .from('wp_drafts')
        .select('id, number, title, short_name, color')
        .eq('proposal_id', proposalId)
        .order('number');
      const list = (data || []).map((wp: any) => ({
        ...wp,
        color: wp.color || DEFAULT_WP_COLORS[(wp.number - 1) % DEFAULT_WP_COLORS.length],
      }));
      const byId = new Map(list.map((wp: any) => [wp.id, wp]));
      const byNumber = new Map(list.map((wp: any) => [wp.number, wp]));
      return { list, byId, byNumber };
    },
  });
}

function useParticipantLookup(proposalId: string) {
  return useQuery({
    queryKey: ['b31-participants-mirror', proposalId],
    enabled: !!proposalId,
    queryFn: async () => {
      const { data } = await supabase
        .from('participants')
        .select('id, participant_number, organisation_short_name, organisation_name')
        .eq('proposal_id', proposalId)
        .order('participant_number');
      const list = data || [];
      return { list, byId: new Map(list.map((p: any) => [p.id, p])) };
    },
  });
}

function ReadOnlyHtmlCell({ html }: { html: string | null | undefined }) {
  const raw = (html ?? '').toString();
  if (!raw || raw.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, '').trim() === '') {
    return <span className="text-muted-foreground italic">—</span>;
  }
  return (
    <div
      className="font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight"
      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(raw, RICH_TEXT_CONFIG) }}
    />
  );
}

function ReadOnlyTextCell({ text }: { text: string | null | undefined }) {
  const v = (text ?? '').toString();
  if (!v.trim()) return <span className="text-muted-foreground italic">—</span>;
  return <span>{v}</span>;
}

function MonthLabel({ m }: { m: number | null | undefined }) {
  if (m == null) return <span className="text-muted-foreground italic">—</span>;
  return <span>M{String(m).padStart(2, '0')}</span>;
}

function DeliverablePentagon({ label, color }: { label: string; color?: string }) {
  const stroke = color || '#000';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
      height: '17px', padding: '0 10px 0 5px', fontFamily: "'Times New Roman', Times, serif",
      fontSize: '11pt', fontWeight: 700, lineHeight: 1, color: stroke, whiteSpace: 'nowrap',
    }}>
      <span style={{
        position: 'absolute', inset: 0, backgroundColor: stroke,
        clipPath: 'polygon(0% 0%, calc(100% - 8px) 0%, 100% 50%, calc(100% - 8px) 100%, 0% 100%)',
      }} />
      <span style={{
        position: 'absolute', top: '1.5px', bottom: '1.5px', left: '1.5px', right: '2.5px',
        backgroundColor: '#ffffff',
        clipPath: 'polygon(0% 0%, calc(100% - 7px) 0%, 100% 50%, calc(100% - 7px) 100%, 0% 100%)',
      }} />
      <span style={{ position: 'relative', zIndex: 1 }}>{label}</span>
    </span>
  );
}

function MilestoneBadge({ number }: { number: number | null | undefined }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: '#000', color: '#fff', fontFamily: "'Times New Roman', Times, serif",
      fontSize: '11pt', fontWeight: 700, lineHeight: '18px', height: '18px', padding: '0 4px',
      clipPath: 'polygon(12% 0%, 88% 0%, 100% 50%, 88% 100%, 12% 100%, 0% 50%)',
    }}>
      MS{number ?? ''}
    </span>
  );
}

/** Parse a comma/space list of WP numbers (e.g. "1, 3, WP5") into number[]. */
function parseWPList(s: string | null | undefined): number[] {
  if (!s) return [];
  return s.split(/[,;\s]+/)
    .map((t) => t.replace(/^WP/i, '').trim())
    .filter(Boolean)
    .map((t) => parseInt(t, 10))
    .filter((n) => Number.isFinite(n));
}

// ============================================================
// Table 3.1.c — Deliverables (read-only mirror)
// ============================================================
export function B31DeliverablesTable({ proposalId }: Props) {
  const { data: wpInfo } = useWPLookup(proposalId);
  const { data: partInfo } = useParticipantLookup(proposalId);

  const { data: deliverables = [] } = useQuery({
    queryKey: ['b31-deliverables-live', proposalId],
    enabled: !!proposalId && !!wpInfo,
    queryFn: async () => {
      const wpIds = wpInfo!.list.map((wp: any) => wp.id);
      if (wpIds.length === 0) return [];
      const { data } = await supabase
        .from('wp_draft_deliverables')
        .select('id, wp_draft_id, number, title, type, dissemination_level, responsible_participant_id, due_month, description, order_index')
        .in('wp_draft_id', wpIds);
      return (data || []).map((d: any) => {
        const wp = wpInfo!.byId.get(d.wp_draft_id);
        return { ...d, wp };
      }).sort((a: any, b: any) => {
        const wa = a.wp?.number ?? 999;
        const wb = b.wp?.number ?? 999;
        if (wa !== wb) return wa - wb;
        return (a.number ?? 0) - (b.number ?? 0);
      });
    },
  });

  return (
    <div>
      <EditableCaption
        proposalId={proposalId}
        tableKey="table-3.1.c"
        label="Table 3.1.c."
        defaultCaption="Deliverables, including the partner responsible, type, dissemination level & month due"
        className="mb-0"
      />
      <table className={tableCls}>
        <thead>
          <tr>
            <th className={thCls} style={{ width: 60 }}>No.</th>
            <th className={thCls}>Deliverable title</th>
            <th className={thCls} style={{ width: 50 }}>WP</th>
            <th className={thCls} style={{ width: 90 }}>Lead</th>
            <th className={thCls} style={{ width: 60 }}>Type</th>
            <th className={thCls} style={{ width: 60 }}>Diss.</th>
            <th className={thCls} style={{ width: 50 }}>Due</th>
          </tr>
        </thead>
        <tbody>
          {deliverables.length === 0 && (
            <tr>
              <td colSpan={7} className={tdCls + ' text-muted-foreground italic'}>
                No deliverables in WP drafts yet.
              </td>
            </tr>
          )}
          {deliverables.map((d: any) => {
            const lead = d.responsible_participant_id ? partInfo?.byId.get(d.responsible_participant_id) : undefined;
            const wp = d.wp;
            const delLabel = wp ? `D${wp.number}.${d.number}` : `D?.${d.number}`;
            return (
              <tr key={d.id}>
                <td className={tdCls} style={{ whiteSpace: 'nowrap' }}>
                  <DeliverablePentagon label={delLabel} color={wp?.color} />
                </td>
                <td className={tdCls}><ReadOnlyTextCell text={d.title} /></td>
                <td className={tdCls}>
                  {wp ? <WPBubble wpNumber={wp.number} wpColor={wp.color} /> : <span className="text-muted-foreground italic">—</span>}
                </td>
                <td className={tdCls}>
                  {lead ? (
                    <ParticipantBubble shortName={lead.organisation_short_name || lead.organisation_name} />
                  ) : (
                    <span className="text-muted-foreground italic">—</span>
                  )}
                </td>
                <td className={tdCls}><ReadOnlyTextCell text={d.type} /></td>
                <td className={tdCls}><ReadOnlyTextCell text={d.dissemination_level} /></td>
                <td className={tdCls}><MonthLabel m={d.due_month} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// Table 3.1.d — Milestones (read-only mirror, proposal_milestones)
// ============================================================
export function B31MilestonesTable({ proposalId }: Props) {
  const { data: wpInfo } = useWPLookup(proposalId);

  const { data: milestones = [] } = useQuery({
    queryKey: ['b31-milestones-live', proposalId],
    enabled: !!proposalId,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from('proposal_milestones')
        .select('id, number, title, due_month, means_of_verification, order_index')
        .eq('proposal_id', proposalId)
        .order('number');
      const ids = (rows || []).map((m: any) => m.id);
      let linkMap = new Map<string, string[]>();
      if (ids.length > 0) {
        const { data: links } = await supabase
          .from('proposal_milestone_wps')
          .select('milestone_id, wp_draft_id')
          .in('milestone_id', ids);
        for (const l of links || []) {
          const arr = linkMap.get(l.milestone_id) || [];
          arr.push(l.wp_draft_id);
          linkMap.set(l.milestone_id, arr);
        }
      }
      return (rows || []).map((m: any) => ({ ...m, _wpIds: linkMap.get(m.id) || [] }));
    },
  });

  // Auto-order: due_month asc (nulls last), then min related WP number, then id.
  const sortedMilestones = useMemo(() => {
    const minWpNum = (m: any) => {
      const nums = (m._wpIds as string[])
        .map(id => wpInfo?.byId.get(id)?.number)
        .filter((n: any) => typeof n === 'number') as number[];
      return nums.length ? Math.min(...nums) : Number.POSITIVE_INFINITY;
    };
    return [...milestones].sort((a: any, b: any) => {
      const da = a.due_month ?? Number.POSITIVE_INFINITY;
      const db = b.due_month ?? Number.POSITIVE_INFINITY;
      if (da !== db) return da - db;
      const wa = minWpNum(a);
      const wb = minWpNum(b);
      if (wa !== wb) return wa - wb;
      return String(a.id).localeCompare(String(b.id));
    });
  }, [milestones, wpInfo]);

  return (
    <div>
      <EditableCaption
        proposalId={proposalId}
        tableKey="table-3.1.d"
        label="Table 3.1.d."
        defaultCaption="Milestones"
        className="mb-0"
      />
      <table className={tableCls}>
        <thead>
          <tr>
            <th className={thCls} style={{ width: 60 }}>No.</th>
            <th className={thCls}>Milestone name</th>
            <th className={thCls} style={{ width: 80 }}>WPs</th>
            <th className={thCls} style={{ width: 50 }}>Due</th>
            <th className={thCls}>Means of verification</th>
          </tr>
        </thead>
        <tbody>
          {milestones.length === 0 && (
            <tr>
              <td colSpan={5} className={tdCls + ' text-muted-foreground italic'}>
                No milestones yet.
              </td>
            </tr>
          )}
          {milestones.map((m: any) => {
            const wps = (m._wpIds as string[])
              .map((id) => wpInfo?.byId.get(id))
              .filter(Boolean)
              .sort((a: any, b: any) => a.number - b.number);
            return (
              <tr key={m.id}>
                <td className={tdCls}><MilestoneBadge number={m.number} /></td>
                <td className={tdCls}><ReadOnlyTextCell text={m.title} /></td>
                <td className={tdCls}>
                  <div className="flex flex-wrap gap-0.5">
                    {wps.length === 0 && <span className="text-muted-foreground italic">—</span>}
                    {wps.map((wp: any) => (
                      <WPBubble key={wp.id} wpNumber={wp.number} wpColor={wp.color} />
                    ))}
                  </div>
                </td>
                <td className={tdCls}><MonthLabel m={m.due_month} /></td>
                <td className={tdCls}><ReadOnlyHtmlCell html={m.means_of_verification} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}


// ============================================================
// Table 3.1.e — Critical risks (read-only mirror, proposal_risks)
// ============================================================
export function B31RisksTable({ proposalId }: Props) {
  const { data: wpInfo } = useWPLookup(proposalId);

  const { data: risks = [] } = useQuery({
    queryKey: ['b31-risks-live', proposalId],
    enabled: !!proposalId,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from('proposal_risks')
        .select('id, number, title, likelihood, severity, mitigation, order_index')
        .eq('proposal_id', proposalId)
        .order('number');
      const ids = (rows || []).map((r: any) => r.id);
      let linkMap = new Map<string, string[]>();
      if (ids.length > 0) {
        const { data: links } = await supabase
          .from('proposal_risk_wps')
          .select('risk_id, wp_draft_id')
          .in('risk_id', ids);
        for (const l of links || []) {
          const arr = linkMap.get(l.risk_id) || [];
          arr.push(l.wp_draft_id);
          linkMap.set(l.risk_id, arr);
        }
      }
      return (rows || []).map((r: any) => ({ ...r, _wpIds: linkMap.get(r.id) || [] }));
    },
  });

  return (
    <div>
      <EditableCaption
        proposalId={proposalId}
        tableKey="table-3.1.e"
        label="Table 3.1.e."
        defaultCaption="Critical risks"
        className="mb-0"
      />
      <table className={tableCls}>
        <thead>
          <tr>
            <th className={thCls} style={{ width: '25%' }}>Risk</th>
            <th className={thCls + ' text-center'} style={{ width: 30 }}>i.</th>
            <th className={thCls + ' text-center'} style={{ width: 30 }}>ii.</th>
            <th className={thCls} style={{ width: 100 }}>WPs</th>
            <th className={thCls}>Mitigation & adaptation measures</th>
          </tr>
        </thead>
        <tbody>
          {risks.length === 0 && (
            <tr>
              <td colSpan={5} className={tdCls + ' text-muted-foreground italic'}>
                No risks yet.
              </td>
            </tr>
          )}
          {risks.map((r: any) => {
            const wps = (r._wpIds as string[])
              .map((id) => wpInfo?.byId.get(id))
              .filter(Boolean)
              .sort((a: any, b: any) => a.number - b.number);
            return (
              <tr key={r.id}>
                <td className={tdCls}><ReadOnlyHtmlCell html={r.title} /></td>
                <td className={tdCls + ' text-center'}>
                  {r.likelihood ? <RiskBadge level={r.likelihood as 'L' | 'M' | 'H'} /> : <span className="text-muted-foreground">—</span>}
                </td>
                <td className={tdCls + ' text-center'}>
                  {r.severity ? <RiskBadge level={r.severity as 'L' | 'M' | 'H'} /> : <span className="text-muted-foreground">—</span>}
                </td>
                <td className={tdCls}>
                  <div className="flex flex-wrap gap-0.5">
                    {wps.length === 0 && <span className="text-muted-foreground italic">—</span>}
                    {wps.map((wp: any) => (
                      <WPBubble key={wp.id} wpNumber={wp.number} wpColor={wp.color} />
                    ))}
                  </div>
                </td>
                <td className={tdCls}><ReadOnlyHtmlCell html={r.mitigation} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}


// Wrapper kept for backward compatibility.
export function B31TablesEditor({ proposalId }: Props) {
  return (
    <div className="space-y-8">
      <B31DeliverablesTable proposalId={proposalId} />
      <B31MilestonesTable proposalId={proposalId} />
      <B31RisksTable proposalId={proposalId} />
    </div>
  );
}
