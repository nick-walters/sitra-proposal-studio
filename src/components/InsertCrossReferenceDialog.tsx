import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Image, Table2 } from "lucide-react";
import { supabase } from '@/integrations/supabase/client';

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

  // Match figure captions: "Figure X.X.x." pattern
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

  // Match table captions: "Table X.X.x." pattern
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

  // Load content from ALL sections in this proposal
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

      // Sort by label
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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Insert Cross-Reference</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="figures" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="figures" className="gap-2">
              <Image className="w-4 h-4" />
              Figures ({figures.length})
            </TabsTrigger>
            <TabsTrigger value="tables" className="gap-2">
              <Table2 className="w-4 h-4" />
              Tables ({tables.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="figures">
            <ScrollArea className="h-[300px] pr-4">
              {loading ? (
                <div className="space-y-2 p-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-12 bg-muted animate-pulse rounded" />
                  ))}
                </div>
              ) : figures.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No figures found in this proposal
                </p>
              ) : (
                <div className="space-y-2">
                  {figures.map((fig, idx) => (
                    <Button
                      key={idx}
                      variant="outline"
                      className="w-full justify-start text-left h-auto py-3"
                      onClick={() => handleInsert(fig)}
                    >
                      <div>
                        <div className="font-medium">Figure {fig.label}</div>
                        <div className="text-xs text-muted-foreground truncate max-w-[300px]">
                          {fig.title}
                        </div>
                      </div>
                    </Button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="tables">
            <ScrollArea className="h-[300px] pr-4">
              {loading ? (
                <div className="space-y-2 p-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-12 bg-muted animate-pulse rounded" />
                  ))}
                </div>
              ) : tables.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No tables found in this proposal
                </p>
              ) : (
                <div className="space-y-2">
                  {tables.map((tbl, idx) => (
                    <Button
                      key={idx}
                      variant="outline"
                      className="w-full justify-start text-left h-auto py-3"
                      onClick={() => handleInsert(tbl)}
                    >
                      <div>
                        <div className="font-medium">Table {tbl.label}</div>
                        <div className="text-xs text-muted-foreground truncate max-w-[300px]">
                          {tbl.title}
                        </div>
                      </div>
                    </Button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
