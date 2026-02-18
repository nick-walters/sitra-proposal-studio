import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Image, Table2 } from "lucide-react";
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface CrossReferenceItem {
  label: string;
  title: string;
  type: 'figure' | 'table';
  sectionId?: string;
}

interface InsertCrossReferenceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  proposalId: string;
  sectionNumber: string;
  onInsert: (reference: string) => void;
}

function extractRefsFromContent(html: string): { figures: CrossReferenceItem[]; tables: CrossReferenceItem[] } {
  const figures: CrossReferenceItem[] = [];
  const tables: CrossReferenceItem[] = [];

  const figurePattern = /Figure (\d+\.\d+\.[a-z])\.?\s*([^<\n]*)/gi;
  let match;
  const seenFigures = new Set<string>();
  while ((match = figurePattern.exec(html)) !== null) {
    if (!seenFigures.has(match[1])) {
      seenFigures.add(match[1]);
      figures.push({
        label: match[1],
        title: match[2]?.trim() || 'Untitled',
        type: 'figure',
      });
    }
  }

  const tablePattern = /Table (\d+\.\d+\.[a-z])\.?\s*([^<\n]*)/gi;
  const seenTables = new Set<string>();
  while ((match = tablePattern.exec(html)) !== null) {
    if (!seenTables.has(match[1])) {
      seenTables.add(match[1]);
      tables.push({
        label: match[1],
        title: match[2]?.trim().replace(/<[^>]*>/g, '') || 'Untitled',
        type: 'table',
      });
    }
  }

  return { figures, tables };
}

export function InsertCrossReferenceDialog({
  isOpen,
  onClose,
  proposalId,
  sectionNumber,
  onInsert,
}: InsertCrossReferenceDialogProps) {
  const [figures, setFigures] = useState<CrossReferenceItem[]>([]);
  const [tables, setTables] = useState<CrossReferenceItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !proposalId) return;

    const loadAllContent = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('section_content')
        .select('content, section_id')
        .eq('proposal_id', proposalId);

      if (error) {
        console.error('Error loading section content:', error);
        setLoading(false);
        return;
      }

      const allFigures: CrossReferenceItem[] = [];
      const allTables: CrossReferenceItem[] = [];
      const seenFigLabels = new Set<string>();
      const seenTblLabels = new Set<string>();

      for (const row of data || []) {
        if (!row.content) continue;
        const { figures: figs, tables: tbls } = extractRefsFromContent(row.content);
        for (const f of figs) {
          if (!seenFigLabels.has(f.label)) {
            seenFigLabels.add(f.label);
            allFigures.push({ ...f, sectionId: row.section_id });
          }
        }
        for (const t of tbls) {
          if (!seenTblLabels.has(t.label)) {
            seenTblLabels.add(t.label);
            allTables.push({ ...t, sectionId: row.section_id });
          }
        }
      }

      allFigures.sort((a, b) => a.label.localeCompare(b.label));
      allTables.sort((a, b) => a.label.localeCompare(b.label));

      setFigures(allFigures);
      setTables(allTables);
      setLoading(false);
    };

    loadAllContent();
  }, [isOpen, proposalId]);

  const handleInsert = (item: CrossReferenceItem) => {
    const refText = item.type === 'figure'
      ? `Figure ${item.label}`
      : `Table ${item.label}`;
    onInsert(refText);
    onClose();
  };

  const renderItems = (items: CrossReferenceItem[], emptyLabel: string) => (
    <ScrollArea className="max-h-[400px]">
      {loading ? (
        <div className="space-y-2 p-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 bg-muted animate-pulse rounded" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">
          {emptyLabel}
        </div>
      ) : (
        <div className="p-1">
          {items.map((item, idx) => (
            <button
              key={idx}
              onClick={() => handleInsert(item)}
              className={cn(
                "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left",
                "hover:bg-muted/80 transition-colors"
              )}
            >
              <span
                className="shrink-0 font-bold italic text-xs"
                style={{ fontFamily: "'Times New Roman', Times, serif" }}
              >
                {item.type === 'figure' ? `Figure ${item.label}` : `Table ${item.label}`}
              </span>
              <span className="text-sm text-muted-foreground truncate">{item.title}</span>
            </button>
          ))}
        </div>
      )}
    </ScrollArea>
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="font-bold italic" style={{ fontFamily: "'Times New Roman', Times, serif" }}>Figure/Table</span>
            Cross-Reference
          </DialogTitle>
          <DialogDescription>
            Select a figure or table to insert as an inline cross-reference.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="all" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="all">
              All ({figures.length + tables.length})
            </TabsTrigger>
            <TabsTrigger value="figures" className="gap-1">
              <Image className="w-3.5 h-3.5" />
              Figures ({figures.length})
            </TabsTrigger>
            <TabsTrigger value="tables" className="gap-1">
              <Table2 className="w-3.5 h-3.5" />
              Tables ({tables.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all">
            {renderItems(
              [...figures, ...tables].sort((a, b) => {
                if (a.type !== b.type) return a.type === 'figure' ? -1 : 1;
                return a.label.localeCompare(b.label);
              }),
              'No figures or tables found in this proposal.'
            )}
          </TabsContent>

          <TabsContent value="figures">
            {renderItems(figures, 'No figures found in this proposal.')}
          </TabsContent>

          <TabsContent value="tables">
            {renderItems(tables, 'No tables found in this proposal.')}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
