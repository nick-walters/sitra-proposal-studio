import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  ChevronLeft, 
  ChevronRight,
  GitBranch, 
  Check, 
  X, 
  CheckCheck, 
  XCircle,
  Clock,
  MessageSquare,
  UserPlus,
  CalendarClock,
  User,
} from 'lucide-react';
import { TrackChange } from '@/extensions/TrackChanges';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { 
  Tooltip, 
  TooltipContent, 
  TooltipTrigger 
} from '@/components/ui/tooltip';
import { Editor } from '@tiptap/react';
import { CommentsSidebar } from './CommentsSidebar';

interface AssignmentInfo {
  assignedTo: string | null;
  assignedToName: string | null;
  assignedToAvatar: string | null;
  assignedToEmail: string | null;
  dueDate: string | null;
}

interface CollaborationPanelProps {
  editor: Editor | null;
  proposalId: string;
  sectionId: string;
  // Track changes props
  trackChangesEnabled: boolean;
  onTrackChangesToggle: (enabled: boolean) => void;
  trackedChanges: TrackChange[];
  // Assignment props
  assignmentInfo: AssignmentInfo;
  canManageAssignment: boolean;
  isAssignedToMe: boolean;
  onOpenAssignmentDialog: () => void;
  // Comments props
  selectedText: string;
  selectionRange?: { start: number; end: number };
  onApplySuggestion: (originalText: string, suggestedText: string) => void;
  onClearSelection: () => void;
  // Panel state
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export function CollaborationPanel({
  editor,
  proposalId,
  sectionId,
  trackChangesEnabled,
  onTrackChangesToggle,
  trackedChanges,
  assignmentInfo,
  canManageAssignment,
  isAssignedToMe,
  onOpenAssignmentDialog,
  selectedText,
  selectionRange,
  onApplySuggestion,
  onClearSelection,
  isCollapsed,
  onToggleCollapse,
}: CollaborationPanelProps) {
  const [activeTab, setActiveTab] = useState<'comments' | 'changes'>('comments');

  const insertions = trackedChanges.filter(c => c.type === 'insertion');
  const deletions = trackedChanges.filter(c => c.type === 'deletion');

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

  // Collapsed state - show toggle button only
  if (isCollapsed) {
    return (
      <button
        onClick={onToggleCollapse}
        className="w-4 flex items-center justify-center bg-muted/50 hover:bg-muted transition-colors border-l border-border"
      >
        <ChevronLeft className="w-3 h-3 text-muted-foreground" />
      </button>
    );
  }

  return (
    <div className="w-80 shrink-0 h-full flex flex-col border-l border-border bg-card">
      {/* Panel Header */}
      <div className="p-3 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold text-sm">Collaboration</h3>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onToggleCollapse}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Assignment Section */}
      {canManageAssignment && (
        <div className="p-3 border-b border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Assignment
            </span>
            <Button
              variant={assignmentInfo.assignedTo ? "default" : "outline"}
              size="sm"
              className={cn(
                "h-7 gap-1.5",
                assignmentInfo.assignedTo && "bg-blue-500 hover:bg-blue-600 text-white"
              )}
              onClick={onOpenAssignmentDialog}
            >
              <UserPlus className="w-3.5 h-3.5" />
              {assignmentInfo.assignedTo ? 'Reassign' : 'Assign'}
            </Button>
          </div>
          {assignmentInfo.assignedTo ? (
            <div className="flex items-center gap-2 p-2 rounded-md bg-blue-50 dark:bg-blue-950/20">
              <Avatar className="h-8 w-8">
                <AvatarImage src={assignmentInfo.assignedToAvatar || undefined} />
                <AvatarFallback className="text-xs bg-blue-500 text-white">
                  {assignmentInfo.assignedToName?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || <User className="h-3 w-3" />}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {assignmentInfo.assignedToName}
                  {isAssignedToMe && <Badge variant="secondary" className="ml-2 text-[10px]">You</Badge>}
                </p>
                {assignmentInfo.dueDate && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <CalendarClock className="w-3 h-3" />
                    Due {format(new Date(assignmentInfo.dueDate), 'MMM d, yyyy')}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No one assigned to this section</p>
          )}
        </div>
      )}

      {/* Track Changes Section */}
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Track Changes
          </span>
          <div className="flex items-center gap-2">
            <Switch
              id="track-changes-panel"
              checked={trackChangesEnabled}
              onCheckedChange={onTrackChangesToggle}
              className="scale-75"
            />
            <Label htmlFor="track-changes-panel" className="text-xs cursor-pointer">
              {trackChangesEnabled ? 'On' : 'Off'}
            </Label>
          </div>
        </div>
        
        {trackChangesEnabled && trackedChanges.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {insertions.length > 0 && (
                  <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 text-[10px]">
                    +{insertions.length}
                  </Badge>
                )}
                {deletions.length > 0 && (
                  <Badge variant="secondary" className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 text-[10px]">
                    -{deletions.length}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-6 px-1.5 text-green-600 hover:text-green-700 hover:bg-green-50"
                      onClick={handleAcceptAll}
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Accept all</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-6 px-1.5 text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={handleRejectAll}
                    >
                      <XCircle className="w-3.5 h-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Reject all</TooltipContent>
                </Tooltip>
              </div>
            </div>
            <ScrollArea className="max-h-32">
              <div className="space-y-1">
                {trackedChanges.slice(0, 5).map((change) => (
                  <div
                    key={change.id}
                    className={cn(
                      "p-1.5 rounded text-[10px]",
                      change.type === 'insertion'
                        ? 'bg-green-50 dark:bg-green-900/20'
                        : 'bg-red-50 dark:bg-red-900/20'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <div 
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: change.authorColor }}
                        />
                        <span className="font-medium truncate max-w-[100px]">{change.authorName}</span>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-4 w-4 p-0 text-green-600 hover:text-green-700"
                          onClick={() => handleAcceptChange(change.id)}
                        >
                          <Check className="w-2.5 h-2.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-4 w-4 p-0 text-red-600 hover:text-red-700"
                          onClick={() => handleRejectChange(change.id)}
                        >
                          <X className="w-2.5 h-2.5" />
                        </Button>
                      </div>
                    </div>
                    {change.content && (
                      <p className="text-muted-foreground italic truncate mt-0.5">
                        "{change.content}"
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
            {trackedChanges.length > 5 && (
              <p className="text-[10px] text-muted-foreground text-center">
                +{trackedChanges.length - 5} more changes
              </p>
            )}
          </div>
        )}
        
        {trackChangesEnabled && trackedChanges.length === 0 && (
          <p className="text-xs text-muted-foreground">No changes tracked yet</p>
        )}
      </div>

      {/* Comments Section (full remaining height) */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="p-3 border-b border-border flex items-center gap-2">
          <MessageSquare className="w-4 h-4" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Comments
          </span>
        </div>
        <div className="flex-1 overflow-hidden">
          <CommentsSidebar
            proposalId={proposalId}
            sectionId={sectionId}
            selectedText={selectedText}
            selectionRange={selectionRange}
            onApplySuggestion={onApplySuggestion}
            onClearSelection={onClearSelection}
            compact
          />
        </div>
      </div>
    </div>
  );
}
