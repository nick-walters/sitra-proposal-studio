import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ParticipantBubble } from './B31Pill';
import { EditableCaption } from '@/components/EditableCaption';
import { useProposalRole } from '@/hooks/useProposalRole';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

interface Props {
  proposalId: string;
  /** true only when rendered in the editor NodeView; false/undefined in export. */
  interactive?: boolean;
}

type ParticipantRow = {
  id: string;
  participant_number: number | null;
  organisation_short_name: string | null;
};

type InfraRow = {
  id: string;
  participant_id: string;
  name: string;
  description: string | null;
  order_index: number | null;
};

type MergedRow = {
  key: string;
  name: string;
  description: string | null;
  participants: ParticipantRow[];
  minPartNum: number;
};

const SEP = '\u241E';

function mergeKey(name: string, description: string | null | undefined) {
  return (name || '').trim().toLowerCase() + SEP + (description || '').trim().toLowerCase();
}

export function B32MirrorInfrastructureSlot({ proposalId, interactive = false }: Props) {
  const qc = useQueryClient();
  const { roleTier } = useProposalRole(proposalId);
  const canReorder = interactive && (roleTier === 'coordinator');

  const toggleQ = useQuery({
    queryKey: ['b32-mirror-toggles', proposalId],
    enabled: !!proposalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposals')
        .select(
          'mirror_contribution_resources, mirror_infrastructure, mirror_value_chain, mirror_industrial_involvement, mirror_participation_justification, b32_infrastructure_order',
        )
        .eq('id', proposalId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const enabled = toggleQ.data ? Boolean(toggleQ.data.mirror_infrastructure) : false;
  const savedOrder: string[] = useMemo(() => {
    const raw = (toggleQ.data as any)?.b32_infrastructure_order;
    return Array.isArray(raw) ? raw.filter((k) => typeof k === 'string') : [];
  }, [toggleQ.data]);

  const dataQ = useQuery({
    queryKey: ['b32-mirror-infrastructure', proposalId],
    enabled: !!proposalId && enabled,
    queryFn: async () => {
      const partsR = await supabase
        .from('participants')
        .select('id, participant_number, organisation_short_name')
        .eq('proposal_id', proposalId);
      if (partsR.error) throw partsR.error;
      const participants = (partsR.data || []) as ParticipantRow[];
      const partIds = participants.map((p) => p.id);
      if (partIds.length === 0) {
        return { participants, items: [] as InfraRow[] };
      }
      const infraR = await supabase
        .from('participant_infrastructure')
        .select('id, participant_id, name, description, order_index')
        .in('participant_id', partIds);
      if (infraR.error) throw infraR.error;
      return { participants, items: (infraR.data || []) as InfraRow[] };
    },
  });

  useEffect(() => {
    const handler = () => {
      qc.invalidateQueries({ queryKey: ['b32-mirror-infrastructure', proposalId] });
      qc.invalidateQueries({ queryKey: ['b32-mirror-toggles', proposalId] });
    };
    window.addEventListener('cross-ref-data-changed', handler);
    return () => window.removeEventListener('cross-ref-data-changed', handler);
  }, [qc, proposalId]);

  const rows = useMemo<MergedRow[]>(() => {
    if (!dataQ.data) return [];
    const partById = new Map(dataQ.data.participants.map((p) => [p.id, p]));
    const groups = new Map<string, MergedRow>();
    for (const item of dataQ.data.items) {
      const nameTrim = (item.name || '').trim();
      if (nameTrim.length === 0) continue;
      const descTrim = (item.description || '').trim();
      const key = mergeKey(item.name, item.description);
      const participant = partById.get(item.participant_id);
      if (!participant) continue;
      let group = groups.get(key);
      if (!group) {
        group = {
          key,
          name: nameTrim,
          description: descTrim.length > 0 ? item.description : null,
          participants: [],
          minPartNum: 9999,
        };
        groups.set(key, group);
      }
      if (!group.participants.some((p) => p.id === participant.id)) {
        group.participants.push(participant);
        const n = participant.participant_number ?? 9999;
        if (n < group.minPartNum) group.minPartNum = n;
      }
    }
    for (const g of groups.values()) {
      g.participants.sort(
        (a, b) => (a.participant_number ?? 9999) - (b.participant_number ?? 9999),
      );
    }
    const all = Array.from(groups.values());
    const orderIdx = new Map(savedOrder.map((k, i) => [k, i]));
    // Known keys first (in saved order), unknown keys after (default sort).
    const known = all
      .filter((r) => orderIdx.has(r.key))
      .sort((a, b) => (orderIdx.get(a.key)! - orderIdx.get(b.key)!));
    const unknown = all
      .filter((r) => !orderIdx.has(r.key))
      .sort((a, b) => a.minPartNum - b.minPartNum || a.name.localeCompare(b.name));
    return [...known, ...unknown];
  }, [dataQ.data, savedOrder]);

  const persistOrderMut = useMutation({
    mutationFn: async (newOrder: string[]) => {
      const { error } = await (supabase as any)
        .from('proposals')
        .update({ b32_infrastructure_order: newOrder })
        .eq('id', proposalId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['b32-mirror-toggles', proposalId] });
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = rows.findIndex((r) => r.key === active.id);
    const newIndex = rows.findIndex((r) => r.key === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(rows, oldIndex, newIndex);
    persistOrderMut.mutate(reordered.map((r) => r.key));
  };

  if (!enabled) return null;
  if (rows.length === 0) return null;

  const tableInner = (
    <table
      data-table-key="b32-infrastructure"
      className="platform-table platform-table--tight"
      style={{ tableLayout: 'fixed', borderCollapse: 'collapse', width: '100%' }}
    >
      <colgroup>
        <col style={{ width: '75%' }} />
        <col style={{ width: '25%' }} />
      </colgroup>
      <thead>
        <tr>
          <th className="cell-pl-0 py-0 text-[11pt] text-left align-bottom">Infrastructure</th>
          <th className="cell-pl-0 py-0 text-[11pt] text-left align-bottom">Access</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) =>
          canReorder ? (
            <SortableInfraRow key={r.key} row={r} />
          ) : (
            <StaticInfraRow key={r.key} row={r} />
          ),
        )}
      </tbody>
    </table>
  );

  return (
    <div
      data-b32-mirror-infrastructure-slot=""
      className="b31-tables-container space-y-1 [&_p]:!my-0 mt-[2px]"
    >
      <EditableCaption
        proposalId={proposalId}
        tableKey="b32-infrastructure"
        label="Table 3.2.b."
        defaultCaption="Access to critical infrastructure"
      />
      {canReorder ? (
        <div className="relative w-full [&>div]:overflow-visible">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={rows.map((r) => r.key)} strategy={verticalListSortingStrategy}>
              {tableInner}
            </SortableContext>
          </DndContext>
        </div>
      ) : (
        tableInner
      )}
    </div>
  );
}

function InfraRowCells({ row }: { row: MergedRow }) {
  return (
    <>
      <td className="align-top cell-pl-0 py-0 leading-tight text-[11pt]" style={{ position: 'relative' }}>
        <strong>{row.name}</strong>
        {row.description ? <>: {row.description}</> : null}
      </td>
      <td className="align-top cell-pl-0 py-0 leading-tight text-[11pt]">
        <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
          {row.participants.map((p) => (
            <ParticipantBubble
              key={p.id}
              number={p.participant_number ?? undefined}
              shortName={p.organisation_short_name ?? ''}
            />
          ))}
        </span>
      </td>
    </>
  );
}

function StaticInfraRow({ row }: { row: MergedRow }) {
  return (
    <tr>
      <InfraRowCells row={row} />
    </tr>
  );
}

function SortableInfraRow({ row }: { row: MergedRow }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.key,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <tr ref={setNodeRef} style={style} className="group hover:bg-muted/50">
      <td
        className="align-top cell-pl-0 py-0 leading-tight text-[11pt]"
        style={{ position: 'relative' }}
      >
        <div
          className="absolute top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity z-10"
          style={{ left: '-20px' }}
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-4 w-4 text-[#2563EB]" />
        </div>
        <strong>{row.name}</strong>
        {row.description ? <>: {row.description}</> : null}
      </td>
      <td className="align-top cell-pl-0 py-0 leading-tight text-[11pt]">
        <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
          {row.participants.map((p) => (
            <ParticipantBubble
              key={p.id}
              number={p.participant_number ?? undefined}
              shortName={p.organisation_short_name ?? ''}
            />
          ))}
        </span>
      </td>
    </tr>
  );
}

export default B32MirrorInfrastructureSlot;
