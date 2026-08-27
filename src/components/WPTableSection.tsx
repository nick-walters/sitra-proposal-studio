import { useCallback, useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { DebouncedInput } from '@/components/ui/debounced-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Plus, ArrowRight, ChevronDown, ChevronUp, Crown, Eye, EyeOff, GripVertical, Recycle } from 'lucide-react';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ParticipantMultiSelect } from '@/components/ParticipantMultiSelect';
import { LockedWPRichField } from '@/components/wp/LockedWPRichField';
import { CollapseChevron } from '@/components/cards/CollapseChevron';
import {
  wpDescriptionCollapseKey,
  wpObjectivesCollapseKey,
  wpTaskCollapseKey,
} from '@/lib/wpCollapseKeys';

import { WPBinDialog, useWPBinCount } from '@/components/wp/WPBinDialog';
import { jumpToElementId } from '@/lib/jumpToElement';
import { versionTargetAttr } from '@/hooks/useFocusedVersionTarget';
import { wpTargetId, wpTaskTargetId } from '@/hooks/useCardLocks';
import {
  WP_OBJECTIVES_FIELD_EXTENSIONS,
  WP_DRAFT_FIELD_EXTENSIONS,
} from '@/components/wp/wpDraftFieldExtensions';
import type { WPDraftTask } from '@/hooks/useWPDrafts';
import type { ParticipantSummary } from '@/types/proposal';

interface WPOption {
  id: string;
  number: number;
  short_name: string | null;
  title: string | null;
}

interface WPTableSectionProps {
  wpNumber: number;
  wpColor?: string;
  objectives: string | null;
  descriptionBeforeTasks: string | null;
  introVisible?: boolean;
  onIntroVisibleChange?: (visible: boolean) => void;
  tasks: WPDraftTask[];
  participants: ParticipantSummary[];
  onObjectivesChange: (value: string) => void;
  onDescriptionBeforeTasksChange: (value: string) => void;
  /** Creates the single optional field before the first task. */
  onIntroPresenceChange?: (present: boolean) => void;
  /** Deletes that field into the tasks bin (restorable for 90 days). */
  onIntroDelete?: () => Promise<boolean> | void;
  /** Persists a new task order through the server-side resequencing. */
  onTasksReorder?: (orderedIds: string[]) => Promise<boolean>;
  onTaskUpdate: (taskId: string, updates: Partial<WPDraftTask>) => Promise<boolean>;
  onTaskAdd: () => Promise<any>;
  onTaskDelete: (taskId: string) => Promise<boolean>;
  onTaskParticipantsChange: (taskId: string, participantIds: string[]) => Promise<boolean>;
  onTaskMove?: (taskId: string, targetWpDraftId: string) => Promise<boolean>;
  onRefetch?: () => void;
  readOnly?: boolean;
  projectDuration?: number;
  allWpDrafts?: WPOption[];
  currentWpDraftId?: string;
  proposalId?: string | null;
  /** WP draft row id — addresses this WP's lock and version targets. */
  wpDraftId?: string | null;
  /** Keep the focused editor mounted while an insert dialog is open. */
  shouldStayMounted?: () => boolean;
  /** Per-user collapse state, keyed exactly as Part B keys its blocks. */
  collapsedKeys?: Set<string>;
  onToggleCollapsed?: (key: string) => void;
}


/**
 * Blocks 2 and 3 of a WP draft: Objectives, and Tasks.
 *
 * These are PROJECTIONS over `wp_drafts` and `wp_draft_tasks` — there are no
 * card rows behind them. They wear the Part B block chrome (`BlockControlRow`)
 * and the page-styled surface (`doc-surface-page`), and every rich field is
 * lock-, stream- and version-aware through `LockedWPRichField` and the
 * `data-version-target` marker the shared toolbar reads. Guidance is never
 * printed on the block: it is reached through the Guidelines button while a
 * field inside the block has focus (`data-guideline-key`).
 */
export function WPTableSection({
  wpNumber,
  wpColor,
  objectives,
  descriptionBeforeTasks,
  introVisible = true,
  onIntroVisibleChange,
  tasks,
  participants,
  onObjectivesChange,
  onDescriptionBeforeTasksChange,
  onIntroPresenceChange,
  onIntroDelete,
  onTasksReorder,
  onTaskUpdate,
  onTaskAdd,
  onTaskDelete,
  onTaskParticipantsChange,
  onTaskMove,
  onRefetch,
  readOnly = false,
  projectDuration = 36,
  allWpDrafts = [],
  currentWpDraftId,
  proposalId,
  wpDraftId,
  shouldStayMounted,
  collapsedKeys,
  onToggleCollapsed,
}: WPTableSectionProps) {
  const [binOpen, setBinOpen] = useState(false);
  const binCount = useWPBinCount(wpDraftId, ['wp_draft_task', 'wp_draft_intro']);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const isCollapsed = (key: string) => collapsedKeys?.has(key) ?? false;
  const objectivesKey = wpObjectivesCollapseKey(wpDraftId);
  const dowKey = wpDescriptionCollapseKey(wpDraftId);


  /** Adds a task and scrolls to it, as Part B does for a new module. */
  const handleAddTask = useCallback(async () => {
    const created = await onTaskAdd();
    const id = (created as { id?: string } | null)?.id;
    if (id) void jumpToElementId(`wp-task-row-${id}`);
  }, [onTaskAdd]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !onTasksReorder) return;
    const ids = tasks.map((t) => t.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const next = [...ids];
    next.splice(to, 0, next.splice(from, 1)[0]);
    void onTasksReorder(next);
  }, [tasks, onTasksReorder]);

  const formatTaskNumber = (taskNum: number) => `T${wpNumber}.${taskNum}`;

  // The optional field before the first task exists when the column holds a
  // string — an empty string is a present-but-empty field, null is "no field".
  const introPresent = descriptionBeforeTasks !== null && descriptionBeforeTasks !== undefined;
  const otherWps = allWpDrafts.filter((wp) => wp.id !== currentWpDraftId);

  return (
    <div className="space-y-4">
      {/* ── BLOCK 2: Objectives. One field, with the shared collapse control. ── */}
      <section
        data-guideline-key="drafts.wp.objectives"
        data-version-label="Objectives"
        data-version-target={
          wpDraftId ? versionTargetAttr('wp_draft', wpDraftId, 'objectives') : undefined
        }
      >
        {onToggleCollapsed && (
          <div className="flex items-center gap-1 px-1">
            <CollapseChevron
              collapsed={isCollapsed(objectivesKey)}
              onToggle={() => onToggleCollapsed(objectivesKey)}
            />
            {isCollapsed(objectivesKey) && (
              <span
                className="select-none font-bold"
                style={{ fontFamily: "'Times New Roman', Times, serif", fontSize: '11pt' }}
              >
                Objectives:
              </span>
            )}
          </div>
        )}
        {!isCollapsed(objectivesKey) && (
          <div className="doc-surface-page bg-white px-[1.5cm] py-[6pt]">
            <p
              className="select-none font-bold"
              style={{ fontFamily: "'Times New Roman', Times, serif", fontSize: '11pt' }}
            >
              Objectives:
            </p>
            {wpDraftId && (
              <LockedWPRichField
                targetId={wpTargetId(wpDraftId, 'objectives')}
                value={objectives || ''}
                onChange={onObjectivesChange}
                disabled={readOnly}
                minHeight="60px"
                proposalId={proposalId ?? ''}
                staticExtensions={WP_OBJECTIVES_FIELD_EXTENSIONS}
                documentSurface
                shouldStayMounted={shouldStayMounted}
              />
            )}
          </div>
        )}
      </section>

      {/* ── BLOCK 3: Description of work ──
          One white block frame carries the heading, the block controls, the
          optional field before the first task and every task module, exactly
          as a Part B block does. Modules are separated by the same hairline. */}
      <section className="rounded-md border border-border bg-card">
        <div className="flex items-center gap-1 border-b border-border px-3 py-1.5">
          {onToggleCollapsed && (
            <CollapseChevron
              collapsed={isCollapsed(dowKey)}
              onToggle={() => onToggleCollapsed(dowKey)}
            />
          )}
          {/* The heading starts on the 18 cm column's left edge, matching the
              text below it: the header's own padding and the chevron column
              are subtracted from the 1.5 cm margin. */}
          <p
            className="min-w-0 flex-1 select-none font-bold"
            style={{
              fontFamily: "'Times New Roman', Times, serif",
              fontSize: '11pt',
              paddingLeft: onToggleCollapsed ? 'calc(1.5cm - 40px)' : 'calc(1.5cm - 12px)',
            }}
          >
            Description of work:
          </p>

          {!readOnly && (
            <div className="flex items-center gap-1">
              {/* Order: add, move to another WP, restore. */}
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label="Add">
                        <Plus className="h-3.5 w-3.5 text-blue-500" />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent>Add</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuItem onClick={() => void handleAddTask()}>Add task</DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={introPresent || !onIntroPresenceChange}
                    onClick={() => onIntroPresenceChange?.(true)}
                  >
                    Add a field before the first task
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {onTaskMove && otherWps.length > 0 && tasks.length > 0 && (
                <DropdownMenu>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          aria-label="Move a task to another work package"
                        >
                          <ArrowRight className="h-3.5 w-3.5 text-blue-500" />
                        </Button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent>Move a task to another work package</TooltipContent>
                  </Tooltip>
                  <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuLabel>Move a task to another WP</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {tasks.map((task) => (
                      <DropdownMenuSub key={task.id}>
                        <DropdownMenuSubTrigger>
                          {formatTaskNumber(task.number)}
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          {otherWps.map((wp) => (
                            <DropdownMenuItem
                              key={wp.id}
                              onClick={() => void onTaskMove(task.id, wp.id)}
                            >
                              WP{wp.number}
                              {wp.short_name ? `: ${wp.short_name}` : wp.title ? `: ${wp.title}` : ''}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {/* Restore stays visible and greys out when the bin is empty. */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    aria-label="Restore a deleted task"
                    disabled={binCount === 0 || !wpDraftId}
                    onClick={() => setBinOpen(true)}
                  >
                    <Recycle className="h-3.5 w-3.5 text-emerald-600" strokeWidth={2.5} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {binCount === 0 ? 'Nothing deleted recently' : 'Restore a deleted task'}
                </TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>

        {/* Everything below the header hides when the block is collapsed. */}
        {!isCollapsed(dowKey) && (
        <>

        {/* The single optional field before the first task: fixed in place, no
            drag grip — only visibility and delete. */}
        {introPresent && (
          <div
            className={cn('border-b border-border py-2', !introVisible && 'opacity-50')}
            data-guideline-key="drafts.wp.intro"
            data-version-label="Field before the first task"
            data-version-target={
              wpDraftId
                ? versionTargetAttr('wp_draft', wpDraftId, 'description_before_tasks')
                : undefined
            }
          >
            <div className="flex items-center justify-end gap-1 px-[1.5cm]">
              {!readOnly && onIntroVisibleChange && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-pressed={!introVisible}
                      onClick={() => onIntroVisibleChange(!introVisible)}
                    >
                      {introVisible ? (
                        <Eye className="h-3.5 w-3.5 text-emerald-600" strokeWidth={2.5} />
                      ) : (
                        <EyeOff className="h-3.5 w-3.5 text-destructive" strokeWidth={2.5} />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {introVisible ? 'Hide this field from Part B' : 'Show this field in Part B'}
                  </TooltipContent>
                </Tooltip>
              )}
              {!readOnly && (onIntroDelete || onIntroPresenceChange) && (
                <DeleteConfirmDialog
                  itemLabel="this field"
                  description="This field goes to the tasks bin, where it can be restored for 90 days."
                  onConfirm={() =>
                    onIntroDelete ? void onIntroDelete() : onIntroPresenceChange?.(false)
                  }
                />
              )}
            </div>
            <div className="doc-surface-page bg-white px-[1.5cm] py-[6pt]">
              {wpDraftId && (
                <LockedWPRichField
                  targetId={wpTargetId(wpDraftId, 'intro')}
                  value={descriptionBeforeTasks || ''}
                  onChange={onDescriptionBeforeTasksChange}
                  disabled={readOnly}
                  minHeight="60px"
                  proposalId={proposalId ?? ''}
                  staticExtensions={WP_DRAFT_FIELD_EXTENSIONS}
                  documentSurface
                  shouldStayMounted={shouldStayMounted}
                />
              )}
            </div>
          </div>
        )}

        {/* Task modules. Dragging is constrained to the task run and writes
            through the server-side resequencing. */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            <div>
              {tasks.map((task, index) => (
                <SortableTaskModule
                  key={task.id}
                  id={task.id}
                  className={cn(index < tasks.length - 1 && 'border-b border-border')}
                >
                  {(dragHandleProps) => (
                    <TaskModule
                      task={task}
                      wpNumber={wpNumber}
                      wpColor={wpColor}
                      participants={participants}
                      projectDuration={projectDuration}
                      onUpdate={onTaskUpdate}
                      onDelete={onTaskDelete}
                      onParticipantsChange={onTaskParticipantsChange}
                      readOnly={readOnly}
                      formatTaskNumber={formatTaskNumber}
                      proposalId={proposalId}
                      shouldStayMounted={shouldStayMounted}
                      dragHandleProps={readOnly ? undefined : dragHandleProps}
                      collapsed={isCollapsed(wpTaskCollapseKey(task.id))}
                      onToggleCollapsed={
                        onToggleCollapsed
                          ? () => onToggleCollapsed(wpTaskCollapseKey(task.id))
                          : undefined
                      }
                    />
                  )}
                </SortableTaskModule>
              ))}
            </div>
          </SortableContext>
        </DndContext>
        {tasks.length === 0 && (
          <p className="py-3 text-center text-sm italic text-muted-foreground">
            No tasks yet — use the add control above.
          </p>
        )}
        </>
        )}
      </section>

      {wpDraftId && (
        <WPBinDialog
          isOpen={binOpen}
          onClose={() => setBinOpen(false)}
          wpDraftId={wpDraftId}
          targetType={['wp_draft_task', 'wp_draft_intro']}
          title="Deleted tasks"
          onRestored={onRefetch}
        />
      )}
    </div>
  );
}

/** Sortable wrapper for one task module: the grip is passed to the module. */
function SortableTaskModule({
  id,
  className,
  children,
}: {
  id: string;
  className?: string;
  children: (dragHandleProps: Record<string, unknown>) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      id={`wp-task-row-${id}`}
      className={cn(className, isDragging && 'relative z-10 bg-card shadow-md')}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {children({ ...attributes, ...listeners })}
    </div>
  );
}

interface TaskModuleProps {
  task: WPDraftTask;
  wpNumber: number;
  wpColor?: string;
  participants: ParticipantSummary[];
  projectDuration: number;
  onUpdate: (taskId: string, updates: Partial<WPDraftTask>) => Promise<boolean>;
  onDelete: (taskId: string) => Promise<boolean>;
  onParticipantsChange: (taskId: string, participantIds: string[]) => Promise<boolean>;
  readOnly: boolean;
  formatTaskNumber: (num: number) => string;
  proposalId?: string | null;
  shouldStayMounted?: () => boolean;
  dragHandleProps?: Record<string, unknown>;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

/** One task module: badge and title, leader and participants, duration, text. */
function TaskModule({
  task,
  wpNumber,
  wpColor,
  participants,
  projectDuration,
  onUpdate,
  onDelete,
  onParticipantsChange,
  readOnly,
  formatTaskNumber,
  proposalId,
  shouldStayMounted,
  dragHandleProps,
  collapsed = false,
  onToggleCollapsed,
}: TaskModuleProps) {
  const isVisible = task.is_visible !== false;
  const selectedParticipantIds = (task.participants?.map((p) => p.participant_id) || []).filter(
    (id) => id !== task.lead_participant_id,
  );
  const availableParticipants = task.lead_participant_id
    ? participants.filter((p) => p.id !== task.lead_participant_id)
    : participants;

  return (
    <div
      className={cn('space-y-1 bg-white py-2', !isVisible && 'opacity-50')}
      data-guideline-key="drafts.wp.task"
    >
      {/* Row 1: badge, title, visibility, delete — inside the 18 cm column.
          The collapse chevron sits above the drag grip at the module's left
          edge, exactly as it does on a Part B module. */}
      <div className="flex items-center gap-1.5 px-[1.5cm]">
        {(onToggleCollapsed || dragHandleProps) && (
          <div className="-ml-9 flex shrink-0 flex-col items-center gap-0.5 self-start">
            {onToggleCollapsed && (
              <CollapseChevron
                collapsed={collapsed}
                onToggle={onToggleCollapsed}
                label="task"
              />
            )}
          </div>
        )}
        {dragHandleProps && (

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="-ml-5 shrink-0 cursor-grab touch-none rounded hover:bg-muted active:cursor-grabbing"
                {...dragHandleProps}
              >
                <GripVertical className="h-4 w-4 text-blue-500" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Drag to reorder this task</TooltipContent>
          </Tooltip>
        )}
        <span
          className="inline-flex shrink-0 select-none items-center justify-center rounded-full font-bold"
          style={{
            backgroundColor: '#ffffff',
            border: `1.5px solid ${wpColor || '#73C92D'}`,
            color: wpColor || '#73C92D',
            height: '22px',
            fontFamily: "'Times New Roman', Times, serif",
            fontSize: '11pt',
            lineHeight: '22px',
            padding: '0px 5px',
          }}
        >
          {formatTaskNumber(task.number)}
        </span>
        <div
          className="min-w-0 flex-1"
          data-version-label={`${formatTaskNumber(task.number)} title`}
          data-version-target={versionTargetAttr('wp_draft_task', task.id, 'title')}
        >
          <DebouncedInput
            value={task.title || ''}
            onDebouncedChange={(val) => { void onUpdate(task.id, { title: val }); }}
            placeholder="Task title…"
            className="h-6 w-full border-0 bg-transparent px-1 font-bold text-foreground shadow-none outline-none placeholder:text-muted-foreground/60 focus-visible:ring-0"
            style={{ fontFamily: "'Times New Roman', Times, serif", fontSize: '11pt' }}
            disabled={readOnly}
          />
        </div>
        {!readOnly && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                aria-pressed={!isVisible}
                onClick={() => void onUpdate(task.id, { is_visible: !isVisible })}
              >
                {isVisible ? (
                  <Eye className="h-3.5 w-3.5 text-emerald-600" strokeWidth={2.5} />
                ) : (
                  <EyeOff className="h-3.5 w-3.5 text-destructive" strokeWidth={2.5} />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {isVisible ? 'Hide this task from Part B' : 'Show this task in Part B'}
            </TooltipContent>
          </Tooltip>
        )}
        {!readOnly && (
          <DeleteConfirmDialog
            itemLabel="this task"
            description="This task goes to the tasks bin, where it can be restored for 90 days."
            onConfirm={() => void onDelete(task.id)}
          />
        )}
      </div>

      {/* Row 2: leader, participants, duration */}
      <div className="flex flex-wrap items-center gap-2 px-[1.5cm]">
        <Select
          value={task.lead_participant_id || ''}
          onValueChange={(value) =>
            onUpdate(task.id, {
              lead_participant_id: value === '__clear__' ? null : value || null,
            })
          }
          disabled={readOnly}
        >
          <SelectTrigger
            className={cn(
              'h-auto w-auto gap-0 border-0 bg-transparent p-0 text-draft shadow-none',
              task.lead_participant_id ? 'font-bold' : 'font-normal',
            )}
          >
            {task.lead_participant_id ? (
              <span
                className="relative inline-flex items-center overflow-hidden whitespace-nowrap"
                style={{
                  backgroundColor: '#000000',
                  color: '#ffffff',
                  height: '17px',
                  lineHeight: '17px',
                  fontFamily: "'Times New Roman', Times, serif",
                  fontSize: '11pt',
                  borderRadius: '9999px',
                  paddingLeft: '18px',
                  paddingRight: '6px',
                  backgroundClip: 'padding-box',
                }}
              >
                <Crown
                  className="absolute left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 fill-white text-white"
                  style={{ zIndex: 1 }}
                />
                <SelectValue placeholder="Select" className="font-normal" />
              </span>
            ) : (
              <SelectValue placeholder="Task leader" className="font-normal" />
            )}
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__clear__">
              <span className="italic text-muted-foreground">Clear selection</span>
            </SelectItem>
            {participants.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                <span
                  className="inline-flex items-center justify-center whitespace-nowrap rounded-full font-bold"
                  style={{
                    backgroundColor: '#000000',
                    color: '#ffffff',
                    fontFamily: "'Times New Roman', Times, serif",
                    fontSize: '11pt',
                    fontWeight: 700,
                    lineHeight: 1,
                    padding: '0px 5px',
                    height: '17px',
                  }}
                >
                  {p.organisation_short_name || p.organisation_name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="min-w-0 flex-1">
          <ParticipantMultiSelect
            participants={availableParticipants}
            selectedIds={selectedParticipantIds}
            onChange={(ids) => onParticipantsChange(task.id, ids)}
            disabled={readOnly}
          />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <TimingRangePicker
            task={task}
            projectDuration={projectDuration}
            readOnly={readOnly}
            onUpdate={onUpdate}
          />
        </div>
      </div>

      {/* Row 3: description, on the page surface */}
      <div
        data-version-label={`${formatTaskNumber(task.number)} description`}
        data-version-target={versionTargetAttr('wp_draft_task', task.id, 'description')}
      >
        <div className="doc-surface-page bg-white px-[1.5cm] py-[6pt]">
          <LockedWPRichField
            targetId={wpTaskTargetId(task.id, 'description')}
            value={task.description || ''}
            onChange={(value) => { void onUpdate(task.id, { description: value }); }}
            disabled={readOnly}
            minHeight="60px"
            proposalId={proposalId ?? ''}
            staticExtensions={WP_DRAFT_FIELD_EXTENSIONS}
            documentSurface
            shouldStayMounted={shouldStayMounted}
          />
        </div>
      </div>
    </div>
  );
}

/* ── Timing range picker ── */
function TimingRangePicker({
  task,
  projectDuration,
  readOnly,
  onUpdate,
}: {
  task: WPDraftTask;
  projectDuration: number;
  readOnly: boolean;
  onUpdate: (taskId: string, updates: Partial<WPDraftTask>) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [selecting, setSelecting] = useState<'start' | 'end' | null>(null);
  const [localStart, setLocalStart] = useState(task.start_month);
  const [localEnd, setLocalEnd] = useState(task.end_month);

  const months = Array.from({ length: projectDuration }, (_, i) => i + 1);

  const handleClick = (m: number) => {
    if (selecting === 'start' || !selecting) {
      setLocalStart(m);
      if (localEnd != null && m > localEnd) setLocalEnd(null);
      setSelecting('end');
      return;
    }
    if (m < (localStart ?? 1)) {
      setLocalStart(m);
      setSelecting('end');
      return;
    }
    setLocalEnd(m);
    setSelecting(null);
    void onUpdate(task.id, { start_month: localStart, end_month: m });
    setOpen(false);
  };

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      setLocalStart(task.start_month);
      setLocalEnd(task.end_month);
      setSelecting('start');
    }
  };

  const fmt = (m: number | null) => (m != null ? `M${String(m).padStart(2, '0')}` : null);

  return (
    <>
      <Popover open={open} onOpenChange={handleOpen}>
        <PopoverTrigger asChild>
          <button
            className="h-6 cursor-pointer rounded-md border bg-background px-2 text-draft hover:opacity-80"
            disabled={readOnly}
          >
            {task.start_month != null && task.end_month != null ? (
              <>{fmt(task.start_month)}–{fmt(task.end_month)}</>
            ) : task.start_month != null ? (
              <>{fmt(task.start_month)}–<span className="italic text-muted-foreground">M??</span></>
            ) : (
              <span className="font-normal italic text-muted-foreground">Select</span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[280px] p-2" align="end">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-draft font-medium text-muted-foreground">
              {selecting === 'end' ? 'Select end month' : 'Select start month'}
            </span>
            {(task.start_month != null || task.end_month != null) && (
              <button
                className="cursor-pointer text-draft italic text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setLocalStart(null);
                  setLocalEnd(null);
                  void onUpdate(task.id, { start_month: null, end_month: null });
                  setOpen(false);
                }}
              >
                Clear
              </button>
            )}
          </div>
          <div className="grid grid-cols-6 gap-0.5">
            {months.map((m) => {
              const isStart = m === localStart;
              const isEnd = m === localEnd;
              const isInRange =
                localStart != null && localEnd != null && m >= localStart && m <= localEnd;
              const isPartialRange =
                selecting === 'end' && localStart != null && localEnd == null && m >= localStart;
              return (
                <button
                  key={m}
                  className={cn(
                    'cursor-pointer rounded px-1 py-0.5 text-center text-draft',
                    (isStart || isEnd) && 'bg-primary font-bold text-primary-foreground',
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
    </>
  );
}
