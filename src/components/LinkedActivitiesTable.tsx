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
import { useColumnResize } from '@/hooks/useColumnResize';
import { ColumnResizer } from '@/components/ColumnResizer';
import { EditableColumnHeader } from '@/components/EditableColumnHeader';
import { useColumnHeaders } from '@/hooks/useColumnHeaders';


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
import {
  MarginRailAbsolute,
  RAIL_DELIVERABLE_DELETE_NUDGE,
} from '@/components/cards/MarginRail';
import { MethodologyRichEditor } from '@/components/MethodologyRichEditor';
import {
  FUNDING_INSTRUMENTS,
  getInstrumentAbbreviation,
  getInstrumentFullName,
  formatDurationShort,
} from '@/lib/fundingInstruments';
import { YearRangePicker } from '@/components/YearRangePicker';
import { useLinkedActivities, type LinkedActivity } from '@/hooks/useLinkedActivities';
import { LazyRichField } from '@/components/participant/LazyRichField';
import { HEADING_TITLE_FIELD_EXTENSIONS } from '@/components/wp/wpDraftFieldExtensions';
import { ensureRichHtml } from '@/lib/richTextUpgrade';
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
const tableStyles = "font-['Times_New_Roman',Times,serif] text-[11pt] text-left [&_p]:!text-left";
const cellStyles =
  "px-[3pt] py-[0.75pt] align-middle font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight text-left";
const firstCellStyles = `${cellStyles} !pl-0`;




/** The 18 cm text column, in CSS pixels — the hard cap for every table. */
const BLOCK_WIDTH = 768;

const DEFAULT_COL_PCT = ['37%', '43%', '20%'];

/** Template defaults; a user's retyped wording overrides these per proposal. */
const DEFAULT_HEADERS = ['Project', 'How the project will be linked', 'By whom'];

const DEFAULT_CAPTION =
  'How relevant research & innovation activities will be linked & whom will establish the link';

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
  const [detailsOpen, setDetailsOpen] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const selected = participants.find((p) => p.id === activity.responsibleParticipantId);
  const isOther = activity.instrumentCode === 'OTHER';

  /* One value, one cell: "TEHDAS2, EU4H, 2024-26". The instrument shows its
     abbreviation only and the year range uses a hyphen with a two-digit end
     year, matching the Typst emitter exactly. */
  const projectLabel = [
    htmlToPlainText(activity.acronym || '').trim(),
    getInstrumentAbbreviation(activity.instrumentCode, activity.instrumentCustom).trim(),
    formatDurationShort(activity.durationStart, activity.durationEnd).trim(),
  ]
    .filter((part) => part.length > 0)
    .join(', ');

  return (
    /* One <tr> per activity: every column, description included, on a single
       row so the sortable unit is a real table row. */
    <tr ref={setNodeRef} style={style} className="border-b border-gray-200 last:border-b-0">

        <td className={`${firstCellStyles} relative break-words`}>
          {canEdit ? (
            <Tip label="Drag to reorder this activity">
              <button
                type="button"
                className="absolute right-full top-1/2 mr-1 -translate-y-1/2 cursor-grab touch-none text-blue-600"
                {...attributes}
                {...listeners}
              >
                <GripVertical className="h-4 w-4" />
              </button>
            </Tip>
          ) : null}
          {canEdit ? (
            <button
              type="button"
              data-scalar-field=""
              onClick={() => setDetailsOpen(true)}
              className="w-full break-words text-left font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight"
            >
              {projectLabel || (
                <span className="italic text-muted-foreground">Project, instrument, years</span>
              )}
            </button>
          ) : (
            <span>{projectLabel || '—'}</span>
          )}

          <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Project details</DialogTitle>
                <DialogDescription>
                  The acronym, funding instrument and years appear together in the Project column.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Acronym</label>
                  <LazyRichField
                    singleLine
                    proposalId={proposalId}
                    value={ensureRichHtml(activity.acronym)}
                    placeholder="Acronym"
                    minHeight="32px"
                    className="font-['Times_New_Roman',Times,serif] text-[11pt] [&_p]:m-0"
                    staticExtensions={HEADING_TITLE_FIELD_EXTENSIONS}
                    onChange={(html) => onUpdate(activity.id, { acronym: html })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Funding instrument
                  </label>
                  <Select
                    value={activity.instrumentCode ?? NONE}
                    onValueChange={(v) =>
                      onUpdate(activity.id, {
                        instrumentCode: v === NONE ? null : v,
                        ...(v === 'OTHER' ? {} : { instrumentCustom: null }),
                      })
                    }
                  >
                    <SelectTrigger aria-label="Funding instrument">
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
                      placeholder="Instrument abbreviation"
                      aria-label="Custom funding instrument"
                    />
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Years</label>
                  <YearRangePicker
                    startYear={activity.durationStart}
                    endYear={activity.durationEnd}
                    onChange={(start, end) =>
                      onUpdate(activity.id, { durationStart: start, durationEnd: end })
                    }
                    className="w-full justify-start"
                  />
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </td>


        {/* How the project will be linked — a normal cell on the same row.
            No min-height: the field hugs its own text so the cell's
            vertical-align: middle centres placeholder and content alike. */}
        <td className={`${cellStyles} break-words`}>
          <MethodologyRichEditor
            proposalId={proposalId}
            value={activity.linkDescriptionHtml ?? ''}
            onChange={(html) => onUpdate(activity.id, { linkDescriptionHtml: html })}
            canEdit={canEdit}
            isCoordinator={isCoordinator}
            minHeight="0"
            placeholder="How the project will be linked"
            cellSurface
          />
        </td>


        {/* Participant is the final content column; the trailing cell contains
            only the row action, as in other authored tables. */}
        <td className={`${cellStyles} relative`}>
          <div data-scalar-field="" tabIndex={-1} className="flex min-w-0 items-center gap-1 outline-none">
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
                className="inline-flex items-center justify-center whitespace-nowrap text-xs font-bold"
                onClick={() => setAssignOpen(true)}
              >
                + Assign
              </button>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
        </td>

        {/* Row actions live in their own narrow column so they are always
            visible; a bare <div> child of <tr> is not laid out as a cell and
            could only be positioned against the drag transform. */}
        <td data-noresize="" className={`${cellStyles} !px-0 w-[28px] relative`}>
          {canEdit && (
            /* On the shared margin rail, at the deliverable delete button's
               horizontal position, rather than a hand-set column offset. */
            <MarginRailAbsolute nudge={RAIL_DELIVERABLE_DELETE_NUDGE}>
              <DeleteConfirmDialog
                itemLabel="this linked activity"
                tooltip="Delete this linked activity"
                buttonClassName="h-6 w-6 text-red-600 hover:text-red-700"
                iconSize="h-4 w-4"
                onConfirm={() => onDelete(activity.id)}
              />
            </MarginRailAbsolute>
          )}
        </td>


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
    </tr>
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

  const canResize = canEdit;
  const { colWidths, tableRef, handleColResizeStart } = useColumnResize({
    proposalId,
    tableKey: 'b12-linked-activities',
    canResize,
    maxTotalWidth: BLOCK_WIDTH,
    expectedColumnCount: DEFAULT_COL_PCT.length,
  });
  const sized = colWidths.length === DEFAULT_COL_PCT.length;
  const { headers, setHeader } = useColumnHeaders(
    proposalId,
    'b12-linked-activities',
    DEFAULT_HEADERS,
  );
  const instrumentLegend = Array.from(
    new Map(
      activities
        .map((activity) => {
          const abbreviation = getInstrumentAbbreviation(activity.instrumentCode, activity.instrumentCustom);
          const fullName = getInstrumentFullName(activity.instrumentCode, activity.instrumentCustom);
          return abbreviation && fullName && abbreviation !== fullName
            ? [abbreviation, fullName] as const
            : null;
        })
        .filter((entry): entry is readonly [string, string] => entry !== null),
    ).entries(),
  );


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
          defaultCaption={DEFAULT_CAPTION}
          canEdit={canEdit}
        />
      )}
      {ordered.length === 0 ? (
        <p className="text-sm italic text-muted-foreground">
          No linked activities yet
          {canEdit ? ' — add the first related project below.' : '.'}
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={ordered.map((a) => a.id)} strategy={verticalListSortingStrategy}>
            <table
              ref={tableRef}
              data-table-key="b12-linked-activities"
              className={`${tableStyles} w-full max-w-full bg-white [&_th]:border-x-0 [&_th]:border-t-0 [&_th]:border-b-[1.5px] [&_th]:border-black [&_td]:border-0 [&_tbody_tr]:border-x-0 [&_tbody_tr]:border-t-0 [&_tbody_tr]:border-b [&_tbody_tr]:border-gray-200 [&_tbody_tr:last-child]:border-b-0`}
              style={{
                tableLayout: 'fixed',
                width: sized ? `${colWidths.reduce((s, w) => s + w, 0)}px` : '100%',
                borderCollapse: 'collapse',
              }}
            >
              <colgroup>
                {DEFAULT_COL_PCT.map((pct, i) => (
                  <col key={i} style={{ width: sized ? `${colWidths[i]}px` : pct }} />
                ))}
                {/* Editor-only action column; never part of the document table. */}
                <col style={{ width: '28px' }} />
              </colgroup>
              <thead>
                <tr>
                  {headers.map((h, i) => (
                    <th
                      key={i}
                      className={`${
                        i === 0 ? firstCellStyles : cellStyles
                      } relative align-bottom font-bold`}
                    >
                      <EditableColumnHeader
                        value={h}
                        canEdit={canEdit}
                        onCommit={(next) => setHeader(i, next)}
                      />
                      {canResize && i < DEFAULT_COL_PCT.length - 1 && (
                        <ColumnResizer onMouseDown={handleColResizeStart(i)} />
                      )}
                    </th>
                  ))}
                  <th data-noresize="" className={`${cellStyles} !px-0 !border-0`} />
                </tr>
              </thead>
              <tbody>
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
              </tbody>
              {instrumentLegend.length > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={DEFAULT_COL_PCT.length + 1} className="!border-0 !px-0 !pt-[2pt] !pb-0 align-top text-[8pt] leading-tight">
                      {instrumentLegend.map(([abbreviation, fullName], index) => (
                        <span key={abbreviation}>
                          {index > 0 ? '; ' : ''}
                          <strong>{abbreviation}</strong> = {fullName}
                        </span>
                      ))}
                    </td>
                  </tr>
                </tfoot>
              )}


            </table>
          </SortableContext>
        </DndContext>
      )}


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
