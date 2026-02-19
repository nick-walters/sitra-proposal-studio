import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart3, Network, Image, Check, Sparkles, Upload, Link2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

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
  onInsertFigure: (figure: Figure) => void;
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
  const [insertMode, setInsertMode] = useState<'image' | 'reference'>('image');

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

  const handleInsert = () => {
    if (selectedFigures.size === 0) return;

    // Get selected figures in their original order
    const ordered = figures.filter(f => selectedFigures.has(f.id));

    for (const fig of ordered) {
      if (insertMode === 'image' && onInsertFigureImage) {
        onInsertFigureImage(fig);
      } else {
        onInsertFigure(fig);
      }
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

  const imageFigures = figures.filter(f => f.content?.imageUrl);
  const displayFigures = insertMode === 'image' ? imageFigures : figures;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Insert Figure</DialogTitle>
          <DialogDescription>
            Select one or more figures to insert at the cursor position.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={insertMode} onValueChange={(v) => { setInsertMode(v as 'image' | 'reference'); setSelectedFigures(new Set()); }}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="image" className="gap-2">
              <Image className="w-4 h-4" />
              Insert Image
            </TabsTrigger>
            <TabsTrigger value="reference" className="gap-2">
              <Link2 className="w-4 h-4" />
              Insert Reference
            </TabsTrigger>
          </TabsList>

          <TabsContent value="image" className="mt-4">
            <p className="text-sm text-muted-foreground mb-3">
              Insert figure images with their captions into the document.
            </p>
          </TabsContent>

          <TabsContent value="reference" className="mt-4">
            <p className="text-sm text-muted-foreground mb-3">
              Insert text references like "(see Figure 1.1.a)" that link to figures.
            </p>
          </TabsContent>
        </Tabs>

        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {displayFigures.length === 0 ? (
            <div className="text-center py-8">
              <Image className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                {insertMode === 'image'
                  ? 'No image figures available. Upload or generate images from the Figures page.'
                  : 'No figures created yet. Create figures from the Figures section.'}
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
                      <img src={figure.content.imageUrl} alt="" className="w-full h-full object-cover" />
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
            {insertMode === 'image'
              ? `Insert ${selectedFigures.size > 1 ? `${selectedFigures.size} Figures` : 'Figure'}`
              : `Insert ${selectedFigures.size > 1 ? `${selectedFigures.size} References` : 'Reference'}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
