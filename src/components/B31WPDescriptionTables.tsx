import React, { useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Crown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { B31WPData, B31Participant } from '@/hooks/useB31SectionData';

const tableStyles = "font-['Times_New_Roman',Times,serif] text-[11pt]";
const cellStyles = "border px-0.5 py-0 font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight align-middle";
const editableCellStyles = `${cellStyles} cursor-text hover:bg-muted/30`;

interface Props {
  wpData: B31WPData[];
  participants: B31Participant[];
  proposalId: string;
}

/* ── Participant bubble ── */
function ParticipantBubble({ participant, showCrown = false }: { participant: B31Participant; showCrown?: boolean }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9pt] font-bold italic whitespace-nowrap align-middle"
      style={{ backgroundColor: '#000000', color: '#FFFFFF', lineHeight: 1 }}
    >
      {showCrown && <Crown className="h-2.5 w-2.5 mr-0.5 fill-white" strokeWidth={0} />}
      {participant.organisation_short_name || participant.organisation_name}
    </span>
  );
}

/* ── Single-select participant picker (with deselect support) ── */
function LeaderPicker({
  entityId,
  entityTable,
  currentLeaderId,
  participants,
  proposalId,
  showCrown = false,
  arrowPosition = 'right',
}: {
  entityId: string;
  entityTable: 'wp_drafts' | 'wp_draft_tasks';
  currentLeaderId: string | null;
  participants: B31Participant[];
  proposalId: string;
  showCrown?: boolean;
  arrowPosition?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const leader = participants.find(p => p.id === currentLeaderId);

  const select = async (pid: string | null) => {
    setOpen(false);
    await supabase.from(entityTable).update({ lead_participant_id: pid }).eq('id', entityId);
    queryClient.invalidateQueries({ queryKey: ['b31-wp-data', proposalId] });
  };

  const arrow = <ChevronsUpDown className="h-3 w-3 opacity-50 shrink-0" />;
  const content = leader ? (
    <ParticipantBubble participant={leader} showCrown={showCrown} />
  ) : (
    <span className="text-muted-foreground text-[9pt] italic">{entityTable === 'wp_drafts' ? 'Select WP leader' : 'Select task leader'}</span>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1 cursor-pointer hover:opacity-80">
          {arrowPosition === 'left' ? <>{arrow}{content}</> : <>{content}{arrow}</>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" align="start">
        <div className="max-h-[200px] overflow-y-auto">
          {currentLeaderId && (
            <button
              className="flex items-center gap-2 w-full px-2 py-1.5 text-sm hover:bg-accent cursor-pointer text-muted-foreground italic"
              onClick={() => select(null)}
            >
              Clear selection
            </button>
          )}
          {participants.map(p => (
            <button
              key={p.id}
              className={cn(
                'flex items-center gap-2 w-full px-2 py-1.5 text-sm hover:bg-accent cursor-pointer',
                p.id === currentLeaderId && 'bg-accent',
              )}
              onClick={() => select(p.id)}
            >
              <div
                className={cn(
                  'flex h-4 w-4 items-center justify-center rounded-full border',
                  p.id === currentLeaderId ? 'bg-primary border-primary' : 'border-muted-foreground',
                )}
              >
                {p.id === currentLeaderId && <Check className="h-3 w-3 text-primary-foreground" />}
              </div>
              <span className="truncate">
                {p.participant_number}. {p.organisation_short_name || p.organisation_name}
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ── Multi-select participant picker (partners) ── */
function PartnersPicker({
  taskId,
  selectedIds,
  participants,
  proposalId,
  leaderId,
}: {
  taskId: string;
  selectedIds: string[];
  participants: B31Participant[];
  proposalId: string;
  leaderId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const filteredSelectedIds = selectedIds.filter(id => id !== leaderId);
  const availableParticipants = participants.filter(p => p.id !== leaderId);

  const toggle = async (pid: string) => {
    const next = filteredSelectedIds.includes(pid)
      ? filteredSelectedIds.filter(id => id !== pid)
      : [...filteredSelectedIds, pid];
    await supabase.from('wp_draft_task_participants').delete().eq('task_id', taskId);
    if (next.length > 0) {
      await supabase
        .from('wp_draft_task_participants')
        .insert(next.map(participant_id => ({ task_id: taskId, participant_id })));
    }
    queryClient.invalidateQueries({ queryKey: ['b31-wp-data', proposalId] });
  };

  const selected = availableParticipants.filter(p => filteredSelectedIds.includes(p.id));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1 flex-wrap cursor-pointer hover:opacity-80">
          {selected.length > 0 ? (
            selected.map(p => (
              <ParticipantBubble key={p.id} participant={p} />
            ))
          ) : (
            <span className="text-muted-foreground text-[9pt] italic">Select participant(s)</span>
          )}
          <ChevronsUpDown className="h-3 w-3 opacity-50 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" align="start">
        <div className="max-h-[200px] overflow-y-auto">
          {availableParticipants.map(p => {
            const isSelected = filteredSelectedIds.includes(p.id);
            return (
              <button
                key={p.id}
                className={cn(
                  'flex items-center gap-2 w-full px-2 py-1.5 text-sm hover:bg-accent cursor-pointer',
                  isSelected && 'bg-accent',
                )}
                onClick={() => toggle(p.id)}
              >
                <div
                  className={cn(
                    'flex h-4 w-4 items-center justify-center rounded-sm border',
                    isSelected ? 'bg-primary border-primary' : 'border-muted-foreground',
                  )}
                >
                  {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                </div>
                <span className="truncate">
                  {p.participant_number}. {p.organisation_short_name || p.organisation_name}
                </span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ── Month range picker ── */
function MonthRangePicker({
  taskId,
  startMonth,
  endMonth,
  proposalId,
}: {
  taskId: string;
  startMonth: number | null;
  endMonth: number | null;
  proposalId: string;
}) {
  const [open, setOpen] = useState(false);
  const [selecting, setSelecting] = useState<'start' | 'end' | null>(null);
  const [localStart, setLocalStart] = useState(startMonth);
  const [localEnd, setLocalEnd] = useState(endMonth);
  const queryClient = useQueryClient();

  const months = Array.from({ length: 60 }, (_, i) => i + 1);

  const save = async (start: number | null, end: number | null) => {
    await supabase.from('wp_draft_tasks').update({ start_month: start, end_month: end }).eq('id', taskId);
    queryClient.invalidateQueries({ queryKey: ['b31-wp-data', proposalId] });
  };

  const handleClick = (m: number) => {
    if (selecting === 'start' || !selecting) {
      setLocalStart(m);
      if (localEnd != null && m > localEnd) {
        setLocalEnd(null);
      }
      setSelecting('end');
    } else {
      if (m < (localStart ?? 1)) {
        // clicked before start, reset
        setLocalStart(m);
        setSelecting('end');
      } else {
        setLocalEnd(m);
        setSelecting(null);
        save(localStart, m);
        setOpen(false);
      }
    }
  };

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      setLocalStart(startMonth);
      setLocalEnd(endMonth);
      setSelecting('start');
    }
  };

  const formatMonth = (m: number | null) => m != null ? `M${String(m).padStart(2, '0')}` : null;

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <button className="cursor-pointer hover:opacity-80 font-['Times_New_Roman',Times,serif] text-[11pt]">
          {startMonth != null && endMonth != null ? (
            <>{formatMonth(startMonth)}–{formatMonth(endMonth)}</>
          ) : startMonth != null ? (
            <>{formatMonth(startMonth)}–<span className="text-muted-foreground italic">M??</span></>
          ) : (
            <span className="text-muted-foreground italic">Duration</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-2" align="start">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-muted-foreground font-medium">
            {selecting === 'start' ? 'Select start month' : selecting === 'end' ? 'Select end month' : 'Select start month'}
          </span>
          {(startMonth != null || endMonth != null) && (
            <button
              className="text-xs text-muted-foreground hover:text-foreground italic cursor-pointer"
              onClick={() => {
                setLocalStart(null);
                setLocalEnd(null);
                save(null, null);
                setOpen(false);
              }}
            >
              Clear selection
            </button>
          )}
        </div>
        <div className="grid grid-cols-6 gap-0.5">
          {months.map(m => {
            const isStart = m === localStart;
            const isEnd = m === localEnd;
            const isInRange = localStart != null && localEnd != null && m >= localStart && m <= localEnd;
            const isPartialRange = selecting === 'end' && localStart != null && localEnd == null && m >= localStart;
            return (
              <button
                key={m}
                className={cn(
                  'px-1 py-0.5 text-xs rounded cursor-pointer text-center',
                  (isStart || isEnd) && 'bg-primary text-primary-foreground font-bold',
                  !isStart && !isEnd && isInRange && 'bg-primary/20',
                  !isStart && !isEnd && !isInRange && isPartialRange && 'bg-primary/10',
                  !isStart && !isEnd && !isInRange && !isPartialRange && 'hover:bg-accent',
                )}
                onClick={() => handleClick(m)}
              >
                M{String(m).padStart(2, '0')}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ── Spacer row ── */
function SpacerRow() {
  return (
    <tr>
      <td
        colSpan={3}
        style={{
          fontSize: '1pt',
          lineHeight: '1pt',
          height: '4px',
          padding: 0,
          userSelect: 'none',
          pointerEvents: 'none',
          border: 'none',
        }}
        contentEditable={false}
      >
        &nbsp;
      </td>
    </tr>
  );
}

/* ── Inline editable text cell ── */
function EditableText({
  value,
  onSave,
  placeholder,
  className,
  inline,
}: {
  value: string;
  onSave: (newValue: string) => void;
  placeholder?: string;
  className?: string;
  inline?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const savedRef = useRef(value);

  const handleBlur = useCallback(() => {
    const current = ref.current?.innerHTML || '';
    if (current !== savedRef.current) {
      savedRef.current = current;
      onSave(current);
    }
  }, [onSave]);

  const Tag = inline ? 'span' : 'div';

  return (
    <Tag
      ref={ref as any}
      contentEditable
      suppressContentEditableWarning
      className={cn(
        "outline-none min-h-[1.2em] font-['Times_New_Roman',Times,serif] text-[11pt]",
        !value && 'text-muted-foreground italic',
        className,
      )}
      onBlur={handleBlur}
      dangerouslySetInnerHTML={{ __html: value || placeholder || '' }}
    />
  );
}

/* ── Inline editable plain text (for headers) ── */
function EditableHeaderText({
  value,
  onSave,
  className,
}: {
  value: string;
  onSave: (newValue: string) => void;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const savedRef = useRef(value);

  const handleBlur = useCallback(() => {
    const current = ref.current?.textContent || '';
    if (current !== savedRef.current) {
      savedRef.current = current;
      onSave(current);
    }
  }, [onSave]);

  return (
    <span
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      className={cn("outline-none font-['Times_New_Roman',Times,serif] text-[11pt]", className)}
      onBlur={handleBlur}
    >
      {value}
    </span>
  );
}

/* ── Caption crown bubble ── */
function CaptionBubble({ showCrown = false }: { showCrown?: boolean }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-1.5 text-[9pt] font-bold whitespace-nowrap align-middle relative"
      style={{ backgroundColor: '#000000', color: '#FFFFFF', lineHeight: 1, top: '-1pt' }}
    >
      {showCrown && <Crown className="h-2.5 w-2.5 fill-white" strokeWidth={0} />}
      {!showCrown && <span style={{ width: '10px', display: 'inline-block' }}>&nbsp;</span>}
    </span>
  );
}

/* ── Main component ── */
export function B31WPDescriptionTables({ wpData, participants, proposalId }: Props) {
  const queryClient = useQueryClient();
  const populatedWPs = wpData;

  if (populatedWPs.length === 0) return null;

  const saveWPField = async (wpId: string, field: string, value: string) => {
    await supabase.from('wp_drafts').update({ [field]: value || null }).eq('id', wpId);
    queryClient.invalidateQueries({ queryKey: ['b31-wp-data', proposalId] });
  };

  const saveTaskField = async (taskId: string, field: string, value: string) => {
    await supabase.from('wp_draft_tasks').update({ [field]: value || null }).eq('id', taskId);
    queryClient.invalidateQueries({ queryKey: ['b31-wp-data', proposalId] });
  };

  return (
    <div>
      <p className={`${tableStyles} italic mb-0`}>
        <span className="font-bold italic">Table 3.1.b.</span>{' '}
        WP descriptions, including objectives, task (T) descriptions, task/WP leaders{' '}
        <CaptionBubble showCrown />{' '}
        &amp; other participants{' '}
        <CaptionBubble />{' '}
        &amp; start month &amp; end month
      </p>
      {populatedWPs.map((wp, idx) => {
        const shortName = wp.short_name || wp.title || `WP${wp.number}`;
        const title = wp.title || `Work Package ${wp.number}`;
        const wpLeader = participants.find(p => p.id === wp.lead_participant_id);

        // Compute month range from tasks
        const starts = wp.tasks.map(t => t.start_month).filter((m): m is number => m != null);
        const ends = wp.tasks.map(t => t.end_month).filter((m): m is number => m != null);
        const monthRange = starts.length > 0 && ends.length > 0
          ? `M${String(Math.min(...starts)).padStart(2, '0')}–M${String(Math.max(...ends)).padStart(2, '0')}`
          : null;

        return (
          <div key={wp.id}>
            <div style={{ height: '0.5em' }} />
            <table
              className={`${tableStyles} w-full border-collapse`}
              style={{ borderLeft: `3pt solid ${wp.color}` }}
            >
              <tbody>
                {/* Header row 1: WP number + short name | WP leader bubble with crown */}
                <tr>
                  <td
                    className="border px-0.5 font-bold text-[11pt] font-['Times_New_Roman',Times,serif] leading-tight text-white"
                    style={{
                      backgroundColor: wp.color,
                      borderColor: wp.color,
                      paddingTop: 0,
                      paddingBottom: 0,
                      lineHeight: 1.2,
                    }}
                  >
                    WP{wp.number}:&nbsp;
                    <EditableHeaderText
                      value={shortName}
                      onSave={(val) => saveWPField(wp.id, 'short_name', val)}
                      className="text-white"
                    />
                  </td>
                  <td
                    className="border px-0.5 font-bold text-[11pt] font-['Times_New_Roman',Times,serif] leading-tight text-white text-right whitespace-nowrap"
                    style={{
                      backgroundColor: wp.color,
                      borderColor: wp.color,
                      paddingTop: 0,
                      paddingBottom: 0,
                      lineHeight: 1.2,
                      width: '1%',
                    }}
                  >
                    <LeaderPicker
                      entityId={wp.id}
                      entityTable="wp_drafts"
                      currentLeaderId={wp.lead_participant_id}
                      participants={participants}
                      proposalId={proposalId}
                      showCrown
                      arrowPosition="left"
                    />
                  </td>
                </tr>

                {/* Header row 2: WP title | month range */}
                <tr>
                  <td
                    className="border px-0.5 font-bold text-[11pt] font-['Times_New_Roman',Times,serif] leading-tight text-white"
                    style={{
                      backgroundColor: wp.color,
                      borderColor: wp.color,
                      paddingTop: 0,
                      paddingBottom: 0,
                      lineHeight: 1.2,
                    }}
                  >
                    <EditableHeaderText
                      value={title}
                      onSave={(val) => saveWPField(wp.id, 'title', val)}
                      className="text-white"
                    />
                  </td>
                  <td
                    className="border px-0.5 font-bold text-[11pt] font-['Times_New_Roman',Times,serif] leading-tight text-white text-right whitespace-nowrap"
                    style={{
                      backgroundColor: wp.color,
                      borderColor: wp.color,
                      paddingTop: 0,
                      paddingBottom: 0,
                      lineHeight: 1.2,
                      width: '1%',
                    }}
                  >
                    {monthRange || <span className="opacity-70">—</span>}
                  </td>
                </tr>

                {/* Spacer */}
                <SpacerRow />

                {/* Objectives */}
                <tr>
                  <td colSpan={2} className={editableCellStyles} style={{ borderColor: wp.color }}>
                    <span className="font-bold italic">Objectives: </span>
                    <EditableText
                      inline
                      value={wp.objectives || ''}
                      placeholder="Enter objectives..."
                      onSave={async (val) => {
                        await supabase.from('wp_drafts').update({ objectives: val }).eq('id', wp.id);
                        queryClient.invalidateQueries({ queryKey: ['b31-wp-data', proposalId] });
                      }}
                    />
                  </td>
                </tr>

                {/* Tasks */}
                {wp.tasks.map(task => {
                  const partnerIds = task.participants?.map(p => p.participant_id) || [];
                  return (
                    <React.Fragment key={task.id}>
                      {/* Spacer */}
                      <SpacerRow />

                      {/* Task header row - editable title */}
                      <tr>
                        <td
                          colSpan={2}
                          className="border px-0.5 font-bold text-[11pt] font-['Times_New_Roman',Times,serif] leading-tight text-white"
                          style={{
                            backgroundColor: wp.color,
                            borderColor: wp.color,
                            paddingTop: 0,
                            paddingBottom: 0,
                            lineHeight: 1.2,
                          }}
                        >
                          T{wp.number}.{task.number}:&nbsp;
                          <EditableHeaderText
                            value={task.title || `Task ${task.number}`}
                            onSave={(val) => saveTaskField(task.id, 'title', val)}
                            className="text-white"
                          />
                        </td>
                      </tr>

                      {/* Task metadata row: leader + partners merged | timing */}
                      <tr>
                        <td className={`${cellStyles}`} style={{ borderColor: wp.color }}>
                          <div className="flex items-center flex-wrap gap-0.5">
                            <LeaderPicker
                              entityId={task.id}
                              entityTable="wp_draft_tasks"
                              currentLeaderId={task.lead_participant_id}
                              participants={participants}
                              proposalId={proposalId}
                              showCrown
                            />
                            <PartnersPicker
                              taskId={task.id}
                              selectedIds={partnerIds}
                              participants={participants}
                              proposalId={proposalId}
                              leaderId={task.lead_participant_id}
                            />
                          </div>
                        </td>
                        <td className={`${cellStyles} whitespace-nowrap`} style={{ borderColor: wp.color, width: '1%' }}>
                          <MonthRangePicker taskId={task.id} startMonth={task.start_month} endMonth={task.end_month} proposalId={proposalId} />
                        </td>
                      </tr>

                      {/* Task description row */}
                      <tr>
                        <td
                          colSpan={2}
                          className={editableCellStyles}
                          style={{ borderColor: wp.color }}
                        >
                          <EditableText
                            value={task.description || ''}
                            placeholder="Enter task description..."
                            onSave={async (val) => {
                              await supabase.from('wp_draft_tasks').update({ description: val }).eq('id', task.id);
                              queryClient.invalidateQueries({ queryKey: ['b31-wp-data', proposalId] });
                            }}
                          />
                        </td>
                      </tr>
                    </React.Fragment>
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
