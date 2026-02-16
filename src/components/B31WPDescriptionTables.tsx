import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ChevronsUpDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { B31WPData, B31Participant } from '@/hooks/useB31SectionData';

const tableStyles = "font-['Times_New_Roman',Times,serif] text-[11pt]";
const cellStyles = "border border-black px-0.5 py-0 font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight align-top";

interface Props {
  wpData: B31WPData[];
  participants: B31Participant[];
  proposalId: string;
}

/* ── Participant bubble ── */
function ParticipantBubble({ participant, color }: { participant: B31Participant; color: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9pt] font-bold whitespace-nowrap"
      style={{ backgroundColor: color, color: '#FFFFFF' }}
    >
      {participant.participant_number}. {participant.organisation_short_name || participant.organisation_name}
    </span>
  );
}

/* ── Single-select participant picker (task leader) ── */
function LeaderPicker({
  taskId,
  currentLeaderId,
  participants,
  color,
  proposalId,
}: {
  taskId: string;
  currentLeaderId: string | null;
  participants: B31Participant[];
  color: string;
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
            <ParticipantBubble participant={leader} color={color} />
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
  color,
  proposalId,
}: {
  taskId: string;
  selectedIds: string[];
  participants: B31Participant[];
  color: string;
  proposalId: string;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const toggle = async (pid: string) => {
    const next = selectedIds.includes(pid)
      ? selectedIds.filter(id => id !== pid)
      : [...selectedIds, pid];
    await supabase.from('wp_draft_task_participants').delete().eq('task_id', taskId);
    if (next.length > 0) {
      await supabase
        .from('wp_draft_task_participants')
        .insert(next.map(participant_id => ({ task_id: taskId, participant_id })));
    }
    queryClient.invalidateQueries({ queryKey: ['b31-wp-data', proposalId] });
  };

  const selected = participants.filter(p => selectedIds.includes(p.id));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1 flex-wrap cursor-pointer hover:opacity-80">
          {selected.length > 0 ? (
            selected.map(p => (
              <ParticipantBubble key={p.id} participant={p} color={color} />
            ))
          ) : (
            <span className="text-muted-foreground text-[9pt] italic">Select…</span>
          )}
          <ChevronsUpDown className="h-3 w-3 opacity-50 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" align="start">
        <div className="max-h-[200px] overflow-y-auto">
          {participants.map(p => {
            const isSelected = selectedIds.includes(p.id);
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
}: {
  taskId: string;
  field: 'start_month' | 'end_month';
  value: number | null;
  proposalId: string;
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
          {months.map(m => (
            <button
              key={m}
              className={cn(
                'w-full px-2 py-1 text-sm hover:bg-accent cursor-pointer text-left',
                m === value && 'bg-accent font-bold',
              )}
              onClick={() => select(m)}
            >
              M{String(m).padStart(2, '0')}
            </button>
          ))}
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

/* ── Main component ── */
export function B31WPDescriptionTables({ wpData, participants, proposalId }: Props) {
  const populatedWPs = wpData.filter(wp => wp.objectives || (wp.tasks && wp.tasks.length > 0));

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
                    className="px-0.5 py-0 font-bold text-[11pt] font-['Times_New_Roman',Times,serif]"
                    style={{
                      backgroundColor: wp.color,
                      color: '#FFFFFF',
                      borderColor: wp.color,
                      borderStyle: 'solid',
                      borderWidth: '1px',
                    }}
                  >
                    WP{wp.number}: {shortName} – {title}
                  </td>
                </tr>

                {/* Spacer */}
                <SpacerRow />

                {/* Objectives */}
                {wp.objectives && (
                  <>
                    <tr>
                      <td colSpan={3} className={`${cellStyles} font-bold`}>
                        Objectives
                      </td>
                    </tr>
                    <tr>
                      <td
                        colSpan={3}
                        className={cellStyles}
                        dangerouslySetInnerHTML={{ __html: wp.objectives }}
                      />
                    </tr>
                  </>
                )}

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
                          className="px-0.5 py-0 font-bold text-[11pt] font-['Times_New_Roman',Times,serif]"
                          style={{
                            backgroundColor: wp.color,
                            color: '#FFFFFF',
                            borderColor: wp.color,
                            borderStyle: 'solid',
                            borderWidth: '1px',
                          }}
                        >
                          T{wp.number}.{task.number}: {task.title || `Task ${task.number}`}
                        </td>
                      </tr>

                      {/* Task metadata row: leader | partners | timing */}
                      <tr>
                        <td className={`${cellStyles}`}>
                          <span className="italic font-bold">Task leader: </span>
                          <LeaderPicker
                            taskId={task.id}
                            currentLeaderId={task.lead_participant_id}
                            participants={participants}
                            color={wp.color}
                            proposalId={proposalId}
                          />
                        </td>
                        <td className={`${cellStyles}`}>
                          <span className="italic font-bold">Partners: </span>
                          <PartnersPicker
                            taskId={task.id}
                            selectedIds={partnerIds}
                            participants={participants}
                            color={wp.color}
                            proposalId={proposalId}
                          />
                        </td>
                        <td className={`${cellStyles} whitespace-nowrap`}>
                          <MonthPicker taskId={task.id} field="start_month" value={task.start_month} proposalId={proposalId} />
                          –
                          <MonthPicker taskId={task.id} field="end_month" value={task.end_month} proposalId={proposalId} />
                        </td>
                      </tr>

                      {/* Task description row */}
                      {task.description && (
                        <tr>
                          <td
                            colSpan={3}
                            className={cellStyles}
                            dangerouslySetInnerHTML={{ __html: task.description }}
                          />
                        </tr>
                      )}
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
