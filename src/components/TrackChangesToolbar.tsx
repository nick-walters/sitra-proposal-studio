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
    <div className="flex items-center gap-3">
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
              {/* Next/Previous navigation */}
              <div className="flex items-center gap-0.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={handlePrevChange}>
                      <ChevronUp className="w-3.5 h-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Previous change</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={handleNextChange}>
                      <ChevronDown className="w-3.5 h-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Next change</TooltipContent>
                </Tooltip>
              </div>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <GitBranch className="w-3.5 h-3.5" />
                    {changes.length} {changes.length === 1 ? 'Change' : 'Changes'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="end">
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
                        className={`p-2 rounded-md text-xs ${
                          change.type === 'insertion'
                            ? 'bg-green-50 dark:bg-green-900/20'
                            : 'bg-red-50 dark:bg-red-900/20'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5">
                            <div 
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: change.authorColor }}
                            />
                            <span className="font-medium">{change.authorName}</span>
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
                          <span>{format(new Date(change.timestamp), 'MMM d, h:mm a')}</span>
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
