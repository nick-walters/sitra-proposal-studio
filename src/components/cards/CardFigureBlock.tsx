import { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StorageImage } from '@/components/StorageImage';
import { FigureManager } from '@/components/FigureManager';
import { useCardFigure, useProposalFigures } from '@/hooks/useCardFigure';
import { tableCaptionClass, TABLE_CAPTION_LABEL_CLASS } from '@/lib/tableStyleSpec';
import type { FigurePlacement } from '@/types/cardTable';
import { cn } from '@/lib/utils';

interface CardFigureBlockProps {
  cardId: string;
  proposalId: string;
  canEdit: boolean;
  /** Placement, width and break controls are coordinator-or-above only. */
  isCoordinator: boolean;
  /**
   * The section declares that every figure and table is full width (B3.1).
   * Comes from the template, never from a hardcoded section id.
   */
  fullWidthOnly?: boolean;
  /** "Figure 1.2.a." — assigned by the board from document order. */
  captionLabel: string;
}

const PLACEMENT_LABELS: Record<FigurePlacement, string> = {
  full_width: 'Full width',
  beside_next: 'Beside the next block',
  top_of_page: 'Top of the page',
};

/**
 * Figure block. `card_figure` is authoritative for placement — the asset's own
 * `figures.section_id` is deliberately never read here.
 */
export function CardFigureBlock({
  cardId,
  proposalId,
  canEdit,
  isCoordinator,
  fullWidthOnly = false,
  captionLabel,
}: CardFigureBlockProps) {
  const { figureBlock, isLoading, save } = useCardFigure(cardId);
  const { data: figures = [] } = useProposalFigures(proposalId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [captionDraft, setCaptionDraft] = useState('');
  const captionTouched = useRef(false);

  useEffect(() => {
    if (!captionTouched.current) setCaptionDraft(figureBlock?.caption ?? '');
  }, [figureBlock?.caption]);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading the figure…</p>;
  if (!figureBlock) {
    return <p className="text-sm italic text-muted-foreground">This figure block has no placement data.</p>;
  }

  // The FK is ON DELETE SET NULL, so a deleted asset leaves the block orphaned.
  const figure = figureBlock.figureId ? figures.find((f) => f.id === figureBlock.figureId) : null;
  const imageUrl: string | null = figure?.content?.imageUrl ?? null;
  const missingAsset = !figureBlock.figureId || (figures.length > 0 && !figure);

  const placement: FigurePlacement = fullWidthOnly ? 'full_width' : figureBlock.placement;
  const widthPct = fullWidthOnly ? 100 : figureBlock.widthPct;
  const showPlacementControls = canEdit && isCoordinator;

  return (
    <div className="space-y-3">
      <div
        className={cn(
          'flex',
          placement === 'beside_next' ? 'justify-start' : 'justify-center',
        )}
      >
        <div style={{ width: `${widthPct}%` }} className="max-w-full">
          {missingAsset ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center">
              <ImageIcon className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {figureBlock.figureId
                  ? 'The figure this block pointed to has been deleted.'
                  : 'No figure chosen for this block yet.'}
              </p>
              {canEdit && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
                    Choose a figure
                  </Button>
                  <Button size="sm" onClick={() => setManagerOpen(true)}>
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Create a figure
                  </Button>
                </div>
              )}
            </div>
          ) : imageUrl ? (
            <StorageImage storedPath={imageUrl} alt={figure?.title ?? ''} className="h-auto w-full" />
          ) : (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              {figure?.title} has no rendered image yet. Open it on the figures page to render it.
            </div>
          )}

          <p className={tableCaptionClass('mt-2')}>
            <span className={TABLE_CAPTION_LABEL_CLASS}>{captionLabel}</span>{' '}
            {canEdit ? (
              <Input
                value={captionDraft}
                placeholder="Caption"
                className="mt-1 h-7 text-sm italic"
                onFocus={() => {
                  captionTouched.current = true;
                }}
                onChange={(e) => setCaptionDraft(e.target.value)}
                onBlur={() => {
                  captionTouched.current = false;
                  if ((figureBlock.caption ?? '') !== captionDraft) save.mutate({ caption: captionDraft });
                }}
              />
            ) : (
              <span>{figureBlock.caption}</span>
            )}
          </p>
        </div>
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-end gap-3 rounded-md bg-muted/40 p-2">
          {showPlacementControls && !fullWidthOnly && (
            <>
              <div className="space-y-1">
                <Label className="text-xs">Placement</Label>
                <Select
                  value={figureBlock.placement}
                  onValueChange={(value) => save.mutate({ placement: value as FigurePlacement })}
                >
                  <SelectTrigger className="h-8 w-52 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PLACEMENT_LABELS) as FigurePlacement[]).map((p) => (
                      <SelectItem key={p} value={p}>
                        {PLACEMENT_LABELS[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Width (% of the text column)</Label>
                <Input
                  type="number"
                  step="5"
                  min="10"
                  max="100"
                  defaultValue={figureBlock.widthPct}
                  className="h-8 w-28 text-xs"
                  onBlur={(e) => {
                    const raw = Number(e.target.value);
                    const next = Math.min(Math.max(Number.isFinite(raw) ? raw : 100, 10), 100);
                    if (next !== figureBlock.widthPct) save.mutate({ width_pct: next });
                  }}
                />
              </div>

              {figureBlock.placement === 'beside_next' && (
                <p className="self-center text-xs text-muted-foreground">
                  The next block takes the remaining {100 - figureBlock.widthPct}%.
                </p>
              )}
            </>
          )}

          {showPlacementControls && fullWidthOnly && (
            <p className="self-center text-xs text-muted-foreground">
              This section renders every figure and table at full width, so placement and width
              cannot be changed here.
            </p>
          )}

          {showPlacementControls && (
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-xs">
                <Checkbox
                  checked={figureBlock.keepWhole}
                  onCheckedChange={(v) => save.mutate({ keep_whole: v === true })}
                />
                Keep whole
              </label>
              <label className="flex items-center gap-2 text-xs">
                <Checkbox
                  checked={figureBlock.breakBefore}
                  onCheckedChange={(v) => save.mutate({ break_before: v === true })}
                />
                Start on a new page
              </label>
              <label className="flex items-center gap-2 text-xs">
                <Checkbox
                  checked={figureBlock.keepWithNext}
                  onCheckedChange={(v) => save.mutate({ keep_with_next: v === true })}
                />
                Keep with next
              </label>
            </div>
          )}

          <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
            <Pencil className="mr-1 h-3.5 w-3.5" />
            Change figure
          </Button>
          <Button size="sm" variant="outline" onClick={() => setManagerOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Create a figure
          </Button>
        </div>
      )}

      {/* Pick an existing asset. */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Choose a figure</DialogTitle>
            <DialogDescription>
              The block keeps its own placement; picking a figure only changes which asset it shows.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[320px] space-y-2 overflow-y-auto">
            {figures.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                This proposal has no figures yet. Create one first.
              </p>
            )}
            {figures.map((f) => (
              <button
                key={f.id}
                type="button"
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors',
                  f.id === figureBlock.figureId ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted',
                )}
                onClick={() => {
                  save.mutate({ figure_id: f.id });
                  setPickerOpen(false);
                }}
              >
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
                  {f.content?.imageUrl ? (
                    <StorageImage storedPath={f.content.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Figure {f.figureNumber}</p>
                  <p className="truncate text-xs text-muted-foreground">{f.title}</p>
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* The figures page itself, so every creation option is preserved. */}
      <Dialog open={managerOpen} onOpenChange={setManagerOpen}>
        <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create a figure</DialogTitle>
            <DialogDescription>
              Upload an image, generate one with AI, draw on a canvas, or build a Gantt or PERT chart. Close this
              dialog and choose the figure to attach it to this block.
            </DialogDescription>
          </DialogHeader>
          <FigureManager proposalId={proposalId} canEdit={canEdit} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default CardFigureBlock;
