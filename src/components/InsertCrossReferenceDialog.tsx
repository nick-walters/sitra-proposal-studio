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

interface CrossReferenceItem {
  label: string;
  title: string;
  type: 'figure' | 'table';
}

interface InsertCrossReferenceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  content: string;
  sectionNumber: string;
  onInsert: (reference: string) => void;
}

export function InsertCrossReferenceDialog({
  isOpen,
  onClose,
  content,
  sectionNumber,
  onInsert,
}: InsertCrossReferenceDialogProps) {
  const [figures, setFigures] = useState<CrossReferenceItem[]>([]);
  const [tables, setTables] = useState<CrossReferenceItem[]>([]);

  // Extract all figures and tables from content
  useEffect(() => {
    if (!content) {
      setFigures([]);
      setTables([]);
      return;
    }

    const extractedFigures: CrossReferenceItem[] = [];
    const extractedTables: CrossReferenceItem[] = [];

    // Match figure captions: look for "Figure X.X.x." pattern (with or without bold/italic)
    const figurePattern = /<em>(?:<strong>)?Figure (\d+\.\d+\.[a-z])\.(?:<\/strong>)?([^<]*)/gi;
    let match;
    
    while ((match = figurePattern.exec(content)) !== null) {
      extractedFigures.push({
        label: match[1],
        title: match[2]?.trim() || 'Untitled',
        type: 'figure',
      });
    }

    // Also check for non-italic figures
    const figurePatternAlt = /Figure (\d+\.\d+\.[a-z])\.\s*([^<\n]*)/gi;
    while ((match = figurePatternAlt.exec(content)) !== null) {
      // Avoid duplicates
      if (!extractedFigures.some(f => f.label === match[1])) {
        extractedFigures.push({
          label: match[1],
          title: match[2]?.trim() || 'Untitled',
          type: 'figure',
        });
      }
    }

    // Match table captions
    const tablePattern = /<em>(?:<strong>)?Table (\d+\.\d+\.[a-z])\.(?:<\/strong>)?([^<]*)/gi;
    while ((match = tablePattern.exec(content)) !== null) {
      extractedTables.push({
        label: match[1],
        title: match[2]?.trim() || 'Untitled',
        type: 'table',
      });
    }

    // Also check for non-italic tables
    const tablePatternAlt = /Table (\d+\.\d+\.[a-z])\.\s*([^<\n]*)/gi;
    while ((match = tablePatternAlt.exec(content)) !== null) {
      if (!extractedTables.some(t => t.label === match[1])) {
        extractedTables.push({
          label: match[1],
          title: match[2]?.trim() || 'Untitled',
          type: 'table',
        });
      }
    }

    setFigures(extractedFigures);
    setTables(extractedTables);
  }, [content]);

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
              {figures.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No figures found in this section
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
              {tables.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No tables found in this section
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
