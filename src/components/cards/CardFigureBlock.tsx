import { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Pencil, Plus, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tip } from '@/components/ui/control-tip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
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
import { TABLE_CAPTION_LABEL_CLASS } from '@/lib/tableStyleSpec';
import {
  FIGURE_PAGE_BREAK_LABELS,
  FIGURE_POSITION_LABELS,
  FIGURE_WIDTH_LABELS,
  resolveFigureWidthPct,
  type FigurePageBreakMode,
  type FigurePositionMode,
  type FigureWidthMode,
} from '@/lib/figureLayout';
import { cn } from '@/lib/utils';

interface CardFigureBlockProps {
  cardId: string;
  proposalId: string;
  canEdit: boolean;
  /** Layout controls are coordinator-or-above only. */
  isCoordinator: boolean;
  /**
   * The section declares that every figure and table is full width (B3.1).
   * Comes from the template, never from a hardcoded section id.
   */
  fullWidthOnly?: boolean;
  /** "Figure 1.2.a." — assigned by the board from document order. */
  captionLabel: string;
}

/**
 * Figure block. `card_figure` is authoritative for placement — the asset's own
 * `figures.section_id` is deliberately never read here.
 *
 * A figure never splits across pages and is never separated from its caption:
 * that is unconditional, see FIGURE_NEVER_SPLITS in src/lib/figureLayout.ts.
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
  const [managerOpen, setManagerOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
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

  const widthMode: FigureWidthMode = fullWidthOnly ? 'full' : figureBlock.widthMode;
  const widthPct = fullWidthOnly ? 100 : resolveFigureWidthPct(widthMode, figureBlock.customWidthPct);
  const isFullWidth = widthMode === 'full';
  const showLayoutControls = canEdit && isCoordinator;

  return (
    <div className="space-y-3">
      <div
        className={cn(
          'flex',
          figureBlock.positionMode === 'left_wrap' && !isFullWidth ? 'justify-start' : '',
          figureBlock.positionMode === 'right_wrap' && !isFullWidth ? 'justify-end' : '',
          figureBlock.positionMode === 'below' || isFullWidth ? 'justify-center' : '',
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
                <Tip label="Insert a figure into this block">
                  <Button size="sm" onClick={() => setManagerOpen(true)}>
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Insert a figure
                  </Button>
                </Tip>
              )}
            </div>
          ) : imageUrl ? (
            <StorageImage storedPath={imageUrl} alt={figure?.title ?? ''} className="h-auto w-full" />
          ) : (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              {figure?.title} has no rendered image yet. Open it on the figures page to render it.
            </div>
          )}
        </div>
      </div>

      {/* Caption sits between the figure and controls and spans the full block width. */}
      <div className="figure-caption-row w-full items-baseline gap-2">
        <span className={cn(TABLE_CAPTION_LABEL_CLASS, 'shrink-0 whitespace-nowrap')}>
          {captionLabel}
        </span>
        {canEdit ? (
          <Input
            value={captionDraft}
            placeholder="Caption"
            className="h-7 min-w-0 w-auto flex-1 border-transparent bg-transparent px-1 font-[inherit] text-[inherit] italic leading-[inherit] shadow-none focus-visible:border-input focus-visible:bg-background"
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
          <span className="flex-1 italic">{figureBlock.caption}</span>
        )}
      </div>

      {canEdit && (
        <div className="space-y-4 rounded-md bg-muted/40 p-3">
          {showLayoutControls && !fullWidthOnly && (
            <div className="grid gap-4 md:grid-cols-2">
              {/* a. WIDTH */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Width</Label>
                <div className="flex items-center gap-2">
                  <Select
                    value={figureBlock.widthMode}
                    onValueChange={(value) => save.mutate({ width_mode: value as FigureWidthMode })}
                  >
                    <SelectTrigger className="h-8 w-56 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(FIGURE_WIDTH_LABELS) as FigureWidthMode[]).map((m) => (
                        <SelectItem key={m} value={m}>
                          {FIGURE_WIDTH_LABELS[m]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {figureBlock.widthMode === 'custom' && (
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        step="5"
                        min="1"
                        max="100"
                        defaultValue={figureBlock.customWidthPct}
                        className="h-8 w-20 text-xs"
                        onBlur={(e) => {
                          const raw = Number(e.target.value);
                          const next = Math.min(Math.max(Number.isFinite(raw) ? raw : 100, 1), 100);
                          if (next !== figureBlock.customWidthPct) save.mutate({ custom_width_pct: next });
                        }}
                      />
                      <span className="text-xs text-muted-foreground">% of the page width</span>
                    </div>
                  )}
                </div>
              </div>

              {/* b. GROUP WITH */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Group with</Label>
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox
                      checked={figureBlock.groupWithAbove}
                      onCheckedChange={(v) => save.mutate({ group_with_above: v === true })}
                    />
                    The block above
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox
                      checked={figureBlock.groupWithBelow}
                      onCheckedChange={(v) => save.mutate({ group_with_below: v === true })}
                    />
                    The block below
                  </label>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  No page break may fall between this figure and the block ticked.
                </p>
              </div>

              {/* c. POSITION — hidden at full page width, nothing can wrap beside it. */}
              {!isFullWidth && (
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Position compared to the block above</Label>
                  <RadioGroup
                    value={figureBlock.positionMode}
                    onValueChange={(value) => save.mutate({ position_mode: value as FigurePositionMode })}
                    className="gap-1"
                  >
                    {(Object.keys(FIGURE_POSITION_LABELS) as FigurePositionMode[]).map((p) => (
                      <label key={p} className="flex items-center gap-2 text-xs">
                        <RadioGroupItem value={p} id={`${cardId}-pos-${p}`} />
                        {FIGURE_POSITION_LABELS[p]}
                      </label>
                    ))}
                  </RadioGroup>
                </div>
              )}

              {/* d. PAGE BREAKS */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Page breaks</Label>
                <RadioGroup
                  value={figureBlock.pageBreakMode}
                  onValueChange={(value) => save.mutate({ page_break_mode: value as FigurePageBreakMode })}
                  className="gap-1"
                >
                  {(Object.keys(FIGURE_PAGE_BREAK_LABELS) as FigurePageBreakMode[]).map((p) => (
                    <label key={p} className="flex items-center gap-2 text-xs">
                      <RadioGroupItem value={p} id={`${cardId}-brk-${p}`} />
                      {FIGURE_PAGE_BREAK_LABELS[p]}
                    </label>
                  ))}
                </RadioGroup>
                <p className="text-[11px] text-muted-foreground">
                  A figure never splits across pages and is never separated from its caption.
                </p>
              </div>
            </div>
          )}

          {showLayoutControls && fullWidthOnly && (
            <p className="text-xs text-muted-foreground">
              This section renders every figure and table at full page width, so the layout controls
              are fixed here.
            </p>
          )}

          {/* No figure: the empty state's "Insert a figure" is the only entry point. */}
          {!missingAsset && (
            <div className="flex flex-wrap gap-2">
              <Tip label="Change the figure shown in this block">
                <Button size="sm" variant="outline" onClick={() => setManagerOpen(true)}>
                  <Pencil className="mr-1 h-3.5 w-3.5" />
                  Change figure
                </Button>
              </Tip>
              <Tip label="Remove the figure from this block (the figure itself is kept)">
                <Button size="sm" variant="outline" onClick={() => setRemoveOpen(true)}>
                  <Unlink className="mr-1 h-3.5 w-3.5" />
                  Remove the figure from this block
                </Button>
              </Tip>
            </div>
          )}
        </div>
      )}

      {/* Clear the figure — the asset itself survives and becomes unplaced. */}
      <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove the figure from this block?</AlertDialogTitle>
            <AlertDialogDescription>
              The block stays where it is and returns to its empty state. The figure is not deleted:
              it becomes unplaced, reappears in the figures manager and can be placed in another
              block.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                save.mutate({ figure_id: null });
                setRemoveOpen(false);
              }}
            >
              Remove the figure
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* The figures page itself, so every creation option is preserved. */}
      <Dialog open={managerOpen} onOpenChange={setManagerOpen}>
        <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Insert a figure</DialogTitle>
            <DialogDescription>
              Upload an image, generate one with AI, draw on a canvas, or build a Gantt or PERT chart, then use
              “Add to block” beside any unplaced figure to put it in this block.
            </DialogDescription>
          </DialogHeader>
          <FigureManager
            proposalId={proposalId}
            canEdit={canEdit}
            onAddToBlock={(figureId) => {
              save.mutate({ figure_id: figureId });
              setManagerOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default CardFigureBlock;
