import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, FolderKanban } from 'lucide-react';
import { ParticipantPreviousProject } from '@/types/participantDetails';

interface PreviousProjectsSectionProps {
  projects: ParticipantPreviousProject[];
  onAdd: (project: Omit<ParticipantPreviousProject, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdate: (id: string, updates: Partial<ParticipantPreviousProject>) => void;
  onDelete: (id: string) => void;
  canEdit: boolean;
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

  const canAddMore = projects.length < 5;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <FolderKanban className="w-5 h-5" />
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
            <FolderKanban className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No previous projects added yet</p>
            <p className="text-xs mt-1">Add up to 5 relevant previous projects</p>
          </div>
        ) : (
          <div className="space-y-3">
            {projects.map((project, index) => (
              <div
                key={project.id}
                className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg"
              >
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-xs font-medium text-primary">{index + 1}</span>
                </div>
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
            ))}
          </div>
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
