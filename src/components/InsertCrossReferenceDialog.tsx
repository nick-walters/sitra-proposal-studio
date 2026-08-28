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
import { fetchCrossRefTargets } from '@/lib/crossRefTargets';
import { cn } from '@/lib/utils';

interface CrossReferenceItem {
  label: string;
  title: string;
  type: 'figure' | 'table';
  sectionId?: string;
  /** DB id from the figures table (figures only) */
  figureId?: string;
  /** table_key from the table_captions table (tables only) */
  tableKey?: string;
}

export interface CrossRefInsertPayload {
  refText: string;
  figureId?: string;
  tableKey?: string;
  refKind: 'figure' | 'table';
}

interface InsertCrossReferenceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  proposalId: string;
  sectionNumber: string;
  onInsert: (payload: CrossRefInsertPayload) => void;
  filterType?: 'figure' | 'table';
}

/**
 * LEGACY fallback only: sections that still hold their body in
 * `section_content` write the caption label into the HTML itself. The label is
 * followed by the description in SIBLING tags, so the text is read from the
 * parsed paragraph rather than from the regex match — that truncation at the
 * first '<' is why these entries used to read "Untitled".
 */
function extractRefsFromContent(html: string): { figures: CrossReferenceItem[]; tables: CrossReferenceItem[] } {
  const figures: CrossReferenceItem[] = [];
  const tables: CrossReferenceItem[] = [];
  if (!html || typeof document === 'undefined') return { figures, tables };

  const holder = document.createElement('div');
  holder.innerHTML = html;
  const labelPattern = /^\s*(Figure|Table)\s+(\d+\.\d+\.[a-z]+)\.?\s*/i;
  const seen = new Set<string>();

  holder.querySelectorAll('p, div, caption').forEach((el) => {
    const text = (el.textContent || '').replace(/\s+/g, ' ');
    const match = labelPattern.exec(text);
    if (!match) return;
    const kind = match[1].toLowerCase() === 'figure' ? 'figure' : 'table';
    const label = match[2];
    const key = `${kind}:${label}`;
    if (seen.has(key)) return;
    seen.add(key);
    const title = text.slice(match[0].length).trim();
    (kind === 'figure' ? figures : tables).push({ label, title, type: kind });
  });

  return { figures, tables };
}


export function InsertCrossReferenceDialog({
  isOpen,
  onClose,
  proposalId,
  
  onInsert,
  filterType,
}: InsertCrossReferenceDialogProps) {
  const [figures, setFigures] = useState<CrossReferenceItem[]>([]);
  const [tables, setTables] = useState<CrossReferenceItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !proposalId) return;
    let cancelled = false;

    const loadAllContent = async () => {
      setLoading(true);

      // The BLOCK board is the authority: every number here is derived from
      // document position at open time, so a picker opened after a reorder
      // shows the new numbering.
      const [derived, legacyResult] = await Promise.all([
        fetchCrossRefTargets(proposalId).catch((err) => {
          console.error('Error deriving cross-reference targets:', err);
          return { figures: [], tables: [] };
        }),
        supabase
          .from('section_content')
          .select('content, section_id')
          .eq('proposal_id', proposalId),
      ]);
      if (cancelled) return;

      const allFigures: CrossReferenceItem[] = derived.figures.map((f) => ({
        label: f.label,
        title: f.title,
        type: 'figure' as const,
        sectionId: f.sectionId,
        figureId: f.figureId,
      }));
      const allTables: CrossReferenceItem[] = derived.tables.map((t) => ({
        label: t.label,
        title: t.title,
        type: 'table' as const,
        sectionId: t.sectionId,
        tableKey: t.tableKey,
      }));
      const seenFigLabels = new Set(allFigures.map((f) => f.label));
      const seenTblLabels = new Set(allTables.map((t) => t.label));

      // Legacy `section_content` bodies, for sections not yet on blocks.
      for (const row of legacyResult.data || []) {
        if (!row.content) continue;
        const { figures: figs, tables: tbls } = extractRefsFromContent(row.content);
        for (const f of figs) {
          if (seenFigLabels.has(f.label)) continue;
          seenFigLabels.add(f.label);
          allFigures.push({ ...f, sectionId: row.section_id });
        }
        for (const t of tbls) {
          if (seenTblLabels.has(t.label)) continue;
          seenTblLabels.add(t.label);
          allTables.push({ ...t, sectionId: row.section_id });
        }
      }

      allFigures.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
      allTables.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));

      setFigures(allFigures);
      setTables(allTables);
      setLoading(false);
    };

    loadAllContent();
    return () => {
      cancelled = true;
    };
  }, [isOpen, proposalId]);


  const handleInsert = (item: CrossReferenceItem) => {
    const refText = item.type === 'figure'
      ? `Figure ${item.label}`
      : `Table ${item.label}`;
    onInsert({
      refText,
      figureId: item.figureId,
      tableKey: item.tableKey,
      refKind: item.type,
    });
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
              {item.title ? (
                <span className="text-sm text-muted-foreground truncate">
                  <span className="mr-1">—</span>
                  {item.title}
                </span>
              ) : (
                <span className="text-sm italic text-muted-foreground/70 truncate">
                  — no caption yet
                </span>
              )}
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
            <span className="font-bold italic" style={{ fontFamily: "'Times New Roman', Times, serif" }}>
              {filterType === 'figure' ? 'Figure' : filterType === 'table' ? 'Table' : 'Figure/Table'}
            </span>
            Cross-Reference
          </DialogTitle>
          <DialogDescription>
            Select a {filterType || 'figure or table'} to insert as an inline cross-reference.
          </DialogDescription>
        </DialogHeader>

        {filterType ? (
          renderItems(
            filterType === 'figure' ? figures : tables,
            `No ${filterType}s found in this proposal.`
          )
        ) : (
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
        )}
      </DialogContent>
    </Dialog>
  );
}
