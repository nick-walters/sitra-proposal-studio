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
import { GripVertical, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
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
}

const GRID = 'grid items-center gap-2 grid-cols-[1.25rem_minmax(7rem,1.3fr)_minmax(11rem,1.3fr)_minmax(7rem,0.7fr)_minmax(11rem,1.4fr)_1.5rem]';

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
    <div ref={setNodeRef} style={style} className="space-y-2 rounded-md border border-border p-3">
      <div className={GRID}>
        {canEdit ? (
          <button
            type="button"
            className="cursor-grab touch-none text-[#2563EB]"
            aria-label="Reorder linked activity"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        ) : (
          <span />
        )}

        {/* Acronym */}
        {canEdit ? (
          <Input
            value={activity.acronym}
            onChange={(e) => onUpdate(activity.id, { acronym: e.target.value })}
            placeholder="Acronym"
            className="h-8 text-xs"
          />
        ) : (
          <span className="truncate text-xs">{activity.acronym || '—'}</span>
        )}

        {/* Instrument */}
        {canEdit ? (
          <div className="flex min-w-0 items-center gap-1">
            <Select
              value={activity.instrumentCode ?? NONE}
              onValueChange={(v) =>
                onUpdate(activity.id, {
                  instrumentCode: v === NONE ? null : v,
                  ...(v === 'OTHER' ? {} : { instrumentCustom: null }),
                })
              }
            >
              <SelectTrigger className="h-8 min-w-0 flex-1 text-xs" aria-label="Funding instrument">
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
          <YearRangePicker
            startYear={activity.durationStart}
            endYear={activity.durationEnd}
            onChange={(start, end) =>
              onUpdate(activity.id, { durationStart: start, durationEnd: end })
            }
          />
        ) : (
          <span className="truncate text-xs">
            {formatYearRange(activity.durationStart, activity.durationEnd) ?? '—'}
          </span>
        )}

        {/* Responsible participant */}
        <div className="min-w-0">
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

        {canEdit ? (
          <DeleteConfirmDialog
            itemLabel="this linked activity"
            onConfirm={() => onDelete(activity.id)}
          />
        ) : (
          <span />
        )}
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
        <div className="text-xs text-muted-foreground">How the project will be linked</div>
        <MethodologyRichEditor
          proposalId={proposalId}
          value={activity.linkDescriptionHtml ?? ''}
          onChange={(html) => onUpdate(activity.id, { linkDescriptionHtml: html })}
          canEdit={canEdit}
          isCoordinator={isCoordinator}
          minHeight="2.5rem"
        />
      </div>
    </div>
  );
}

export default function LinkedActivitiesTable({
  proposalId,
  canEdit,
  isCoordinator,
}: LinkedActivitiesTableProps) {
  const { activities, addActivity, deleteActivity, updateField, reorder } =
    useLinkedActivities(proposalId);
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);

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
      {ordered.length === 0 ? (
        <p className="text-sm italic text-muted-foreground">
          No linked activities yet
          {canEdit ? ' — add the first related project below.' : '.'}
        </p>
      ) : (
        <div className={`${GRID} px-3 text-xs font-medium text-muted-foreground`}>
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

      {canEdit && (
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() => addActivity().catch(() => toast.error('Could not add the activity'))}
        >
          <Plus className="h-3.5 w-3.5" />
          Add linked research &amp; innovation activity
        </Button>
      )}
    </div>
  );
}
