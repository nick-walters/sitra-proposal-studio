import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { EditableCaption } from '@/components/EditableCaption';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { useEffect, useRef, useCallback, useState } from 'react';
import { toast } from 'sonner';
import { useUserRole } from '@/hooks/useUserRole';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const tableStyles = "font-['Times_New_Roman',Times,serif] text-[11pt]";

interface OngoingProject {
  id: string;
  proposal_id: string;
  acronym_name: string;
  funding_programme: string;
  period: string;
  coordinator: string;
  relation: string;
  order_index: number;
}

const COLUMNS = [
  { key: 'acronym_name', label: 'Project acronym/name', width: '20%' },
  { key: 'funding_programme', label: 'Funding programme', width: '18%' },
  { key: 'period', label: 'Period', width: '12%' },
  { key: 'coordinator', label: 'Coordinator', width: '18%' },
  { key: 'relation', label: 'Relation to this project', width: '32%' },
] as const;

type ColumnKey = typeof COLUMNS[number]['key'];

function SortableRow({
  row, canEdit, onUpdate, onDelete,
}: {
  row: OngoingProject; canEdit: boolean;
  onUpdate: (id: string, field: ColumnKey, value: string) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <tr ref={setNodeRef} style={{ ...style, borderBottom: '0.5px solid #d1d5db' }} {...attributes}>
      {canEdit && (
        <td className="w-6 p-0 text-center" style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', left: '-28px', top: '50%', transform: 'translateY(-50%)' }}>
            <button {...listeners} className="cursor-grab text-muted-foreground hover:text-foreground p-0.5" tabIndex={-1}>
              <GripVertical className="h-3.5 w-3.5" style={{ color: '#2563EB' }} />
            </button>
          </div>
        </td>
      )}
      {COLUMNS.map(col => (
        <td key={col.key} className="p-1 border-r border-border last:border-r-0" style={{ fontFamily: "'Times New Roman', Times, serif", fontSize: '11pt', width: col.width }}>
          {canEdit ? (
            <DebouncedInput
              value={(row as any)[col.key] || ''}
              onChange={(v) => onUpdate(row.id, col.key, v)}
            />
          ) : (
            <span>{(row as any)[col.key] || ''}</span>
          )}
        </td>
      ))}
      {canEdit && (
        <td className="w-6 p-0 text-center" style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', right: '-28px', top: '50%', transform: 'translateY(-50%)' }}>
            <button onClick={() => onDelete(row.id)} className="text-muted-foreground hover:text-destructive p-0.5" tabIndex={-1}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </td>
      )}
    </tr>
  );
}

function DebouncedInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [localValue, setLocalValue] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => { setLocalValue(value); }, [value]);

  const handleChange = (v: string) => {
    setLocalValue(v);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onChange(v), 500);
  };

  return (
    <input
      type="text"
      className={`${tableStyles} w-full bg-transparent outline-none border-none p-0`}
      value={localValue}
      onChange={(e) => handleChange(e.target.value)}
    />
  );
}

interface Props {
  proposalId: string;
}

export function B12OngoingProjectsTable({ proposalId }: Props) {
  const queryClient = useQueryClient();
  const { isAdminOrOwner, hasAnyCoordinatorRole } = useUserRole();
  const canEdit = isAdminOrOwner || hasAnyCoordinatorRole;
  const initialized = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['b12-ongoing-projects', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('b12_ongoing_projects')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('order_index');
      if (error) throw error;
      return (data || []) as OngoingProject[];
    },
  });

  // Initialize 8 empty rows if none exist
  useEffect(() => {
    if (isLoading || initialized.current) return;
    if (rows.length === 0) {
      initialized.current = true;
      const inserts = Array.from({ length: 8 }, (_, i) => ({
        proposal_id: proposalId,
        order_index: i,
      }));
      supabase.from('b12_ongoing_projects').insert(inserts).then(({ error }) => {
        if (!error) queryClient.invalidateQueries({ queryKey: ['b12-ongoing-projects', proposalId] });
      });
    }
  }, [isLoading, rows.length, proposalId, queryClient]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel('b12-ongoing-projects-realtime')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'b12_ongoing_projects',
        filter: `proposal_id=eq.${proposalId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['b12-ongoing-projects', proposalId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [proposalId, queryClient]);

  const handleUpdate = useCallback(async (id: string, field: ColumnKey, value: string) => {
    await supabase.from('b12_ongoing_projects').update({ [field]: value }).eq('id', id);
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    await supabase.from('b12_ongoing_projects').delete().eq('id', id);
    queryClient.invalidateQueries({ queryKey: ['b12-ongoing-projects', proposalId] });
  }, [proposalId, queryClient]);

  const handleAdd = useCallback(async () => {
    const maxOrder = rows.length > 0 ? Math.max(...rows.map(r => r.order_index)) + 1 : 0;
    await supabase.from('b12_ongoing_projects').insert({ proposal_id: proposalId, order_index: maxOrder });
    queryClient.invalidateQueries({ queryKey: ['b12-ongoing-projects', proposalId] });
  }, [rows, proposalId, queryClient]);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = rows.findIndex(r => r.id === active.id);
    const newIndex = rows.findIndex(r => r.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(rows, oldIndex, newIndex);
    // Optimistic update
    queryClient.setQueryData(['b12-ongoing-projects', proposalId], reordered);
    // Persist
    await Promise.all(reordered.map((r, i) =>
      supabase.from('b12_ongoing_projects').update({ order_index: i }).eq('id', r.id)
    ));
  }, [rows, proposalId, queryClient]);

  return (
    <div className="mt-4" style={{ overflow: 'visible' }}>
      <EditableCaption
        proposalId={proposalId}
        tableKey="b12-ongoing-projects"
        label="Table 1.2.i."
        defaultCaption="Ongoing & recently completed projects & initiatives with which the project will collaborate"
      />

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <table
          className={`${tableStyles} w-full border-collapse`}
          style={{ maxWidth: '18cm', tableLayout: 'fixed', lineHeight: 1.0, overflow: 'visible' }}
        >
          <thead>
            <tr style={{ borderBottom: '1.5px solid #000000' }}>
              {canEdit && <th className="w-6" />}
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  className="p-1.5 text-left font-bold"
                  style={{ fontFamily: "'Times New Roman', Times, serif", fontSize: '11pt', width: col.width, whiteSpace: 'normal' }}
                >
                  {col.label}
                </th>
              ))}
              {canEdit && <th className="w-6" />}
            </tr>
          </thead>
          <SortableContext items={rows.map(r => r.id)} strategy={verticalListSortingStrategy}>
            <tbody>
              {rows.map(row => (
                <SortableRow
                  key={row.id}
                  row={row}
                  canEdit={canEdit}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                />
              ))}
            </tbody>
          </SortableContext>
        </table>
      </DndContext>

      {canEdit && (
        <div className="mt-1">
          <Button variant="ghost" size="sm" onClick={handleAdd} className="text-xs h-6 px-2 text-muted-foreground hover:text-foreground">
            <Plus className="h-3 w-3 mr-1" /> Add row
          </Button>
        </div>
      )}
    </div>
  );
}
