import { useState, useRef } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FigureEditor } from '@/components/FigureEditor';
import { Plus, Image, BarChart3, Network, FileImage, ArrowRight, Upload, Sparkles, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { generateProposalFilePath, uploadProposalFile } from '@/lib/proposalStorage';

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
  { id: 'image', label: 'Upload Image', icon: Upload, description: 'Upload an image file (PNG, JPG, etc.)' },
  { id: 'ai', label: 'AI Generated', icon: Sparkles, description: 'Generate an image using AI' },
  { id: 'gantt', label: 'Gantt Chart', icon: BarChart3, description: 'Timeline view of work packages and tasks' },
  { id: 'pert', label: 'PERT Diagram', icon: Network, description: 'Project network diagram' },
  { id: 'custom', label: 'Custom Figure', icon: FileImage, description: 'Create a custom figure manually' },
];

const SECTION_OPTIONS = [
  { id: 'workplan', number: 'B3.1', label: 'Work plan and resources' },
  { id: 'consortium', number: 'B3.2', label: 'Capacity of participants' },
  { id: 'methodology', number: 'B1.2', label: 'Methodology' },
  { id: 'pathways', number: 'B2.1', label: "Project's pathways towards impact" },
  { id: 'excellence', number: 'B1.1', label: 'Excellence' },
  { id: 'impact', number: 'B2.2', label: 'Measures to maximise impact' },
];

export function FigureManager({ proposalId, canEdit }: FigureManagerProps) {
  const [selectedFigure, setSelectedFigure] = useState<Figure | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newFigureTitle, setNewFigureTitle] = useState('');
  const [newFigureType, setNewFigureType] = useState('image');
  const [newFigureSection, setNewFigureSection] = useState('workplan');
  
  // For image upload
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // For AI generation
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  
  const [isUploading, setIsUploading] = useState(false);
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
    mutationFn: async (data: { title: string; figureType: string; sectionId: string; imageUrl?: string }) => {
      const section = SECTION_OPTIONS.find(s => s.id === data.sectionId);
      const sectionNumber = section?.number.replace('B', '') || '1.1';
      const existingInSection = figures.filter(f => f.sectionId === data.sectionId);
      const letter = String.fromCharCode(97 + existingInSection.length); // a, b, c...
      const figureNumber = `${sectionNumber}.${letter}`;

      const { data: newFigure, error } = await supabase
        .from('figures')
        .insert({
          proposal_id: proposalId,
          figure_number: figureNumber,
          section_id: data.sectionId,
          title: data.title,
          figure_type: data.figureType,
          content: data.imageUrl ? { imageUrl: data.imageUrl } : null,
          order_index: figures.length,
        })
        .select()
        .single();
      if (error) throw error;
      return newFigure;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['figures', proposalId] });
      resetCreateDialog();
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

  const resetCreateDialog = () => {
    setIsCreateDialogOpen(false);
    setNewFigureTitle('');
    setNewFigureType('image');
    setSelectedFile(null);
    setPreviewUrl(null);
    setAiPrompt('');
    setGeneratedImageUrl(null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleGenerateImage = async () => {
    if (!aiPrompt.trim()) {
      toast.error('Please enter a description for the image');
      return;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-image', {
        body: { prompt: aiPrompt.trim() }
      });

      if (error) throw error;

      if (data.error) {
        toast.error(data.error);
        return;
      }

      if (data.imageUrl) {
        setGeneratedImageUrl(data.imageUrl);
        toast.success('Image generated successfully!');
      } else {
        toast.error('Failed to generate image');
      }
    } catch (error) {
      console.error('Image generation error:', error);
      toast.error('Failed to generate image. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCreateFigure = async () => {
    if (!newFigureTitle.trim()) {
      toast.error('Please enter a title');
      return;
    }

    // For image types, we need to upload the image first
    if (newFigureType === 'image' || newFigureType === 'ai') {
      const imageSource = newFigureType === 'image' ? selectedFile : generatedImageUrl;
      
      if (!imageSource) {
        toast.error(newFigureType === 'image' ? 'Please select an image' : 'Please generate an image first');
        return;
      }

      setIsUploading(true);
      try {
        let blob: Blob;
        
        if (newFigureType === 'image' && selectedFile) {
          blob = selectedFile;
        } else if (generatedImageUrl) {
          const response = await fetch(generatedImageUrl);
          blob = await response.blob();
        } else {
          throw new Error('No image source');
        }

        // Generate file path
        const section = SECTION_OPTIONS.find(s => s.id === newFigureSection);
        const sectionNumber = section?.number.replace('B', '') || '1.1';
        const existingInSection = figures.filter(f => f.sectionId === newFigureSection);
        const letter = String.fromCharCode(97 + existingInSection.length);
        const filename = `figure-${sectionNumber}-${letter}-${newFigureTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
        
        const filePath = generateProposalFilePath(proposalId, 'figures', filename, {
          prefix: newFigureType === 'ai' ? 'ai-generated' : 'uploaded',
          addTimestamp: true,
        });

        const { url, error } = await uploadProposalFile(blob, filePath, {
          contentType: blob.type || 'image/png',
        });

        if (error) throw error;
        if (!url) throw new Error('Failed to get public URL');

        // Create figure with image URL
        createFigure.mutate({
          title: newFigureTitle,
          figureType: newFigureType,
          sectionId: newFigureSection,
          imageUrl: url,
        });
      } catch (error) {
        console.error('Upload error:', error);
        toast.error('Failed to upload image');
      } finally {
        setIsUploading(false);
      }
    } else {
      // For non-image types (gantt, pert, custom)
      createFigure.mutate({
        title: newFigureTitle,
        figureType: newFigureType,
        sectionId: newFigureSection,
      });
    }
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

  const renderImageInput = () => {
    if (newFigureType === 'image') {
      return (
        <div className="space-y-2">
          <Label>Upload Image</Label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />
          <div 
            className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            {previewUrl ? (
              <div className="space-y-2">
                <img src={previewUrl} alt="Preview" className="max-h-40 mx-auto rounded" />
                <p className="text-sm text-muted-foreground">{selectedFile?.name}</p>
              </div>
            ) : (
              <div className="space-y-2">
                <Upload className="w-8 h-8 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Click to select an image</p>
              </div>
            )}
          </div>
        </div>
      );
    }

    if (newFigureType === 'ai') {
      return (
        <div className="space-y-3">
          <Label>Image Description</Label>
          <Textarea
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="Describe the image you want to generate, e.g., 'A flowchart showing data processing pipeline with input, processing, and output stages'"
            rows={3}
          />
          <Button 
            type="button"
            variant="outline" 
            className="w-full gap-2"
            onClick={handleGenerateImage}
            disabled={isGenerating || !aiPrompt.trim()}
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Generate Image
              </>
            )}
          </Button>
          {generatedImageUrl && (
            <div className="border rounded-lg p-2">
              <img src={generatedImageUrl} alt="Generated" className="max-h-40 mx-auto rounded" />
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  return (
    <div className="flex-1 overflow-auto p-6 bg-muted/30">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Figures</h1>
            <p className="text-muted-foreground">
              Create and manage figures for your proposal. Insert them into Part B sections using the Insert Figure tool.
            </p>
          </div>
          {canEdit && (
            <Dialog open={isCreateDialogOpen} onOpenChange={(open) => open ? setIsCreateDialogOpen(true) : resetCreateDialog()}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="w-4 h-4" />
                  Add Figure
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Create New Figure</DialogTitle>
                  <DialogDescription>
                    Add a new figure to your proposal. Figures will be numbered automatically based on their section.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-4 max-h-[60vh] overflow-y-auto">
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
                          onClick={() => {
                            setNewFigureType(type.id);
                            setSelectedFile(null);
                            setPreviewUrl(null);
                            setGeneratedImageUrl(null);
                          }}
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
                  
                  {renderImageInput()}
                  
                  <Button 
                    className="w-full" 
                    onClick={handleCreateFigure}
                    disabled={createFigure.isPending || isUploading}
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      'Create Figure'
                    )}
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
                    {sectionFigures.map((figure) => {
                      const hasImage = figure.content?.imageUrl;
                      return (
                        <button
                          key={figure.id}
                          className="w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-muted transition-colors text-left"
                          onClick={() => setSelectedFigure(figure)}
                        >
                          <div className="w-10 h-10 rounded bg-muted flex items-center justify-center overflow-hidden">
                            {hasImage ? (
                              <img src={figure.content.imageUrl} alt="" className="w-full h-full object-cover" />
                            ) : figure.figureType === 'gantt' ? (
                              <BarChart3 className="w-5 h-5 text-muted-foreground" />
                            ) : figure.figureType === 'pert' ? (
                              <Network className="w-5 h-5 text-muted-foreground" />
                            ) : figure.figureType === 'ai' ? (
                              <Sparkles className="w-5 h-5 text-muted-foreground" />
                            ) : (
                              <Image className="w-5 h-5 text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm">
                              Figure {figure.figureNumber}: {figure.title}
                            </p>
                            <p className="text-xs text-muted-foreground capitalize">
                              {figure.figureType === 'ai' ? 'AI Generated' : figure.figureType === 'image' ? 'Uploaded Image' : `${figure.figureType} chart`}
                            </p>
                          </div>
                          <ArrowRight className="w-4 h-4 text-muted-foreground" />
                        </button>
                      );
                    })}
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