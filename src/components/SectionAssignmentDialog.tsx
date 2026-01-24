import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { format, isPast, isToday, differenceInDays } from 'date-fns';
import {
  CalendarIcon,
  User,
  X,
  Check,
  Search,
  Clock,
  AlertTriangle,
} from 'lucide-react';

interface TeamMember {
  id: string;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  organisation: string | null;
}

interface AssignmentInfo {
  assignedTo: string | null;
  assignedToName: string | null;
  assignedToEmail: string | null;
  assignedToAvatar: string | null;
  assignedBy: string | null;
  assignedByName: string | null;
  assignedAt: string | null;
  dueDate: string | null;
}

interface SectionAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sectionTitle: string;
  sectionNumber: string;
  assignmentInfo: AssignmentInfo;
  teamMembers: TeamMember[];
  updating: boolean;
  onAssign: (userId: string | null, dueDate: string | null) => Promise<void>;
  onClearAssignment: () => Promise<void>;
}

export function SectionAssignmentDialog({
  open,
  onOpenChange,
  sectionTitle,
  sectionNumber,
  assignmentInfo,
  teamMembers,
  updating,
  onAssign,
  onClearAssignment,
}: SectionAssignmentDialogProps) {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(assignmentInfo.assignedTo);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    assignmentInfo.dueDate ? new Date(assignmentInfo.dueDate) : undefined
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  // Sync state when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedUserId(assignmentInfo.assignedTo);
      setSelectedDate(assignmentInfo.dueDate ? new Date(assignmentInfo.dueDate) : undefined);
      setSearchQuery('');
    }
  }, [open, assignmentInfo]);

  const filteredMembers = teamMembers.filter(
    (member) =>
      member.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.organisation?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const handleSave = async () => {
    await onAssign(selectedUserId, selectedDate ? selectedDate.toISOString() : null);
    onOpenChange(false);
  };

  const handleClear = async () => {
    await onClearAssignment();
    setSelectedUserId(null);
    setSelectedDate(undefined);
    onOpenChange(false);
  };

  const selectedMember = teamMembers.find((m) => m.id === selectedUserId);

  const getDueDateStatus = () => {
    if (!selectedDate) return null;
    if (isPast(selectedDate) && !isToday(selectedDate)) {
      return { label: 'Overdue', className: 'bg-destructive text-destructive-foreground' };
    }
    const daysUntil = differenceInDays(selectedDate, new Date());
    if (daysUntil <= 3) {
      return { label: 'Due soon', className: 'bg-amber-500 text-white' };
    }
    return null;
  };

  const dueDateStatus = getDueDateStatus();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign Section</DialogTitle>
          <DialogDescription>
            Assign <strong>{sectionNumber}. {sectionTitle}</strong> to a team member with an optional due date.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Current assignment display */}
          {selectedMember && (
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={selectedMember.avatarUrl || undefined} />
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    {getInitials(selectedMember.fullName)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium text-sm">{selectedMember.fullName}</p>
                  <p className="text-xs text-muted-foreground">{selectedMember.email}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedUserId(null)}
                className="h-8 w-8"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Team member search and selection */}
          {!selectedMember && (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search team members..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              <ScrollArea className="h-[200px] border rounded-lg">
                {filteredMembers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                    <User className="h-8 w-8 mb-2" />
                    <p className="text-sm">No team members found</p>
                  </div>
                ) : (
                  <div className="p-2 space-y-1">
                    {filteredMembers.map((member) => (
                      <button
                        key={member.id}
                        onClick={() => setSelectedUserId(member.id)}
                        className={cn(
                          'w-full flex items-center gap-3 p-2 rounded-md hover:bg-accent text-left transition-colors',
                          selectedUserId === member.id && 'bg-accent'
                        )}
                      >
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={member.avatarUrl || undefined} />
                          <AvatarFallback className="bg-primary/10 text-primary text-xs">
                            {getInitials(member.fullName)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{member.fullName}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {member.organisation || member.email}
                          </p>
                        </div>
                        {selectedUserId === member.id && (
                          <Check className="h-4 w-4 text-primary" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </>
          )}

          {/* Due date picker */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Due Date (optional)</label>
            <div className="flex items-center gap-2">
              <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'flex-1 justify-start text-left font-normal',
                      !selectedDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate ? format(selectedDate, 'PPP') : 'Select due date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => {
                      setSelectedDate(date);
                      setIsCalendarOpen(false);
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              {selectedDate && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedDate(undefined)}
                  className="h-10 w-10"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            {dueDateStatus && (
              <div className="flex items-center gap-2">
                <Badge className={dueDateStatus.className}>
                  {dueDateStatus.label === 'Overdue' ? (
                    <AlertTriangle className="h-3 w-3 mr-1" />
                  ) : (
                    <Clock className="h-3 w-3 mr-1" />
                  )}
                  {dueDateStatus.label}
                </Badge>
              </div>
            )}
          </div>

          {/* Assignment metadata */}
          {assignmentInfo.assignedBy && assignmentInfo.assignedAt && (
            <div className="text-xs text-muted-foreground pt-2 border-t">
              Assigned by {assignmentInfo.assignedByName} on{' '}
              {format(new Date(assignmentInfo.assignedAt), 'PPP')}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-between">
          <Button
            variant="ghost"
            onClick={handleClear}
            disabled={updating || !assignmentInfo.assignedTo}
            className="text-muted-foreground"
          >
            Clear Assignment
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={updating}>
              {updating ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
