import { Section, Participant } from "@/types/proposal";
import { ChevronRight, ChevronDown, FileText, Info, Lightbulb, User, Clock, AlertTriangle } from "lucide-react";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SectionAssignment } from "@/hooks/useSectionAssignments";
import { isPast, isToday, differenceInDays, format } from "date-fns";

interface SectionNavigatorProps {
  sections: Section[];
  activeSectionId: string | null;
  onSectionClick: (section: Section) => void;
  participants?: Participant[];
  isAdmin?: boolean;
  currentUserId?: string;
  participantMembers?: { participantId: string; userId?: string }[];
  assignments?: Map<string, SectionAssignment>;
}

// Format section number for display in left navigation
function formatSectionNumber(number: string, depth: number): string {
  // If already has "Part" prefix, return as-is
  if (number.startsWith('Part')) {
    return number;
  }
  // Remove dots between letter and first number (e.g., "B.1.1" -> "B1.1")
  // Then add trailing period (e.g., "B1.1" -> "B1.1.")
  const formatted = number.replace(/^([AB])\./, '$1');
  return formatted + '.';
}

// Replace "and" with "&" in titles
function formatTitle(title: string): string {
  return title.replace(/\band\b/gi, '&');
}

// Get due date urgency info
function getDueDateInfo(dueDateStr: string | null) {
  if (!dueDateStr) return null;
  const dueDate = new Date(dueDateStr);
  const isOverdue = isPast(dueDate) && !isToday(dueDate);
  const daysUntil = differenceInDays(dueDate, new Date());
  const isDueSoon = daysUntil >= 0 && daysUntil <= 3;
  return { dueDate, isOverdue, isDueSoon, daysUntil };
}

function SectionItem({
  section,
  depth = 0,
  activeSectionId,
  onSectionClick,
  assignments,
  currentUserId,
}: {
  section: Section;
  depth?: number;
  activeSectionId: string | null;
  onSectionClick: (section: Section) => void;
  assignments?: Map<string, SectionAssignment>;
  currentUserId?: string;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasSubsections = section.subsections && section.subsections.length > 0;
  const isActive = activeSectionId === section.id;
  
  // Get assignment info for this section
  const assignment = assignments?.get(section.number);
  const dueDateInfo = assignment ? getDueDateInfo(assignment.dueDate) : null;
  const isAssignedToMe = assignment?.assignedTo === currentUserId;
  
  // Check if this is a collapsible heading (Part A, Part B, B1, B2, etc.)
  // Note: A2 is NOT a collapsible heading - it should navigate to ParticipantListView
  const isCollapsibleHeading = hasSubsections && (
    section.id === 'part-a' || 
    section.id === 'part-b' || 
    section.id === 'b1' || 
    section.id === 'b2'
  );
  
  // Check if this is a top-level bold item (Proposal overview, Part A, Part B, Figures)
  // Match both ID-based and number-based checks for database sections
  const isTopLevelBold = 
    section.id === 'proposal-overview' || 
    section.id === 'part-a' || 
    section.number === 'Part A' ||
    section.id === 'part-b' || 
    section.number === 'Part B' ||
    section.id === 'figures' ||
    section.title === 'Figures';
  
  // Check for guideline types
  const hasOfficialGuideline = section.guidelinesArray?.some(g => g.type === 'official') || 
    (section.guidelines?.text && !section.guidelinesArray);
  const hasSitraTip = section.guidelinesArray?.some(g => g.type === 'sitra_tip');

  // Don't show number prefix for Proposal overview or empty numbers
  const showNumber = section.number && section.number.trim() !== '';

  return (
    <div className="animate-fade-in">
      <div
        className={cn(
          "section-nav-item flex items-center gap-2 group",
          isActive && "section-nav-item-active",
          !isActive && "hover:bg-muted",
          (isCollapsibleHeading || isTopLevelBold) && "font-semibold",
          // Color coding for assignment status
          dueDateInfo?.isOverdue && "border-l-2 border-destructive",
          dueDateInfo?.isDueSoon && !dueDateInfo?.isOverdue && "border-l-2 border-amber-500",
          isAssignedToMe && !dueDateInfo?.isOverdue && !dueDateInfo?.isDueSoon && "border-l-2 border-blue-500"
        )}
        style={{ paddingLeft: `${depth * 12 + 12}px` }}
        onClick={() => {
          if (hasSubsections) {
            setIsExpanded(!isExpanded);
          }
          onSectionClick(section);
        }}
      >
        {hasSubsections ? (
          <button
            className="p-0.5 rounded hover:bg-accent"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
        ) : (
          <FileText className="w-4 h-4 text-muted-foreground" />
        )}
        {/* Only show number if not a top-level bold item and number exists */}
        {showNumber && !isTopLevelBold && (
          <span className="font-medium text-muted-foreground mr-1">
            {formatSectionNumber(section.number, depth)}
          </span>
        )}
        <span className={cn("flex-1 truncate", isActive && "font-medium")}>
          {formatTitle(section.title)}
        </span>
        
        {/* Assignment indicators */}
        {assignment && (
          <div className="flex items-center gap-1 shrink-0">
            {/* Due date indicator */}
            {dueDateInfo && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className={cn(
                      "flex items-center",
                      dueDateInfo.isOverdue && "text-destructive",
                      dueDateInfo.isDueSoon && !dueDateInfo.isOverdue && "text-amber-500"
                    )}>
                      {dueDateInfo.isOverdue ? (
                        <AlertTriangle className="w-3 h-3" />
                      ) : dueDateInfo.isDueSoon ? (
                        <Clock className="w-3 h-3" />
                      ) : null}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">
                    {dueDateInfo.isOverdue 
                      ? `Overdue (was due ${format(dueDateInfo.dueDate, 'MMM d')})`
                      : dueDateInfo.isDueSoon
                        ? `Due soon (${format(dueDateInfo.dueDate, 'MMM d')})`
                        : `Due ${format(dueDateInfo.dueDate, 'MMM d')}`
                    }
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            
            {/* Assignee avatar */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Avatar className={cn(
                    "h-5 w-5 border",
                    isAssignedToMe && "ring-2 ring-blue-500 ring-offset-1"
                  )}>
                    <AvatarImage src={assignment.assignedToAvatar || undefined} />
                    <AvatarFallback className="text-[8px] bg-muted">
                      {assignment.assignedToName?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || <User className="h-2.5 w-2.5" />}
                    </AvatarFallback>
                  </Avatar>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs">
                  <div>
                    <span className="font-medium">{assignment.assignedToName}</span>
                    {isAssignedToMe && <span className="text-blue-500 ml-1">(You)</span>}
                  </div>
                  {assignment.dueDate && (
                    <div className="text-muted-foreground">
                      Due: {format(new Date(assignment.dueDate), 'MMM d, yyyy')}
                    </div>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
        
        {/* Guideline type indicators */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {hasOfficialGuideline && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-3.5 h-3.5 text-blue-500" />
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs">
                  Official guideline
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {hasSitraTip && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Lightbulb className="w-3.5 h-3.5 text-gray-800" />
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs">
                  Sitra tip
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      {hasSubsections && isExpanded && (
        <div className="animate-slide-in-left">
          {section.subsections!.map((subsection) => (
            <SectionItem
              key={subsection.id}
              section={subsection}
              depth={depth + 1}
              activeSectionId={activeSectionId}
              onSectionClick={onSectionClick}
              assignments={assignments}
              currentUserId={currentUserId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function SectionNavigator({
  sections,
  activeSectionId,
  onSectionClick,
  participants = [],
  isAdmin = false,
  currentUserId,
  participantMembers = [],
  assignments,
}: SectionNavigatorProps) {
  // Filter visible participants based on role
  const visibleParticipants = useMemo(() => {
    if (isAdmin) return participants;
    return participants.filter(p => 
      participantMembers.some(m => m.participantId === p.id && m.userId === currentUserId)
    );
  }, [participants, isAdmin, currentUserId, participantMembers]);

  // Inject participants under A2 section
  const sectionsWithParticipants = useMemo(() => {
    return sections.map(section => {
      if (section.subsections) {
        return {
          ...section,
          subsections: section.subsections.map(sub => {
            if (sub.id === 'a2' && visibleParticipants.length > 0) {
              return {
                ...sub,
                subsections: visibleParticipants.map(p => ({
                  id: `a2-${p.id}`,
                  number: `${p.participantNumber}`,
                  title: p.organisationShortName || p.organisationName || 'Participant',
                  isPartA: true,
                })),
              };
            }
            return sub;
          }),
        };
      }
      return section;
    });
  }, [sections, visibleParticipants]);

  return (
    <nav className="py-2">
      <div className="px-4 py-2 mb-2">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Contents
        </h2>
      </div>
      <div className="space-y-0.5">
        {sectionsWithParticipants.map((section) => (
          <SectionItem
            key={section.id}
            section={section}
            activeSectionId={activeSectionId}
            onSectionClick={onSectionClick}
            assignments={assignments}
            currentUserId={currentUserId}
          />
        ))}
      </div>
    </nav>
  );
}
