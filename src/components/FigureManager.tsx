import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FigureEditor } from '@/components/FigureEditor';
import { Plus, Image, BarChart3, Network, FileImage, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface Figure {
  id: string;
  figureNumber: string;
  sectionId: string;
  title: string;
  figureType: string;
  content: any;
  caption: string | null;
  orderIndex: number;
}

interface FigureManagerProps {
  proposalId: string;
  canEdit: boolean;
}

const FIGURE_TYPES = [
  { id: 'gantt', label: 'Gantt Chart', icon: BarChart3, description: 'Timeline view of work packages and tasks' },
  { id: 'pert', label: 'PERT Diagram', icon: Network, description: 'Project network diagram' },
  { id: 'custom', label: 'Custom Figure', icon: FileImage, description: 'Upload or create a custom figure' },
];

const SECTION_OPTIONS = [
  { id: 'workplan', number: 'B3.1', label: 'Work plan and resources' },
  { id: 'consortium', number: 'B3.2', label: 'Capacity of participants' },
  { id: 'methodology', number: 'B1.2', label: 'Methodology' },
  { id: 'pathways', number: 'B2.1', label: "Project's pathways towards impact" },
];

export function FigureManager({ proposalId, canEdit }: FigureManagerProps) {
  const [selectedFigure, setSelectedFigure] = useState<Figure | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newFigureTitle, setNewFigureTitle] = useState('');
  const [newFigureType, setNewFigureType] = useState('gantt');
  const [newFigureSection, setNewFigureSection] = useState('workplan');
  const queryClient = useQueryClient();

  // Fetch figures for this proposal
  const { data: figures = [], isLoading } = useQuery({
    queryKey: ['figures', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('figures')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('order_index');
      if (error) throw error;
      return data.map((f) => ({
        id: f.id,
        figureNumber: f.figure_number,
        sectionId: f.section_id,
        title: f.title,
        figureType: f.figure_type,
        content: f.content,
        caption: f.caption,
        orderIndex: f.order_index,
      })) as Figure[];
    },
  });

  // Create figure mutation
  const createFigure = useMutation({
    mutationFn: async (data: { title: string; figureType: string; sectionId: string }) => {
      const section = SECTION_OPTIONS.find(s => s.id === data.sectionId);
      const existingInSection = figures.filter(f => f.sectionId === data.sectionId);
      const letter = String.fromCharCode(97 + existingInSection.length); // a, b, c...
      const figureNumber = `${section?.number}.${letter}`;

      const { data: newFigure, error } = await supabase
        .from('figures')
        .insert({
          proposal_id: proposalId,
          figure_number: figureNumber,
          section_id: data.sectionId,
          title: data.title,
          figure_type: data.figureType,
          order_index: figures.length,
        })
        .select()
        .single();
      if (error) throw error;
      return newFigure;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['figures', proposalId] });
      setIsCreateDialogOpen(false);
      setNewFigureTitle('');
      toast.success('Figure created');
    },
    onError: () => {
      toast.error('Failed to create figure');
    },
  });

  // Update figure mutation
  const updateFigure = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Figure> }) => {
      const { error } = await supabase
        .from('figures')
        .update({
          title: updates.title,
          caption: updates.caption,
          content: updates.content,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['figures', proposalId] });
      toast.success('Figure updated');
    },
    onError: () => {
      toast.error('Failed to update figure');
    },
  });

  // Delete figure mutation
  const deleteFigure = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('figures')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['figures', proposalId] });
      setSelectedFigure(null);
      toast.success('Figure deleted');
    },
    onError: () => {
      toast.error('Failed to delete figure');
    },
  });

  const handleCreateFigure = () => {
    if (!newFigureTitle.trim()) {
      toast.error('Please enter a title');
      return;
    }
    createFigure.mutate({
      title: newFigureTitle,
      figureType: newFigureType,
      sectionId: newFigureSection,
    });
  };

  // Group figures by section
  const figuresBySection = figures.reduce((acc, figure) => {
    if (!acc[figure.sectionId]) {
      acc[figure.sectionId] = [];
    }
    acc[figure.sectionId].push(figure);
    return acc;
  }, {} as Record<string, Figure[]>);

  if (selectedFigure) {
    return (
      <FigureEditor
        figure={selectedFigure}
        proposalId={proposalId}
        onUpdate={(updates) => updateFigure.mutate({ id: selectedFigure.id, updates })}
        onDelete={() => deleteFigure.mutate(selectedFigure.id)}
        onBack={() => setSelectedFigure(null)}
        canEdit={canEdit}
      />
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6 bg-muted/30">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Figures</h1>
            <p className="text-muted-foreground">
              Manage figures and diagrams for your proposal
            </p>
          </div>
          {canEdit && (
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="w-4 h-4" />
                  Add Figure
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Figure</DialogTitle>
                  <DialogDescription>
                    Add a new figure to your proposal. Figures will be numbered automatically based on their section.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="figure-title">Title</Label>
                    <Input
                      id="figure-title"
                      value={newFigureTitle}
                      onChange={(e) => setNewFigureTitle(e.target.value)}
                      placeholder="e.g. Project Timeline"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Section</Label>
                    <Select value={newFigureSection} onValueChange={setNewFigureSection}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SECTION_OPTIONS.map((section) => (
                          <SelectItem key={section.id} value={section.id}>
                            {section.number} - {section.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Figure Type</Label>
                    <div className="grid gap-2">
                      {FIGURE_TYPES.map((type) => (
                        <button
                          key={type.id}
                          type="button"
                          className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
                            newFigureType === type.id
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:bg-muted'
                          }`}
                          onClick={() => setNewFigureType(type.id)}
                        >
                          <type.icon className="w-5 h-5 text-muted-foreground" />
                          <div>
                            <p className="font-medium text-sm">{type.label}</p>
                            <p className="text-xs text-muted-foreground">{type.description}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <Button 
                    className="w-full" 
                    onClick={handleCreateFigure}
                    disabled={createFigure.isPending}
                  >
                    Create Figure
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Figures List by Section */}
        {SECTION_OPTIONS.map((section) => {
          const sectionFigures = figuresBySection[section.id] || [];
          return (
            <Card key={section.id}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Badge variant="outline">{section.number}</Badge>
                  {section.label}
                </CardTitle>
                <CardDescription>
                  {sectionFigures.length} figure{sectionFigures.length !== 1 ? 's' : ''}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {sectionFigures.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No figures for this section yet
                  </p>
                ) : (
                  <div className="space-y-2">
                    {sectionFigures.map((figure) => (
                      <button
                        key={figure.id}
                        className="w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-muted transition-colors text-left"
                        onClick={() => setSelectedFigure(figure)}
                      >
                        <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
                          {figure.figureType === 'gantt' ? (
                            <BarChart3 className="w-5 h-5 text-muted-foreground" />
                          ) : figure.figureType === 'pert' ? (
                            <Network className="w-5 h-5 text-muted-foreground" />
                          ) : (
                            <Image className="w-5 h-5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">
                            Figure {figure.figureNumber}: {figure.title}
                          </p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {figure.figureType} chart
                          </p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
