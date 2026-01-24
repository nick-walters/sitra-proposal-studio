import { useState, useEffect, useCallback } from 'react';
import { Section } from '@/types/proposal';
import { useSectionContent } from '@/hooks/useSectionContent';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { X, PanelLeft, SplitSquareHorizontal } from 'lucide-react';

interface SplitViewPanelProps {
  proposalId: string;
  sections: Section[];
  currentSectionId: string;
  onClose: () => void;
}

export function SplitViewPanel({
  proposalId,
  sections,
  currentSectionId,
  onClose,
}: SplitViewPanelProps) {
  const [selectedSectionId, setSelectedSectionId] = useState<string>('');

  // Get all sections except current one - filter to Part B content sections
  const availableSections = sections.filter(
    s => s.id !== currentSectionId && 
         !s.isPartA && 
         !s.subsections && // Only leaf sections
         s.id.startsWith('b') // Part B sections
  );

  // Set initial section
  useEffect(() => {
    if (availableSections.length > 0 && !selectedSectionId) {
      setSelectedSectionId(availableSections[0].id);
    }
  }, [availableSections, selectedSectionId]);

  const selectedSection = sections.find(s => s.id === selectedSectionId);

  const { content, loading } = useSectionContent({
    proposalId,
    sectionId: selectedSectionId,
    sectionNumber: selectedSection?.number,
  });

  // Convert HTML to readable text
  const contentText = content
    .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '\n\n$1\n\n')
    .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '• $1\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return (
    <div className="w-80 lg:w-96 border-l bg-card flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b bg-muted/30 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <SplitSquareHorizontal className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Reference View</span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Section Selector */}
      <div className="p-3 border-b shrink-0">
        <Select value={selectedSectionId} onValueChange={setSelectedSectionId}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a section" />
          </SelectTrigger>
          <SelectContent>
            {availableSections.map((section) => (
              <SelectItem key={section.id} value={section.id}>
                {section.number}. {section.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ) : selectedSection ? (
            <div>
              <h3 className="font-medium text-sm mb-3">
                {selectedSection.number}. {selectedSection.title}
              </h3>
              {contentText ? (
                <div className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                  {contentText}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  This section is empty.
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              Select a section to view
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
