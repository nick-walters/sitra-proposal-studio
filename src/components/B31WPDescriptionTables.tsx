import { Crown } from 'lucide-react';
import React from 'react';
import DOMPurify from 'dompurify';
import { CROSS_REF_RICH_TEXT_CONFIG } from '@/lib/sanitizePresets';
import { renderRefBadges } from '@/lib/renderRefBadges';
import { RefDataProvider, useRefSnapshot } from '@/lib/refDataContext';
import { EditableCaption } from '@/components/EditableCaption';

import type { B31WPData, B31Participant, B31Task } from '@/hooks/useB31SectionData';
import { ALL_PARTICIPANTS_LABEL, coversAllParticipants } from '@/lib/taskParticipantDisplay';
import { B31Pill, WPBubble, ParticipantBubble } from './B31Pill';
import { TABLE_FONT_FAMILY, TABLE_FONT_SIZE } from '@/lib/tableStyleSpec';
import { ensureRichHtml } from '@/lib/richTextUpgrade';

/* DECLARED EXCEPTION: the WP description table keeps its own layout and
   borders, but takes the font and size from the shared spec so it stays
   consistent with every other table. */
const tableStyles = "font-['Times_New_Roman',Times,serif] text-[11pt]";
const tableFontStyle = { fontFamily: TABLE_FONT_FAMILY, fontSize: TABLE_FONT_SIZE } as const;

interface Props {
  wpData: B31WPData[];
  participants: B31Participant[];
  proposalId: string;
  projectDuration?: number;
}

/* ── Read-only rich-text renderer (Times New Roman 11pt, justified) ── */
function ReadOnlyRichText({
  html,
  placeholder,
  inline = false,
}: {
  html: string | null | undefined;
  placeholder?: string;
  /** Single-line title mirrors: no block margins, inherits the caller's type. */
  inline?: boolean;
}) {
  const refData = useRefSnapshot();
  const raw = ensureRichHtml(html);
  const isEmpty = !raw || raw.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, '').trim() === '';
  if (isEmpty) {
    return placeholder ? (
      <span className="text-muted-foreground italic">{placeholder}</span>
    ) : null;
  }
  const safe = renderRefBadges(String(DOMPurify.sanitize(raw, CROSS_REF_RICH_TEXT_CONFIG)), refData);
  if (inline) {
    return <span className="[&_p]:m-0 [&_p]:inline" dangerouslySetInnerHTML={{ __html: safe }} />;
  }
  return (
    <div
      className="font-['Times_New_Roman',Times,serif] text-[11pt] text-justify [&_p]:mt-[3pt] [&_p]:mb-[3pt] [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-[calc(1.5em-4pt)] [&_ol]:pl-[calc(1.5em-4pt)] [&_li::marker]:text-[0.85em] [&_li]:my-[1pt]"
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}

/* ── Read-only plain text ── */
function ReadOnlyText({ value, placeholder, className, style }: { value: string | null | undefined; placeholder?: string; className?: string; style?: React.CSSProperties }) {
  const v = (value ?? '').toString();
  if (!v.trim()) {
    return placeholder ? <span className="text-muted-foreground italic">{placeholder}</span> : null;
  }
  return (
    <span className={className} style={style}>{v}</span>
  );
}

/* ── Read-only leader pill (no popover) ── */
function LeaderPill({ leader, placeholder }: { leader: B31Participant | undefined; placeholder?: string }) {
  if (!leader) {
    return <span className="text-muted-foreground text-[9pt] italic">{placeholder || '—'}</span>;
  }
  return (
    <ParticipantBubble
      showCrown
      shortName={leader.organisation_short_name || leader.organisation_name}
      style={{ fontStyle: 'normal' }}
    />
  );
}

/* ── Spacer row with optional colour-coded border ── */
function SpacerRow({ color }: { color?: string }) {
  return (
    <tr>
      <td
        colSpan={3}
        style={{
          fontSize: '1pt',
          lineHeight: '1pt',
          height: '12px',
          padding: 0,
          userSelect: 'none',
          pointerEvents: 'none',
          border: 'none',
          verticalAlign: 'middle',
        }}
        contentEditable={false}
      >
        {color ? (
          <div style={{ width: '100%', height: '1px', backgroundColor: color }} />
        ) : (
          <>&nbsp;</>
        )}
      </td>
    </tr>
  );
}

function formatMonth(m: number | null | undefined): string | null {
  return m != null ? `M${String(m).padStart(2, '0')}` : null;
}

function TaskGroup({
  task,
  wp,
  participants,
}: {
  task: B31Task;
  wp: B31WPData;
  participants: B31Participant[];
}) {
  const leader = participants.find((p) => p.id === task.lead_participant_id);
  const partnerIds = (task.participants || []).map((p) => p.participant_id).filter((id) => id !== task.lead_participant_id);
  const partners = participants.filter((p) => partnerIds.includes(p.id));
  // Shared display rule (src/lib/taskParticipantDisplay.ts): when the selection
  // covers every participant except the task leader, collapse the partner
  // badges into a single "All participants" bubble.
  const showAllBadge = coversAllParticipants(
    participants.map((p) => p.id),
    task.lead_participant_id,
    partnerIds,
  );
  const start = formatMonth(task.start_month);
  const end = formatMonth(task.end_month);

  return (
    <tbody>
      <SpacerRow color={wp.color} />
      {/* Task header */}
      <tr>
        <td colSpan={2} className="font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight"
          style={{ padding: '1px 0', border: 'none' }}
        >
          <div className="flex items-center gap-1">
            <B31Pill variant="outline" color={wp.color}>
              T{wp.number}.{task.number}
            </B31Pill>
            <span className="font-bold text-[11pt] font-['Times_New_Roman',Times,serif] leading-tight flex-1">
              <ReadOnlyRichText html={task.title} placeholder="Untitled task" inline />
            </span>
          </div>
        </td>
      </tr>

      {/* Meta row: leader + partners + duration */}
      <tr>
        <td className="font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight align-middle py-0"
          style={{ border: 'none', paddingLeft: 0, paddingRight: 0 }}
        >
          <div className="flex items-center justify-between flex-wrap" style={{ gap: 3 }}>
            <div className="flex items-center flex-wrap" style={{ gap: 3 }}>
              <span className="inline-flex items-center" style={{ marginRight: 11 }}>
                <LeaderPill leader={leader} placeholder="No task leader" />
              </span>
              {showAllBadge ? (
                <ParticipantBubble style={{ fontStyle: 'normal' }}>
                  {ALL_PARTICIPANTS_LABEL}
                </ParticipantBubble>
              ) : (
                partners.map((p) => (
                  <ParticipantBubble
                    key={p.id}
                    shortName={p.organisation_short_name || p.organisation_name}
                    style={{ fontStyle: 'normal' }}
                  />
                ))
              )}
            </div>

            <span className="font-bold text-[11pt] font-['Times_New_Roman',Times,serif] whitespace-nowrap">
              {start && end ? `${start}–${end}` : start ? `${start}–M??` : (
                <span className="text-muted-foreground italic font-normal">Duration not set</span>
              )}
            </span>
          </div>
        </td>
      </tr>

      {/* Description */}
      <tr>
        <td colSpan={2} className="font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight align-top"
          style={{ border: 'none', padding: '2px 0' }}
        >
          <ReadOnlyRichText html={task.description} placeholder="No task description yet" />
        </td>
      </tr>
    </tbody>
  );
}

/* ── Main read-only WP descriptions mirror (Table 3.1.b) ── */
export function B31WPDescriptionTables(props: Props) {
  return (
    <RefDataProvider proposalId={props.proposalId}>
      <B31WPDescriptionTablesInner {...props} />
    </RefDataProvider>
  );
}

function B31WPDescriptionTablesInner({ wpData, participants, proposalId }: Props) {
  if (!wpData || wpData.length === 0) return null;

  return (
    <div className="mirror-surface">
      <EditableCaption
        proposalId={proposalId}
        tableKey="table-3.1.b"
        label="Table 3.1.b."
        defaultCaption="Work package descriptions"
        className="mb-0"
        suffixSpacing={false}
        suffix={
          <span className="font-normal italic whitespace-nowrap">
            , where{' '}
            <Crown
              className="h-2.5 w-2.5 inline-block align-baseline fill-black"
              strokeWidth={0}
              style={{ position: 'relative', top: '0.5px' }}
            />
            {' '}denotes the WP or task leader
          </span>
        }
      />
      {wpData.map((wp) => {
        const shortName = wp.short_name || '';
        const title = wp.title || '';
        const wpLeader = participants.find((p) => p.id === wp.lead_participant_id);

        const starts = wp.tasks.map((t) => t.start_month).filter((m): m is number => m != null);
        const ends = wp.tasks.map((t) => t.end_month).filter((m): m is number => m != null);
        const monthRange = starts.length > 0 && ends.length > 0
          ? `M${String(Math.min(...starts)).padStart(2, '0')}–M${String(Math.max(...ends)).padStart(2, '0')}`
          : null;

        return (
          <div key={wp.id}>
            <div style={{ height: '0.7em' }} />
            {/* Table 3.1.b keeps its fixed layout and is the one Part B table
                without draggable columns — its structure is prescribed. */}
            <table
              data-table-key="wp-descriptions"
              className={`${tableStyles} w-full border-collapse`}
              style={tableFontStyle}
            >
              <tbody>
                {/* WP Header */}
                <tr>
                  <td colSpan={2} className="font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight"
                    style={{ padding: 0, border: 'none' }}
                  >
                    <WPBubble
                      wpColor={wp.color}
                      style={{ alignItems: 'baseline', justifyContent: 'flex-start', width: '100%', height: 'auto', padding: '0 6px' }}
                    >
                      <span className="text-white">
                        WP{wp.number}: {shortName}
                        {shortName && title ? ' — ' : ''}{title}
                      </span>
                    </WPBubble>
                  </td>
                </tr>

                <tr><td colSpan={2} style={{ border: 'none', padding: 0, height: '3px', lineHeight: '3px', fontSize: '1pt' }} /></tr>

                {/* WP leader + duration */}
                <tr>
                  <td className="font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight align-middle py-0"
                    style={{ border: 'none', paddingLeft: 0, paddingRight: 0 }}
                  >
                    <div className="flex items-center justify-between flex-wrap gap-0.5">
                      <div className="flex items-center gap-0.5">
                        <LeaderPill leader={wpLeader} placeholder="No WP leader" />
                      </div>
                      <span className="font-bold text-[11pt] font-['Times_New_Roman',Times,serif] whitespace-nowrap" style={{ color: '#000000' }}>
                        {monthRange || <span className="text-muted-foreground italic font-normal">—</span>}
                      </span>
                    </div>
                  </td>
                </tr>

                <SpacerRow color={wp.color} />

                {/* Objectives (from wp_drafts.objectives — source of truth) */}
                <tr>
                  <td colSpan={2} className="font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight align-top"
                    style={{ border: 'none', padding: '2px 0' }}
                  >
                    <ReadOnlyRichText html={wp.objectives} placeholder="No objectives in WP draft yet" />
                  </td>
                </tr>

                {/* Optional description before tasks */}
                {wp.description_before_tasks && wp.description_before_tasks.replace(/<[^>]*>/g, '').trim() !== '' && (
                  <tr>
                    <td colSpan={2} className="font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight align-top"
                      style={{ border: 'none', padding: '2px 0' }}
                    >
                      <ReadOnlyRichText html={wp.description_before_tasks} />
                    </td>
                  </tr>
                )}
              </tbody>

              {/* Tasks */}
              {wp.tasks.map((task) => (
                <TaskGroup key={task.id} task={task} wp={wp} participants={participants} />
              ))}

              <tbody>
                <SpacerRow color={wp.color} />
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
