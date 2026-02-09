import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, MonitorCog, GripVertical } from 'lucide-react';
import { ParticipantInfrastructure } from '@/types/participantDetails';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface InfrastructureSectionProps {
  infrastructure: ParticipantInfrastructure[];
  onAdd: (infra: Omit<ParticipantInfrastructure, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdate: (id: string, updates: Partial<ParticipantInfrastructure>) => void;
  onDelete: (id: string) => void;
  canEdit: boolean;
}

function SortableInfraRow({
  infra,
  canEdit,
  onDelete,
}: {
  infra: ParticipantInfrastructure;
  canEdit: boolean;
  onDelete: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: infra.id, disabled: !canEdit });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg"
    >
      {canEdit && (
        <button
          className="flex-shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-4 h-4" />
        </button>
      )}
      <MonitorCog className="w-5 h-5 text-primary flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-medium">{infra.name}</p>
        {infra.description && (
          <p className="text-sm text-muted-foreground mt-1">{infra.description}</p>
        )}
      </div>
      {canEdit && (
        <Button
          variant="ghost"
          size="icon"
          className="flex-shrink-0 text-muted-foreground hover:text-destructive"
          onClick={() => onDelete(infra.id)}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}

export function InfrastructureSection({
  infrastructure,
  onAdd,
  onUpdate,
  onDelete,
  canEdit,
}: InfrastructureSectionProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newInfra, setNewInfra] = useState({
    name: '',
    description: '',
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleAdd = () => {
    if (!newInfra.name.trim()) return;

    onAdd({
      ...newInfra,
      participantId: '',
      orderIndex: infrastructure.length,
    });

    setNewInfra({
      name: '',
      description: '',
    });
    setShowAddForm(false);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = infrastructure.findIndex((i) => i.id === active.id);
    const newIndex = infrastructure.findIndex((i) => i.id === over.id);
    const reordered = arrayMove(infrastructure, oldIndex, newIndex);
    reordered.forEach((item, i) => {
      onUpdate(item.id, { orderIndex: i });
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <MonitorCog className="w-5 h-5" />
              Description of any significant infrastructure and/or any major items of technical equipment, relevant to the proposed work
            </CardTitle>
          </div>
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddForm(!showAddForm)}
              className="gap-1"
            >
              <Plus className="w-4 h-4" />
              Add
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add Form */}
        {showAddForm && (
          <Card className="border-dashed">
            <CardContent className="pt-4 space-y-4">
              <div className="space-y-2">
                <Label>Name of infrastructure or equipment</Label>
                <Input
                  value={newInfra.name}
                  onChange={(e) => setNewInfra({ ...newInfra, name: e.target.value })}
                  placeholder="e.g., High-Performance Computing Cluster"
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={newInfra.description}
                  onChange={(e) => setNewInfra({ ...newInfra, description: e.target.value })}
                  placeholder="Brief description of the infrastructure/equipment and its relevance..."
                  className="min-h-[80px]"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setShowAddForm(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAdd} disabled={!newInfra.name.trim()}>
                  Add Infrastructure
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Infrastructure List */}
        {infrastructure.length === 0 && !showAddForm ? (
          <div className="text-center py-6 text-muted-foreground">
            <MonitorCog className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No infrastructure added yet</p>
            <p className="text-xs mt-1">Add significant infrastructure or equipment relevant to the project</p>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={infrastructure.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-3">
                {infrastructure.map((infra) => (
                  <SortableInfraRow
                    key={infra.id}
                    infra={infra}
                    canEdit={canEdit}
                    onDelete={onDelete}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </CardContent>
    </Card>
  );
}
