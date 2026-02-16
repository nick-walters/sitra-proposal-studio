import React, { useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ChevronsUpDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { B31WPData, B31Participant } from '@/hooks/useB31SectionData';

const tableStyles = "font-['Times_New_Roman',Times,serif] text-[11pt]";
const cellStyles = "border px-0.5 py-0.5 font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight align-middle";
const editableCellStyles = `${cellStyles} cursor-text hover:bg-muted/30`;

interface Props {
  wpData: B31WPData[];
  participants: B31Participant[];
  proposalId: string;
}

/* ── Participant bubble (always black, no numbering) ── */
function ParticipantBubble({ participant }: { participant: B31Participant }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9pt] font-bold italic whitespace-nowrap"
      style={{ backgroundColor: '#000000', color: '#FFFFFF' }}
    >
      {participant.organisation_short_name || participant.organisation_name}
    </span>
  );
}

/* ── Single-select participant picker (task leader) ── */
function LeaderPicker({
  taskId,
  currentLeaderId,
  participants,
  proposalId,
}: {
  taskId: string;
  currentLeaderId: string | null;
  participants: B31Participant[];
  proposalId: string;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const leader = participants.find(p => p.id === currentLeaderId);

  const select = async (pid: string) => {
    setOpen(false);
    await supabase.from('wp_draft_tasks').update({ lead_participant_id: pid }).eq('id', taskId);
    queryClient.invalidateQueries({ queryKey: ['b31-wp-data', proposalId] });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1 cursor-pointer hover:opacity-80">
          {leader ? (
            <ParticipantBubble participant={leader} />
          ) : (
            <span className="text-muted-foreground text-[9pt] italic">Select…</span>
          )}
          <ChevronsUpDown className="h-3 w-3 opacity-50 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" align="start">
        <div className="max-h-[200px] overflow-y-auto">
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

  // Filter out the task leader from partners
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
            <span className="text-muted-foreground text-[9pt] italic">Select…</span>
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

/* ── Month picker ── */
function MonthPicker({
  taskId,
  field,
  value,
  proposalId,
  minMonth,
  maxMonth,
}: {
  taskId: string;
  field: 'start_month' | 'end_month';
  value: number | null;
  proposalId: string;
  minMonth?: number | null;
  maxMonth?: number | null;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const select = async (m: number) => {
    setOpen(false);
    await supabase.from('wp_draft_tasks').update({ [field]: m }).eq('id', taskId);
    queryClient.invalidateQueries({ queryKey: ['b31-wp-data', proposalId] });
  };

  const months = Array.from({ length: 60 }, (_, i) => i + 1);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="cursor-pointer hover:opacity-80 font-['Times_New_Roman',Times,serif] text-[11pt]">
          {value != null ? `M${String(value).padStart(2, '0')}` : <span className="text-muted-foreground italic">M??</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[120px] p-0" align="start">
        <div className="max-h-[200px] overflow-y-auto">
          {months.map(m => {
            const disabled = (minMonth != null && m < minMonth) || (maxMonth != null && m > maxMonth);
            return (
              <button
                key={m}
                className={cn(
                  'w-full px-2 py-1 text-sm hover:bg-accent cursor-pointer text-left',
                  m === value && 'bg-accent font-bold',
                  disabled && 'opacity-30 cursor-not-allowed hover:bg-transparent',
                )}
                onClick={() => !disabled && select(m)}
                disabled={disabled}
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
}: {
  value: string;
  onSave: (newValue: string) => void;
  placeholder?: string;
  className?: string;
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

  return (
    <div
      ref={ref}
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

/* ── Main component ── */
export function B31WPDescriptionTables({ wpData, participants, proposalId }: Props) {
  const queryClient = useQueryClient();
  const populatedWPs = wpData;

  if (populatedWPs.length === 0) return null;

  return (
    <div>
      <p className={`${tableStyles} italic mb-0`}>
        <span className="font-bold italic">Table 3.1.b.</span> Work package descriptions
      </p>
      {populatedWPs.map((wp, idx) => {
        const shortName = wp.short_name || wp.title || `WP${wp.number}`;
        const title = wp.title || `Work Package ${wp.number}`;

        return (
          <div key={wp.id}>
            {idx > 0 && <div style={{ height: '1.5em' }} />}
            <table
              className={`${tableStyles} w-full border-collapse`}
              style={{ borderLeft: `3pt solid ${wp.color}` }}
            >
              <tbody>
                {/* WP Header row */}
                <tr>
                  <td
                    colSpan={3}
                    className="border px-0.5 font-bold text-[11pt] font-['Times_New_Roman',Times,serif] leading-tight text-white"
                    style={{
                      backgroundColor: wp.color,
                      borderColor: wp.color,
                      paddingTop: 0,
                      paddingBottom: 0,
                      lineHeight: 1.2,
                    }}
                  >
                    WP{wp.number}: {shortName} – {title}
                  </td>
                </tr>

                {/* WP leader & duration row */}
                <tr>
                  <td className={`${cellStyles}`} style={{ borderColor: wp.color }}>
                    <span className="italic font-bold">WP leader: </span>
                    {(() => {
                      const leader = participants.find(p => p.id === wp.lead_participant_id);
                      return leader ? <ParticipantBubble participant={leader} /> : <span className="text-muted-foreground text-[9pt] italic">Not set</span>;
                    })()}
                  </td>
                  <td colSpan={2} className={`${cellStyles}`} style={{ borderColor: wp.color }}>
                    <span className="italic font-bold">Duration: </span>
                    {(() => {
                      const starts = wp.tasks.map(t => t.start_month).filter((m): m is number => m != null);
                      const ends = wp.tasks.map(t => t.end_month).filter((m): m is number => m != null);
                      if (starts.length > 0 && ends.length > 0) {
                        const minStart = Math.min(...starts);
                        const maxEnd = Math.max(...ends);
                        return <span>M{String(minStart).padStart(2, '0')} – M{String(maxEnd).padStart(2, '0')}</span>;
                      }
                      return <span className="text-muted-foreground text-[9pt] italic">No task timing set</span>;
                    })()}
                  </td>
                </tr>

                {/* Spacer */}
                <SpacerRow />

                {/* Objectives */}
                <tr>
                  <td colSpan={3} className={editableCellStyles} style={{ borderColor: wp.color }}>
                    <span className="font-bold italic">Objectives: </span>
                    <EditableText
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

                      {/* Task header row */}
                      <tr>
                        <td
                          colSpan={3}
                          className="border px-0.5 font-bold text-[11pt] font-['Times_New_Roman',Times,serif] leading-tight text-white"
                          style={{
                            backgroundColor: wp.color,
                            borderColor: wp.color,
                            paddingTop: 0,
                            paddingBottom: 0,
                            lineHeight: 1.2,
                          }}
                        >
                          T{wp.number}.{task.number}: {task.title || `Task ${task.number}`}
                        </td>
                      </tr>

                      {/* Task metadata row: leader | partners | timing */}
                      <tr>
                        <td className={`${cellStyles}`} style={{ borderColor: wp.color }}>
                          <span className="italic font-bold">Task leader: </span>
                          <LeaderPicker
                            taskId={task.id}
                            currentLeaderId={task.lead_participant_id}
                            participants={participants}
                            proposalId={proposalId}
                          />
                        </td>
                        <td className={`${cellStyles}`} style={{ borderColor: wp.color }}>
                          <span className="italic font-bold">Partners: </span>
                          <PartnersPicker
                            taskId={task.id}
                            selectedIds={partnerIds}
                            participants={participants}
                            proposalId={proposalId}
                            leaderId={task.lead_participant_id}
                          />
                        </td>
                        <td className={`${cellStyles} whitespace-nowrap`} style={{ borderColor: wp.color }}>
                          <MonthPicker taskId={task.id} field="start_month" value={task.start_month} proposalId={proposalId} maxMonth={task.end_month} />
                          –
                          <MonthPicker taskId={task.id} field="end_month" value={task.end_month} proposalId={proposalId} minMonth={task.start_month} />
                        </td>
                      </tr>

                      {/* Task description row */}
                      <tr>
                        <td
                          colSpan={3}
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
