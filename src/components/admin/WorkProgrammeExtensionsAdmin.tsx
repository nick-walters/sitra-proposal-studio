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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Pencil, Trash2, Globe, Code } from 'lucide-react';
import { useTemplateModifiers, WorkProgrammeExtension } from '@/hooks/useTemplateModifiers';
import { WORK_PROGRAMMES } from '@/types/proposal';

export function WorkProgrammeExtensionsAdmin() {
  const {
    extensions,
    loading,
    createExtension,
    updateExtension,
    deleteExtension,
  } = useTemplateModifiers();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingExtension, setEditingExtension] = useState<WorkProgrammeExtension | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    work_programme_code: '',
    name: '',
    description: '',
    extra_section_ids: '',
    extra_part_a_fields: '{}',
    funding_overrides: '{}',
    page_limit_delta: 0,
    is_active: true,
  });

  const resetForm = () => {
    setFormData({
      work_programme_code: '',
      name: '',
      description: '',
      extra_section_ids: '',
      extra_part_a_fields: '{}',
      funding_overrides: '{}',
      page_limit_delta: 0,
      is_active: true,
    });
    setEditingExtension(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (extension: WorkProgrammeExtension) => {
    setEditingExtension(extension);
    setFormData({
      work_programme_code: extension.work_programme_code,
      name: extension.name,
      description: extension.description || '',
      extra_section_ids: extension.extra_section_ids?.join(', ') || '',
      extra_part_a_fields: JSON.stringify(extension.extra_part_a_fields || {}, null, 2),
      funding_overrides: JSON.stringify(extension.funding_overrides || {}, null, 2),
      page_limit_delta: extension.page_limit_delta || 0,
      is_active: extension.is_active,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const extra_part_a_fields = JSON.parse(formData.extra_part_a_fields);
      const funding_overrides = JSON.parse(formData.funding_overrides);
      const extra_section_ids = formData.extra_section_ids
        ? formData.extra_section_ids.split(',').map(s => s.trim()).filter(Boolean)
        : null;

      const data = {
        work_programme_code: formData.work_programme_code,
        name: formData.name,
        description: formData.description || null,
        extra_section_ids,
        extra_part_a_fields,
        funding_overrides,
        page_limit_delta: formData.page_limit_delta || null,
        is_active: formData.is_active,
      };

      if (editingExtension) {
        await updateExtension(editingExtension.id, data);
      } else {
        await createExtension(data);
      }

      setDialogOpen(false);
      resetForm();
    } catch (error) {
      console.error('Invalid JSON:', error);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    await deleteExtension(deletingId);
    setDeleteDialogOpen(false);
    setDeletingId(null);
  };

  const getWorkProgrammeName = (code: string) => {
    const wp = WORK_PROGRAMMES.find(w => w.id === code);
    return wp ? wp.fullName : code;
  };

  if (loading) {
    return <div className="p-4">Loading extensions...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Work Programme Extensions</h2>
          <p className="text-sm text-muted-foreground">
            Additional sections and settings for specific work programmes
          </p>
        </div>
        <Button onClick={openCreateDialog} className="gap-2">
          <Plus className="w-4 h-4" />
          Add Extension
        </Button>
      </div>

      <ScrollArea className="h-[400px]">
        <div className="space-y-3">
          {extensions.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8">
                <Globe className="w-10 h-10 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No extensions configured</p>
                <Button variant="outline" size="sm" className="mt-4" onClick={openCreateDialog}>
                  Create your first extension
                </Button>
              </CardContent>
            </Card>
          ) : (
            extensions.map((extension) => (
              <Card key={extension.id}>
                <CardHeader className="py-3 px-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base">{extension.name}</CardTitle>
                        <Badge variant="outline">
                          {extension.work_programme_code}
                        </Badge>
                        {!extension.is_active && (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                      </div>
                      <CardDescription className="text-xs">
                        {getWorkProgrammeName(extension.work_programme_code)}
                      </CardDescription>
                      {extension.description && (
                        <p className="text-xs text-muted-foreground">
                          {extension.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(extension)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setDeletingId(extension.id);
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
                      <span className="text-muted-foreground">Page limit delta:</span>{' '}
                      <span className="font-medium">
                        {extension.page_limit_delta ? `${extension.page_limit_delta > 0 ? '+' : ''}${extension.page_limit_delta}` : 'None'}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Extra sections:</span>{' '}
                      <span className="font-medium">
                        {extension.extra_section_ids?.length || 0}
                      </span>
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
              {editingExtension ? 'Edit Extension' : 'Create Extension'}
            </DialogTitle>
            <DialogDescription>
              Configure work programme-specific template extensions
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Work Programme *</Label>
                <Select
                  value={formData.work_programme_code}
                  onValueChange={(value) => setFormData({ ...formData, work_programme_code: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {WORK_PROGRAMMES.map((wp) => (
                      <SelectItem key={wp.id} value={wp.id}>
                        {wp.abbreviation}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Page Limit Delta</Label>
                <Input
                  type="number"
                  value={formData.page_limit_delta}
                  onChange={(e) => setFormData({ ...formData, page_limit_delta: parseInt(e.target.value) || 0 })}
                  placeholder="+5 or -3"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Mission-specific requirements"
              />
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="What this extension adds..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Extra Section IDs (comma-separated)</Label>
              <Input
                value={formData.extra_section_ids}
                onChange={(e) => setFormData({ ...formData, extra_section_ids: e.target.value })}
                placeholder="mission-impact, citizen-engagement"
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Code className="w-4 h-4" />
                Extra Part A Fields (JSON)
              </Label>
              <Textarea
                value={formData.extra_part_a_fields}
                onChange={(e) => setFormData({ ...formData, extra_part_a_fields: e.target.value })}
                placeholder='{"mission_board_endorsement": true}'
                rows={3}
                className="font-mono text-xs"
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Code className="w-4 h-4" />
                Funding Overrides (JSON)
              </Label>
              <Textarea
                value={formData.funding_overrides}
                onChange={(e) => setFormData({ ...formData, funding_overrides: e.target.value })}
                placeholder='{"max_budget": 5000000}'
                rows={3}
                className="font-mono text-xs"
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
              <Label>Active</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit}>
              {editingExtension ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Extension?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The extension will be permanently removed.
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
