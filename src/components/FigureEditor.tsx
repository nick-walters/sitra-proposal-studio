import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { GanttChartFigure } from '@/components/GanttChartFigure';
import { PERTChartFigure } from '@/components/PERTChartFigure';
import { ImpactCanvasBuilder } from '@/components/ImpactCanvasBuilder';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ArrowLeft, Save, Trash2, Image, Sparkles, Loader2, Upload } from 'lucide-react';
import { useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { generateProposalFilePath, uploadProposalFile } from '@/lib/proposalStorage';
import { compressImage, getFormatExtension } from '@/lib/imageCompression';
import { useStorageUrl } from '@/hooks/useStorageUrl';
import { useImpactCanvasEnabled } from '@/hooks/useImpactCanvas';
import { useProposalRole } from '@/hooks/useProposalRole';
import { Switch } from '@/components/ui/switch';

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

interface FigureEditorProps {
  figure: Figure;
  proposalId: string;
  onUpdate: (updates: Partial<Figure>) => void;
  onDelete: () => void;
  onBack: () => void;
  canEdit: boolean;
}

export function FigureEditor({
  figure,
  proposalId,
  onUpdate,
  onDelete,
  onBack,
  canEdit,
}: FigureEditorProps) {
  const [title, setTitle] = useState(figure.title);
  const caption = figure.caption || '';
  
  // AI regeneration state
  const [editPrompt, setEditPrompt] = useState(figure.content?.aiPrompt || '');
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isReplacing, setIsReplacing] = useState(false);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const resolvedImageUrl = useStorageUrl(figure.content?.imageUrl);
  const isImpactCanvas = figure.figureType === 'impact-canvas';
  const { roleTier } = useProposalRole(proposalId);
  const isCoordinator = roleTier === 'coordinator';
  const { enabled: canvasEnabled, setEnabled: setCanvasEnabled } = useImpactCanvasEnabled(
    isImpactCanvas ? proposalId : '',
  );

  const handleReplaceImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsReplacing(true);
    try {
      const compressed = await compressImage(file, { format: 'png', quality: 0.92 });
      const ext = getFormatExtension('png');
      const filename = `figure-${figure.figureNumber}-replaced.${ext}`;
      const filePath = generateProposalFilePath(proposalId, 'figures', filename, {
        prefix: figure.figureType === 'ai' ? 'ai-generated' : 'uploaded',
        addTimestamp: true,
      });

      const { storagePath, error: uploadErr } = await uploadProposalFile(compressed, filePath, {
        contentType: 'image/png',
      });

      if (uploadErr) throw uploadErr;
      if (!storagePath) throw new Error('Failed to get storage path');

      const newContent = { ...figure.content, imageUrl: storagePath };
      onUpdate({ content: newContent });
      toast.success('Image replaced successfully!');
    } catch (error) {
      console.error('Replace image error:', error);
      toast.error('Failed to replace image. Please try again.');
    } finally {
      setIsReplacing(false);
      if (replaceInputRef.current) replaceInputRef.current.value = '';
    }
  };

  const handleSave = () => {
    onUpdate({ title });
  };

  const handleRegenerate = async () => {
    if (!editPrompt.trim()) {
      toast.error('Please enter a description for the image');
      return;
    }

    setIsRegenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-image', {
        body: { prompt: editPrompt.trim() }
      });

      if (error) throw error;
      if (data.error) {
        toast.error(data.error);
        return;
      }

      if (data.imageUrl) {
        // Upload to storage
        const response = await fetch(data.imageUrl);
        const sourceBlob = await response.blob();
        const compressedBlob = await compressImage(sourceBlob, { format: 'png', quality: 0.92 });
        
        const filename = `figure-${figure.figureNumber}-regenerated.png`;
        const filePath = generateProposalFilePath(proposalId, 'figures', filename, {
          prefix: 'ai-generated',
          addTimestamp: true,
        });

        const { storagePath: newPath, error: uploadErr } = await uploadProposalFile(compressedBlob, filePath, {
          contentType: 'image/png',
        });

        if (uploadErr) throw uploadErr;
        if (!newPath) throw new Error('Failed to get storage path');

        onUpdate({ content: { imageUrl: newPath, aiPrompt: editPrompt.trim() } });
        toast.success('Image regenerated successfully!');
      } else {
        toast.error('Failed to regenerate image');
      }
    } catch (error) {
      console.error('Regeneration error:', error);
      toast.error('Failed to regenerate image. Please try again.');
    } finally {
      setIsRegenerating(false);
    }
  };

  const renderFigureContent = () => {
    if (figure.content?.imageUrl) {
      return (
        <div className="space-y-4">
          <div className="border rounded-lg overflow-hidden bg-muted/30">
            <Dialog>
              <DialogTrigger asChild>
                <img 
                  src={resolvedImageUrl || ''} 
                  alt={figure.title}
                  className="max-w-full h-auto mx-auto cursor-pointer hover:opacity-80 transition-opacity"
                  title="Click to enlarge"
                />
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh]">
                <DialogHeader>
                  <DialogTitle>Figure {figure.figureNumber}</DialogTitle>
                </DialogHeader>
                <img 
                  src={resolvedImageUrl || ''} 
                  alt={figure.title}
                  className="w-full h-auto rounded"
                />
              </DialogContent>
          </Dialog>
          </div>
          {canEdit && (
            <div className="flex items-center gap-2">
              <input
                ref={replaceInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleReplaceImage}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => replaceInputRef.current?.click()}
                disabled={isReplacing}
              >
                {isReplacing ? (
                  <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Replacing...</>
                ) : (
                  <><Upload className="w-4 h-4 mr-1" />Replace Image</>
                )}
              </Button>
            </div>
          )}
          <p className="text-sm text-muted-foreground text-left">
            <em><strong>Figure {figure.figureNumber}.</strong> {caption || title}</em>
          </p>
        </div>
      );
    }

    switch (figure.figureType) {
      case 'gantt':
        return (
          <GanttChartFigure
            figureId={figure.id}
            figureNumber={figure.figureNumber}
            proposalId={proposalId}
            content={figure.content}
            onContentChange={(content) => onUpdate({ content })}
            canEdit={canEdit}
          />
        );
      case 'pert':
        return (
          <PERTChartFigure
            figureId={figure.id}
            figureNumber={figure.figureNumber}
            proposalId={proposalId}
            content={figure.content}
            onContentChange={(content) => onUpdate({ content })}
            canEdit={canEdit}
          />
        );
      case 'impact-canvas':
        return <ImpactCanvasBuilder proposalId={proposalId} canEdit={canEdit} />;
      case 'image':
      case 'ai':
        return (
          <div className="min-h-[200px] border-2 border-dashed rounded-lg flex flex-col items-center justify-center text-muted-foreground gap-2">
            <Image className="w-12 h-12" />
            <p>No image uploaded yet</p>
          </div>
        );
      default:
        return (
          <div className="min-h-[300px] border-2 border-dashed rounded-lg flex items-center justify-center text-muted-foreground">
            Custom figure content editor coming soon
          </div>
        );
    }
  };

  return (
    <div className="flex-1 overflow-auto p-6 bg-muted/30">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back" title="Back">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-xl font-bold">Figure {figure.figureNumber}</h1>
              <p className="text-sm text-muted-foreground">
                {figure.figureType === 'ai' ? 'AI Generated' : figure.figureType === 'image' ? 'Uploaded Image' : `${figure.figureType} figure`} for section {figure.sectionId}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canEdit && (
              <>
                <Button variant="outline" size="sm" onClick={onDelete} className="text-destructive">
                  <Trash2 className="w-4 h-4 mr-1" />
                  Delete
                </Button>
                <Button size="sm" onClick={handleSave}>
                  <Save className="w-4 h-4 mr-1" />
                  Save
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Title & Caption */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Figure details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Figure title"
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="caption">Caption</Label>
              <Input
                id="caption"
                value={caption}
                placeholder="No caption set. Edit in Part B templates."
                disabled
                className="bg-muted/50"
              />
              <p className="text-xs text-muted-foreground">
                Captions are edited in Part B templates where the figure is inserted.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* AI Regeneration */}
        {figure.figureType === 'ai' && canEdit && figure.content?.imageUrl && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                AI Image Prompt
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                placeholder="Describe the image you want to generate..."
                rows={3}
                disabled={isRegenerating}
              />
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={handleRegenerate}
                disabled={isRegenerating || !editPrompt.trim()}
              >
                {isRegenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Regenerating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Regenerate Image
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Figure Content */}
        <Card>
          <CardContent className="pt-6">
            {renderFigureContent()}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
