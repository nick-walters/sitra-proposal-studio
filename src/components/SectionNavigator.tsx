import { Section, Participant } from "@/types/proposal";
import { ChevronRight, ChevronDown, FileText, User, Clock, AlertTriangle, BarChart3, Layers, Building2, Info, Euro, Lightbulb, Target, Settings, FlaskConical, ShieldCheck, HelpCircle, MessageSquare, ListTodo, Briefcase } from "lucide-react";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SectionAssignment } from "@/hooks/useSectionAssignments";
import { isPast, isToday, differenceInDays, format } from "date-fns";
import type { WPSection, CaseSection } from "@/hooks/useProposalSections";

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
  sections: (Section | WPSection | CaseSection)[];
  activeSectionId: string | null;
  onSectionClick: (section: Section | WPSection | CaseSection) => void;
  participants?: Participant[];
  isCoordinator?: boolean;
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
  section: Section | WPSection | CaseSection;
  depth?: number;
  activeSectionId: string | null;
  onSectionClick: (section: Section | WPSection | CaseSection) => void;
  assignments?: Map<string, SectionAssignment>;
  currentUserId?: string;
  collaborators?: CollaboratorPresence[];
}) {
  const [isExpanded, setIsExpanded] = useState(section.id !== 'a2');
  const hasSubsections = section.subsections && section.subsections.length > 0;
  const isActive = activeSectionId === section.id;
  
  // Check if this is a WP section with color
  const wpSection = section as WPSection;
  const isWPSection = wpSection.wpId !== undefined;
  const wpColor = wpSection.wpColor;
  
  // Check if this is a Case section with color
  const caseSection = section as CaseSection;
  const isCaseSection = caseSection.caseId !== undefined;
  const caseColor = caseSection.caseColor;
  
  // Check if this is a participant section (a2-{participantId})
  const isParticipantSection = section.id.startsWith('a2-') && section.id !== 'a2';
  
  // Get collaborators currently editing this section
  const sectionCollaborators = collaborators.filter(c => c.sectionId === section.id);
  
  // Get assignment info for this section
  const assignment = assignments?.get(section.number);
  const dueDateInfo = assignment ? getDueDateInfo(assignment.dueDate) : null;
  const isAssignedToMe = assignment?.assignedTo === currentUserId;
  // Check if this is a Part B subsection (B1.1, B2.1, etc.) - these need extra indent to align under parent text
  const isPartBSubsection = section.number && /^B\d+\.\d+/.test(section.number);
  
  // Part B subsections need extra indentation to align under parent B1/B2/B3 text (past the icon)
  const extraIndent = isPartBSubsection ? 12 : 0;
  
  // Check if this is a collapsible heading (Part A, Part B, B1, B2, Proposal management)
  // Note: A2 is NOT a collapsible heading - it should navigate to ParticipantListView
  // Note: WP Drafts is NOT a collapsible heading - it should navigate to WP Manager/Tracker
  const isCollapsibleHeading = hasSubsections && (
    section.id === 'part-a' || 
    section.id === 'part-b' || 
    section.id === 'b1' || 
    section.id === 'b2' ||
    section.id === 'proposal-management'
  );

  // Check if this is a top-level bold item
  const isTopLevelBold = 
    section.id === 'part-a' || 
    section.number === 'Part A' ||
    section.id === 'part-b' || 
    section.number === 'Part B' ||
    section.id === 'figures' ||
    section.title === 'Figures' ||
    section.id === 'wp-progress-tracker' ||
    section.id === 'wp-drafts' ||
    section.id === 'proposal-management';
  
  // Note: Guideline icons removed from navigation hover to reduce visual clutter

  // Don't show number prefix for Proposal overview or empty numbers
  const showNumber = section.number && section.number.trim() !== '';

  return (
    <div className="animate-fade-in">
      <div
        className={cn(
          "section-nav-item flex items-center gap-[3px] group",
          isActive && "section-nav-item-active",
          !isActive && "hover:bg-muted",
          (isCollapsibleHeading || isTopLevelBold) && "font-semibold",
          // Color coding for assignment status
          dueDateInfo?.isOverdue && "border-l-2 border-destructive",
          dueDateInfo?.isDueSoon && !dueDateInfo?.isOverdue && "border-l-2 border-amber-500",
          isAssignedToMe && !dueDateInfo?.isOverdue && !dueDateInfo?.isDueSoon && "border-l-2 border-blue-500"
        )}
        style={{ paddingLeft: `${depth * 8 + 12 + extraIndent}px` }}
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
                  sub.id === 'b1' || sub.id === 'b2'
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
            // WP drafts expands AND navigates to show manager/tracker
            setIsExpanded(!isExpanded);
            onSectionClick(section);
          } else {
            onSectionClick(section);
          }
        }}
      >
        {/* Left-side icons */}
        {/* Left-side icons */}
        {section.id === 'proposal-management' ? (
          <Briefcase className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : section.id === 'messaging' ? (
          <MessageSquare className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : section.id === 'task-allocator' ? (
          <ListTodo className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : section.id === 'progress-tracker' ? (
          <BarChart3 className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : section.id === 'a1' || section.number === 'A1' ? (
          <Info className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : section.id === 'a2' || section.number === 'A2' ? (
          <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : section.id === 'a3' || section.number === 'A3' ? (
          <Euro className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : section.id === 'a4' || section.number === 'A4' ? (
          <ShieldCheck className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : section.id === 'a5' || section.number === 'A5' ? (
          <HelpCircle className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : section.id === 'b1' || section.number === 'B1' ? (
          <Lightbulb className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : section.id === 'b2' || section.number === 'B2' ? (
          <Target className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : section.id === 'b3' || section.number === 'B3' ? (
          <Settings className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : !hasSubsections && (
          section.id === 'wp-progress-tracker' ? (
            <BarChart3 className="w-4 h-4 text-muted-foreground shrink-0" />
          ) : section.id === 'wp-drafts' ? (
            <Layers className="w-4 h-4 text-muted-foreground shrink-0" />
          ) : section.id === 'figures' || section.title === 'Figures' ? (
            null
          ) : isWPSection && wpColor ? (
            null
          ) : isCaseSection && caseColor ? (
            null
          ) : isParticipantSection ? (
            null
          ) : (
            <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
          )
        )}
        
        {/* WP sections render as colored bubbles - with left margin to align with text */}
        {isWPSection && wpColor ? (
          <span 
            className="inline-flex items-center justify-center px-1.5 py-px rounded-full text-[10px] font-bold whitespace-nowrap"
            style={{ backgroundColor: wpColor, color: '#ffffff' }}
          >
            WP{wpSection.wpNumber}: {wpSection.title}
          </span>
        ) : isCaseSection && caseColor ? (
          <span 
            className="inline-flex items-center justify-center px-1.5 py-px rounded-full text-[10px] font-bold whitespace-nowrap border-[1.5px] border-black"
            style={{ backgroundColor: '#ffffff', color: '#000000' }}
          >
            {caseSection.number}: {caseSection.title}
          </span>
        ) : isParticipantSection ? (
          <span 
            className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap ml-5"
            style={{ backgroundColor: '#000000', color: '#ffffff' }}
          >
            P{section.number}: {section.title}
          </span>
        ) : (
          <>
            {/* Only show number if not a top-level bold item and number exists */}
            {showNumber && !isTopLevelBold && (
              <span className="font-medium text-muted-foreground">
                {formatSectionNumber(section.number, depth)}
              </span>
            )}
            <span className={cn("flex-1 truncate", isActive && "font-medium")}>
              {formatTitle(section.title)}
            </span>
          </>
        )}
        
        {/* Right-aligned expand/collapse arrow for items with subsections */}
        {hasSubsections && (
          <button
            className="p-0.5 rounded hover:bg-accent ml-auto shrink-0"
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
          {/* Render WP Drafts, Case Drafts, and A2 Participants as 2-column grid of bubbles */}
          {(section.id === 'wp-drafts' || section.id === 'case-drafts' || section.id === 'a2') ? (
            <div 
              className="grid grid-cols-2 gap-x-1 py-1"
              style={{ 
                paddingLeft: `${depth * 8 + 12}px`, 
                paddingRight: '8px',
                rowGap: '2px',
              }}
            >
              {section.subsections!.map((subsection) => {
                const wpSub = subsection as WPSection;
                const caseSub = subsection as CaseSection;
                const isWP = wpSub.wpId !== undefined;
                const isCase = caseSub.caseId !== undefined;
                const isSubActive = activeSectionId === subsection.id;
                
                return (
                  <TooltipProvider key={subsection.id}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          className={cn(
                            "inline-flex items-center justify-start w-fit px-2 py-0 rounded-full text-xs font-bold truncate cursor-pointer transition-all max-w-full leading-tight",
                            isSubActive && "ring-2 ring-primary ring-offset-1"
                          )}
                          style={{ 
                            backgroundColor: isWP ? wpSub.wpColor : isCase ? '#ffffff' : '#000000',
                            color: isCase ? '#000000' : '#ffffff',
                            border: isCase ? '1.5px solid #000000' : undefined,
                          }}
                          onClick={() => onSectionClick(subsection)}
                        >
                          {isWP 
                            ? `WP${wpSub.wpNumber}: ${wpSub.title}`
                            : isCase
                              ? `${caseSub.number}: ${caseSub.title}`
                              : `${subsection.number}: ${subsection.title}`
                          }
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="text-xs">
                        {isWP 
                          ? `WP${wpSub.wpNumber}: ${wpSub.title}`
                          : isCase
                            ? `Case ${caseSub.number}: ${caseSub.title}`
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
  isCoordinator = false,
  currentUserId,
  participantMembers = [],
  assignments,
  collaborators = [],
}: SectionNavigatorProps) {
  // All users with proposal access can see all participants
  const visibleParticipants = useMemo(() => {
    return participants;
  }, [participants]);

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
