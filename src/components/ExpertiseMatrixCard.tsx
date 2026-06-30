import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { DebouncedInput } from '@/components/ui/debounced-input';
import { DebouncedTextarea } from '@/components/ui/debounced-textarea';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { ParticipantBubble } from './B31Pill';
import { useExpertiseMatrix, ExpertiseRow, ExpertiseColumn } from '@/hooks/useExpertiseMatrix';
import type { Participant } from '@/types/proposal';
import { useProposalRole } from '@/hooks/useProposalRole';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface Props {
  proposalId: string;
  participants: Participant[];
}

export function ExpertiseMatrixCard({ proposalId, participants }: Props) {
  const { roleTier } = useProposalRole(proposalId);
  const isCoordinator = roleTier === 'coordinator';
  const canEditCells = roleTier === 'coordinator' || roleTier === 'editor';

  const {
    enabled, rows, columns, cellMap, loading,
    setEnabled, addRow, deleteRow, updateRowLabel, reorderRows,
    addCustomColumn, deleteCustomColumn, updateColumnHeader, setCell,
  } = useExpertiseMatrix(proposalId, participants);

  const partMap = useMemo(() => new Map(participants.map((p) => [p.id, p])), [participants]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = rows.map((r) => r.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    reorderRows(arrayMove(ids, from, to));
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Expertise matrix</CardTitle>
        <CardDescription>
          Tick the area(s) of expertise each participant brings to the consortium. This table is mirrored read-only into Part B3.2.
        </CardDescription>
        <div className="flex items-center gap-2 pt-2">
          <Checkbox
            id="expertise-matrix-enabled"
            checked={!!enabled}
            disabled={!isCoordinator}
            onCheckedChange={(v) => setEnabled(v === true)}
          />
          <label htmlFor="expertise-matrix-enabled" className="text-sm cursor-pointer">
            Show expertise matrix
          </label>
          {!isCoordinator && (
            <span className="text-xs italic text-muted-foreground ml-2">
              Only coordinators can toggle visibility or edit headers.
            </span>
          )}
        </div>
      </CardHeader>

      {enabled && (
        <CardContent className="space-y-3">
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b-[1.5px] border-black">
                      <th className="w-7 px-1 py-1" />
                      <th className="text-left px-2 py-1 font-bold text-sm text-foreground align-bottom">
                        Expertise
                      </th>
                      {columns.map((col) => (
                        <th key={col.id} className="px-0.5 py-1 align-bottom font-bold text-sm text-foreground" style={{ width: '80px' }}>
                          <HeaderCell
                            col={col}
                            participant={col.participant_id ? partMap.get(col.participant_id) : undefined}
                            canEditHeader={isCoordinator}
                            onChange={(v) => updateColumnHeader(col.id, v)}
                          />
                        </th>
                      ))}
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                      <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
                        {rows.map((row) => (
                          <SortableRow
                            key={row.id}
                            row={row}
                            columns={columns}
                            cellMap={cellMap}
                            canEdit={canEditCells}
                            onLabelChange={(v) => updateRowLabel(row.id, v)}
                            onCellToggle={(colId, checked) => setCell(row.id, colId, checked)}
                            onDelete={() => deleteRow(row.id)}
                          />
                        ))}
                      </SortableContext>
                    </DndContext>

                    {/* Custom column delete-bin row */}
                    {columns.some((c) => c.kind === 'custom') && (
                      <tr>
                        <td />
                        <td />
                        {columns.map((col) => (
                          <td key={col.id} className="px-1 py-1 text-center align-top">
                            {col.kind === 'custom' && (
                              <Button
                                size="icon" variant="ghost"
                                className="h-7 w-7 text-red-600 hover:text-red-700"
                                disabled={!isCoordinator}
                                onClick={() => deleteCustomColumn(col.id)}
                                title="Delete column"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </td>
                        ))}
                        <td />
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-2">
                {isCoordinator && (
                  <Button size="sm" variant="outline" onClick={addCustomColumn}>
                    <Plus className="h-4 w-4 mr-1" /> Add column
                  </Button>
                )}
                {canEditCells && (
                  <Button size="sm" variant="outline" onClick={addRow}>
                    <Plus className="h-4 w-4 mr-1" /> Add row
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function HeaderCell({
  col, participant, canEditHeader, onChange,
}: {
  col: ExpertiseColumn;
  participant?: Participant;
  canEditHeader: boolean;
  onChange: (v: string) => void;
}) {
  if (col.kind === 'participant') {
    return (
      <div className="flex justify-center">
        <ParticipantBubble
          number={participant?.participantNumber}
          shortName={participant?.organisationShortName || ''}
        />
      </div>
    );
  }
  return (
    <DebouncedTextarea
      value={col.header_text || ''}
      onDebouncedChange={onChange}
      disabled={!canEditHeader}
      placeholder="Header"
      rows={2}
      className="text-[11px] leading-tight px-1 py-0.5 min-h-[28px] resize-none w-full whitespace-normal break-words text-center"
    />
  );
}

function SortableRow({
  row, columns, cellMap, canEdit, onLabelChange, onCellToggle, onDelete,
}: {
  row: ExpertiseRow;
  columns: ExpertiseColumn[];
  cellMap: Map<string, boolean>;
  canEdit: boolean;
  onLabelChange: (v: string) => void;
  onCellToggle: (columnId: string, checked: boolean) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <tr ref={setNodeRef} style={style} className="border-b last:border-b-0">
      <td className="w-7 px-1 py-1.5 align-middle">
        <button
          {...attributes}
          {...listeners}
          type="button"
          className="text-blue-600 hover:text-blue-700 cursor-grab active:cursor-grabbing"
          aria-label="Reorder row"
          disabled={!canEdit}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </td>
      <td className="px-1 py-0.5 align-middle">
        <DebouncedTextarea
          value={row.label}
          onDebouncedChange={onLabelChange}
          disabled={!canEdit}
          placeholder="Expertise area"
          rows={1}
          className="text-[11px] leading-tight px-1 py-0.5 min-h-[28px] resize-none w-full whitespace-normal break-words"
        />
      </td>
      {columns.map((col) => {
        const checked = cellMap.get(`${row.id}::${col.id}`) === true;
        return (
          <td key={col.id} className="px-0.5 py-0.5 text-center align-middle">
            <Checkbox
              checked={checked}
              disabled={!canEdit}
              onCheckedChange={(v) => onCellToggle(col.id, v === true)}
            />
          </td>
        );
      })}
      <td className="w-8 px-1 py-1.5 text-center align-middle">
        <Button
          size="icon" variant="ghost"
          className="h-7 w-7 text-red-600 hover:text-red-700"
          disabled={!canEdit}
          onClick={onDelete}
          title="Delete row"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </td>
    </tr>
  );
}
