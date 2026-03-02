import { Editor } from '@tiptap/react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { 
  GitBranch, 
  Check, 
  X, 
  CheckCheck, 
  XCircle,
  Clock,
  User,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { TrackChange } from '@/extensions/TrackChanges';
import { format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

function ordinalSuffix(day: number): string {
  if (day >= 11 && day <= 13) return 'th';
  switch (day % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

function formatPanelDate(date: Date): string {
  const day = date.getDate();
  return `${day}${ordinalSuffix(day)} ${format(date, 'MMMM yyyy')} at ${format(date, 'HH:mm')}`;
}

interface TrackChangesToolbarProps {
  editor: Editor | null;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  changes: TrackChange[];
}

export function TrackChangesToolbar({ 
  editor, 
  enabled, 
  onToggle, 
  changes 
}: TrackChangesToolbarProps) {
  const insertions = changes.filter(c => c.type === 'insertion');
  const deletions = changes.filter(c => c.type === 'deletion');

  const handleAcceptChange = (changeId: string) => {
    editor?.commands.acceptChange(changeId);
  };

  const handleRejectChange = (changeId: string) => {
    editor?.commands.rejectChange(changeId);
  };

  // Resolve author display names from profiles
  const [authorNames, setAuthorNames] = useState<Record<string, string>>({});
  useEffect(() => {
    const uniqueIds = [...new Set(changes.map(c => c.authorId).filter(Boolean))];
    if (uniqueIds.length === 0) return;
    const missing = uniqueIds.filter(id => !authorNames[id]);
    if (missing.length === 0) return;
    supabase.from('profiles').select('id, full_name').in('id', missing).then(({ data }) => {
      if (!data) return;
      setAuthorNames(prev => {
        const next = { ...prev };
        data.forEach(p => { if (p.full_name) next[p.id] = p.full_name; });
        return next;
      });
    });
  }, [changes]);

  const getDisplayName = (change: TrackChange) =>
    authorNames[change.authorId] || change.authorName;

  const handleAcceptAll = () => {
    editor?.commands.acceptAllChanges();
  };

  const handleRejectAll = () => {
    editor?.commands.rejectAllChanges();
  };

  const handleNextChange = () => {
    editor?.commands.navigateToNextChange();
  };

  const handlePrevChange = () => {
    editor?.commands.navigateToPreviousChange();
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Toggle Switch */}
      <div className="flex items-center gap-2">
        <Switch
          id="track-changes"
          checked={enabled}
          onCheckedChange={onToggle}
        />
        <Label 
          htmlFor="track-changes" 
          className="text-sm font-medium cursor-pointer flex items-center gap-1.5"
        >
          <GitBranch className="w-4 h-4" />
          Track Changes
        </Label>
      </div>

      {enabled && (
        <>
          {/* Change counts */}
          <div className="flex items-center gap-1.5">
            {insertions.length > 0 && (
              <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                +{insertions.length}
              </Badge>
            )}
            {deletions.length > 0 && (
              <Badge variant="secondary" className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                -{deletions.length}
              </Badge>
            )}
          </div>

          {/* Changes panel and navigation */}
          {changes.length > 0 && (
            <>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <GitBranch className="w-3.5 h-3.5" />
                    {changes.length} {changes.length === 1 ? 'Change' : 'Changes'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="end" onOpenAutoFocus={e => e.preventDefault()}>
                <div className="p-3 border-b">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-sm">Tracked Changes</h4>
                    <div className="flex items-center gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-7 px-2 text-green-600 hover:text-green-700 hover:bg-green-50"
                            onClick={handleAcceptAll}
                          >
                            <CheckCheck className="w-4 h-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Accept all changes</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={handleRejectAll}
                          >
                            <XCircle className="w-4 h-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Reject all changes</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                </div>
                <ScrollArea className="max-h-64">
                  <div className="p-2 space-y-1">
                    {changes.map((change) => (
                      <div
                        key={change.id}
                        className={`p-2 rounded-md text-xs cursor-pointer transition-colors hover:ring-1 hover:ring-primary/30 ${
                          change.type === 'insertion'
                            ? 'bg-green-50 dark:bg-green-900/20'
                            : 'bg-red-50 dark:bg-red-900/20'
                        }`}
                        onClick={(e) => {
                          // Don't jump if clicking accept/reject buttons
                          if ((e.target as HTMLElement).closest('button')) return;
                          if (!editor) return;
                          try {
                            const pos = Math.min(change.from, editor.state.doc.content.size);
                            editor.commands.setTextSelection(pos);
                            editor.commands.focus();
                            // Scroll the mark into view
                            setTimeout(() => {
                              try {
                                const dom = editor.view.domAtPos(pos);
                                if (dom?.node) {
                                  const el = dom.node instanceof HTMLElement ? dom.node : dom.node.parentElement;
                                  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                }
                              } catch { /* position may be stale */ }
                            }, 50);
                          } catch { /* position may be stale */ }
                        }}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5">
                            <div 
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: change.authorColor }}
                            />
                            <span className="font-medium">{getDisplayName(change)}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-5 w-5 p-0 text-green-600 hover:text-green-700"
                                  onClick={() => handleAcceptChange(change.id)}
                                >
                                  <Check className="w-3 h-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Accept</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-5 w-5 p-0 text-red-600 hover:text-red-700"
                                  onClick={() => handleRejectChange(change.id)}
                                >
                                  <X className="w-3 h-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Reject</TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          <span>{formatPanelDate(new Date(change.timestamp))}</span>
                          <Badge 
                            variant="outline" 
                            className={`text-[10px] py-0 ${
                              change.type === 'insertion' 
                                ? 'border-green-300 text-green-700'
                                : 'border-red-300 text-red-700'
                            }`}
                          >
                            {change.type === 'insertion' ? 'Added' : 'Deleted'}
                          </Badge>
                        </div>
                        {change.content && (
                          <div className="mt-1 text-muted-foreground italic truncate">
                            "{change.content}"
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
                </PopoverContent>
              </Popover>
            </>
          )}
        </>
      )}
    </div>
  );
}
