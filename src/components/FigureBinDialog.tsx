import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { StorageImage } from '@/components/StorageImage';
import { BarChart3, Image, LayoutTemplate, Network, RotateCcw, Sparkles } from 'lucide-react';
import type { DeletedFigureOption } from '@/hooks/useCardFigure';

interface FigureBinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  figures: DeletedFigureOption[];
  onRestore: (figureId: string) => void;
  isRestoring: boolean;
  canEdit: boolean;
}

/**
 * The figures recycle bin. Figures are not section-scoped once unplaced, so
 * they have their own bin rather than living in a per-section block bin.
 * There is no permanent delete control, matching the block bins: rows are
 * cleared by the scheduled purge job once the retention window has passed.
 */
export function FigureBinDialog({
  open,
  onOpenChange,
  figures,
  onRestore,
  isRestoring,
  canEdit,
}: FigureBinDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Deleted figures</DialogTitle>
          <DialogDescription>
            Restoring a figure returns it to Unplaced. Deleted figures are kept until the proposal
            is submitted, then for 30 days.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto pt-2">
          {figures.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              The figures recycle bin is empty.
            </p>
          ) : (
            figures.map((figure) => (
              <div
                key={figure.id}
                className="flex items-center gap-3 rounded-lg border bg-background p-3"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
                  {figure.content?.imageUrl ? (
                    <StorageImage
                      storedPath={figure.content.imageUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : figure.figureType === 'gantt' ? (
                    <BarChart3 className="h-5 w-5 text-muted-foreground" />
                  ) : figure.figureType === 'pert' ? (
                    <Network className="h-5 w-5 text-muted-foreground" />
                  ) : figure.figureType === 'impact-canvas' ||
                    figure.figureType === 'overview-canvas' ? (
                    <LayoutTemplate className="h-5 w-5 text-muted-foreground" />
                  ) : figure.figureType === 'ai' ? (
                    <Sparkles className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <Image className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <p className="min-w-0 flex-1 truncate text-sm">{figure.title}</p>
                {canEdit && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 gap-1"
                    disabled={isRestoring}
                    onClick={() => onRestore(figure.id)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Restore
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
