import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, ArrowRight, BarChart3, Network, Sparkles, Image } from 'lucide-react';

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

interface SortableFigureItemProps {
  figure: Figure;
  onSelect: (figure: Figure) => void;
  canEdit: boolean;
}

export function SortableFigureItem({ figure, onSelect, canEdit }: SortableFigureItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: figure.id, disabled: !canEdit });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const hasImage = figure.content?.imageUrl;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 p-3 rounded-lg border bg-background hover:bg-muted transition-colors ${
        isDragging ? 'shadow-lg ring-2 ring-primary' : ''
      }`}
    >
      {canEdit && (
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded touch-none"
          aria-label="Drag to reorder"
        >
          <GripVertical className="w-4 h-4 text-muted-foreground" />
        </button>
      )}
      <button
        className="flex-1 flex items-center gap-3 text-left"
        onClick={() => onSelect(figure)}
      >
        <div className="w-10 h-10 rounded bg-muted flex items-center justify-center overflow-hidden shrink-0">
          {hasImage ? (
            <img src={figure.content.imageUrl} alt="" className="w-full h-full object-cover" />
          ) : figure.figureType === 'gantt' ? (
            <BarChart3 className="w-5 h-5 text-muted-foreground" />
          ) : figure.figureType === 'pert' ? (
            <Network className="w-5 h-5 text-muted-foreground" />
          ) : figure.figureType === 'ai' ? (
            <Sparkles className="w-5 h-5 text-muted-foreground" />
          ) : (
            <Image className="w-5 h-5 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          {/* Caption matching Part B format: "Figure X.X.x. Caption or Title" */}
          <p className="text-sm italic truncate">
            <span className="font-semibold not-italic">Figure {figure.figureNumber}.</span>{' '}
            {figure.caption || figure.title}
          </p>
          <p className="text-xs text-muted-foreground capitalize">
            {figure.figureType === 'ai' ? 'AI Generated' : figure.figureType === 'image' ? 'Uploaded Image' : `${figure.figureType} chart`}
          </p>
        </div>
        <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
      </button>
    </div>
  );
}
