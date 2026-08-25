import { useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useQuery } from '@tanstack/react-query';
import { GripVertical, Plus, Recycle, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Tip } from '@/components/ui/control-tip';
import { EditableCaption } from '@/components/EditableCaption';

import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ParticipantBubble } from '@/components/B31Pill';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import { MethodologyRichEditor } from '@/components/MethodologyRichEditor';
import { FUNDING_INSTRUMENTS, getInstrumentAbbreviation } from '@/lib/fundingInstruments';
import { YearRangePicker, formatYearRange } from '@/components/YearRangePicker';
import { useLinkedActivities, type LinkedActivity } from '@/hooks/useLinkedActivities';
import { LazyRichField } from '@/components/participant/LazyRichField';
import { HEADING_TITLE_FIELD_EXTENSIONS } from '@/components/wp/wpDraftFieldExtensions';
import { ensureRichHtml, displayRichHtml } from '@/lib/richTextUpgrade';
import { htmlToPlainText } from '@/lib/htmlToPlainText';

interface ParticipantSummary {
  id: string;
  organisation_short_name: string | null;
  organisation_name: string | null;
  english_name: string | null;
  participant_number: number | null;
}

interface LinkedActivitiesTableProps {
  proposalId: string;
  canEdit: boolean;
  isCoordinator: boolean;
  /**
   * When supplied (cards board), the hook result is owned by the caller so it
   * can render the Add/Restore buttons in the block header; this component
   * then hides its own control row and restore dialog.
   */
  controller?: ReturnType<typeof useLinkedActivities>;
  /**
   * Derived, non-editable caption label ("Table 1.2.a.") supplied by the
   * board from this block's position. Only the caption text is editable.
   */
  captionLabel?: string;
}

/** Document table spec: TNR 11pt, tight cells, no vertical rules. */
const tableStyles = "font-['Times_New_Roman',Times,serif] text-[11pt]";
const cellStyles =
  "px-[6pt] py-[2pt] align-middle font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight text-left";
const firstCellStyles = `${cellStyles} !pl-0`;

/**
 * Controls embedded in cells read as document text until hovered or focused:
 * transparent border and background, revealing the affordance on interaction.
 */
const SUBTLE_CONTROL =
  "[&_button]:border-transparent [&_button]:bg-transparent [&_button]:shadow-none [&_input]:border-transparent [&_input]:bg-transparent [&_input]:shadow-none hover:[&_button]:border-input hover:[&_input]:border-input focus-within:[&_button]:border-input focus-within:[&_input]:border-input";

/** The 18 cm text column, in CSS pixels — the hard cap for every table. */
const BLOCK_WIDTH = 768;

const DEFAULT_COL_PCT = ['3%', '30%', '42%', '9%', '12%', '4%'];

const NONE = '__none__';

interface RowProps {
  activity: LinkedActivity;
  proposalId: string;
  canEdit: boolean;
  isCoordinator: boolean;
  participants: ParticipantSummary[];
  onUpdate: (id: string, patch: Parameters<ReturnType<typeof useLinkedActivities>['updateField']>[1]) => void;
  onDelete: (id: string) => void;
}

function SortableActivityRow({
  activity,
  proposalId,
  canEdit,
  isCoordinator,
  participants,
  onUpdate,
  onDelete,
}: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: activity.id,
  });
  const [assignOpen, setAssignOpen] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const selected = participants.find((p) => p.id === activity.responsibleParticipantId);
  const isOther = activity.instrumentCode === 'OTHER';

  return (
    /* One <tbody> per activity: the sortable unit keeps the scalar row and the
       full-width description row travelling together while staying valid HTML. */
    <tbody ref={setNodeRef} style={style} className="border-y border-gray-200">
      <tr>
        <td className={firstCellStyles}>

        {canEdit ? (
          <Tip label="Drag to reorder this activity">
            <button
              type="button"
              className="cursor-grab touch-none text-[#2563EB]"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-4 w-4" />
            </button>
          </Tip>

        ) : (
          <span />
        )}

        {/* Acronym — single-line rich text, title-field controls only
            (undo, redo, font colour). Legacy plain strings upgrade on read. */}
        {canEdit ? (
          <LazyRichField
            singleLine
            proposalId={proposalId}
            value={ensureRichHtml(activity.acronym)}
            placeholder="Acronym"
            minHeight="32px"
            className="text-xs [&_p]:m-0"
            staticExtensions={HEADING_TITLE_FIELD_EXTENSIONS}
            onChange={(html) => onUpdate(activity.id, { acronym: html })}
          />
        ) : (
          <span
            className="truncate text-xs [&_p]:m-0 [&_p]:inline"
            dangerouslySetInnerHTML={{ __html: displayRichHtml(activity.acronym) || '—' }}
          />
        )}

        {/* Instrument */}
        {canEdit ? (
          <div data-scalar-field="" className="flex min-w-0 items-center gap-1">
            <Select
              value={activity.instrumentCode ?? NONE}
              onValueChange={(v) =>
                onUpdate(activity.id, {
                  instrumentCode: v === NONE ? null : v,
                  ...(v === 'OTHER' ? {} : { instrumentCustom: null }),
                })
              }
            >
              <SelectTrigger className="h-8 min-w-0 flex-1 justify-between text-left text-xs [&>span]:block [&>span]:w-full [&>span]:truncate [&>span]:text-left" aria-label="Funding instrument">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>—</SelectItem>
                {FUNDING_INSTRUMENTS.map((inst) => (
                  <SelectItem key={inst.code} value={inst.code}>
                    {inst.fullName ? `${inst.abbreviation} (${inst.fullName})` : 'Other'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isOther && (
              <Input
                value={activity.instrumentCustom ?? ''}
                onChange={(e) => onUpdate(activity.id, { instrumentCustom: e.target.value })}
                placeholder="Name"
                className="h-8 w-24 text-xs"
                aria-label="Custom funding instrument"
              />
            )}
          </div>
        ) : (
          <span className="truncate text-xs">
            {getInstrumentAbbreviation(activity.instrumentCode, activity.instrumentCustom) || '—'}
          </span>
        )}

        {/* Duration */}
        {canEdit ? (
          <div data-scalar-field="" className="min-w-0">
            <YearRangePicker
              startYear={activity.durationStart}
              endYear={activity.durationEnd}
              onChange={(start, end) =>
                onUpdate(activity.id, { durationStart: start, durationEnd: end })
              }
            />
          </div>
        ) : (
          <span className="truncate text-xs">
            {formatYearRange(activity.durationStart, activity.durationEnd) ?? '—'}
          </span>
        )}

        {/* Responsible participant + delete control */}
        {/* tabIndex makes the chip itself focusable on click, so the features
            tier opens for this scalar field like it does for the others. */}
        <div data-scalar-field="" tabIndex={-1} className="min-w-0 flex items-center gap-1 outline-none">
          {selected ? (
            <ParticipantBubble
              onClick={() => {
                if (canEdit) setAssignOpen(true);
              }}
              style={{
                fontSize: '12px',
                height: 'auto',
                padding: '2px 8px',
                cursor: canEdit ? 'pointer' : 'default',
                opacity: canEdit ? 1 : 0.6,
              }}
              className="whitespace-nowrap transition-all hover:ring-2 hover:ring-primary/30"
            >
              {selected.organisation_short_name || `P${selected.participant_number}`}
            </ParticipantBubble>
          ) : canEdit ? (
            <button
              type="button"
              className="inline-flex items-center justify-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold transition-all hover:ring-2 hover:ring-primary/30"
              style={{ border: '1px dashed hsl(var(--muted-foreground))' }}
              onClick={() => setAssignOpen(true)}
            >
              + Assign
            </button>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </div>

        {/* Fixed delete column: inside the block, identical position on every
            row whatever the participant chip's width. */}
        <div className="flex w-9 shrink-0 items-center justify-center">
          {canEdit && (
            <DeleteConfirmDialog
              itemLabel="this linked activity"
              tooltip="Delete this linked activity"
              onConfirm={() => onDelete(activity.id)}
            />
          )}
        </div>


      </div>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Participant responsible for establishing the link</DialogTitle>
            <DialogDescription>
              Choose the partner organisation responsible for establishing this link.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[400px]">
            <div className="space-y-1 p-1">
              <button
                onClick={() => {
                  onUpdate(activity.id, { responsibleParticipantId: null });
                  setAssignOpen(false);
                }}
                className="w-full rounded-md p-3 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/80"
              >
                None
              </button>
              {participants.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    onUpdate(activity.id, { responsibleParticipantId: p.id });
                    setAssignOpen(false);
                  }}
                  className="flex w-full items-center rounded-md p-3 text-left transition-colors hover:bg-muted/80"
                >
                  <div className="w-24 shrink-0">
                    <ParticipantBubble
                      style={{ fontSize: '12px', height: 'auto', padding: '2px 8px' }}
                    >
                      {p.organisation_short_name || `P${p.participant_number}`}
                    </ParticipantBubble>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{p.organisation_name}</div>
                    {p.english_name && p.english_name !== p.organisation_name && (
                      <div className="truncate text-xs text-muted-foreground">{p.english_name}</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <div className="space-y-1">
        <MethodologyRichEditor
          proposalId={proposalId}
          value={activity.linkDescriptionHtml ?? ''}
          onChange={(html) => onUpdate(activity.id, { linkDescriptionHtml: html })}
          canEdit={canEdit}
          isCoordinator={isCoordinator}
          minHeight="2.5rem"
          placeholder="How the project will be linked"
        />
      </div>
    </div>
  );
}

export default function LinkedActivitiesTable({
  proposalId,
  canEdit,
  isCoordinator,
  controller,
  captionLabel,
}: LinkedActivitiesTableProps) {
  const internal = useLinkedActivities(controller ? '' : proposalId);
  const { activities, deletedActivities, addActivity, deleteActivity, restoreActivity, updateField, reorder } =
    controller ?? internal;
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);
  const [binOpen, setBinOpen] = useState(false);

  const { data: participants = [] } = useQuery({
    queryKey: ['participants-for-case', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('participants')
        .select('id, organisation_short_name, organisation_name, english_name, participant_number')
        .eq('proposal_id', proposalId)
        .order('participant_number');
      if (error) throw error;
      return data as ParticipantSummary[];
    },
    enabled: !!proposalId,
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const ordered = (() => {
    if (!localOrder) return activities;
    const byId = new Map(activities.map((a) => [a.id, a]));
    const list = localOrder.map((id) => byId.get(id)).filter(Boolean) as LinkedActivity[];
    return list.length === activities.length ? list : activities;
  })();

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = ordered.map((a) => a.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const nextIds = arrayMove(ids, oldIndex, newIndex);
    setLocalOrder(nextIds);
    reorder(nextIds).catch(() => {
      setLocalOrder(null);
      toast.error('Could not save the new order');
    });
  };

  return (
    <div className="space-y-3">
      {captionLabel && (
        <EditableCaption
          proposalId={proposalId}
          tableKey="b12.linked_activities"
          label={captionLabel}
          defaultCaption="Linked research & innovation activities"
          canEdit={canEdit}
        />
      )}
      {ordered.length === 0 ? (
        <p className="text-sm italic text-muted-foreground">
          No linked activities yet
          {canEdit ? ' — add the first related project below.' : '.'}
        </p>
      ) : (
        <div
          /* Rows sit inside a 1px border plus p-3, so their content starts
             13px from the block edge — the labels must match exactly. */
          className={`${GRID} px-[13px] text-xs font-medium text-muted-foreground`}
        >
          <span />
          <span>Project acronym</span>
          <span>Funding instrument</span>
          <span>Duration</span>
          <span>Participant responsible for establishing the link</span>
          <span />
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ordered.map((a) => a.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {ordered.map((activity) => (
              <SortableActivityRow
                key={activity.id}
                activity={activity}
                proposalId={proposalId}
                canEdit={canEdit}
                isCoordinator={isCoordinator}
                participants={participants}
                onUpdate={updateField}
                onDelete={(id) =>
                  deleteActivity(id).catch(() => toast.error('Could not delete the activity'))
                }
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {canEdit && !controller && (
        <div className="flex items-center gap-2">
          <Tip label="Add activity">
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => addActivity().catch(() => toast.error('Could not add the activity'))}
            >
              <Plus className="h-3.5 w-3.5" />
              Add activity
            </Button>
          </Tip>
          {deletedActivities.length > 0 && (
            <Tip label={`Restore deleted activity (${deletedActivities.length} in the recycle bin)`}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBinOpen(true)}
              >
                <Recycle className="mr-1 h-3.5 w-3.5 text-emerald-600" strokeWidth={2.5} />
                Restore activity ({deletedActivities.length})
              </Button>
            </Tip>
          )}

        </div>
      )}

      {!controller && (
      <Dialog open={binOpen} onOpenChange={setBinOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Restore activity</DialogTitle>
            <DialogDescription>
              Deleted linked activities are kept here. Restoring brings the row back with all of
              its content.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[320px]">
            <div className="space-y-1 p-1">
              {deletedActivities.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {htmlToPlainText(a.acronym ?? '') || (
                      <span className="italic text-muted-foreground">No acronym</span>
                    )}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      restoreActivity(a.id)
                        .then(() => {
                          if (deletedActivities.length === 1) setBinOpen(false);
                        })
                        .catch(() => toast.error('Could not restore the activity'))
                    }
                  >
                    <RotateCcw className="mr-1 h-3.5 w-3.5" />
                    Restore
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
      )}
    </div>
  );
}
