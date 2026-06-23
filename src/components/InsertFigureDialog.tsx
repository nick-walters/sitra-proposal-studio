import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { BarChart3, Network, Image, Check, Sparkles, Upload } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { StorageImage } from '@/components/StorageImage';

interface Figure {
  id: string;
  figureNumber: string;
  sectionId: string;
  title: string;
  figureType: string;
  content: any;
}

interface InsertFigureDialogProps {
  isOpen: boolean;
  onClose: () => void;
  proposalId: string;
  currentSectionId: string;
  // Callback to insert a figure image (with caption) at the cursor.
  // Some callers pass this as `onInsertFigure` (legacy name); we accept either.
  onInsertFigure?: (figure: Figure) => void;
  onInsertFigureImage?: (figure: Figure) => void;
}

export function InsertFigureDialog({
  isOpen,
  onClose,
  proposalId,
  currentSectionId,
  onInsertFigure,
  onInsertFigureImage,
}: InsertFigureDialogProps) {
  const [selectedFigures, setSelectedFigures] = useState<Set<string>>(new Set());

  const { data: figures = [] } = useQuery({
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
      })) as Figure[];
    },
    enabled: isOpen,
  });

  const toggleFigure = (id: string) => {
    setSelectedFigures(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const insertHandler = onInsertFigureImage ?? onInsertFigure;

  const handleInsert = () => {
    if (selectedFigures.size === 0 || !insertHandler) return;

    // Get selected figures in their original order
    const ordered = figures.filter(f => selectedFigures.has(f.id));

    for (const fig of ordered) {
      insertHandler(fig);
    }

    setSelectedFigures(new Set());
    onClose();
  };

  const getFigureIcon = (type: string) => {
    switch (type) {
      case 'gantt': return BarChart3;
      case 'pert': return Network;
      case 'ai': return Sparkles;
      case 'image': return Upload;
      default: return Image;
    }
  };

  const displayFigures = figures.filter(f => f.content?.imageUrl);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Insert figure image</DialogTitle>
          <DialogDescription>
            Select one or more figure images to insert at the cursor position. To insert a text cross-reference instead, use the cross-reference dropdown.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-[300px] overflow-y-auto mt-2">
          {displayFigures.length === 0 ? (
            <div className="text-center py-8">
              <Image className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                No image figures available. Upload or generate images from the Figures page.
              </p>
            </div>
          ) : (
            displayFigures.map((figure) => {
              const Icon = getFigureIcon(figure.figureType);
              const isSelected = selectedFigures.has(figure.id);
              const hasImage = figure.content?.imageUrl;

              return (
                <button
                  key={figure.id}
                  type="button"
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors",
                    isSelected
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted'
                  )}
                  onClick={() => toggleFigure(figure.id)}
                >
                  <div className="w-12 h-12 rounded bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                    {hasImage ? (
                      <StorageImage storedPath={figure.content.imageUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Icon className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">
                      Figure {figure.figureNumber}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {figure.title}
                    </p>
                  </div>
                  {isSelected && (
                    <Check className="w-4 h-4 text-primary flex-shrink-0" />
                  )}
                </button>
              );
            })
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleInsert} disabled={selectedFigures.size === 0}>
            {`Insert ${selectedFigures.size > 1 ? `${selectedFigures.size} figure images` : 'figure image'}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
