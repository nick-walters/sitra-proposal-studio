import { ArrowRight, BarChart3, Network, Sparkles, Image, LayoutTemplate, Plus, Trash2 } from 'lucide-react';
import { StorageImage } from '@/components/StorageImage';
import { Button } from '@/components/ui/button';

interface FigureRowFigure {
  id: string;
  /** Derived from the placing block; null when unplaced. */
  figureNumber: string | null;
  title: string;
  figureType: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: any;
  caption: string | null;
}

interface FigureRowProps<T extends FigureRowFigure> {
  figure: T;
  onSelect: (figure: T) => void;
  /** Shown only when a figure block invoked the manager and this figure is unplaced. */
  onAddToBlock?: (figure: T) => void;
  /** Shown only for genuinely unplaced figures: soft delete into the figures bin. */
  onDelete?: (figure: T) => void;
}

/**
 * A single row in the figures manager. Read-only with respect to order and
 * numbering: both are derived from the block placing the figure, so this row
 * has no drag handle and no number field.
 */
export function FigureRow<T extends FigureRowFigure>({ figure, onSelect, onAddToBlock, onDelete }: FigureRowProps<T>) {
  const hasImage = figure.content?.imageUrl;

  return (
    <div
      role="button"
      tabIndex={0}
      className="flex w-full cursor-pointer items-center gap-3 rounded-lg border bg-background p-3 text-left transition-colors hover:bg-muted"
      onClick={() => onSelect(figure)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(figure);
        }
      }}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
        {hasImage ? (
          <StorageImage storedPath={figure.content.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : figure.figureType === 'gantt' ? (
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
        ) : figure.figureType === 'pert' ? (
          <Network className="h-5 w-5 text-muted-foreground" />
        ) : figure.figureType === 'impact-canvas' || figure.figureType === 'overview-canvas' ? (
          <LayoutTemplate className="h-5 w-5 text-muted-foreground" />
        ) : figure.figureType === 'ai' ? (
          <Sparkles className="h-5 w-5 text-muted-foreground" />
        ) : (
          <Image className="h-5 w-5 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm italic">
          {figure.figureNumber && (
            <span className="font-semibold not-italic">Figure {figure.figureNumber}.</span>
          )}{' '}
          {figure.caption || figure.title}
        </p>
        <p className="text-xs capitalize text-muted-foreground">
          {figure.figureType === 'ai'
            ? 'AI generated'
            : figure.figureType === 'image'
              ? 'Uploaded image'
              : `${figure.figureType} chart`}
        </p>
      </div>
      {onAddToBlock && (
        <Button
          size="sm"
          className="shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onAddToBlock(figure);
          }}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add to block
        </Button>
      )}
      {onDelete && (
        <Button
          size="icon"
          variant="ghost"
          aria-label="Delete figure"
          className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(figure);
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </div>
  );
}
