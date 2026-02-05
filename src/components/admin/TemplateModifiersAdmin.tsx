import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Pencil, Trash2, Settings2, Code } from 'lucide-react';
import { useTemplateModifiers, TemplateModifier } from '@/hooks/useTemplateModifiers';

export function TemplateModifiersAdmin() {
  const {
    modifiers,
    loading,
    createModifier,
    updateModifier,
    deleteModifier,
  } = useTemplateModifiers();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingModifier, setEditingModifier] = useState<TemplateModifier | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
    conditions: '{}',
    effects: '{}',
    is_admin_editable: true,
    is_active: true,
    priority: 0,
  });

  const resetForm = () => {
    setFormData({
      code: '',
      name: '',
      description: '',
      conditions: '{}',
      effects: '{}',
      is_admin_editable: true,
      is_active: true,
      priority: 0,
    });
    setEditingModifier(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (modifier: TemplateModifier) => {
    setEditingModifier(modifier);
    setFormData({
      code: modifier.code,
      name: modifier.name,
      description: modifier.description || '',
      conditions: JSON.stringify(modifier.conditions, null, 2),
      effects: JSON.stringify(modifier.effects, null, 2),
      is_admin_editable: modifier.is_admin_editable,
      is_active: modifier.is_active,
      priority: modifier.priority,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const conditions = JSON.parse(formData.conditions);
      const effects = JSON.parse(formData.effects);

      const data = {
        code: formData.code,
        name: formData.name,
        description: formData.description || null,
        conditions,
        effects,
        is_admin_editable: formData.is_admin_editable,
        is_active: formData.is_active,
        priority: formData.priority,
      };

      if (editingModifier) {
        await updateModifier(editingModifier.id, data);
      } else {
        await createModifier(data);
      }

      setDialogOpen(false);
      resetForm();
    } catch (error) {
      console.error('Invalid JSON:', error);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    await deleteModifier(deletingId);
    setDeleteDialogOpen(false);
    setDeletingId(null);
  };

  if (loading) {
    return <div className="p-4">Loading modifiers...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Template Modifiers</h2>
          <p className="text-sm text-muted-foreground">
            Rules that modify template behavior based on conditions
          </p>
        </div>
        <Button onClick={openCreateDialog} className="gap-2">
          <Plus className="w-4 h-4" />
          Add Modifier
        </Button>
      </div>

      <ScrollArea className="h-[400px]">
        <div className="space-y-3">
          {modifiers.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8">
                <Settings2 className="w-10 h-10 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No modifiers configured</p>
                <Button variant="outline" size="sm" className="mt-4" onClick={openCreateDialog}>
                  Create your first modifier
                </Button>
              </CardContent>
            </Card>
          ) : (
            modifiers.map((modifier) => (
              <Card key={modifier.id}>
                <CardHeader className="py-3 px-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base">{modifier.name}</CardTitle>
                        <Badge variant="outline" className="font-mono text-xs">
                          {modifier.code}
                        </Badge>
                        {!modifier.is_active && (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                      </div>
                      {modifier.description && (
                        <CardDescription className="text-xs">
                          {modifier.description}
                        </CardDescription>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(modifier)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setDeletingId(modifier.id);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="py-2 px-4 border-t">
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-muted-foreground">Priority:</span>{' '}
                      <span className="font-medium">{modifier.priority}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Admin editable:</span>{' '}
                      <span className="font-medium">{modifier.is_admin_editable ? 'Yes' : 'No'}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingModifier ? 'Edit Modifier' : 'Create Modifier'}
            </DialogTitle>
            <DialogDescription>
              Configure a template modifier rule
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Code *</Label>
                <Input
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="STAGE_1_ANONYMOUS"
                />
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Input
                  type="number"
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Stage 1 Anonymous Submission"
              />
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="What this modifier does..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Code className="w-4 h-4" />
                Conditions (JSON)
              </Label>
              <Textarea
                value={formData.conditions}
                onChange={(e) => setFormData({ ...formData, conditions: e.target.value })}
                placeholder='{"submission_stage": "stage_1"}'
                rows={3}
                className="font-mono text-xs"
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Code className="w-4 h-4" />
                Effects (JSON)
              </Label>
              <Textarea
                value={formData.effects}
                onChange={(e) => setFormData({ ...formData, effects: e.target.value })}
                placeholder='{"hide_participant_names": true}'
                rows={3}
                className="font-mono text-xs"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
                <Label>Active</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.is_admin_editable}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_admin_editable: checked })}
                />
                <Label>Admin Editable</Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit}>
              {editingModifier ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Modifier?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The modifier will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
