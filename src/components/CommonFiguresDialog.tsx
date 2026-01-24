import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Image, Sparkles, BarChart3, Network, Search, Library, Plus, Loader2 } from 'lucide-react';

interface CommonFigure {
  id: string;
  title: string;
  description: string | null;
  figure_type: string;
  content: any;
  category: string | null;
  tags: string[] | null;
}

interface CommonFiguresDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectFigure: (figure: CommonFigure, sectionId: string) => void;
  sectionOptions: Array<{ id: string; number: string; label: string }>;
  isAdding?: boolean;
}

export function CommonFiguresDialog({
  open,
  onOpenChange,
  onSelectFigure,
  sectionOptions,
  isAdding = false,
}: CommonFiguresDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSection, setSelectedSection] = useState(sectionOptions[0]?.id || '');
  const [selectedFigure, setSelectedFigure] = useState<CommonFigure | null>(null);

  const { data: commonFigures = [], isLoading } = useQuery({
    queryKey: ['common-figures'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('common_figures')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as CommonFigure[];
    },
    enabled: open,
  });

  // Get unique categories
  const categories = Array.from(
    new Set(commonFigures.map(f => f.category).filter(Boolean))
  ) as string[];

  // Filter figures
  const filteredFigures = commonFigures.filter(figure => {
    const matchesSearch = !searchQuery || 
      figure.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      figure.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      figure.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesCategory = selectedCategory === 'all' || figure.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  const handleAdd = () => {
    if (selectedFigure && selectedSection) {
      onSelectFigure(selectedFigure, selectedSection);
    }
  };

  const getFigureIcon = (type: string) => {
    switch (type) {
      case 'gantt': return BarChart3;
      case 'pert': return Network;
      case 'ai': return Sparkles;
      default: return Image;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Library className="w-5 h-5" />
            Frequently Used Figures
          </DialogTitle>
          <DialogDescription>
            Select a figure from the shared library to add to your proposal.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 py-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search figures..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map(cat => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <ScrollArea className="flex-1 min-h-0 pr-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredFigures.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {commonFigures.length === 0 
                ? 'No common figures available yet. Owners can add figures from the Backend admin.'
                : 'No figures match your search.'}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {filteredFigures.map((figure) => {
                const Icon = getFigureIcon(figure.figure_type);
                const isSelected = selectedFigure?.id === figure.id;
                const hasImage = figure.content?.imageUrl;

                return (
                  <Card
                    key={figure.id}
                    className={`cursor-pointer transition-all overflow-hidden ${
                      isSelected ? 'ring-2 ring-primary' : 'hover:ring-1 hover:ring-border'
                    }`}
                    onClick={() => setSelectedFigure(figure)}
                  >
                    <div className="aspect-video bg-muted flex items-center justify-center overflow-hidden">
                      {hasImage ? (
                        <img 
                          src={figure.content.imageUrl} 
                          alt={figure.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Icon className="w-10 h-10 text-muted-foreground" />
                      )}
                    </div>
                    <CardContent className="p-3">
                      <p className="font-medium text-sm truncate">{figure.title}</p>
                      {figure.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                          {figure.description}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-1 mt-2">
                        {figure.category && (
                          <Badge variant="secondary" className="text-xs">{figure.category}</Badge>
                        )}
                        {figure.tags?.slice(0, 2).map(tag => (
                          <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {selectedFigure && (
          <div className="border-t pt-4 mt-2 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <p className="font-medium">{selectedFigure.title}</p>
                <p className="text-sm text-muted-foreground">
                  {selectedFigure.description || 'No description'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <Label className="text-sm">Add to section</Label>
                <Select value={selectedSection} onValueChange={setSelectedSection}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sectionOptions.map(section => (
                      <SelectItem key={section.id} value={section.id}>
                        {section.number} - {section.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button 
                onClick={handleAdd}
                disabled={isAdding || !selectedSection}
                className="mt-6"
              >
                {isAdding ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Add to Proposal
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
