import { useSectionProgress, SectionProgressItem, ProgressSummary } from "@/hooks/useSectionProgress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  FileText, 
  User,
  Calendar,
  Edit3,
  BarChart3,
  Users,
  Target,
} from "lucide-react";
import { format, isPast, isToday, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";

interface SectionProgressDashboardProps {
  proposalId: string;
  proposalAcronym?: string;
  currentUserId?: string;
}

function SummaryCard({ 
  title, 
  value, 
  icon: Icon, 
  color 
}: { 
  title: string; 
  value: number; 
  icon: React.ElementType; 
  color: string;
}) {
  return (
    <Card className="flex-1 min-w-[140px]">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={cn("p-2 rounded-lg", color)}>
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground">{title}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ProgressRow({ item }: { item: SectionProgressItem }) {
  const getDueDateInfo = () => {
    if (!item.dueDate) return null;
    const dueDate = new Date(item.dueDate);
    const isOverdue = isPast(dueDate) && !isToday(dueDate);
    const daysUntil = differenceInDays(dueDate, new Date());
    const isDueSoon = daysUntil >= 0 && daysUntil <= 3;
    return { dueDate, isOverdue, isDueSoon, daysUntil };
  };

  const dueDateInfo = getDueDateInfo();
  
  const getStatusBadge = () => {
    if (item.hasContent) {
      return (
        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Complete
        </Badge>
      );
    }
    if (item.wordCount > 10) {
      return (
        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 gap-1">
          <Edit3 className="h-3 w-3" />
          In Progress
        </Badge>
      );
    }
    if (dueDateInfo?.isOverdue) {
      return (
        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 gap-1">
          <AlertTriangle className="h-3 w-3" />
          Overdue
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="bg-muted text-muted-foreground gap-1">
        <FileText className="h-3 w-3" />
        Not Started
      </Badge>
    );
  };

  return (
    <div className={cn(
      "flex items-center gap-4 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors",
      dueDateInfo?.isOverdue && !item.hasContent && "border-l-4 border-l-red-500",
      dueDateInfo?.isDueSoon && !item.hasContent && !dueDateInfo?.isOverdue && "border-l-4 border-l-amber-500"
    )}>
      {/* Section info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
            {item.sectionNumber}
          </span>
          <span className="font-medium truncate">{item.sectionTitle}</span>
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
          {item.wordCount > 0 && (
            <span>{item.wordCount} words</span>
          )}
          {item.updatedAt && (
            <span>Updated {format(new Date(item.updatedAt), 'MMM d')}</span>
          )}
          {item.lastEditedByName && (
            <span>by {item.lastEditedByName}</span>
          )}
        </div>
      </div>

      {/* Assignee */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2">
              <Avatar className="h-7 w-7">
                <AvatarImage src={item.assignedToAvatar || undefined} />
                <AvatarFallback className="text-xs bg-muted">
                  {item.assignedToName?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || <User className="h-3 w-3" />}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm hidden lg:inline max-w-[100px] truncate">
                {item.assignedToName || 'Unknown'}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p className="font-medium">{item.assignedToName}</p>
            {item.assignedToEmail && (
              <p className="text-xs text-muted-foreground">{item.assignedToEmail}</p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Due date */}
      {dueDateInfo && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={cn(
                "flex items-center gap-1.5 text-sm",
                dueDateInfo.isOverdue && !item.hasContent && "text-red-600",
                dueDateInfo.isDueSoon && !dueDateInfo.isOverdue && !item.hasContent && "text-amber-600"
              )}>
                <Calendar className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{format(dueDateInfo.dueDate, 'MMM d')}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Due: {format(dueDateInfo.dueDate, 'MMMM d, yyyy')}</p>
              {dueDateInfo.isOverdue && !item.hasContent && (
                <p className="text-red-400 text-xs">Overdue!</p>
              )}
              {dueDateInfo.isDueSoon && !dueDateInfo.isOverdue && !item.hasContent && (
                <p className="text-amber-400 text-xs">Due in {dueDateInfo.daysUntil} days</p>
              )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Status */}
      <div className="flex-shrink-0">
        {getStatusBadge()}
      </div>
    </div>
  );
}

function ProgressByAssignee({ progress }: { progress: SectionProgressItem[] }) {
  // Group by assignee
  const byAssignee = progress.reduce((acc, item) => {
    const key = item.assignedTo || 'unassigned';
    if (!acc[key]) {
      acc[key] = {
        name: item.assignedToName || 'Unknown',
        avatar: item.assignedToAvatar,
        sections: [],
        completed: 0,
        total: 0,
      };
    }
    acc[key].sections.push(item);
    acc[key].total++;
    if (item.hasContent) acc[key].completed++;
    return acc;
  }, {} as Record<string, { name: string; avatar: string | null; sections: SectionProgressItem[]; completed: number; total: number }>);

  const assignees = Object.values(byAssignee).sort((a, b) => {
    // Sort by completion percentage descending
    const aPercent = a.total > 0 ? a.completed / a.total : 0;
    const bPercent = b.total > 0 ? b.completed / b.total : 0;
    return bPercent - aPercent;
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          Progress by Team Member
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {assignees.map((assignee, idx) => {
          const percentage = assignee.total > 0 
            ? Math.round((assignee.completed / assignee.total) * 100) 
            : 0;
          
          return (
            <div key={idx} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={assignee.avatar || undefined} />
                    <AvatarFallback className="text-[10px]">
                      {assignee.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium truncate max-w-[120px]">{assignee.name}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {assignee.completed}/{assignee.total} ({percentage}%)
                </span>
              </div>
              <Progress value={percentage} className="h-1.5" />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function SectionProgressDashboard({ proposalId, proposalAcronym, currentUserId }: SectionProgressDashboardProps) {
  const { progress, summary, loading } = useSectionProgress(proposalId, currentUserId);

  if (loading) {
    return (
      <div className="flex-1 p-6 bg-muted/30">
        <div className="max-w-6xl mx-auto space-y-6">
          <Skeleton className="h-8 w-48" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (progress.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted/30">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <BarChart3 className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium">No Assignments</h3>
          <p className="text-sm text-muted-foreground mt-2">
            You have no sections assigned to you and haven't assigned any sections to others yet. 
            Use the "Assign" button in the editor toolbar when viewing a Part B section.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 bg-muted/30 overflow-auto">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              My Assignments
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Sections assigned to you or that you've assigned to others
            </p>
          </div>
          {proposalAcronym && (
            <Badge variant="outline" className="text-sm">
              {proposalAcronym}
            </Badge>
          )}
        </div>

        {/* Overall progress bar */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Overall Completion</span>
              <span className="text-2xl font-bold text-primary">{summary.completionPercentage}%</span>
            </div>
            <Progress value={summary.completionPercentage} className="h-3" />
            <p className="text-xs text-muted-foreground mt-2">
              {summary.completed} of {summary.totalAssigned} assigned sections complete
            </p>
          </CardContent>
        </Card>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <SummaryCard 
            title="Total Assigned" 
            value={summary.totalAssigned} 
            icon={FileText} 
            color="bg-primary/10 text-primary" 
          />
          <SummaryCard 
            title="Completed" 
            value={summary.completed} 
            icon={CheckCircle2} 
            color="bg-green-100 text-green-700" 
          />
          <SummaryCard 
            title="In Progress" 
            value={summary.inProgress} 
            icon={Edit3} 
            color="bg-blue-100 text-blue-700" 
          />
          <SummaryCard 
            title="Not Started" 
            value={summary.notStarted} 
            icon={Clock} 
            color="bg-muted text-muted-foreground" 
          />
          <SummaryCard 
            title="Due Soon" 
            value={summary.dueSoon} 
            icon={Clock} 
            color="bg-amber-100 text-amber-700" 
          />
          <SummaryCard 
            title="Overdue" 
            value={summary.overdue} 
            icon={AlertTriangle} 
            color="bg-red-100 text-red-700" 
          />
        </div>

        {/* Main content grid */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Section list */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  Assigned Sections ({progress.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[400px]">
                  <div className="p-4 pt-0 space-y-2">
                    {progress.map((item) => (
                      <ProgressRow key={item.sectionNumber} item={item} />
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Side panel */}
          <div className="space-y-6">
            <ProgressByAssignee progress={progress} />
            
            {/* Quick stats */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  Quick Stats
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total words written</span>
                  <span className="font-medium">
                    {progress.reduce((sum, item) => sum + item.wordCount, 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Team members</span>
                  <span className="font-medium">
                    {new Set(progress.map(p => p.assignedTo).filter(Boolean)).size}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Avg. words per section</span>
                  <span className="font-medium">
                    {progress.length > 0 
                      ? Math.round(progress.reduce((sum, item) => sum + item.wordCount, 0) / progress.length)
                      : 0}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
