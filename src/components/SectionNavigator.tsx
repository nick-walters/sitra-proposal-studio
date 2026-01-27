import { Section, Participant } from "@/types/proposal";
import { ChevronRight, ChevronDown, FileText, User, Clock, AlertTriangle, BarChart3, Layers } from "lucide-react";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SectionAssignment } from "@/hooks/useSectionAssignments";
import { isPast, isToday, differenceInDays, format } from "date-fns";
import type { WPSection } from "@/hooks/useProposalSections";

// Collaborator presence info for real-time editing indicators
interface CollaboratorPresence {
  id: string;
  name: string;
  email: string;
  sectionId: string | null;
  color: string;
  avatar_url?: string | null;
}

interface SectionNavigatorProps {
  sections: (Section | WPSection)[];
  activeSectionId: string | null;
  onSectionClick: (section: Section | WPSection) => void;
  participants?: Participant[];
  isAdmin?: boolean;
  currentUserId?: string;
  participantMembers?: { participantId: string; userId?: string }[];
  assignments?: Map<string, SectionAssignment>;
  collaborators?: CollaboratorPresence[];
}

// Format section number for display in left navigation
function formatSectionNumber(number: string, depth: number): string {
  // If already has "Part" prefix, return as-is
  if (number.startsWith('Part')) {
    return number;
  }
  // WP numbers get a colon (e.g., "WP1" -> "WP1:")
  if (number.startsWith('WP')) {
    return number + ':';
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
  collaborators = [],
}: {
  section: Section | WPSection;
  depth?: number;
  activeSectionId: string | null;
  onSectionClick: (section: Section | WPSection) => void;
  assignments?: Map<string, SectionAssignment>;
  currentUserId?: string;
  collaborators?: CollaboratorPresence[];
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasSubsections = section.subsections && section.subsections.length > 0;
  const isActive = activeSectionId === section.id;
  
  // Check if this is a WP section with color
  const wpSection = section as WPSection;
  const isWPSection = wpSection.wpId !== undefined;
  const wpColor = wpSection.wpColor;
  
  // Check if this is a participant section (a2-{participantId})
  const isParticipantSection = section.id.startsWith('a2-') && section.id !== 'a2';
  
  // Get collaborators currently editing this section
  const sectionCollaborators = collaborators.filter(c => c.sectionId === section.id);
  
  // Get assignment info for this section
  const assignment = assignments?.get(section.number);
  const dueDateInfo = assignment ? getDueDateInfo(assignment.dueDate) : null;
  const isAssignedToMe = assignment?.assignedTo === currentUserId;
  
  // Check if this is a collapsible heading (Part A, Part B, B1, B2, WP Drafts, etc.)
  // Note: A2 is NOT a collapsible heading - it should navigate to ParticipantListView
  const isCollapsibleHeading = hasSubsections && (
    section.id === 'part-a' || 
    section.id === 'part-b' || 
    section.id === 'b1' || 
    section.id === 'b2' ||
    section.id === 'wp-drafts'
  );
  
  // Check if this is a top-level bold item (Proposal overview, Part A, Part B, Figures, WP Progress Tracker, WP Drafts)
  // Match both ID-based and number-based checks for database sections
  const isTopLevelBold = 
    section.id === 'proposal-overview' || 
    section.id === 'part-a' || 
    section.number === 'Part A' ||
    section.id === 'part-b' || 
    section.number === 'Part B' ||
    section.id === 'figures' ||
    section.title === 'Figures' ||
    section.id === 'wp-progress-tracker' ||
    section.id === 'wp-drafts';
  
  // Note: Guideline icons removed from navigation hover to reduce visual clutter

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
          if (isCollapsibleHeading) {
            // For collapsible headings, expand/collapse and navigate to first child
            setIsExpanded(!isExpanded);
            // Find the first navigable child section
            const findFirstChild = (subs: (Section | WPSection)[]): Section | WPSection | undefined => {
              for (const sub of subs) {
                // Skip collapsible headings, find actual content sections
                const subHasSubs = sub.subsections && sub.subsections.length > 0;
                const isSubCollapsible = subHasSubs && (
                  sub.id === 'part-a' || sub.id === 'part-b' || 
                  sub.id === 'b1' || sub.id === 'b2' || sub.id === 'wp-drafts'
                );
                if (!isSubCollapsible) {
                  return sub;
                }
                // Recursively check subsections
                if (sub.subsections) {
                  const found = findFirstChild(sub.subsections);
                  if (found) return found;
                }
              }
              return undefined;
            };
            const firstChild = section.subsections ? findFirstChild(section.subsections) : undefined;
            if (firstChild) {
              onSectionClick(firstChild);
            }
          } else if (hasSubsections) {
            setIsExpanded(!isExpanded);
            onSectionClick(section);
          } else {
            onSectionClick(section);
          }
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
        ) : section.id === 'wp-progress-tracker' ? (
          <BarChart3 className="w-4 h-4 text-muted-foreground" />
        ) : section.id === 'wp-drafts' ? (
          <Layers className="w-4 h-4 text-muted-foreground" />
        ) : isWPSection && wpColor ? (
          null
        ) : isParticipantSection ? (
          null
        ) : (
          <FileText className="w-4 h-4 text-muted-foreground" />
        )}
        
        {/* WP sections render as colored bubbles */}
        {isWPSection && wpColor ? (
          <span 
            className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap"
            style={{ backgroundColor: wpColor, color: '#ffffff' }}
          >
            WP{wpSection.wpNumber}: {wpSection.title}
          </span>
        ) : isParticipantSection ? (
          <span 
            className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap"
            style={{ backgroundColor: '#000000', color: '#ffffff' }}
          >
            P{section.number}: {section.title}
          </span>
        ) : (
          <>
            {/* Only show number if not a top-level bold item and number exists */}
            {showNumber && !isTopLevelBold && (
              <span className="font-medium text-muted-foreground mr-0.5">
                {formatSectionNumber(section.number, depth)}
              </span>
            )}
            <span className={cn("flex-1 truncate", isActive && "font-medium")}>
              {formatTitle(section.title)}
            </span>
          </>
        )}
        
        {/* Real-time collaborator presence indicators */}
        {sectionCollaborators.length > 0 && (
          <div className="flex items-center -space-x-1.5 shrink-0">
            {sectionCollaborators.slice(0, 3).map((collab) => (
              <TooltipProvider key={collab.id}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="relative inline-block">
                      <Avatar 
                        className="h-5 w-5 border-2 ring-1 ring-offset-0"
                        style={{ 
                          borderColor: collab.color,
                          boxShadow: `0 0 0 1px ${collab.color}40`
                        }}
                      >
                        <AvatarImage src={collab.avatar_url || undefined} />
                        <AvatarFallback 
                          className="text-[8px] text-white"
                          style={{ backgroundColor: collab.color }}
                        >
                          {collab.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      {/* Pulsing indicator showing active editing */}
                      <span 
                        className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full animate-pulse"
                        style={{ backgroundColor: collab.color }}
                      />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">
                    <div className="flex items-center gap-1.5">
                      <span 
                        className="w-2 h-2 rounded-full animate-pulse" 
                        style={{ backgroundColor: collab.color }}
                      />
                      <span className="font-medium">{collab.name}</span>
                      <span className="text-muted-foreground">is editing</span>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ))}
            {sectionCollaborators.length > 3 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Avatar className="h-5 w-5 border bg-muted">
                      <AvatarFallback className="text-[8px]">
                        +{sectionCollaborators.length - 3}
                      </AvatarFallback>
                    </Avatar>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">
                    {sectionCollaborators.slice(3).map(c => c.name).join(', ')}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        )}
        
        {/* Assignment indicators */}
        {assignment && (
          <div className="flex items-center gap-1 shrink-0">
            {/* Due date indicator */}
            {dueDateInfo && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className={cn(
                      "flex items-center",
                      dueDateInfo.isOverdue && "text-destructive",
                      dueDateInfo.isDueSoon && !dueDateInfo.isOverdue && "text-amber-500"
                    )}>
                      {dueDateInfo.isOverdue ? (
                        <AlertTriangle className="w-3 h-3" />
                      ) : dueDateInfo.isDueSoon ? (
                        <Clock className="w-3 h-3" />
                      ) : null}
                    </span>
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
        
      </div>

      {hasSubsections && isExpanded && (
        <div className="animate-slide-in-left">
          {/* Render WP Drafts and A2 Participants as 2-column grid of bubbles */}
          {(section.id === 'wp-drafts' || section.id === 'a2') ? (
            <div 
              className="grid grid-cols-2 gap-x-2 gap-y-1 py-1"
              style={{ paddingLeft: `${(depth + 1) * 12 + 8}px`, paddingRight: '8px' }}
            >
              {section.subsections!.map((subsection) => {
                const wpSub = subsection as WPSection;
                const isWP = wpSub.wpId !== undefined;
                const isSubActive = activeSectionId === subsection.id;
                
                return (
                  <TooltipProvider key={subsection.id}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          className={cn(
                            "inline-flex items-center justify-start w-fit px-2 py-0.5 rounded-full text-xs font-bold truncate cursor-pointer transition-all max-w-full",
                            isSubActive && "ring-2 ring-primary ring-offset-1"
                          )}
                          style={{ 
                            backgroundColor: isWP ? wpSub.wpColor : '#000000',
                            color: '#ffffff' 
                          }}
                          onClick={() => onSectionClick(subsection)}
                        >
                          {isWP 
                            ? `WP${wpSub.wpNumber}: ${wpSub.title}`
                            : `${subsection.number}: ${subsection.title}`
                          }
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="text-xs">
                        {isWP 
                          ? `WP${wpSub.wpNumber}: ${wpSub.title}`
                          : `Participant ${subsection.number}: ${subsection.title}`
                        }
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              })}
            </div>
          ) : (
            /* Regular vertical list for other subsections */
            section.subsections!.map((subsection) => (
              <SectionItem
                key={subsection.id}
                section={subsection}
                depth={depth + 1}
                activeSectionId={activeSectionId}
                onSectionClick={onSectionClick}
                assignments={assignments}
                currentUserId={currentUserId}
                collaborators={collaborators}
              />
            ))
          )}
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
  collaborators = [],
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
            collaborators={collaborators}
          />
        ))}
      </div>
    </nav>
  );
}
