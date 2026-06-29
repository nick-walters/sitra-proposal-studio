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
import { getCaseTypePrefix, buildCaseLabel, getCaseTypeLabel } from '@/lib/caseTypeLabels';

interface CaseDraft {
  id: string;
  number: number;
  short_name: string | null;
  title: string | null;
  color: string;
  case_type: string;
  case_type_id: string | null;
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
  const [typesById, setTypesById] = useState<Map<string, TypeRow>>(new Map());
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
        .select('id, include_number, include_abbreviation, outline_color')
        .eq('proposal_id', proposalId),
    ]);

    if (cases.error) console.error('Error fetching case drafts:', cases.error);
    setCaseDrafts((cases.data || []) as CaseDraft[]);
    setTypesById(new Map(((types.data as TypeRow[]) || []).map((t) => [t.id, t])));
    setLoading(false);
  };

  const handleSelect = (caseItem: CaseDraft) => {
    onSelect(caseItem);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="w-5 h-5" />
            Insert Case Reference
          </DialogTitle>
          <DialogDescription>
            Select a case to insert as an inline reference badge.
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
              No cases found. Enable cases and add some first.
            </div>
          ) : (
            <div className="space-y-1 p-1">
              {caseDrafts.map((caseItem) => {
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
                      "w-full flex items-center p-3 rounded-md text-left cursor-pointer",
                      "hover:bg-muted/80 transition-colors"
                    )}
                  >
                    <span
                      className="shrink-0 rounded-full font-bold text-center border-[1.5px] text-black bg-white text-xs px-1.5 py-0.5 whitespace-nowrap"
                      style={{ borderColor: outline }}
                    >
                      {label}
                    </span>
                    <div className="flex-1 min-w-0 ml-3">
                      <div className="font-medium text-sm truncate">
                        {caseItem.short_name || '—'}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {caseItem.title || '—'}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
