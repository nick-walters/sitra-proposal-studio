import { useState, useRef, useCallback } from 'react';
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
import { Plus, Image, BarChart3, Network, FileImage, Upload, Sparkles, Loader2, LayoutGrid, List, Library } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { generateProposalFilePath, uploadProposalFile } from '@/lib/proposalStorage';
import { compressImage, getRecommendedFormat, getFormatExtension } from '@/lib/imageCompression';
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
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { SortableFigureItem } from './SortableFigureList';
import { CommonFiguresDialog } from './CommonFiguresDialog';

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

interface SectionOption {
  id: string;
  number: string;
  label: string;
}

interface FigureManagerProps {
  proposalId: string;
  canEdit: boolean;
  availableSections?: SectionOption[];
}

const FIGURE_TYPES = [
  { id: 'image', label: 'Upload Image', icon: Upload, description: 'Upload an image file (PNG, JPG, etc.)' },
  { id: 'ai', label: 'AI Generated', icon: Sparkles, description: 'Generate an image using AI' },
  { id: 'gantt', label: 'Gantt Chart', icon: BarChart3, description: 'Timeline view of work packages and tasks' },
  { id: 'pert', label: 'PERT Diagram', icon: Network, description: 'Project network diagram' },
  { id: 'custom', label: 'Custom Figure', icon: FileImage, description: 'Create a custom figure manually' },
];

// Fallback sections for backward compatibility
const DEFAULT_SECTION_OPTIONS: SectionOption[] = [
  { id: '1.1', number: 'B1.1', label: 'Excellence' },
  { id: '1.2', number: 'B1.2', label: 'Methodology' },
  { id: '2.1', number: 'B2.1', label: "Project's pathways towards impact" },
  { id: '2.2', number: 'B2.2', label: 'Measures to maximise impact' },
  { id: '3.1', number: 'B3.1', label: 'Work plan & resources' },
  { id: '3.2', number: 'B3.2', label: 'Capacity of participants' },
];

export function FigureManager({ proposalId, canEdit, availableSections }: FigureManagerProps) {
  // Use provided sections or fallback to defaults
  const SECTION_OPTIONS = availableSections && availableSections.length > 0 
    ? availableSections 
    : DEFAULT_SECTION_OPTIONS;
  const [selectedFigure, setSelectedFigure] = useState<Figure | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newFigureTitle, setNewFigureTitle] = useState('');
  const [newFigureType, setNewFigureType] = useState('image');
  const [newFigureSection, setNewFigureSection] = useState('workplan');
  const [viewMode, setViewMode] = useState<'list' | 'gallery'>('list');
  const [isLibraryDialogOpen, setIsLibraryDialogOpen] = useState(false);
  const [isAddingFromLibrary, setIsAddingFromLibrary] = useState(false);
  
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
        .order('section_id')
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

  // Sort figures numerically by figure number (e.g., 1.1.a, 1.1.b, 1.2.a)
  const sortedFigures = [...figures].sort((a, b) => {
    // Parse figure numbers like "1.1.a", "1.2.b"
    const parseNumber = (num: string) => {
      const parts = num.split('.');
      const major = parseInt(parts[0] || '0', 10);
      const minor = parseInt(parts[1] || '0', 10);
      const letter = parts[2] || 'a';
      const letterValue = letter.charCodeAt(0) - 'a'.charCodeAt(0);
      return major * 10000 + minor * 100 + letterValue;
    };
    return parseNumber(a.figureNumber) - parseNumber(b.figureNumber);
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

  // Reorder figures mutation with automatic renumbering
  const reorderFigures = useMutation({
    mutationFn: async ({ sectionId, reorderedFigures }: { sectionId: string; reorderedFigures: Figure[] }) => {
      const section = SECTION_OPTIONS.find(s => s.id === sectionId);
      const sectionNumber = section?.number.replace('B', '') || '1.1';
      
      // Update each figure with new order and figure number
      const updates = reorderedFigures.map((figure, index) => {
        const newLetter = String.fromCharCode(97 + index); // a, b, c...
        const newFigureNumber = `${sectionNumber}.${newLetter}`;
        
        return supabase
          .from('figures')
          .update({
            order_index: index,
            figure_number: newFigureNumber,
          })
          .eq('id', figure.id);
      });

      const results = await Promise.all(updates);
      const errors = results.filter(r => r.error);
      if (errors.length > 0) throw errors[0].error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['figures', proposalId] });
      toast.success('Figures reordered');
    },
    onError: () => {
      toast.error('Failed to reorder figures');
    },
  });

  // Add figure from common library
  const handleAddFromLibrary = useCallback(async (
    commonFigure: { id: string; title: string; description: string | null; figure_type: string; content: any },
    sectionId: string
  ) => {
    setIsAddingFromLibrary(true);
    try {
      const section = SECTION_OPTIONS.find(s => s.id === sectionId);
      const sectionNumber = section?.number.replace('B', '') || '1.1';
      const existingInSection = figures.filter(f => f.sectionId === sectionId);
      const letter = String.fromCharCode(97 + existingInSection.length);
      const figureNumber = `${sectionNumber}.${letter}`;

      const { error } = await supabase
        .from('figures')
        .insert({
          proposal_id: proposalId,
          figure_number: figureNumber,
          section_id: sectionId,
          title: commonFigure.title,
          figure_type: commonFigure.figure_type,
          content: commonFigure.content,
          caption: commonFigure.description,
          order_index: figures.length,
        });

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['figures', proposalId] });
      setIsLibraryDialogOpen(false);
      toast.success('Figure added from library');
    } catch (error) {
      console.error('Error adding figure from library:', error);
      toast.error('Failed to add figure');
    } finally {
      setIsAddingFromLibrary(false);
    }
  }, [figures, proposalId, queryClient]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Handle drag end for a specific section
  const handleDragEnd = useCallback((sectionId: string) => (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const sectionFigures = figures.filter(f => f.sectionId === sectionId);
    const oldIndex = sectionFigures.findIndex(f => f.id === active.id);
    const newIndex = sectionFigures.findIndex(f => f.id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      const reordered = arrayMove(sectionFigures, oldIndex, newIndex);
      reorderFigures.mutate({ sectionId, reorderedFigures: reordered });
    }
  }, [figures, reorderFigures]);

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
        let sourceBlob: Blob;
        
        if (newFigureType === 'image' && selectedFile) {
          sourceBlob = selectedFile;
        } else if (generatedImageUrl) {
          const response = await fetch(generatedImageUrl);
          sourceBlob = await response.blob();
        } else {
          throw new Error('No image source');
        }

        // Compress image: 300 DPI, max 18cm wide
        // Use PNG for AI-generated (better for text), JPEG for uploaded photos
        const format = getRecommendedFormat(newFigureType);
        const compressedBlob = await compressImage(sourceBlob, { format, quality: 0.92 });

        // Generate file path with correct extension
        const section = SECTION_OPTIONS.find(s => s.id === newFigureSection);
        const sectionNumber = section?.number.replace('B', '') || '1.1';
        const existingInSection = figures.filter(f => f.sectionId === newFigureSection);
        const letter = String.fromCharCode(97 + existingInSection.length);
        const extension = getFormatExtension(format);
        const filename = `figure-${sectionNumber}-${letter}-${newFigureTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.${extension}`;
        
        const filePath = generateProposalFilePath(proposalId, 'figures', filename, {
          prefix: newFigureType === 'ai' ? 'ai-generated' : 'uploaded',
          addTimestamp: true,
        });

        const contentType = format === 'png' ? 'image/png' : 'image/jpeg';
        const { url, error } = await uploadProposalFile(compressedBlob, filePath, {
          contentType,
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

  // Group figures by section (using sorted figures)
  const figuresBySection = sortedFigures.reduce((acc, figure) => {
    if (!acc[figure.sectionId]) {
      acc[figure.sectionId] = [];
    }
    acc[figure.sectionId].push(figure);
    return acc;
  }, {} as Record<string, Figure[]>);

  // Helper to format caption like Part B templates: "Figure X.X.x. Caption or Title"
  const formatFigureCaption = (figure: Figure) => {
    return `Figure ${figure.figureNumber}. ${figure.caption || figure.title}`;
  };

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
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground">Figures</h1>
            <p className="text-muted-foreground">
              Create and manage figures for your proposal. Insert them into Part B sections using the Insert Figure tool.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* View Toggle */}
            <div className="flex items-center border rounded-lg p-1">
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-8 px-3"
                onClick={() => setViewMode('list')}
              >
                <List className="w-4 h-4" />
              </Button>
              <Button
                variant={viewMode === 'gallery' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-8 px-3"
                onClick={() => setViewMode('gallery')}
              >
                <LayoutGrid className="w-4 h-4" />
              </Button>
            </div>
            {canEdit && (
              <>
                <Button 
                  variant="outline" 
                  className="gap-2"
                  onClick={() => setIsLibraryDialogOpen(true)}
                >
                  <Library className="w-4 h-4" />
                  From Library
                </Button>
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
              </>
            )}
          </div>
        </div>

        {/* Gallery View */}
        {viewMode === 'gallery' && (
          <div className="space-y-4">
            {sortedFigures.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Image className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No figures yet. Add your first figure to get started.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {sortedFigures.map((figure) => {
                  const section = SECTION_OPTIONS.find(s => s.id === figure.sectionId);
                  const hasImage = figure.content?.imageUrl;
                  
                  return (
                    <Card
                      key={figure.id}
                      className="overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary transition-all group"
                      onClick={() => setSelectedFigure(figure)}
                    >
                      <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden relative">
                        {hasImage ? (
                          <img 
                            src={figure.content.imageUrl} 
                            alt={figure.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                        ) : figure.figureType === 'gantt' ? (
                          <BarChart3 className="w-12 h-12 text-muted-foreground" />
                        ) : figure.figureType === 'pert' ? (
                          <Network className="w-12 h-12 text-muted-foreground" />
                        ) : figure.figureType === 'ai' ? (
                          <Sparkles className="w-12 h-12 text-muted-foreground" />
                        ) : (
                          <Image className="w-12 h-12 text-muted-foreground" />
                        )}
                        {/* Section badge overlay */}
                        <Badge 
                          variant="secondary" 
                          className="absolute top-2 left-2 text-xs"
                        >
                          {section?.number || 'B'}
                        </Badge>
                      </div>
                      <CardContent className="p-3">
                        {/* Caption matching Part B format: "Figure X.X.x. Caption or Title" */}
                        <p className="text-sm italic truncate" title={formatFigureCaption(figure)}>
                          <span className="font-semibold">Figure {figure.figureNumber}.</span>{' '}
                          {figure.caption || figure.title}
                        </p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* List View - Figures by Section */}
        {viewMode === 'list' && SECTION_OPTIONS.map((section) => {
          const sectionFigures = figuresBySection[section.id] || [];
          const figureIds = sectionFigures.map(f => f.id);
          
          return (
            <Card key={section.id}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Badge variant="outline">{section.number}</Badge>
                  {section.label}
                </CardTitle>
                <CardDescription>
                  {sectionFigures.length} figure{sectionFigures.length !== 1 ? 's' : ''}
                  {canEdit && sectionFigures.length > 1 && (
                    <span className="text-xs ml-2">(drag to reorder)</span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {sectionFigures.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No figures for this section yet
                  </p>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd(section.id)}
                  >
                    <SortableContext items={figureIds} strategy={verticalListSortingStrategy}>
                      <div className="space-y-2">
                        {sectionFigures.map((figure) => (
                          <SortableFigureItem
                            key={figure.id}
                            figure={figure}
                            onSelect={setSelectedFigure}
                            canEdit={canEdit}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Common Figures Library Dialog */}
      <CommonFiguresDialog
        open={isLibraryDialogOpen}
        onOpenChange={setIsLibraryDialogOpen}
        onSelectFigure={handleAddFromLibrary}
        sectionOptions={SECTION_OPTIONS}
        isAdding={isAddingFromLibrary}
      />
    </div>
  );
}