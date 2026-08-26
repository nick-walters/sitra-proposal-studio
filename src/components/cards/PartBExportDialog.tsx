/**
 * Part B export: pick what goes in, then (coordinators and above) whether the
 * PDF is watermarked.
 *
 * The tree is Section → Block → Module, everything checked by default, and the
 * user's last completed selection is remembered per proposal and per user in
 * `localStorage` (see `partBDocument.ts`). Standard users have no watermark
 * step: their exports are always watermarked.
 */

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { fetchSectionBlockTree, type SectionBlockTree } from '@/lib/typst/sectionToTypst';
import {
  labelOf,
  loadSelection,
  saveSelection,
  type PartBExportSelection,
  type PartBSection,
} from '@/lib/typst/partBDocument';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proposalId: string;
  userId: string | null | undefined;
  sections: PartBSection[];
  /** Coordinators and above choose whether to watermark; others cannot. */
  canChooseWatermark: boolean;
  busy?: boolean;
  onExport: (selection: PartBExportSelection, watermark: boolean) => void;
}

type Trees = Record<string, SectionBlockTree>;

export function PartBExportDialog({
  open,
  onOpenChange,
  proposalId,
  userId,
  sections,
  canChooseWatermark,
  busy,
  onExport,
}: Props) {
  const [step, setStep] = useState<'select' | 'watermark'>('select');
  const [watermark, setWatermark] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [excluded, setExcluded] = useState<PartBExportSelection>({
    sections: [],
    blocks: [],
    modules: [],
  });

  const { data: trees, isLoading } = useQuery<Trees>({
    queryKey: ['partb-export-trees', proposalId, sections.map((s) => s.id).join(',')],
    enabled: open && sections.length > 0,
    queryFn: async () => {
      const entries = await Promise.all(
        sections.map(async (s) => [s.id, await fetchSectionBlockTree(proposalId, s.id)] as const),
      );
      return Object.fromEntries(entries) as Trees;
    },
  });

  useEffect(() => {
    if (!open) return;
    setStep('select');
    setWatermark(true);
    setExcluded(loadSelection(proposalId, userId));
  }, [open, proposalId, userId]);

  const sets = useMemo(
    () => ({
      sections: new Set(excluded.sections),
      blocks: new Set(excluded.blocks),
      modules: new Set(excluded.modules),
    }),
    [excluded],
  );

  const toggle = (kind: keyof PartBExportSelection, ids: string[], include: boolean) => {
    setExcluded((prev) => {
      const next = new Set(prev[kind]);
      for (const id of ids) {
        if (include) next.delete(id);
        else next.add(id);
      }
      return { ...prev, [kind]: Array.from(next) };
    });
  };

  const allIds = useMemo(() => {
    const blocks: string[] = [];
    const modules: string[] = [];
    for (const section of sections) {
      const tree = trees?.[section.id];
      for (const card of tree?.cards || []) {
        blocks.push(card.id);
        for (const field of tree?.fieldsByCard[card.id] || []) modules.push(field.id);
      }
    }
    return { sections: sections.map((s) => s.id), blocks, modules };
  }, [sections, trees]);

  const setAll = (include: boolean) =>
    setExcluded(
      include
        ? { sections: [], blocks: [], modules: [] }
        : { sections: [...allIds.sections], blocks: [...allIds.blocks], modules: [...allIds.modules] },
    );

  const nothingSelected =
    allIds.sections.length > 0 && allIds.sections.every((id) => sets.sections.has(id));

  const finish = (useWatermark: boolean) => {
    saveSelection(proposalId, userId, excluded);
    onExport(excluded, useWatermark);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Export Part B</DialogTitle>
          <DialogDescription>
            {step === 'select'
              ? 'Choose what to include. Everything is included unless you clear it.'
              : 'Choose whether the exported PDF carries a draft watermark.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'select' && (
          <>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setAll(true)}>
                Select all
              </Button>
              <Button size="sm" variant="outline" onClick={() => setAll(false)}>
                Deselect all
              </Button>
            </div>

            <ScrollArea className="h-[50vh] rounded border">
              {isLoading && (
                <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading blocks&hellip;
                </div>
              )}
              <div className="p-2">
                {sections.map((section) => {
                  const tree = trees?.[section.id];
                  const cards = tree?.cards || [];
                  const sectionOpen = expanded[section.id] ?? true;
                  return (
                    <div key={section.id} className="mb-1">
                      <div className="flex items-center gap-1.5 py-1">
                        <button
                          type="button"
                          className="text-muted-foreground"
                          aria-label={sectionOpen ? 'Collapse section' : 'Expand section'}
                          onClick={() =>
                            setExpanded((p) => ({ ...p, [section.id]: !sectionOpen }))
                          }
                        >
                          {sectionOpen ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </button>
                        <Checkbox
                          id={`sec-${section.id}`}
                          checked={!sets.sections.has(section.id)}
                          onCheckedChange={(v) => toggle('sections', [section.id], v === true)}
                        />
                        <Label htmlFor={`sec-${section.id}`} className="text-sm font-semibold">
                          {section.number} {section.title}
                        </Label>
                      </div>

                      {sectionOpen &&
                        cards.map((card) => {
                          const fields = tree?.fieldsByCard[card.id] || [];
                          const blockOpen = expanded[card.id] ?? false;
                          const disabled = sets.sections.has(section.id);
                          return (
                            <div key={card.id} className="ml-6">
                              <div className="flex items-center gap-1.5 py-0.5">
                                <button
                                  type="button"
                                  className="text-muted-foreground disabled:opacity-30"
                                  disabled={!fields.length}
                                  aria-label={blockOpen ? 'Collapse block' : 'Expand block'}
                                  onClick={() =>
                                    setExpanded((p) => ({ ...p, [card.id]: !blockOpen }))
                                  }
                                >
                                  {blockOpen ? (
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5" />
                                  )}
                                </button>
                                <Checkbox
                                  id={`blk-${card.id}`}
                                  disabled={disabled}
                                  checked={!disabled && !sets.blocks.has(card.id)}
                                  onCheckedChange={(v) => toggle('blocks', [card.id], v === true)}
                                />
                                <Label htmlFor={`blk-${card.id}`} className="text-sm">
                                  {labelOf(card.title, card.templateKey || 'Block')}
                                </Label>
                              </div>

                              {blockOpen &&
                                fields.map((field, index) => {
                                  const moduleDisabled = disabled || sets.blocks.has(card.id);
                                  return (
                                    <div key={field.id} className="ml-6 flex items-center gap-1.5 py-0.5">
                                      <Checkbox
                                        id={`mod-${field.id}`}
                                        disabled={moduleDisabled}
                                        checked={!moduleDisabled && !sets.modules.has(field.id)}
                                        onCheckedChange={(v) =>
                                          toggle('modules', [field.id], v === true)
                                        }
                                      />
                                      <Label
                                        htmlFor={`mod-${field.id}`}
                                        className="text-xs text-muted-foreground"
                                      >
                                        {labelOf(field.heading, `Module ${index + 1}`)}
                                      </Label>
                                    </div>
                                  );
                                })}
                            </div>
                          );
                        })}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>

            <DialogFooter>
              {canChooseWatermark ? (
                <Button disabled={nothingSelected} onClick={() => setStep('watermark')}>
                  Next
                </Button>
              ) : (
                <Button disabled={nothingSelected || busy} onClick={() => finish(true)}>
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Export
                </Button>
              )}
            </DialogFooter>
          </>
        )}

        {step === 'watermark' && (
          <>
            <RadioGroup
              value={watermark ? 'yes' : 'no'}
              onValueChange={(v) => setWatermark(v === 'yes')}
              className="gap-3 py-2"
            >
              <div className="flex items-start gap-2">
                <RadioGroupItem value="yes" id="wm-yes" />
                <Label htmlFor="wm-yes" className="font-normal">
                  Include the &ldquo;CONFIDENTIAL DRAFT&rdquo; watermark
                </Label>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem value="no" id="wm-no" />
                <Label htmlFor="wm-no" className="font-normal">
                  No watermark
                </Label>
              </div>
            </RadioGroup>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('select')}>
                Back
              </Button>
              <Button disabled={busy} onClick={() => finish(watermark)}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Export
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default PartBExportDialog;
