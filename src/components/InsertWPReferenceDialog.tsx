import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Layers } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getContrastingTextColor } from '@/lib/wpColors';
import { cn } from '@/lib/utils';

interface WPDraft {
  id: string;
  number: number;
  short_name: string | null;
  title: string | null;
  color: string;
}

interface InsertWPReferenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proposalId: string;
  onSelect: (wp: WPDraft) => void;
}

export function InsertWPReferenceDialog({
  open,
  onOpenChange,
  proposalId,
  onSelect,
}: InsertWPReferenceDialogProps) {
  const [wpDrafts, setWPDrafts] = useState<WPDraft[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open && proposalId) {
      fetchWPDrafts();
    }
  }, [open, proposalId]);

  const fetchWPDrafts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('wp_drafts')
      .select('id, number, short_name, title, color')
      .eq('proposal_id', proposalId)
      .order('order_index');

    if (error) {
      console.error('Error fetching WP drafts:', error);
    } else {
      setWPDrafts(data || []);
    }
    setLoading(false);
  };

  const handleSelect = (wp: WPDraft) => {
    onSelect(wp);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="w-5 h-5" />
            Insert WP Reference
          </DialogTitle>
          <DialogDescription>
            Select a work package to insert as an inline reference badge.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[400px]">
          {loading ? (
            <div className="space-y-2 p-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : wpDrafts.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No work packages found.
            </div>
          ) : (
            <div className="space-y-1 p-1">
              {wpDrafts.map((wp) => (
                <button
                  key={wp.id}
                  onClick={() => handleSelect(wp)}
                  className={cn(
                    "w-full flex items-center p-3 rounded-md text-left",
                    "hover:bg-muted/80 transition-colors"
                  )}
                >
                  <Badge
                    className="shrink-0 rounded-full font-bold text-white w-12 justify-center"
                    style={{
                      backgroundColor: wp.color,
                    }}
                  >
                    WP{wp.number}
                  </Badge>
                  <div className="flex-1 min-w-0 ml-3">
                    <div className="font-medium text-sm truncate">
                      {wp.short_name || '—'}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {wp.title || '—'}
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
