import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { EditableCaption } from '@/components/EditableCaption';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, GripVertical, Check, ChevronsUpDown } from 'lucide-react';
import { useEffect, useRef, useCallback, useState } from 'react';
import { useUserRole } from '@/hooks/useUserRole';
import { useColumnResize } from '@/hooks/useColumnResize';
import { ColumnResizer } from '@/components/ColumnResizer';
import { applyColumnWidthsToTable, computeAutoFitSmart } from '@/lib/autoFitColumns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
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
  project_info: string | null;
  shared_data: string | null;
  order_index: number | null;
}

interface Participant {
  id: string;
  organisation_short_name: string | null;
  organisation_name: string;
  participant_number: number;
}

const COLUMN_KEYS = ['project_info', 'shared_data', 'participants'] as const;
const COLUMN_LABELS_DEFAULT = [
  'Project acronym, funder & duration',
  'Data, expertise & tools to be shared',
  'Participant(s) to establish link',
];
const COLUMN_WIDTHS = ['34%', '38%', '28%'];

type EditableColumnKey = 'project_info' | 'shared_data';

/* ── Participant bubble dropdown ────────────────────────────── */
function ParticipantCellDropdown({
  rowId, participants, selectedIds, canEdit, onToggle,
}: {
  rowId: string;
  participants: Participant[];
  selectedIds: string[];
  canEdit: boolean;
  onToggle: (rowId: string, participantId: string, selected: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedParticipants = participants.filter(p => selectedIds.includes(p.id));

  if (!canEdit) {
    return (
      <div className="flex flex-wrap gap-0.5">
        {selectedParticipants.map(p => (
          <span
            key={p.id}
            className="inline-flex items-center rounded-full font-bold whitespace-nowrap"
            style={{
              backgroundColor: '#000000', color: '#FFFFFF', border: '1.5px solid #000000',
              fontFamily: "'Times New Roman', Times, serif", fontSize: '11pt', fontWeight: 700,
              lineHeight: 1, padding: '0px 5px',
            }}
          >
            {p.organisation_short_name || p.organisation_name}
          </span>
        ))}
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="w-full flex items-center justify-between min-h-[20px] bg-transparent outline-none border-none p-0 cursor-pointer"
          style={{ fontFamily: "'Times New Roman', Times, serif", fontSize: '11pt' }}
        >
          <div className="flex flex-wrap gap-0.5">
            {selectedParticipants.length === 0 ? (
              <span className="text-muted-foreground text-xs">Select...</span>
            ) : (
              selectedParticipants.map(p => (
                <span
                  key={p.id}
                  className="inline-flex items-center rounded-full font-bold whitespace-nowrap"
                  style={{
                    backgroundColor: '#000000', color: '#FFFFFF', border: '1.5px solid #000000',
                    fontFamily: "'Times New Roman', Times, serif", fontSize: '11pt', fontWeight: 700,
                    lineHeight: 1, padding: '0px 5px',
                  }}
                >
                  {p.organisation_short_name || p.organisation_name}
                </span>
              ))
            )}
          </div>
          <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50 ml-1" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="start">
        <div className="max-h-[200px] overflow-y-auto">
          {participants.map((participant) => {
            const isSelected = selectedIds.includes(participant.id);
            return (
              <button
                key={participant.id}
                className={cn(
                  "flex items-center gap-2 w-full px-2 py-1.5 text-sm hover:bg-accent cursor-pointer",
                  isSelected && "bg-accent"
                )}
                onClick={() => onToggle(rowId, participant.id, !isSelected)}
              >
                <div className={cn(
                  "flex h-4 w-4 items-center justify-center rounded-sm border",
                  isSelected ? "bg-primary border-primary" : "border-primary"
                )}>
                  {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                </div>
                <span className="truncate">
                  {participant.organisation_short_name || participant.organisation_name}
                </span>
              </button>
            );
          })}
          {participants.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No participants</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ── Debounced text input ───────────────────────────────────── */
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
    <textarea
      rows={1}
      className={`${tableStyles} w-full bg-transparent outline-none border-none p-0 resize-none overflow-hidden`}
      value={localValue}
      onChange={(e) => {
        handleChange(e.target.value);
        // Auto-resize height
        e.target.style.height = 'auto';
        e.target.style.height = e.target.scrollHeight + 'px';
      }}
      onInput={(e) => {
        const el = e.target as HTMLTextAreaElement;
        el.style.height = 'auto';
        el.style.height = el.scrollHeight + 'px';
      }}
      ref={(el) => {
        if (el) {
          el.style.height = 'auto';
          el.style.height = el.scrollHeight + 'px';
        }
      }}
    />
  );
}

/* ── Editable header input ──────────────────────────────────── */
function DebouncedHeaderInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [localValue, setLocalValue] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => { setLocalValue(value); }, [value]);

  const handleChange = (v: string) => {
    setLocalValue(v);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onChange(v), 500);
  };

  return (
    <textarea
      rows={1}
      className={`${tableStyles} w-full bg-transparent outline-none border-none p-0 font-bold resize-none overflow-hidden`}
      value={localValue}
      onChange={(e) => {
        handleChange(e.target.value);
        e.target.style.height = 'auto';
        e.target.style.height = e.target.scrollHeight + 'px';
      }}
      onInput={(e) => {
        const el = e.target as HTMLTextAreaElement;
        el.style.height = 'auto';
        el.style.height = el.scrollHeight + 'px';
      }}
      ref={(el) => {
        if (el) {
          el.style.height = 'auto';
          el.style.height = el.scrollHeight + 'px';
        }
      }}
    />
  );
}

/* ── Sortable row ───────────────────────────────────────────── */
function SortableRow({
  row, canEdit, participants, participantIds, onUpdate, onDelete, onToggleParticipant, defaultWidths,
}: {
  row: OngoingProject;
  canEdit: boolean;
  participants: Participant[];
  participantIds: string[];
  onUpdate: (id: string, field: EditableColumnKey, value: string) => void;
  onDelete: (id: string) => void;
  onToggleParticipant: (rowId: string, participantId: string, selected: boolean) => void;
  defaultWidths?: readonly string[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  const cellStyle = (width?: string): React.CSSProperties => ({
    fontFamily: "'Times New Roman', Times, serif",
    fontSize: '11pt',
    ...(width ? { width } : {}),
    padding: '0.03pt 4px',
    verticalAlign: 'middle',
  });

  return (
    <tr ref={setNodeRef} data-b12-row-id={row.id} style={{ ...style, borderBottom: '0.5px solid #d1d5db' }} {...attributes}>
      <td style={{ ...cellStyle(defaultWidths?.[0]), position: 'relative' }}>
        {canEdit && (
          <div style={{ position: 'absolute', left: '-24px', top: '50%', transform: 'translateY(-50%)' }}>
            <button {...listeners} className="cursor-grab text-muted-foreground hover:text-foreground p-0.5" tabIndex={-1}>
              <GripVertical className="h-3.5 w-3.5" style={{ color: '#2563EB' }} />
            </button>
          </div>
        )}
        {canEdit ? (
          <DebouncedInput value={row.project_info || ''} onChange={(v) => onUpdate(row.id, 'project_info', v)} />
        ) : (
          <span>{row.project_info || ''}</span>
        )}
      </td>
      <td style={cellStyle(defaultWidths?.[1])}>
        {canEdit ? (
          <DebouncedInput value={row.shared_data || ''} onChange={(v) => onUpdate(row.id, 'shared_data', v)} />
        ) : (
          <span>{row.shared_data || ''}</span>
        )}
      </td>
      <td style={{ ...cellStyle(defaultWidths?.[2]), position: 'relative' }}>
        <ParticipantCellDropdown
          rowId={row.id}
          participants={participants}
          selectedIds={participantIds}
          canEdit={canEdit}
          onToggle={onToggleParticipant}
        />
        {canEdit && (
          <div style={{ position: 'absolute', right: '-24px', top: '50%', transform: 'translateY(-50%)' }}>
            <button onClick={() => onDelete(row.id)} className="text-destructive hover:text-destructive p-0.5" tabIndex={-1}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

/* ── Main component ─────────────────────────────────────────── */
interface Props {
  proposalId: string;
  tableIndex?: number;
  sectionNumber?: string;
}

export function B12OngoingProjectsTable({ proposalId, tableIndex = 0, sectionNumber = '1.2' }: Props) {
  const queryClient = useQueryClient();
  const { isAdminOrOwner, hasAnyCoordinatorRole } = useUserRole();
  const canEdit = isAdminOrOwner || hasAnyCoordinatorRole;
  const initialized = useRef(false);
  const { colWidths, tableRef, handleColResizeStart, setColWidths, saveWidths } = useColumnResize({ proposalId, tableKey: 'b12-ongoing', canResize: canEdit });

  const dispatchToolbarFocus = useCallback((target: EventTarget | null) => {
    if (!(target instanceof Element)) return;

    window.dispatchEvent(new CustomEvent('b12-table-focus', {
      detail: {
        tableId: 'ongoing-projects',
        rowId: target.closest('[data-b12-row-id]')?.getAttribute('data-b12-row-id') ?? null,
      },
    }));
  }, []);

  // Editable column headers
  const [headerLabels, setHeaderLabels] = useState<string[]>(COLUMN_LABELS_DEFAULT);

  // Load saved headers
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('table_captions')
        .select('caption')
        .eq('proposal_id', proposalId)
        .eq('table_key', 'b12-ongoing-headers')
        .maybeSingle();
      if (data?.caption) {
        try {
          const parsed = JSON.parse(data.caption);
          if (Array.isArray(parsed) && parsed.length === 3) setHeaderLabels(parsed);
        } catch { /* ignore */ }
      }
    })();
  }, [proposalId]);

  const handleHeaderChange = useCallback(async (index: number, value: string) => {
    const updated = [...headerLabels];
    updated[index] = value;
    setHeaderLabels(updated);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('table_captions').upsert({
      proposal_id: proposalId,
      table_key: 'b12-ongoing-headers',
      caption: JSON.stringify(updated),
      updated_at: new Date().toISOString(),
      updated_by: user?.id || null,
    }, { onConflict: 'proposal_id,table_key' });
  }, [headerLabels, proposalId]);

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

  const { data: participants = [] } = useQuery({
    queryKey: ['b12-ongoing-participants', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('participants')
        .select('id, organisation_short_name, organisation_name, participant_number')
        .eq('proposal_id', proposalId)
        .order('participant_number');
      if (error) throw error;
      return (data || []) as Participant[];
    },
  });

  const { data: participantLinks = [] } = useQuery({
    queryKey: ['b12-ongoing-project-participants', proposalId],
    queryFn: async () => {
      const { data: projects } = await supabase
        .from('b12_ongoing_projects')
        .select('id')
        .eq('proposal_id', proposalId);
      if (!projects || projects.length === 0) return [];
      const ids = projects.map(p => p.id);
      const { data, error } = await supabase
        .from('b12_ongoing_project_participants')
        .select('*')
        .in('ongoing_project_id', ids);
      if (error) throw error;
      return data || [];
    },
    enabled: rows.length > 0,
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
    const ch1 = supabase
      .channel('b12-ongoing-projects-realtime')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'b12_ongoing_projects',
        filter: `proposal_id=eq.${proposalId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['b12-ongoing-projects', proposalId] });
      })
      .subscribe();
    const ch2 = supabase
      .channel('b12-ongoing-project-participants-realtime')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'b12_ongoing_project_participants',
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['b12-ongoing-project-participants', proposalId] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch1);
      supabase.removeChannel(ch2);
    };
  }, [proposalId, queryClient]);

  const handleUpdate = useCallback(async (id: string, field: EditableColumnKey, value: string) => {
    await supabase.from('b12_ongoing_projects').update({ [field]: value }).eq('id', id);
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    await supabase.from('b12_ongoing_projects').delete().eq('id', id);
    queryClient.invalidateQueries({ queryKey: ['b12-ongoing-projects', proposalId] });
  }, [proposalId, queryClient]);

  const handleAdd = useCallback(async () => {
    const maxOrder = rows.length > 0 ? Math.max(...rows.map(r => r.order_index ?? 0)) + 1 : 0;
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
    queryClient.setQueryData(['b12-ongoing-projects', proposalId], reordered);
    await Promise.all(reordered.map((r, i) =>
      supabase.from('b12_ongoing_projects').update({ order_index: i }).eq('id', r.id)
    ));
  }, [rows, proposalId, queryClient]);

  const handleToggleParticipant = useCallback(async (rowId: string, participantId: string, selected: boolean) => {
    if (selected) {
      await supabase.from('b12_ongoing_project_participants').insert({
        ongoing_project_id: rowId,
        participant_id: participantId,
      });
    } else {
      await supabase.from('b12_ongoing_project_participants')
        .delete()
        .eq('ongoing_project_id', rowId)
        .eq('participant_id', participantId);
    }
    queryClient.invalidateQueries({ queryKey: ['b12-ongoing-project-participants', proposalId] });
  }, [proposalId, queryClient]);

  const getParticipantIdsForRow = (rowId: string) =>
    participantLinks.filter(l => l.ongoing_project_id === rowId).map(l => l.participant_id);

  const handleAutoResize = useCallback(() => {
    const table = tableRef.current;
    if (!table) return;
    const widths = computeAutoFitSmart(table);
    if (widths && widths.length === COLUMN_KEYS.length) {
      applyColumnWidthsToTable(table, widths);
      setColWidths(widths);
      saveWidths(widths);
    }
  }, [setColWidths, saveWidths, tableRef]);

  useEffect(() => {
    const handleExternalAutoResize = (event: Event) => {
      const detail = (event as CustomEvent<{ tableId?: string }>).detail;
      if (detail?.tableId !== 'ongoing-projects') return;
      handleAutoResize();
    };

    window.addEventListener('b12-table-autoresize', handleExternalAutoResize as EventListener);
    return () => {
      window.removeEventListener('b12-table-autoresize', handleExternalAutoResize as EventListener);
    };
  }, [handleAutoResize]);

  const hasCustomWidths = colWidths.length === COLUMN_KEYS.length;
  const defaultWidths = hasCustomWidths ? undefined : COLUMN_WIDTHS;

  return (
    <div
      className="mt-4"
      data-b12-table="ongoing-projects"
      onFocusCapture={(e) => dispatchToolbarFocus(e.target)}
      style={{ overflow: 'visible', maxWidth: '18cm', width: '18cm' }}
    >
      <EditableCaption
        proposalId={proposalId}
        tableKey="b12-ongoing-projects"
        label={`Table ${sectionNumber.replace(/^[A-Za-z]+/, '')}.${String.fromCharCode(97 + tableIndex)}.`}
        defaultCaption="Ongoing & recently completed projects & initiatives with which the project will collaborate"
        onRefresh={() => window.dispatchEvent(new CustomEvent('caption-refresh-all'))}
      />

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <table
          ref={tableRef}
          className={`${tableStyles} w-full border-collapse`}
          style={{
            maxWidth: '18cm',
            tableLayout: 'fixed',
            lineHeight: 1.0,
            overflow: 'visible',
            width: hasCustomWidths ? `${colWidths.reduce((sum, width) => sum + width, 0)}px` : '100%',
          }}
        >
          {hasCustomWidths && (
            <colgroup>
              {colWidths.map((w, i) => (
                <col key={i} style={{ width: `${w}px` }} />
              ))}
            </colgroup>
          )}
          <thead>
            <tr style={{ borderBottom: '1.5px solid #000000' }}>
              {COLUMN_KEYS.map((key, i) => (
                <th
                  key={key}
                  className="text-left font-bold relative"
                  style={{
                    fontFamily: "'Times New Roman', Times, serif",
                    fontSize: '11pt',
                    width: hasCustomWidths ? undefined : COLUMN_WIDTHS[i],
                    whiteSpace: 'normal',
                    padding: '0.03pt 4px',
                    verticalAlign: 'middle',
                  }}
                >
                  {canEdit ? (
                    <DebouncedHeaderInput
                      value={headerLabels[i]}
                      onChange={(v) => handleHeaderChange(i, v)}
                    />
                  ) : (
                    headerLabels[i]
                  )}
                  {canEdit && <ColumnResizer onMouseDown={handleColResizeStart(i)} />}
                </th>
              ))}
            </tr>
          </thead>
          <SortableContext items={rows.map(r => r.id)} strategy={verticalListSortingStrategy}>
            <tbody>
              {rows.map(row => (
                <SortableRow
                  key={row.id}
                  row={row}
                  canEdit={canEdit}
                  participants={participants}
                  participantIds={getParticipantIdsForRow(row.id)}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                  onToggleParticipant={handleToggleParticipant}
                  defaultWidths={defaultWidths}
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
