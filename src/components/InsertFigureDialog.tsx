import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BarChart3, Network, Image, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

interface Figure {
  id: string;
  figureNumber: string;
  sectionId: string;
  title: string;
  figureType: string;
}

interface InsertFigureDialogProps {
  isOpen: boolean;
  onClose: () => void;
  proposalId: string;
  currentSectionId: string;
  onInsertFigure: (figure: Figure) => void;
}

export function InsertFigureDialog({
  isOpen,
  onClose,
  proposalId,
  currentSectionId,
  onInsertFigure,
}: InsertFigureDialogProps) {
  const [selectedFigure, setSelectedFigure] = useState<Figure | null>(null);

  // Fetch figures for this proposal
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
      })) as Figure[];
    },
    enabled: isOpen,
  });

  const handleInsert = () => {
    if (selectedFigure) {
      onInsertFigure(selectedFigure);
      setSelectedFigure(null);
      onClose();
    }
  };

  const getFigureIcon = (type: string) => {
    switch (type) {
      case 'gantt':
        return BarChart3;
      case 'pert':
        return Network;
      default:
        return Image;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Insert Figure Reference</DialogTitle>
          <DialogDescription>
            Select a figure to insert a reference at the current cursor position.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {figures.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No figures created yet. Create figures from the Figures section.
            </p>
          ) : (
            figures.map((figure) => {
              const Icon = getFigureIcon(figure.figureType);
              const isSelected = selectedFigure?.id === figure.id;
              return (
                <button
                  key={figure.id}
                  type="button"
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
                    isSelected
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted'
                  }`}
                  onClick={() => setSelectedFigure(figure)}
                >
                  <div className="w-8 h-8 rounded bg-muted flex items-center justify-center">
                    <Icon className="w-4 h-4 text-muted-foreground" />
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
                    <Check className="w-4 h-4 text-primary" />
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
          <Button onClick={handleInsert} disabled={!selectedFigure}>
            Insert Reference
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
