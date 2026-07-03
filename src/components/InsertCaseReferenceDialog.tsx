import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { ScrollArea } from '@/components/ui/scroll-area';
import { FlaskConical } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { getCaseTypePrefix, buildCaseLabel, getCaseTypeLabel, caseWord } from '@/lib/caseTypeLabels';

interface CaseDraft {
  id: string;
  number: number;
  short_name: string | null;
  title: string | null;
  color: string;
  case_type: string;
  case_type_id: string | null;
  /** Resolved from proposal_case_types at select time. Optional so callers
   *  that don't need them keep working, but insertion paths use them to
   *  build the initial badge in its correct form (right outline colour +
   *  include_number / include_abbreviation flags), matching what
   *  syncCrossReferences would otherwise rewrite on the next edit. */
  outline_color?: string | null;
  include_number?: boolean;
  include_abbreviation?: boolean;
}

interface TypeRow {
  id: string;
  type_code: string;
  custom_type_name: string | null;
  include_number: boolean;
  include_abbreviation: boolean;
  outline_color: string | null;
  order_index: number;
}

interface InsertCaseReferenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proposalId: string;
  onSelect: (caseItem: CaseDraft) => void;
}

export function InsertCaseReferenceDialog({
  open,
  onOpenChange,
  proposalId,
  onSelect,
}: InsertCaseReferenceDialogProps) {
  const [caseDrafts, setCaseDrafts] = useState<CaseDraft[]>([]);
  const [typeRows, setTypeRows] = useState<TypeRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open && proposalId) {
      fetchCaseDrafts();
    }
  }, [open, proposalId]);

  const fetchCaseDrafts = async () => {
    setLoading(true);
    const [cases, types] = await Promise.all([
      supabase
        .from('case_drafts')
        .select('id, number, short_name, title, color, case_type, case_type_id')
        .eq('proposal_id', proposalId)
        .order('order_index'),
      supabase
        .from('proposal_case_types')
        .select('id, type_code, custom_type_name, include_number, include_abbreviation, outline_color, order_index')
        .eq('proposal_id', proposalId)
        .order('order_index'),
    ]);

    if (cases.error) console.error('Error fetching case drafts:', cases.error);
    setCaseDrafts((cases.data || []) as CaseDraft[]);
    setTypeRows((types.data as TypeRow[]) || []);
    setLoading(false);
  };

  const typesById = useMemo(
    () => new Map(typeRows.map((t) => [t.id, t])),
    [typeRows],
  );

  const handleSelect = (caseItem: CaseDraft) => {
    onSelect(caseItem);
    onOpenChange(false);
  };

  // Compute the widest badge label across ALL cases so every row's badge
  // column is the same width and titles line up vertically.
  const badgeColCh = useMemo(() => {
    let max = 2;
    for (const c of caseDrafts) {
      const t = c.case_type_id ? typesById.get(c.case_type_id) : null;
      const includeNumber = t?.include_number !== false;
      const includeAbbreviation = t?.include_abbreviation !== false;
      const label = buildCaseLabel({
        prefix: getCaseTypePrefix(c.case_type),
        number: c.number,
        shortName: c.short_name,
        includeNumber,
        includeAbbreviation,
        withShortName: false,
      });
      if (label.length > max) max = label.length;
    }
    return max;
  }, [caseDrafts, typesById]);

  const badgeColStyle = { width: `calc(${badgeColCh}ch + 1.25rem)` } as const;

  const renderCaseButton = (caseItem: CaseDraft) => {
    const prefix = getCaseTypePrefix(caseItem.case_type);
    const t = caseItem.case_type_id ? typesById.get(caseItem.case_type_id) : null;
    const includeNumber = t?.include_number !== false;
    const includeAbbreviation = t?.include_abbreviation !== false;
    const outline = t?.outline_color || '#000000';
    const label = buildCaseLabel({
      prefix,
      number: caseItem.number,
      shortName: caseItem.short_name,
      includeNumber,
      includeAbbreviation,
      withShortName: false,
    });
    return (
      <button
        key={caseItem.id}
        onClick={() => handleSelect(caseItem)}
        className={cn(
          'w-full flex items-center px-3 py-1 rounded-md text-left cursor-pointer',
          'hover:bg-muted/80 transition-colors',
        )}
      >
        <span className="shrink-0 flex items-center" style={badgeColStyle}>
          <span
            className="rounded-full font-bold text-center border-[1.5px] bg-white text-xs px-1.5 py-0.5 whitespace-nowrap"
            style={{ borderColor: outline, color: outline }}
          >
            {label}
          </span>
        </span>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">
            {caseItem.short_name || '—'}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {caseItem.title || '—'}
          </div>
        </div>
      </button>
    );
  };

  const showSections = typeRows.length > 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="w-5 h-5" />
            Insert {caseWord(typeRows, { capitalize: true })} Reference
          </DialogTitle>
          <DialogDescription>
            Select a {caseWord(typeRows, { capitalize: false })} to insert as an inline reference badge.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[400px]">
          {loading ? (
            <div className="space-y-2 p-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : caseDrafts.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No {caseWord(typeRows, { plural: true, capitalize: false })} found. Enable {caseWord(typeRows, { plural: true, capitalize: false })} and add some first.
            </div>

          ) : showSections ? (
            <div className="p-1">
              {typeRows.map((t) => {
                const items = caseDrafts.filter((c) => c.case_type_id === t.id);
                if (items.length === 0) return null;
                const heading = getCaseTypeLabel(t.type_code, t.custom_type_name);
                return (
                  <div key={t.id} className="mb-2">
                    <div className="px-2 pt-2 pb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      {heading}
                    </div>
                    <div className="space-y-1">{items.map(renderCaseButton)}</div>
                    <div className="border-b mt-1" />
                  </div>
                );
              })}
              {/* Orphaned (no matching type row) */}
              {(() => {
                const orphans = caseDrafts.filter(
                  (c) => !c.case_type_id || !typesById.has(c.case_type_id),
                );
                if (orphans.length === 0) return null;
                return <div className="space-y-1">{orphans.map(renderCaseButton)}</div>;
              })()}
            </div>
          ) : (
            <div className="space-y-1 p-1">{caseDrafts.map(renderCaseButton)}</div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
