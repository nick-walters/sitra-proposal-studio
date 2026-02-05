import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { useUserRole } from "@/hooks/useUserRole";
import { useTemplates, useTemplateSections } from "@/hooks/useTemplates";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Plus, 
  Pencil, 
  Trash2, 
  Copy, 
  ChevronRight,
  FileText,
  Layers,
  BookOpen,
  FormInput,
  AlertCircle,
  Info,
  Lightbulb,
  ClipboardCheck,
  Settings2,
  Globe
} from "lucide-react";
import { toast } from "sonner";
import { GuidelineEditorDialog } from "@/components/admin/GuidelineEditorDialog";
import { TemplateModifiersAdmin } from "@/components/admin/TemplateModifiersAdmin";
import { WorkProgrammeExtensionsAdmin } from "@/components/admin/WorkProgrammeExtensionsAdmin";
import type { FundingProgramme, TemplateType, TemplateSection, SectionGuideline, TemplateFormField } from "@/types/templates";

export function TemplateAdmin() {
  const navigate = useNavigate();
  const { isOwner, loading: roleLoading } = useUserRole();
  const { 
    fundingProgrammes, 
    templateTypes, 
    loading: templatesLoading,
    createFundingProgramme,
    updateFundingProgramme,
    deleteFundingProgramme,
    createTemplateType,
    updateTemplateType,
    deleteTemplateType,
    duplicateTemplateType
  } = useTemplates();

  const [selectedTemplateType, setSelectedTemplateType] = useState<string | null>(null);
  const [programmeDialogOpen, setProgrammeDialogOpen] = useState(false);
  const [typeDialogOpen, setTypeDialogOpen] = useState(false);
  const [editingProgramme, setEditingProgramme] = useState<FundingProgramme | null>(null);
  const [editingType, setEditingType] = useState<TemplateType | null>(null);

  // Redirect non-owners
  useEffect(() => {
    if (!roleLoading && !isOwner) {
      toast.error("Access denied. Owner role required.");
      navigate("/dashboard");
    }
  }, [isOwner, roleLoading, navigate]);

  if (roleLoading || templatesLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto py-8 px-4">
          <Skeleton className="h-8 w-64 mb-4" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (!isOwner) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto py-8 px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Template Management</h1>
          <p className="text-muted-foreground mt-2">
            Manage funding programmes, template types, sections, guidelines, and form fields
          </p>
        </div>

        <Tabs defaultValue="programmes" className="space-y-6">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="programmes" className="gap-2">
              <Layers className="w-4 h-4" />
              Funding Programmes
            </TabsTrigger>
            <TabsTrigger value="types" className="gap-2">
              <FileText className="w-4 h-4" />
              Template Types
            </TabsTrigger>
            <TabsTrigger value="sections" className="gap-2">
              <BookOpen className="w-4 h-4" />
              Sections & Guidelines
            </TabsTrigger>
            <TabsTrigger value="modifiers" className="gap-2">
              <Settings2 className="w-4 h-4" />
              Modifiers
            </TabsTrigger>
            <TabsTrigger value="extensions" className="gap-2">
              <Globe className="w-4 h-4" />
              WP Extensions
            </TabsTrigger>
          </TabsList>

          {/* Funding Programmes Tab */}
          <TabsContent value="programmes">
            <FundingProgrammesPanel
              programmes={fundingProgrammes}
              onCreate={createFundingProgramme}
              onUpdate={updateFundingProgramme}
              onDelete={deleteFundingProgramme}
            />
          </TabsContent>

          {/* Template Types Tab */}
          <TabsContent value="types">
            <TemplateTypesPanel
              types={templateTypes}
              programmes={fundingProgrammes}
              onCreate={createTemplateType}
              onUpdate={updateTemplateType}
              onDelete={deleteTemplateType}
              onDuplicate={duplicateTemplateType}
              onSelectForSections={(id) => setSelectedTemplateType(id)}
            />
          </TabsContent>

          {/* Sections & Guidelines Tab */}
          <TabsContent value="sections">
            <SectionsPanel
              templateTypes={templateTypes}
              selectedTemplateTypeId={selectedTemplateType}
              onSelectTemplateType={setSelectedTemplateType}
            />
          </TabsContent>

          {/* Modifiers Tab */}
          <TabsContent value="modifiers">
            <TemplateModifiersAdmin />
          </TabsContent>

          {/* Work Programme Extensions Tab */}
          <TabsContent value="extensions">
            <WorkProgrammeExtensionsAdmin />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// Funding Programmes Panel Component
function FundingProgrammesPanel({
  programmes,
  onCreate,
  onUpdate,
  onDelete
}: {
  programmes: FundingProgramme[];
  onCreate: (data: Partial<FundingProgramme>) => Promise<any>;
  onUpdate: (id: string, data: Partial<FundingProgramme>) => Promise<any>;
  onDelete: (id: string) => Promise<any>;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FundingProgramme | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    short_name: '',
    description: '',
    is_active: true
  });

  const handleOpenDialog = (programme?: FundingProgramme) => {
    if (programme) {
      setEditing(programme);
      setFormData({
        name: programme.name,
        short_name: programme.short_name || '',
        description: programme.description || '',
        is_active: programme.is_active
      });
    } else {
      setEditing(null);
      setFormData({ name: '', short_name: '', description: '', is_active: true });
    }
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error("Name is required");
      return;
    }

    try {
      if (editing) {
        await onUpdate(editing.id, formData);
        toast.success("Funding programme updated");
      } else {
        await onCreate(formData);
        toast.success("Funding programme created");
      }
      setDialogOpen(false);
    } catch (error) {
      toast.error("Failed to save funding programme");
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this funding programme?")) {
      try {
        await onDelete(id);
        toast.success("Funding programme deleted");
      } catch (error) {
        toast.error("Failed to delete funding programme");
      }
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Funding Programmes</CardTitle>
          <CardDescription>Manage funding programmes like Horizon Europe</CardDescription>
        </div>
        <Button onClick={() => handleOpenDialog()} className="gap-2">
          <Plus className="w-4 h-4" />
          Add Programme
        </Button>
      </CardHeader>
      <CardContent>
        {programmes.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Layers className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No funding programmes yet. Create one to get started.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {programmes.map((programme) => (
              <div
                key={programme.id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{programme.name}</span>
                      {programme.short_name && (
                        <Badge variant="secondary">{programme.short_name}</Badge>
                      )}
                      {!programme.is_active && (
                        <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>
                      )}
                    </div>
                    {programme.description && (
                      <p className="text-sm text-muted-foreground mt-1">{programme.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(programme)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(programme.id)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit' : 'Create'} Funding Programme</DialogTitle>
            <DialogDescription>
              {editing ? 'Update the funding programme details.' : 'Add a new funding programme.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Horizon Europe"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="short_name">Short Name</Label>
              <Input
                id="short_name"
                value={formData.short_name}
                onChange={(e) => setFormData({ ...formData, short_name: e.target.value })}
                placeholder="e.g. HE"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of the funding programme"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="is_active">Active</Label>
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit}>{editing ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// Template Types Panel Component
function TemplateTypesPanel({
  types,
  programmes,
  onCreate,
  onUpdate,
  onDelete,
  onDuplicate,
  onSelectForSections
}: {
  types: TemplateType[];
  programmes: FundingProgramme[];
  onCreate: (data: Partial<TemplateType>) => Promise<any>;
  onUpdate: (id: string, data: Partial<TemplateType>) => Promise<any>;
  onDelete: (id: string) => Promise<any>;
  onDuplicate: (id: string, newCode: string, newName: string) => Promise<any>;
  onSelectForSections: (id: string) => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TemplateType | null>(null);
  const [duplicating, setDuplicating] = useState<TemplateType | null>(null);
  const [formData, setFormData] = useState<{
    code: string;
    name: string;
    description: string;
    funding_programme_id: string;
    parent_type_id: string;
    is_active: boolean;
    base_page_limit: number;
    submission_stage: 'stage_1' | 'full' | '';
    includes_branding: boolean;
    includes_participant_table: boolean;
    action_types: string[];
  }>({
    code: '',
    name: '',
    description: '',
    funding_programme_id: '',
    parent_type_id: '',
    is_active: true,
    base_page_limit: 10,
    submission_stage: '',
    includes_branding: false,
    includes_participant_table: false,
    action_types: []
  });
  const [duplicateData, setDuplicateData] = useState({ code: '', name: '' });

  const handleOpenDialog = (type?: TemplateType) => {
    if (type) {
      setEditing(type);
      setFormData({
        code: type.code,
        name: type.name,
        description: type.description || '',
        funding_programme_id: type.funding_programme_id || '',
        parent_type_id: type.parent_type_id || '',
        is_active: type.is_active,
        base_page_limit: type.base_page_limit || 10,
        submission_stage: type.submission_stage || '',
        includes_branding: type.includes_branding || false,
        includes_participant_table: type.includes_participant_table || false,
        action_types: type.action_types || []
      });
    } else {
      setEditing(null);
      setFormData({ 
        code: '', 
        name: '', 
        description: '', 
        funding_programme_id: '', 
        parent_type_id: '', 
        is_active: true,
        base_page_limit: 10,
        submission_stage: '',
        includes_branding: false,
        includes_participant_table: false,
        action_types: []
      });
    }
    setDialogOpen(true);
  };

  const handleOpenDuplicateDialog = (type: TemplateType) => {
    setDuplicating(type);
    setDuplicateData({ code: `${type.code}_COPY`, name: `${type.name} (Copy)` });
    setDuplicateDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.code.trim() || !formData.name.trim()) {
      toast.error("Code and Name are required");
      return;
    }

    // Prepare data for submission, converting empty strings to undefined
    const submitData = {
      ...formData,
      submission_stage: formData.submission_stage || undefined,
      funding_programme_id: formData.funding_programme_id || undefined,
      parent_type_id: formData.parent_type_id || undefined,
    };

    try {
      if (editing) {
        await onUpdate(editing.id, submitData);
        toast.success("Template type updated");
      } else {
        await onCreate(submitData);
        toast.success("Template type created");
      }
      setDialogOpen(false);
    } catch (error) {
      toast.error("Failed to save template type");
    }
  };

  const handleDuplicate = async () => {
    if (!duplicating || !duplicateData.code.trim() || !duplicateData.name.trim()) {
      toast.error("Code and Name are required");
      return;
    }

    try {
      await onDuplicate(duplicating.id, duplicateData.code, duplicateData.name);
      toast.success("Template type duplicated with all sections and guidelines");
      setDuplicateDialogOpen(false);
    } catch (error) {
      toast.error("Failed to duplicate template type");
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this template type? This will also delete all associated sections and guidelines.")) {
      try {
        await onDelete(id);
        toast.success("Template type deleted");
      } catch (error) {
        toast.error("Failed to delete template type");
      }
    }
  };

  // Group types by funding programme
  const groupedTypes = programmes.map(programme => ({
    programme,
    types: types.filter(t => t.funding_programme_id === programme.id)
  }));

  const unassignedTypes = types.filter(t => !t.funding_programme_id);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Template Types</CardTitle>
          <CardDescription>Manage template types like RIA, IA, CSA</CardDescription>
        </div>
        <Button onClick={() => handleOpenDialog()} className="gap-2">
          <Plus className="w-4 h-4" />
          Add Template Type
        </Button>
      </CardHeader>
      <CardContent>
        {types.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No template types yet. Create one to get started.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {groupedTypes.map(({ programme, types: programmeTypes }) => (
              programmeTypes.length > 0 && (
                <div key={programme.id}>
                  <h3 className="text-sm font-medium text-muted-foreground mb-3">
                    {programme.name} {programme.short_name && `(${programme.short_name})`}
                  </h3>
                  <div className="space-y-2">
                    {programmeTypes.map((type) => (
                      <TemplateTypeRow
                        key={type.id}
                        type={type}
                        onEdit={() => handleOpenDialog(type)}
                        onDelete={() => handleDelete(type.id)}
                        onDuplicate={() => handleOpenDuplicateDialog(type)}
                        onSelectForSections={() => onSelectForSections(type.id)}
                      />
                    ))}
                  </div>
                </div>
              )
            ))}
            {unassignedTypes.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-3">Unassigned</h3>
                <div className="space-y-2">
                  {unassignedTypes.map((type) => (
                    <TemplateTypeRow
                      key={type.id}
                      type={type}
                      onEdit={() => handleOpenDialog(type)}
                      onDelete={() => handleDelete(type.id)}
                      onDuplicate={() => handleOpenDuplicateDialog(type)}
                      onSelectForSections={() => onSelectForSections(type.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit' : 'Create'} Template Type</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="code">Code *</Label>
                <Input
                  id="code"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="e.g. RIA"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type_name">Name *</Label>
                <Input
                  id="type_name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Research & Innovation Action"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="funding_programme">Funding Programme</Label>
              <Select
                value={formData.funding_programme_id}
                onValueChange={(value) => setFormData({ ...formData, funding_programme_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a programme" />
                </SelectTrigger>
                <SelectContent>
                  {programmes.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="parent_type">Parent Type (for variants)</Label>
              <Select
                value={formData.parent_type_id || "none"}
                onValueChange={(value) => setFormData({ ...formData, parent_type_id: value === "none" ? "" : value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None (base type)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (base type)</SelectItem>
                  {types.filter(t => t.id !== editing?.id).map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.code} - {t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="type_description">Description</Label>
              <Textarea
                id="type_description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            
            {/* Template Configuration */}
            <div className="border-t pt-4 mt-4">
              <h4 className="text-sm font-medium mb-4">Template Configuration</h4>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="submission_stage">Submission Stage</Label>
                  <Select
                    value={formData.submission_stage || "not_specified"}
                    onValueChange={(value) => setFormData({ 
                      ...formData, 
                      submission_stage: value === "not_specified" ? "" : value as 'stage_1' | 'full' | '' 
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select stage" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="not_specified">Not specified</SelectItem>
                      <SelectItem value="stage_1">Stage 1 (Pre-proposal)</SelectItem>
                      <SelectItem value="full">Full Proposal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="base_page_limit">Base Page Limit</Label>
                  <Input
                    id="base_page_limit"
                    type="number"
                    min={1}
                    value={formData.base_page_limit}
                    onChange={(e) => setFormData({ ...formData, base_page_limit: parseInt(e.target.value) || 10 })}
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <Label htmlFor="includes_branding" className="cursor-pointer">Include Branding</Label>
                  <Switch
                    id="includes_branding"
                    checked={formData.includes_branding}
                    onCheckedChange={(checked) => setFormData({ ...formData, includes_branding: checked })}
                  />
                </div>
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <Label htmlFor="includes_participant_table" className="cursor-pointer">Include Participant Table</Label>
                  <Switch
                    id="includes_participant_table"
                    checked={formData.includes_participant_table}
                    onCheckedChange={(checked) => setFormData({ ...formData, includes_participant_table: checked })}
                  />
                </div>
              </div>
              
              <div className="mt-4 space-y-2">
                <Label>Action Types</Label>
                <div className="flex gap-2 flex-wrap">
                  {['RIA', 'IA', 'CSA'].map((actionType) => (
                    <Button
                      key={actionType}
                      type="button"
                      variant={formData.action_types.includes(actionType) ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        const newTypes = formData.action_types.includes(actionType)
                          ? formData.action_types.filter(t => t !== actionType)
                          : [...formData.action_types, actionType];
                        setFormData({ ...formData, action_types: newTypes });
                      }}
                    >
                      {actionType}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Select which action types this template applies to</p>
              </div>
            </div>
            
            <div className="flex items-center justify-between pt-4 border-t">
              <Label htmlFor="type_is_active">Active</Label>
              <Switch
                id="type_is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit}>{editing ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate Dialog */}
      <Dialog open={duplicateDialogOpen} onOpenChange={setDuplicateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicate Template Type</DialogTitle>
            <DialogDescription>
              This will create a copy of "{duplicating?.name}" with all its sections, guidelines, and form fields.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="dup_code">New Code *</Label>
              <Input
                id="dup_code"
                value={duplicateData.code}
                onChange={(e) => setDuplicateData({ ...duplicateData, code: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dup_name">New Name *</Label>
              <Input
                id="dup_name"
                value={duplicateData.name}
                onChange={(e) => setDuplicateData({ ...duplicateData, name: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDuplicateDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleDuplicate}>Duplicate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function TemplateTypeRow({
  type,
  onEdit,
  onDelete,
  onDuplicate,
  onSelectForSections
}: {
  type: TemplateType;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onSelectForSections: () => void;
}) {
  return (
    <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{type.code}</Badge>
            <span className="font-medium">{type.name}</span>
            {!type.is_active && (
              <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>
            )}
          </div>
          {type.description && (
            <p className="text-sm text-muted-foreground mt-1">{type.description}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onSelectForSections} className="gap-1">
          <BookOpen className="w-4 h-4" />
          Sections
        </Button>
        <Button variant="ghost" size="icon" onClick={onDuplicate}>
          <Copy className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onEdit}>
          <Pencil className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onDelete}>
          <Trash2 className="w-4 h-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

// Sections Panel Component
function SectionsPanel({
  templateTypes,
  selectedTemplateTypeId,
  onSelectTemplateType
}: {
  templateTypes: TemplateType[];
  selectedTemplateTypeId: string | null;
  onSelectTemplateType: (id: string | null) => void;
}) {
  const {
    sections,
    loading,
    createSection,
    updateSection,
    deleteSection,
    createGuideline,
    updateGuideline,
    deleteGuideline,
    createFormField,
    updateFormField,
    deleteFormField
  } = useTemplateSections(selectedTemplateTypeId);

  const [sectionDialogOpen, setSectionDialogOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<TemplateSection | null>(null);
  const [sectionFormData, setSectionFormData] = useState({
    part: 'B' as 'A' | 'B',
    section_number: '',
    title: '',
    description: '',
    placeholder_content: '', // Pre-filled guidance text for writers
    editor_type: 'rich_text' as 'form' | 'rich_text' | 'summary',
    word_limit: undefined as number | undefined,
    page_limit: undefined as number | undefined,
    parent_section_id: undefined as string | undefined,
    is_required: true,
    is_active: true,
    order_index: 0
  });

  const selectedType = templateTypes.find(t => t.id === selectedTemplateTypeId);

  const partASections = sections.filter(s => s.part === 'A' && !s.parent_section_id);
  const partBSections = sections.filter(s => s.part === 'B' && !s.parent_section_id);

  // Collect all section IDs including children for default expanded state
  const getAllSectionIds = (sectionList: TemplateSection[]): string[] => {
    return sectionList.flatMap(s => [s.id, ...getAllSectionIds(s.children || [])]);
  };
  
  // State for expanded accordions - default to all expanded
  const [expandedPartA, setExpandedPartA] = useState<string[]>(() => getAllSectionIds(partASections));
  const [expandedPartB, setExpandedPartB] = useState<string[]>(() => getAllSectionIds(partBSections));

  // Update expanded state when sections change to include new sections
  useEffect(() => {
    const allPartAIds = getAllSectionIds(partASections);
    const allPartBIds = getAllSectionIds(partBSections);
    
    // Add any new section IDs that aren't already in the expanded state
    setExpandedPartA(prev => {
      const newIds = allPartAIds.filter(id => !prev.includes(id));
      return newIds.length > 0 ? [...prev, ...newIds] : prev;
    });
    setExpandedPartB(prev => {
      const newIds = allPartBIds.filter(id => !prev.includes(id));
      return newIds.length > 0 ? [...prev, ...newIds] : prev;
    });
  }, [sections]);

  const handleOpenSectionDialog = (section?: TemplateSection) => {
    if (section) {
      setEditingSection(section);
      setSectionFormData({
        part: section.part,
        section_number: section.section_number,
        title: section.title,
        description: section.description || '',
        placeholder_content: section.placeholder_content || '',
        editor_type: section.editor_type,
        word_limit: section.word_limit || undefined,
        page_limit: section.page_limit || undefined,
        parent_section_id: section.parent_section_id || undefined,
        is_required: section.is_required,
        is_active: section.is_active,
        order_index: section.order_index
      });
    } else {
      setEditingSection(null);
      setSectionFormData({
        part: 'B',
        section_number: '',
        title: '',
        description: '',
        placeholder_content: '',
        editor_type: 'rich_text',
        word_limit: undefined,
        page_limit: undefined,
        parent_section_id: undefined,
        is_required: true,
        is_active: true,
        order_index: sections.length
      });
    }
    setSectionDialogOpen(true);
  };

  const handleSubmitSection = async () => {
    if (!sectionFormData.section_number.trim() || !sectionFormData.title.trim()) {
      toast.error("Section number and title are required");
      return;
    }

    try {
      if (editingSection) {
        await updateSection(editingSection.id, sectionFormData);
        toast.success("Section updated");
      } else {
        await createSection(sectionFormData);
        toast.success("Section created");
      }
      setSectionDialogOpen(false);
    } catch (error) {
      toast.error("Failed to save section");
    }
  };

  const handleDeleteSection = async (id: string) => {
    if (confirm("Are you sure you want to delete this section?")) {
      try {
        await deleteSection(id);
        toast.success("Section deleted");
      } catch (error) {
        toast.error("Failed to delete section");
      }
    }
  };

  if (!selectedTemplateTypeId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sections & Guidelines</CardTitle>
          <CardDescription>Select a template type to manage its sections</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {templateTypes.map((type) => (
              <Button
                key={type.id}
                variant="outline"
                className="h-auto py-4 flex flex-col items-start"
                onClick={() => onSelectTemplateType(type.id)}
              >
                <Badge variant="secondary" className="mb-2">{type.code}</Badge>
                <span className="text-sm">{type.name}</span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Button variant="ghost" size="sm" onClick={() => onSelectTemplateType(null)}>
              ← Back
            </Button>
          </div>
          <CardTitle className="flex items-center gap-2">
            <Badge>{selectedType?.code}</Badge>
            {selectedType?.name}
          </CardTitle>
          <CardDescription>Manage sections, guidelines, and form fields</CardDescription>
        </div>
        <Button onClick={() => handleOpenSectionDialog()} className="gap-2">
          <Plus className="w-4 h-4" />
          Add Section
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : sections.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No sections yet. Create one to get started.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Part A */}
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Badge variant="outline">Part A</Badge>
                Administrative Forms
              </h3>
              <Accordion type="multiple" value={expandedPartA} onValueChange={setExpandedPartA} className="space-y-2">
                {partASections.map((section) => (
                  <SectionAccordionItem
                    key={section.id}
                    section={section}
                    allSections={sections}
                    expandedSections={expandedPartA}
                    onExpandChange={setExpandedPartA}
                    onEdit={() => handleOpenSectionDialog(section)}
                    onDelete={() => handleDeleteSection(section.id)}
                    onEditSection={handleOpenSectionDialog}
                    onDeleteSection={handleDeleteSection}
                    onCreateGuideline={createGuideline}
                    onUpdateGuideline={updateGuideline}
                    onDeleteGuideline={deleteGuideline}
                    onCreateFormField={createFormField}
                    onUpdateFormField={updateFormField}
                    onDeleteFormField={deleteFormField}
                  />
                ))}
              </Accordion>
            </div>

            {/* Part B */}
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Badge variant="outline">Part B</Badge>
                Technical Annex
              </h3>
              <Accordion type="multiple" value={expandedPartB} onValueChange={setExpandedPartB} className="space-y-2">
                {partBSections.map((section) => (
                  <SectionAccordionItem
                    key={section.id}
                    section={section}
                    allSections={sections}
                    expandedSections={expandedPartB}
                    onExpandChange={setExpandedPartB}
                    onEdit={() => handleOpenSectionDialog(section)}
                    onDelete={() => handleDeleteSection(section.id)}
                    onEditSection={handleOpenSectionDialog}
                    onDeleteSection={handleDeleteSection}
                    onCreateGuideline={createGuideline}
                    onUpdateGuideline={updateGuideline}
                    onDeleteGuideline={deleteGuideline}
                    onCreateFormField={createFormField}
                    onUpdateFormField={updateFormField}
                    onDeleteFormField={deleteFormField}
                  />
                ))}
              </Accordion>
            </div>
          </div>
        )}
      </CardContent>

      {/* Section Dialog - keyed to force re-render for different sections */}
      <Dialog key={editingSection?.id || 'new-section'} open={sectionDialogOpen} onOpenChange={setSectionDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingSection ? 'Edit' : 'Create'} Section</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Part *</Label>
                <Select
                  value={sectionFormData.part}
                  onValueChange={(value: 'A' | 'B') => setSectionFormData({ ...sectionFormData, part: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A">Part A - Admin Forms</SelectItem>
                    <SelectItem value="B">Part B - Technical Annex</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="section_number">Section Number *</Label>
                <Input
                  id="section_number"
                  value={sectionFormData.section_number}
                  onChange={(e) => setSectionFormData({ ...sectionFormData, section_number: e.target.value })}
                  placeholder="e.g. 1.1"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="section_title">Title *</Label>
              <Input
                id="section_title"
                value={sectionFormData.title}
                onChange={(e) => setSectionFormData({ ...sectionFormData, title: e.target.value })}
                placeholder="e.g. Excellence"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="section_desc">Description</Label>
              <Textarea
                id="section_desc"
                value={sectionFormData.description}
                onChange={(e) => setSectionFormData({ ...sectionFormData, description: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Editor Type *</Label>
              <Select
                value={sectionFormData.editor_type}
                onValueChange={(value: 'form' | 'rich_text' | 'summary') => setSectionFormData({ ...sectionFormData, editor_type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rich_text">Rich Text Editor</SelectItem>
                  <SelectItem value="form">Form Fields</SelectItem>
                  <SelectItem value="summary">Summary View</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="word_limit">Word Limit</Label>
                <Input
                  id="word_limit"
                  type="number"
                  value={sectionFormData.word_limit || ''}
                  onChange={(e) => setSectionFormData({ ...sectionFormData, word_limit: e.target.value ? parseInt(e.target.value) : undefined })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="page_limit">Page Limit</Label>
                <Input
                  id="page_limit"
                  type="number"
                  value={sectionFormData.page_limit || ''}
                  onChange={(e) => setSectionFormData({ ...sectionFormData, page_limit: e.target.value ? parseInt(e.target.value) : undefined })}
                />
              </div>
            </div>
            {/* Only show placeholder content field for rich_text editor type */}
            {sectionFormData.editor_type === 'rich_text' && (
              <div className="space-y-2">
                <Label htmlFor="placeholder_content">Placeholder Content</Label>
                <Textarea
                  id="placeholder_content"
                  value={sectionFormData.placeholder_content}
                  onChange={(e) => setSectionFormData({ ...sectionFormData, placeholder_content: e.target.value })}
                  placeholder="Enter template placeholder text that writers will see when starting this section..."
                  className="min-h-[100px]"
                />
                <p className="text-xs text-muted-foreground">
                  This text will appear when writers first open an empty section. They can edit or clear it.
                </p>
              </div>
            )}
            <div className="flex items-center justify-between">
              <Label>Required</Label>
              <Switch
                checked={sectionFormData.is_required}
                onCheckedChange={(checked) => setSectionFormData({ ...sectionFormData, is_required: checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch
                checked={sectionFormData.is_active}
                onCheckedChange={(checked) => setSectionFormData({ ...sectionFormData, is_active: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSectionDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmitSection}>{editingSection ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// Section Accordion Item with guidelines and form fields
function SectionAccordionItem({
  section,
  allSections,
  expandedSections,
  onExpandChange,
  onEdit,
  onDelete,
  onEditSection,
  onDeleteSection,
  onCreateGuideline,
  onUpdateGuideline,
  onDeleteGuideline,
  onCreateFormField,
  onUpdateFormField,
  onDeleteFormField
}: {
  section: TemplateSection;
  allSections: TemplateSection[];
  expandedSections?: string[];
  onExpandChange?: React.Dispatch<React.SetStateAction<string[]>>;
  onEdit: () => void;
  onDelete: () => void;
  onEditSection?: (section: TemplateSection) => void;
  onDeleteSection?: (id: string) => void;
  onCreateGuideline: (sectionId: string, data: any) => Promise<any>;
  onUpdateGuideline: (id: string, data: any) => Promise<any>;
  onDeleteGuideline: (id: string) => Promise<any>;
  onCreateFormField: (sectionId: string, data: any) => Promise<any>;
  onUpdateFormField: (id: string, data: any) => Promise<any>;
  onDeleteFormField: (id: string) => Promise<any>;
}) {
  const childSections = section.children || [];
  const [guidelineDialogOpen, setGuidelineDialogOpen] = useState(false);
  const [editingGuideline, setEditingGuideline] = useState<SectionGuideline | null>(null);

  const handleOpenGuidelineDialog = (guideline?: SectionGuideline) => {
    setEditingGuideline(guideline || null);
    setGuidelineDialogOpen(true);
  };

  const handleSaveGuideline = async (data: Partial<SectionGuideline>) => {
    try {
      if (editingGuideline) {
        await onUpdateGuideline(editingGuideline.id, data);
        toast.success("Guideline updated");
      } else {
        await onCreateGuideline(section.id, data);
        toast.success("Guideline created");
      }
    } catch (error) {
      toast.error("Failed to save guideline");
    }
  };

  const handleDeleteGuideline = async (id: string) => {
    if (confirm("Are you sure you want to delete this guideline?")) {
      try {
        await onDeleteGuideline(id);
        toast.success("Guideline deleted");
      } catch (error) {
        toast.error("Failed to delete guideline");
      }
    }
  };

  // Get icon and colors for guideline type
  const getGuidelineStyle = (type: string) => {
    switch (type) {
      case 'evaluation':
        return { 
          icon: ClipboardCheck, 
          bgColor: 'bg-amber-50', 
          borderColor: 'border-amber-500',
          label: 'Evaluation Criterion'
        };
      case 'official':
        return { 
          icon: Info, 
          bgColor: 'bg-blue-50', 
          borderColor: 'border-blue-500',
          label: 'Official Guidelines'
        };
      case 'sitra_tip':
        return { 
          icon: Lightbulb, 
          bgColor: 'bg-gray-50', 
          borderColor: 'border-gray-800',
          label: "Sitra's Tips"
        };
      default:
        return { 
          icon: Info, 
          bgColor: 'bg-gray-50', 
          borderColor: 'border-gray-300',
          label: type
        };
    }
  };

  return (
    <AccordionItem value={section.id} className="border rounded-lg px-4">
      <AccordionTrigger className="hover:no-underline">
        <div className="flex items-center gap-3 text-left">
          <Badge variant="secondary">{section.section_number}</Badge>
          <span className="font-medium">{section.title}</span>
          <Badge variant="outline" className="text-xs">
            {section.editor_type === 'rich_text' ? 'Rich Text' : section.editor_type === 'form' ? 'Form' : 'Summary'}
          </Badge>
          {section.word_limit && (
            <span className="text-xs text-muted-foreground">{section.word_limit} words</span>
          )}
        </div>
      </AccordionTrigger>
      <AccordionContent className="pt-4">
        <div className="space-y-4">
          {section.description && (
            <p className="text-sm text-muted-foreground">{section.description}</p>
          )}
          
          {/* Actions */}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Pencil className="w-3 h-3 mr-1" />
              Edit
            </Button>
            <Button variant="outline" size="sm" onClick={onDelete} className="text-destructive">
              <Trash2 className="w-3 h-3 mr-1" />
              Delete
            </Button>
          </div>

          {/* Child Sections - Nested Accordions */}
          {childSections.length > 0 && (
            <div className="pl-4 border-l-2 space-y-2 mt-4">
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Subsections ({childSections.length})</h4>
              <Accordion 
                type="multiple" 
                value={expandedSections} 
                onValueChange={onExpandChange}
                className="space-y-2"
              >
                {childSections.map(child => (
                  <SectionAccordionItem
                    key={child.id}
                    section={child}
                    allSections={allSections}
                    expandedSections={expandedSections}
                    onExpandChange={onExpandChange}
                    onEdit={() => onEditSection?.(child)}
                    onDelete={() => onDeleteSection?.(child.id)}
                    onEditSection={onEditSection}
                    onDeleteSection={onDeleteSection}
                    onCreateGuideline={onCreateGuideline}
                    onUpdateGuideline={onUpdateGuideline}
                    onDeleteGuideline={onDeleteGuideline}
                    onCreateFormField={onCreateFormField}
                    onUpdateFormField={onUpdateFormField}
                    onDeleteFormField={onDeleteFormField}
                  />
                ))}
              </Accordion>
            </div>
          )}

          {/* Guidelines - sorted by type priority then order_index */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Guidelines ({section.guidelines?.length || 0})</h4>
            {/* Sort guidelines: evaluation first, then official, then sitra_tip */}
            {[...(section.guidelines || [])]
              .sort((a, b) => {
                const typePriority: Record<string, number> = { 'evaluation': 0, 'official': 1, 'sitra_tip': 2 };
                const aPriority = typePriority[a.guideline_type] ?? 99;
                const bPriority = typePriority[b.guideline_type] ?? 99;
                if (aPriority !== bPriority) return aPriority - bPriority;
                return a.order_index - b.order_index;
              })
              .map(g => {
              const style = getGuidelineStyle(g.guideline_type);
              const IconComponent = style.icon;
              return (
                <div 
                  key={g.id} 
                  className={`p-3 rounded text-sm ${style.bgColor} border-l-4 ${style.borderColor}`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <IconComponent className="w-4 h-4 flex-shrink-0" />
                        <Badge variant="secondary" className="text-xs">
                          {style.label}
                        </Badge>
                      </div>
                      <p className="font-medium">{g.title}</p>
                      <p className="text-muted-foreground line-clamp-3 whitespace-pre-wrap">{g.content}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleOpenGuidelineDialog(g)}
                      >
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleDeleteGuideline(g.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
            <Button 
              variant="outline" 
              size="sm" 
              className="w-full" 
              onClick={() => handleOpenGuidelineDialog()}
            >
              <Plus className="w-3 h-3 mr-1" />
              Add Guideline
            </Button>
          </div>

          {/* Form Fields (only for form editor type) */}
          {section.editor_type === 'form' && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Form Fields ({section.form_fields?.length || 0})</h4>
              {section.form_fields?.map(f => (
                <div key={f.id} className="flex items-center justify-between p-2 bg-muted/50 rounded text-sm">
                  <div className="flex items-center gap-2">
                    <FormInput className="w-4 h-4 text-muted-foreground" />
                    <span>{f.field_label}</span>
                    <Badge variant="outline">{f.field_type}</Badge>
                    {f.is_required && <Badge variant="destructive" className="text-xs">Required</Badge>}
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => onDeleteFormField(f.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" className="w-full" onClick={() => {
                const label = prompt("Field label:");
                const name = prompt("Field name (snake_case):");
                const type = prompt("Field type (text, textarea, select, checkbox, date, number):");
                if (label && name && type) {
                  onCreateFormField(section.id, {
                    field_label: label,
                    field_name: name,
                    field_type: type as any,
                    order_index: (section.form_fields?.length || 0)
                  });
                }
              }}>
                <Plus className="w-3 h-3 mr-1" />
                Add Form Field
              </Button>
            </div>
          )}
        </div>

        {/* Guideline Editor Dialog */}
        <GuidelineEditorDialog
          isOpen={guidelineDialogOpen}
          onClose={() => {
            setGuidelineDialogOpen(false);
            setEditingGuideline(null);
          }}
          guideline={editingGuideline}
          sectionId={section.id}
          existingGuidelinesCount={section.guidelines?.length || 0}
          onSave={handleSaveGuideline}
        />
      </AccordionContent>
    </AccordionItem>
  );
}
