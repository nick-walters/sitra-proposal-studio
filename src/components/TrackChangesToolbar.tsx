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
} from 'lucide-react';
import { TrackChange } from '@/extensions/TrackChanges';
import { format } from 'date-fns';
import { smartTimestamp } from '@/lib/smartTimestamp';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useEffect, useState, useCallback } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { useProposalUserColors } from '@/hooks/useProposalUserColors';

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
  proposalId?: string;
}

export function TrackChangesToolbar({ 
  editor, 
  enabled, 
  onToggle, 
  changes,
  proposalId,
}: TrackChangesToolbarProps) {
  const { getUserColor, getUserAvatar } = useProposalUserColors(proposalId);
  const insertions = changes.filter(c => c.type === 'insertion');
  const deletions = changes.filter(c => c.type === 'deletion');

  // Selection state for popover multi-select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === changes.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(changes.map(c => c.id)));
    }
  }, [selectedIds.size, changes]);

  const handleAcceptSelected = useCallback(() => {
    selectedIds.forEach(id => editor?.commands.acceptChange(id));
    setSelectedIds(new Set());
  }, [editor, selectedIds]);

  const handleRejectSelected = useCallback(() => {
    selectedIds.forEach(id => editor?.commands.rejectChange(id));
    setSelectedIds(new Set());
  }, [editor, selectedIds]);

  const handleAcceptChange = (changeId: string) => {
    editor?.commands.acceptChange(changeId);
    setSelectedIds(prev => { const n = new Set(prev); n.delete(changeId); return n; });
  };

  const handleRejectChange = (changeId: string) => {
    editor?.commands.rejectChange(changeId);
    setSelectedIds(prev => { const n = new Set(prev); n.delete(changeId); return n; });
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
    setSelectedIds(new Set());
  };

  const handleRejectAll = () => {
    editor?.commands.rejectAllChanges();
    setSelectedIds(new Set());
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

      {/* empty block kept for enabled-only features in future */}

      {/* Change counts and panel - visible regardless of tracking state */}
      {changes.length > 0 && (
        <>
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
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={selectedIds.size === changes.length && changes.length > 0}
                        onCheckedChange={toggleSelectAll}
                        className="h-3.5 w-3.5"
                      />
                      <h4 className="font-semibold text-sm">
                        {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Tracked Changes'}
                      </h4>
                    </div>
                    <div className="flex items-center gap-1">
                      {selectedIds.size > 0 ? (
                        <>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-7 px-2 text-green-600 hover:text-green-700 hover:bg-green-50"
                                onClick={handleAcceptSelected}
                              >
                                <CheckCheck className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Accept selected</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={handleRejectSelected}
                              >
                                <XCircle className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Reject selected</TooltipContent>
                          </Tooltip>
                        </>
                      ) : (
                        <>
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
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <ScrollArea className="max-h-64">
                  <div className="p-2 space-y-1">
                    {changes.map((change) => (
                      <div
                        key={`${change.id}-${change.from}-${change.to}-${change.type}`}
                        className={`p-3 rounded-lg text-xs cursor-pointer transition-all border bg-background hover:border-primary hover:shadow-sm ${
                          selectedIds.has(change.id) ? 'ring-1 ring-primary/50' : ''
                        }`}
                        onClick={(e) => {
                          if ((e.target as HTMLElement).closest('button')) return;
                          toggleSelection(change.id);
                        }}
                       >
                        <div className="flex items-center gap-1.5 min-w-0">
                            <Checkbox
                              checked={selectedIds.has(change.id)}
                              onCheckedChange={() => toggleSelection(change.id)}
                              className="h-3.5 w-3.5"
                              onClick={(e) => e.stopPropagation()}
                            />
                            <div 
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: getUserColor(change.authorId) }}
                            />
                            <Avatar className="h-5 w-5 shrink-0">
                              {getUserAvatar(change.authorId) && (
                                <AvatarImage src={getUserAvatar(change.authorId)!} />
                              )}
                              <AvatarFallback className="text-[9px] bg-primary/10">
                                {(getDisplayName(change) || 'U').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm font-medium truncate">{getDisplayName(change)}</span>
                            <div className="flex items-center gap-0.5 shrink-0 ml-auto">
                              <Badge 
                                variant="outline" 
                                className={`text-[9px] py-0 px-1 ${
                                  change.type === 'insertion' 
                                    ? 'border-green-300 text-green-700'
                                    : 'border-red-300 text-red-700'
                                }`}
                              >
                                {change.type === 'insertion' ? 'Inserted' : 'Deleted'}
                              </Badge>
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
                        <div className="text-xs text-muted-foreground mt-1">
                          {smartTimestamp(new Date(change.timestamp))}
                        </div>
                        {change.content && (
                          <div className="mt-1.5 text-muted-foreground italic truncate">
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
    </div>
  );
}
