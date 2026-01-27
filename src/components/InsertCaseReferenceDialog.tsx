import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FlaskConical } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface CaseDraft {
  id: string;
  number: number;
  short_name: string | null;
  title: string | null;
  color: string;
  case_type: string;
}

interface InsertCaseReferenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proposalId: string;
  onSelect: (caseItem: CaseDraft) => void;
}

// Get display prefix based on case type
function getCasePrefix(caseType: string): string {
  switch (caseType) {
    case 'case_study': return 'CS';
    case 'use_case': return 'UC';
    case 'living_lab': return 'LL';
    case 'pilot': return 'P';
    case 'demonstration': return 'D';
    default: return 'C';
  }
}

export function InsertCaseReferenceDialog({
  open,
  onOpenChange,
  proposalId,
  onSelect,
}: InsertCaseReferenceDialogProps) {
  const [caseDrafts, setCaseDrafts] = useState<CaseDraft[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open && proposalId) {
      fetchCaseDrafts();
    }
  }, [open, proposalId]);

  const fetchCaseDrafts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('case_drafts')
      .select('id, number, short_name, title, color, case_type')
      .eq('proposal_id', proposalId)
      .order('order_index');

    if (error) {
      console.error('Error fetching case drafts:', error);
    } else {
      setCaseDrafts(data || []);
    }
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
              {caseDrafts.map((caseItem) => (
                <button
                  key={caseItem.id}
                  onClick={() => handleSelect(caseItem)}
                  className={cn(
                    "w-full flex items-center p-3 rounded-md text-left",
                    "hover:bg-muted/80 transition-colors"
                  )}
                >
                  <Badge
                    className="shrink-0 rounded-full font-bold text-white w-12 justify-center"
                    style={{
                      backgroundColor: caseItem.color,
                    }}
                  >
                    {getCasePrefix(caseItem.case_type)}{caseItem.number}
                  </Badge>
                  <div className="flex-1 min-w-0 ml-3">
                    <div className="font-medium text-sm truncate">
                      {caseItem.short_name || '—'}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {caseItem.title || '—'}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
