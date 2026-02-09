import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, ClipboardList, GripVertical } from 'lucide-react';
import { ParticipantPreviousProject } from '@/types/participantDetails';
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

interface PreviousProjectsSectionProps {
  projects: ParticipantPreviousProject[];
  onAdd: (project: Omit<ParticipantPreviousProject, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdate: (id: string, updates: Partial<ParticipantPreviousProject>) => void;
  onDelete: (id: string) => void;
  canEdit: boolean;
}

function SortableProjectRow({
  project,
    canEdit,
    onDelete,
  }: {
    project: ParticipantPreviousProject;
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
  } = useSortable({ id: project.id, disabled: !canEdit });

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
      <ClipboardList className="w-5 h-5 text-primary flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-medium">{project.projectName}</p>
        {project.description && (
          <p className="text-sm text-muted-foreground mt-1">{project.description}</p>
        )}
      </div>
      {canEdit && (
        <Button
          variant="ghost"
          size="icon"
          className="flex-shrink-0 text-muted-foreground hover:text-destructive"
          onClick={() => onDelete(project.id)}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}

export function PreviousProjectsSection({
  projects,
  onAdd,
  onUpdate,
  onDelete,
  canEdit,
}: PreviousProjectsSectionProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProject, setNewProject] = useState({
    projectName: '',
    description: '',
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleAdd = () => {
    if (!newProject.projectName.trim()) return;

    onAdd({
      ...newProject,
      participantId: '',
      orderIndex: projects.length,
    });

    setNewProject({
      projectName: '',
      description: '',
    });
    setShowAddForm(false);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = projects.findIndex((p) => p.id === active.id);
    const newIndex = projects.findIndex((p) => p.id === over.id);
    const reordered = arrayMove(projects, oldIndex, newIndex);
    reordered.forEach((item, i) => {
      onUpdate(item.id, { orderIndex: i });
    });
  };

  const canAddMore = projects.length < 5;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <ClipboardList className="w-5 h-5" />
              List of up to 5 most relevant previous projects or activities, connected to the subject of this proposal
            </CardTitle>
          </div>
          {canEdit && canAddMore && (
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
                <Label>Name of project or activity</Label>
                <Input
                  value={newProject.projectName}
                  onChange={(e) => setNewProject({ ...newProject, projectName: e.target.value })}
                  placeholder="e.g., H2020-ProjectName"
                />
              </div>
              <div className="space-y-2">
                <Label>Short description</Label>
                <Textarea
                  value={newProject.description}
                  onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                  placeholder="Brief description of the project and your organisation's role..."
                  className="min-h-[80px]"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setShowAddForm(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAdd} disabled={!newProject.projectName.trim()}>
                  Add Project
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Projects List */}
        {projects.length === 0 && !showAddForm ? (
          <div className="text-center py-6 text-muted-foreground">
            <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No previous projects added yet</p>
            <p className="text-xs mt-1">Add up to 5 relevant previous projects</p>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={projects.map((p) => p.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-3">
                {projects.map((project) => (
                  <SortableProjectRow
                    key={project.id}
                    project={project}
                    canEdit={canEdit}
                    onDelete={onDelete}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {!canAddMore && projects.length > 0 && (
          <p className="text-xs text-muted-foreground text-center">
            Maximum of 5 projects reached
          </p>
        )}
      </CardContent>
    </Card>
  );
}
