import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { GanttChartFigure } from '@/components/GanttChartFigure';
import { ArrowLeft, Save, Trash2 } from 'lucide-react';

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
  const [caption, setCaption] = useState(figure.caption || '');

  const handleSave = () => {
    onUpdate({ title, caption });
  };

  const renderFigureContent = () => {
    switch (figure.figureType) {
      case 'gantt':
        return (
          <GanttChartFigure
            figureNumber={figure.figureNumber}
            proposalId={proposalId}
            content={figure.content}
            onContentChange={(content) => onUpdate({ content })}
            canEdit={canEdit}
          />
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
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-xl font-bold">Figure {figure.figureNumber}</h1>
              <p className="text-sm text-muted-foreground">
                Edit figure for section {figure.sectionId}
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
            <CardTitle className="text-base">Figure Details</CardTitle>
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
              <Textarea
                id="caption"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Optional caption for the figure"
                rows={2}
                disabled={!canEdit}
              />
            </div>
          </CardContent>
        </Card>

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
