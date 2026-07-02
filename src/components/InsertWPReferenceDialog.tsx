import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Layers } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

// Lightweight WP type for this dialog only
interface WPRefData {
  id: string;
  number: number;
  short_name: string | null;
  title: string | null;
  color: string;
  theme_id?: string | null;
}

interface WPTheme {
  id: string;
  color: string;
}

interface InsertWPReferenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proposalId: string;
  onSelect: (wp: WPRefData) => void;
}

export function InsertWPReferenceDialog({
  open,
  onOpenChange,
  proposalId,
  onSelect,
}: InsertWPReferenceDialogProps) {
  const [wpDrafts, setWPDrafts] = useState<WPRefData[]>([]);
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
      .select('id, number, short_name, title, color, theme_id')
      .eq('proposal_id', proposalId)
      .order('order_index');

    if (error) {
      console.error('Error fetching WP drafts:', error);
    } else {
      setWPDrafts(data || []);
    }
    setLoading(false);
  };

  // wp_drafts.color is now the single authoritative colour (theme colour is
  // written down there when themes are enabled), so no effectiveColor fork
  // is required.
  const handleSelectNumberOnly = (wp: WPRefData) => {
    onSelect({ ...wp, short_name: '' });
    onOpenChange(false);
  };

  const handleSelectWithShortName = (wp: WPRefData) => {
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
            <div className="p-1">
              {wpDrafts.map((wp, idx) => {
                const effectiveColor = getEffectiveColor(wp);
                return (
                  <div
                    key={wp.id}
                    className={cn(
                      "grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 items-center pb-2",
                      idx < wpDrafts.length - 1 && "border-b border-border mb-2"
                    )}
                  >
                    <button
                      onClick={() => handleSelectNumberOnly(wp)}
                      className={cn(
                        "flex items-center justify-start gap-2 px-2 py-1.5 rounded-md text-left",
                        "hover:bg-muted/80 transition-colors"
                      )}
                    >
                      <Badge
                        className="rounded-full font-bold text-white justify-center"
                        style={{
                          backgroundColor: effectiveColor,
                        }}
                      >
                        WP{wp.number}
                      </Badge>
                    </button>
                    <button
                      onClick={() => handleSelectWithShortName(wp)}
                      className={cn(
                        "flex items-center justify-start gap-2 px-2 py-1.5 rounded-md text-left",
                        "hover:bg-muted/80 transition-colors"
                      )}
                    >
                      <Badge
                        className="rounded-full font-bold text-white justify-center"
                        style={{
                          backgroundColor: effectiveColor,
                        }}
                      >
                        WP{wp.number}: {wp.short_name || '—'}
                      </Badge>
                    </button>
                    <span className="col-span-2 text-xs text-muted-foreground px-2">
                      WP{wp.number}: {wp.short_name || '—'} — {wp.title || 'Untitled'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
