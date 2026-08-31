/**
 * Cross-section review list — every tracked change and comment across Part B,
 * grouped by section. Navigation and overview ONLY: accepting or rejecting a
 * change stays in the per-section review panel and the hover tooltip, where the
 * change can be read in context.
 */

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, Pencil, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { htmlToPlainText } from '@/lib/htmlToPlainText';
import { formatSmartTimestamp } from '@/lib/smartTimestamp';
import { usePartBReview, type ReviewItem } from '@/hooks/usePartBReview';

interface Props {
  proposalId: string;
}

type Kind = 'all' | 'changes' | 'comments';

export function PartBReviewPanel({ proposalId }: Props) {
  const navigate = useNavigate();
  const { groups, authors, totals, loading } = usePartBReview(proposalId);
  const [kind, setKind] = useState<Kind>('all');
  const [author, setAuthor] = useState<string>('all');
  const [showResolved, setShowResolved] = useState(false);

  const filtered = useMemo(
    () =>
      groups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => {
            if (kind === 'changes' && item.kind !== 'change') return false;
            if (kind === 'comments' && item.kind !== 'comment') return false;
            if (author !== 'all' && item.authorId !== author) return false;
            if (item.kind === 'comment' && item.resolved && !showResolved) return false;
            return true;
          }),
        }))
        .filter((group) => group.items.length > 0),
    [groups, kind, author, showResolved],
  );

  const visibleTotals = filtered.reduce(
    (acc, g) => ({
      changes: acc.changes + g.items.filter((i) => i.kind === 'change').length,
      comments: acc.comments + g.items.filter((i) => i.kind === 'comment').length,
    }),
    { changes: 0, comments: 0 },
  );

  const open = (item: ReviewItem) => {
    const params = new URLSearchParams({ section: item.sectionId });
    if (item.kind === 'comment') {
      params.set('panel', 'comments');
      params.set('comment', item.id);
    } else {
      params.set('panel', 'changes');
      params.set('module', item.anchorId);
    }
    navigate(`/proposal/${proposalId}?${params.toString()}`);
  };

  return (
    <div className="flex h-full w-[360px] shrink-0 flex-col border-l border-border bg-background">
      <div className="space-y-3 border-b border-border p-3">
        <div>
          <h2 className="text-sm font-semibold">Review across Part B</h2>
          <p className="text-xs text-muted-foreground">
            {loading
              ? 'Reading changes & comments…'
              : `${totals.changes} change${totals.changes === 1 ? '' : 's'} · ${totals.comments} comment${totals.comments === 1 ? '' : 's'}`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="changes">Changes only</SelectItem>
              <SelectItem value="comments">Comments only</SelectItem>
            </SelectContent>
          </Select>
          <Select value={author} onValueChange={setAuthor}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Everyone" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Everyone</SelectItem>
              {authors.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-2 px-2 text-xs"
          onClick={() => setShowResolved((v) => !v)}
        >
          {showResolved ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {showResolved ? 'Hide resolved comments' : 'Show resolved comments'}
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-4 p-3">
          {!loading && filtered.length === 0 && (
            <p className="py-10 text-center text-xs text-muted-foreground">
              {totals.changes + totals.comments === 0
                ? 'Nothing to review — there are no tracked changes or comments anywhere in Part B.'
                : 'Nothing matches these filters.'}
            </p>
          )}

          {filtered.map((group) => (
            <div key={group.sectionId} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="truncate text-xs font-semibold">{group.sectionLabel}</h3>
                <Badge variant="secondary" className="shrink-0 text-[11px] font-bold">
                  {group.items.length}
                </Badge>
              </div>

              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => open(item)}
                  className="w-full rounded-lg border border-border bg-card p-2.5 text-left transition-colors hover:border-primary"
                >
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    {item.kind === 'change' ? (
                      <Pencil className="h-3.5 w-3.5" />
                    ) : (
                      <MessageSquare className="h-3.5 w-3.5" />
                    )}
                    <span className="font-medium text-foreground">{item.authorName}</span>
                    {item.timestamp && <span>{formatSmartTimestamp(item.timestamp)}</span>}
                    {item.kind === 'change' && (
                      <Badge variant="outline" className="text-[11px] font-bold">
                        {item.type === 'insertion' ? 'Insertion' : 'Deletion'}
                      </Badge>
                    )}
                    {item.kind === 'comment' && item.resolved && (
                      <Badge variant="outline" className="text-[11px] font-bold">
                        Resolved
                      </Badge>
                    )}
                  </div>
                  <p
                    className={`mt-1 line-clamp-3 text-xs ${
                      item.kind === 'change' && item.type === 'deletion'
                        ? 'text-muted-foreground line-through'
                        : ''
                    }`}
                  >
                    {item.kind === 'change' ? item.text : htmlToPlainText(item.content)}
                  </p>
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">
                    {item.moduleLabel}
                  </p>
                </button>
              ))}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

export default PartBReviewPanel;
