import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ArrowLeft, Trash2, Image, Sparkles, Loader2, Upload, Download } from 'lucide-react';
import { useRef } from 'react';
import { ImpactCanvasFreeformEditor } from '@/components/ImpactCanvasFreeformEditor';
import { CanvasFigureRasteriser } from '@/components/CanvasFigureRasteriser';

import { getFigureSizePreset } from '@/lib/figureSizePresets';
import {
  defaultTableCanvasPresetId,
  isTableCanvasFigureType,
  resolveTableCanvasSize,
} from '@/lib/canvasFigureSize';
import { FigureSizePicker, type FigureSizeValue } from '@/components/FigureSizePicker';

import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { generateProposalFilePath, uploadProposalFile } from '@/lib/proposalStorage';
import { compressImage, getFormatExtension } from '@/lib/imageCompression';
import { useStorageUrl } from '@/hooks/useStorageUrl';
import { useImpactCanvasEnabled, useOverviewCanvasEnabled } from '@/hooks/useImpactCanvas';
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
  // Live-mirror caption from figures.caption (Part B is the source of truth).
  const captionQ = useQuery({
    queryKey: ['figure-caption', figure.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('figures')
        .select('caption, title')
        .eq('id', figure.id)
        .maybeSingle();
      return (data?.caption ?? data?.title ?? '') as string;
    },
    staleTime: 5_000,
    refetchOnWindowFocus: true,
  });
  const mirroredCaption = (captionQ.data ?? figure.caption ?? figure.title ?? '').trim();
  
  
  // AI regeneration state
  const [editPrompt, setEditPrompt] = useState(figure.content?.aiPrompt || '');
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isReplacing, setIsReplacing] = useState(false);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const resolvedImageUrl = useStorageUrl(figure.content?.imageUrl);
  const isImpactCanvas = figure.figureType === 'impact-canvas';
  const isOverviewCanvas = figure.figureType === 'overview-canvas';
  const impactGraphicRef = useRef<HTMLDivElement>(null);
  const [downloadingCanvasPng, setDownloadingCanvasPng] = useState(false);
  const { roleTier } = useProposalRole(proposalId);
  const isCoordinator = roleTier === 'coordinator';

  const { enabled: canvasEnabled, setEnabled: setCanvasEnabled } = useImpactCanvasEnabled(
    isImpactCanvas ? proposalId : '',
  );
  const { enabled: overviewEnabled, setEnabled: setOverviewEnabled } = useOverviewCanvasEnabled(
    isOverviewCanvas ? proposalId : '',
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

  const renderImageSizePicker = () => {
    const isCanvasFigure = figure.figureType === 'canvas';
    const isPertFigure = figure.figureType === 'pert';
    const isTableCanvas = isTableCanvasFigureType(figure.figureType);
    const isImageFigure =
      figure.figureType === 'image' || figure.figureType === 'ai' || isCanvasFigure || isPertFigure || isTableCanvas;
    if (!isImageFigure || !canEdit) return null;
    const cWidth = Number(figure.content?.widthCm);
    const cHeight = Number(figure.content?.heightCm);
    const hasSize = Number.isFinite(cWidth) && cWidth > 0 && Number.isFinite(cHeight) && cHeight > 0;
    const presetFallback = isPertFigure
      ? getFigureSizePreset('third')
      : isTableCanvas
      ? getFigureSizePreset(defaultTableCanvasPresetId(figure.figureType))
      : getFigureSizePreset(figure.content?.presetId);
    const sizeValue: FigureSizeValue = {
      presetId: (figure.content?.presetId as any) || (hasSize ? 'custom' : presetFallback.id),
      widthCm: hasSize ? cWidth : presetFallback.widthCm,
      heightCm: hasSize ? cHeight : presetFallback.heightCm,
    };

    const handleSizeChange = (v: FigureSizeValue) => {
      onUpdate({
        content: {
          ...(figure.content || {}),
          presetId: v.presetId,
          widthCm: v.widthCm,
          heightCm: v.heightCm,
        },
      });
    };
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
          <span className="text-sm font-medium shrink-0">
            {isCanvasFigure || isPertFigure || isTableCanvas ? 'Canvas size' : 'Figure size'}
          </span>
          <div className="w-64 shrink-0">
            <FigureSizePicker
              value={sizeValue}
              onChange={handleSizeChange}
              idPrefix={`figure-${figure.id}-size`}
              hideLabel
              inlineCustom
            />
          </div>
          <p className="text-xs text-muted-foreground flex-1 min-w-[16rem]">
            {isPertFigure
              ? 'Resizes the PERT frame. Work package boxes keep their exact positions and sizes — nothing is scaled or moved.'
              : isTableCanvas
              ? 'Sets the canvas frame. Boxes keep their exact positions and sizes in cm; if any box extends past the chosen height the frame grows to fit it, so nothing is ever clipped.'
              : isCanvasFigure
              ? 'Resizes the canvas frame. Elements keep their exact positions and sizes in cm — nothing is scaled or moved; anything outside a smaller frame stays in the data and reappears if you enlarge again.'
              : 'The image fits inside this box preserving aspect ratio (no crop, no stretch, no padding).'}
          </p>
        </CardContent>
      </Card>
    );

  };


  const renderFigureContent = () => {
    // Canvas figures store a DERIVED imageUrl (Stage D rasterisation) but must
    // still open the canvas editor, so they never take the image branch.
    if (figure.content?.imageUrl && figure.figureType !== 'canvas') {

      const cWidth = Number(figure.content?.widthCm);
      const cHeight = Number(figure.content?.heightCm);
      const hasSize = Number.isFinite(cWidth) && cWidth > 0 && Number.isFinite(cHeight) && cHeight > 0;
      const imgStyle = hasSize
        ? { maxWidth: `${cWidth}cm`, maxHeight: `${cHeight}cm`, width: 'auto' as const, height: 'auto' as const }
        : undefined;
      return (
        <div className="space-y-4">
          <div className="border rounded-lg overflow-hidden bg-muted/30 p-2 flex justify-center">
            <Dialog>
              <DialogTrigger asChild>
                <img
                  src={resolvedImageUrl || ''}
                  alt={figure.title}
                  className="max-w-full h-auto mx-auto cursor-pointer hover:opacity-80 transition-opacity"
                  title="Click to enlarge"
                  style={imgStyle}
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
            <em><strong>Figure {figure.figureNumber}.</strong> {mirroredCaption}</em>
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
        return <ImpactCanvasBuilder proposalId={proposalId} canEdit={canEdit} figureNumber={figure.figureNumber} graphicRef={impactGraphicRef} />;
      case 'overview-canvas':
        return (
          <ImpactCanvasBuilder
            proposalId={proposalId}
            canEdit={canEdit}
            figureNumber={figure.figureNumber}
            graphicRef={impactGraphicRef}
            figureId={figure.id}
            variant="overview"
          />
        );
      case 'canvas': {
        const preset = getFigureSizePreset(figure.content?.presetId);
        const widthCm = Number(figure.content?.widthCm) || preset.widthCm;
        const heightCm = Number(figure.content?.heightCm) || preset.heightCm;
        return (
          <>
            <ImpactCanvasFreeformEditor
              proposalId={proposalId}
              canEdit={canEdit}
              figureId={figure.id}
              mode="freeform"
              canvasSize={{ widthCm, heightCm }}
            />
            <CanvasFigureRasteriser
              proposalId={proposalId}
              figureId={figure.id}
              figureNumber={figure.figureNumber}
              widthCm={widthCm}
              heightCm={heightCm}
              content={figure.content}
              onUpdate={onUpdate}
              canEdit={canEdit}
            />
          </>
        );
      }

      case 'image':
      case 'ai':
        return (
          <div className="min-h-[200px] border-2 border-dashed rounded-lg flex flex-col items-center justify-center text-muted-foreground gap-2">
            <Image className="w-12 h-12" />
            <p>No image uploaded yet</p>
          </div>
        );
      default:
        return null;
    }
  };

  const NON_DELETABLE_TYPES = new Set(['pert', 'gantt', 'impact-canvas', 'overview-canvas']);
  const canDeleteFigure = canEdit && !NON_DELETABLE_TYPES.has(figure.figureType);

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
              <h1 className="text-xl font-bold">
                Figure {figure.figureNumber}{mirroredCaption ? `. ${mirroredCaption}` : ''}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isImpactCanvas && isCoordinator && (
              <label className="flex items-center gap-2 text-sm mr-1 select-none">
                <Switch
                  checked={canvasEnabled}
                  onCheckedChange={(v) => setCanvasEnabled.mutate(!!v)}
                  aria-label="Include impact canvas"
                />
                <span className="text-muted-foreground">Include in B2.1</span>
              </label>
            )}
            {isOverviewCanvas && isCoordinator && (
              <label className="flex items-center gap-2 text-sm mr-1 select-none">
                <Switch
                  checked={overviewEnabled}
                  onCheckedChange={(v) => setOverviewEnabled.mutate(!!v)}
                  aria-label="Include overview canvas"
                />
                <span className="text-muted-foreground">Include in B1.1</span>
              </label>
            )}
            {(isImpactCanvas || isOverviewCanvas) && (

              <Button
                variant="outline"
                size="sm"
                disabled={downloadingCanvasPng}
                onClick={async () => {
                  if (!impactGraphicRef.current) return;
                  setDownloadingCanvasPng(true);
                  try {
                    const { exportAsPng } = await import('@/lib/figureExport');
                    await exportAsPng(
                      impactGraphicRef.current,
                      `${isOverviewCanvas ? 'Overview' : 'Impact'}-Canvas-Figure-${figure.figureNumber}`,
                    );
                    toast.success('PNG downloaded');
                  } catch (err) {
                    console.error(err);
                    toast.error('Failed to export PNG');
                  } finally {
                    setDownloadingCanvasPng(false);
                  }
                }}
              >
                <Download className="w-4 h-4 mr-1" />
                Download PNG
              </Button>
            )}
            {canDeleteFigure && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="text-destructive">
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this figure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => onDelete()}
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

          </div>
        </div>


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

        {/* Figure / canvas size — compact card at the bottom of the page */}
        {renderImageSizePicker()}


      </div>
    </div>
  );
}
