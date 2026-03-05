import { Header } from "@/components/Header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SectionNavigator } from "@/components/SectionNavigator";
import { DocumentEditor } from "@/components/DocumentEditor";
// ProposalSummaryPage removed - content merged into GeneralInfoForm
import { ParticipantListView } from "@/components/ParticipantListView";
import { ParticipantDetailForm } from "@/components/ParticipantDetailForm";
import { GeneralInfoForm } from "@/components/GeneralInfoForm";
import { TopicInformationPage } from "@/components/TopicInformationPage";
import { BudgetPortalSheet } from "@/components/BudgetPortalSheet";
import { BudgetParticipantForm } from "@/components/BudgetParticipantForm";
import { EthicsForm } from "@/components/EthicsForm";
import { OtherQuestionsForm } from "@/components/OtherQuestionsForm";
import { DeclarationsForm } from "@/components/DeclarationsForm";
import { FigureManager } from "@/components/FigureManager";
import { SectionProgressDashboard } from "@/components/SectionProgressDashboard";
import { WPDraftEditor } from "@/components/WPDraftEditor";
import { WPManagementCard } from "@/components/WPManagementCard";

import { CaseManagementCard } from "@/components/CaseManagementCard";
import { CaseDraftEditor } from "@/components/CaseDraftEditor";
import { WPProgressTracker } from "@/components/WPProgressTracker";
import { AvailabilityGantt } from "@/components/AvailabilityGantt";
import { ProposalMessagingBoard } from "@/components/ProposalMessagingBoard";
import { ProposalTaskAllocator } from "@/components/ProposalTaskAllocator";
import { ProposalProgressTracker } from "@/components/ProposalProgressTracker";
import { WorkloadDashboard } from "@/components/WorkloadDashboard";
import { ProposalScoringAssessment } from "@/components/ProposalScoringAssessment";
import { CrossReferenceChecker } from "@/components/CrossReferenceChecker";
import { SectionEvaluatePanel } from "@/components/SectionEvaluatePanel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DuplicateProposalDialog } from "@/components/DuplicateProposalDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Section, BudgetType, ProposalStatus, WORK_PROGRAMMES, DESTINATIONS, PROPOSAL_STATUS_LABELS } from "@/types/proposal";
import type { WPSection, CaseSection } from "@/hooks/useProposalSections";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { format, differenceInDays, addDays } from "date-fns";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Eye,
  Calendar,
  ExternalLink,
  FileText,
  AlertTriangle,
  Clock,
  CheckCircle2,
  
  XCircle,
  Send,
  Copy,
  Users,
  BarChart3,
  Trophy,
  ThumbsDown,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePdfExport } from "@/hooks/usePdfExport";
import { useDocxExport } from "@/hooks/useDocxExport";
import type { ExportFormat } from "@/components/ExportDialog";
import { useCollaborativeCursors } from "@/hooks/useCollaborativeCursors";
import { useProposalData } from "@/hooks/useProposalData";
import { useProposalSections } from "@/hooks/useProposalSections";
import { useBudget } from "@/hooks/useBudget";
import { useAuth } from "@/hooks/useAuth";
import { useSectionAssignments } from "@/hooks/useSectionAssignments";
import { useUserRole } from "@/hooks/useUserRole";
import { useProposalOnboarding } from "@/hooks/useProposalOnboarding";
import { useSectionVisibility } from "@/hooks/useSectionVisibility";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { WPLeadershipInfo, CaseLeadershipInfo } from "@/components/ParticipantListView";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { ColoredAcronym } from "@/components/AcronymColorEditor";

export function ProposalEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { isOwner: isGlobalOwner } = useUserRole();
  const [activeSection, setActiveSection] = useState<Section | WPSection | CaseSection | null>(null);
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isDuplicateOpen, setIsDuplicateOpen] = useState(false);
  const [isAddParticipantOpen, setIsAddParticipantOpen] = useState(false);
  const [isSubmitConfirmOpen, setIsSubmitConfirmOpen] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [openPanel, setOpenPanel] = useState<'comments' | 'changes' | null>(null);
  const { exportToPdf, exportProposalToPdf } = usePdfExport();
  const { exportProposalToDocx } = useDocxExport();

  // Fetch proposal data from database
  const {
    proposal,
    participants,
    participantMembers,
    ethics,
    loading,
    isDraft,
    canEdit,
    isCoordinator,
    updateProposal,
    addParticipant,
    updateParticipant,
    deleteParticipant,
    reorderParticipants,
    addParticipantMember,
    updateParticipantMember,
    deleteParticipantMember,
    updateEthics,
  } = useProposalData(id || '');

  // Budget data
  const {
    budgetItems,
    budgetChanges,
    saving: budgetSaving,
    addBudgetItem,
    updateBudgetItem,
    deleteBudgetItem,
  } = useBudget(id || '');

  // Real-time presence for collaborators with cursor tracking
  const { collaborators } = useCollaborativeCursors({
    proposalId: id || '',
    currentSectionId: activeSection?.id || null,
  });

  // Dynamically load sections based on template type (or fallback to hardcoded)
  // Also pass proposalId to load WP drafts for navigation
  // Pass proposalLoaded (!loading) to prevent premature fallback to Stage 1 sections
  const { sections: allSections, loading: sectionsLoading } = useProposalSections(proposal?.templateTypeId || null, id, !loading);

  // Section assignments for sidebar indicators
  const { assignments } = useSectionAssignments(id || null);

  // First-access onboarding: welcome message + starter tasks
  useProposalOnboarding(id);

  // Fetch WP leadership data for participant table
  const { data: wpLeadershipData = [] } = useQuery({
    queryKey: ['wp-leadership', id],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase
        .from('wp_drafts')
        .select('id, number, short_name, lead_participant_id, color')
        .eq('proposal_id', id)
        .order('number');
      if (error) throw error;
      return data || [];
    },
    enabled: !!id,
  });

  // Compute WP leadership mapping: participantId -> WPs they lead
  const wpLeadership = useMemo(() => {
    const mapping: Record<string, WPLeadershipInfo[]> = {};
    for (const wp of wpLeadershipData) {
      if (wp.lead_participant_id) {
        if (!mapping[wp.lead_participant_id]) {
          mapping[wp.lead_participant_id] = [];
        }
        mapping[wp.lead_participant_id].push({
          wpNumber: wp.number,
          color: wp.color,
          shortName: wp.short_name || undefined,
        });
      }
    }
    return mapping;
  }, [wpLeadershipData]);

  // Fetch Case leadership data for participant table
  const { data: caseLeadershipData = [] } = useQuery({
    queryKey: ['case-leadership', id],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase
        .from('case_drafts')
        .select('id, number, short_name, lead_participant_id, color, case_type, custom_type_name')
        .eq('proposal_id', id)
        .order('number');
      if (error) throw error;
      return data || [];
    },
    enabled: !!id && !!proposal?.casesEnabled,
  });

  // Helper to get case prefix
  const getCasePrefix = (caseType: string, customTypeName: string | null): string => {
    if (caseType === 'other' && customTypeName) {
      return customTypeName.toUpperCase();
    }
    switch (caseType) {
      case 'case_study': return 'CS';
      case 'use_case': return 'UC';
      case 'living_lab': return 'LL';
      case 'pilot': return 'P';
      case 'demonstration': return 'D';
      default: return 'C';
    }
  };

  // Compute Case leadership mapping: participantId -> Cases they lead
  const caseLeadership = useMemo(() => {
    const mapping: Record<string, CaseLeadershipInfo[]> = {};
    for (const c of caseLeadershipData) {
      if (c.lead_participant_id) {
        if (!mapping[c.lead_participant_id]) {
          mapping[c.lead_participant_id] = [];
        }
        mapping[c.lead_participant_id].push({
          caseNumber: c.number,
          color: c.color,
          shortName: c.short_name || undefined,
          prefix: getCasePrefix(c.case_type, c.custom_type_name),
        });
      }
    }
    return mapping;
  }, [caseLeadershipData]);

  // Helper to find section by id
  const findSectionById = useCallback((sections: Section[], targetId: string): Section | undefined => {
    for (const section of sections) {
      if (section.id === targetId) return section;
      if (section.subsections) {
        const found = findSectionById(section.subsections, targetId);
        if (found) return found;
      }
    }
    return undefined;
  }, []);

  // React to URL search param changes (for notification navigation)
  useEffect(() => {
    if (sectionsLoading || allSections.length === 0) return;
    const urlSection = searchParams.get('section');
    const urlPanel = searchParams.get('panel') as 'comments' | 'changes' | null;
    if (!urlSection) return;
    
    const found = findSectionById(allSections, urlSection);
    if (found) {
      setActiveSection(found);
    }
    if (urlPanel) {
      setOpenPanel(urlPanel);
    }
    setSearchParams({}, { replace: true });
  }, [searchParams, allSections, sectionsLoading, findSectionById]);

  // Auto-select section on initial load: localStorage > A1
  useEffect(() => {
    if (!sectionsLoading && allSections.length > 0 && !activeSection) {
      // Check localStorage for last visited section
      const lastSectionId = localStorage.getItem(`proposal-${id}-lastSection`);
      if (lastSectionId) {
        const found = findSectionById(allSections, lastSectionId);
        if (found) {
          setActiveSection(found);
          return;
        }
      }

      // Default to A1
      const a1Section = findSectionById(allSections, 'a1');
      if (a1Section) {
        setActiveSection(a1Section);
      }
    }
  }, [allSections, sectionsLoading, activeSection, findSectionById]);

  // Dismiss any "creating proposal" toasts once proposal data has loaded
  useEffect(() => {
    if (!loading && proposal) {
      toast.dismiss();
    }
  }, [loading, proposal]);

  // Preserve scroll position when switching tabs/apps
  const scrollPositionRef = useRef<number>(0);
  
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Save scroll position when tab becomes hidden
        scrollPositionRef.current = window.scrollY;
      } else {
        // Restore scroll position when tab becomes visible
        // Use requestAnimationFrame to ensure DOM is ready
        requestAnimationFrame(() => {
          window.scrollTo(0, scrollPositionRef.current);
        });
      }
    };

    const handleBlur = () => {
      scrollPositionRef.current = window.scrollY;
    };

    const handleFocus = () => {
      requestAnimationFrame(() => {
        window.scrollTo(0, scrollPositionRef.current);
      });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const handleSectionClick = (section: Section | WPSection) => {
    // Clear selected participant when navigating to A2 overview or away from A2
    if (section.id === 'a2' || (!section.id.startsWith('a2-') && !section.id.startsWith('a3-'))) {
      setSelectedParticipantId(null);
    }
    // If clicking on a participant section, extract the ID
    if (section.id.startsWith('a2-')) {
      setSelectedParticipantId(section.id.replace('a2-', ''));
    }
    setActiveSection(section);
    // Persist last visited section
    if (id) localStorage.setItem(`proposal-${id}-lastSection`, section.id);
  };

  const handleBudgetTypeChange = (type: BudgetType) => {
    updateProposal({ budgetType: type });
  };

  const handleSubmit = async () => {
    await updateProposal({ status: 'submitted' as ProposalStatus });
  };

  const handleUpdateStatus = async (status: ProposalStatus) => {
    await updateProposal({ status });
  };

  const handleStatusChangeRequest = (newStatus: ProposalStatus) => {
    if (newStatus === 'submitted') {
      setIsSubmitConfirmOpen(true);
    } else {
      handleConfirmedStatusChange(newStatus);
    }
  };

  const handleConfirmedStatusChange = async (status: ProposalStatus) => {
    setUpdatingStatus(true);
    try {
      await updateProposal({ status });
      toast.success(`Status updated to ${PROPOSAL_STATUS_LABELS[status]}`);
    } catch (error) {
      toast.error('Failed to update status');
    } finally {
      setUpdatingStatus(false);
      setIsSubmitConfirmOpen(false);
    }
  };

  const handleExport = async (format: ExportFormat, includeWatermark: boolean) => {
    if (!proposal) return;
    
    // Fetch section contents
    const { data: sectionContents } = await import('@/integrations/supabase/client').then(
      ({ supabase }) => supabase.from('section_content').select('*').eq('proposal_id', id)
    );

    const exportData = {
      proposal: {
        ...proposal,
        members: [],
        sections: allSections,
      },
      sectionContents: (sectionContents || []).map((sc) => ({
        id: sc.id,
        sectionId: sc.section_id,
        content: sc.content || '',
      })),
      sections: allSections,
      participants: participants,
    };

    if (format === 'docx') {
      exportProposalToDocx(exportData, { includeWatermark });
    } else {
      exportProposalToPdf(exportData, { includeWatermark });
    }
  };

  const handleDuplicateProposal = async (newAcronym: string, newTitle: string) => {
    if (!proposal || !id) return;
    
    try {
      const { data: { session } } = await import('@/integrations/supabase/client').then(
        ({ supabase }) => supabase.auth.getSession()
      );
      
      if (!session) {
        toast.error('You must be logged in to duplicate a proposal');
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/duplicate-proposal`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            proposalId: id,
            newAcronym,
            newTitle,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to duplicate proposal');
      }

      toast.success(`Proposal "${newAcronym}" created as a draft. Redirecting...`);
      setTimeout(() => navigate('/dashboard'), 1500);
    } catch (error) {
      console.error('Error duplicating proposal:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to duplicate proposal');
    }
  };

  // Render the appropriate content based on section
  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex-1 flex items-center justify-center bg-muted/30">
          <div className="text-center space-y-4">
            <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
            <p className="text-lg font-medium text-foreground">Opening proposal…</p>
            <p className="text-sm text-muted-foreground">Loading sections and data</p>
          </div>
        </div>
      );
    }

    if (!activeSection) {
      return (
        <div className="flex-1 flex items-center justify-center bg-muted/30">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Eye className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-muted-foreground">Select a section</h3>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Choose a section from the navigation panel on the left
            </p>
          </div>
        </div>
      );
    }

    // Proposal management tools
    if (activeSection.id === 'messaging') {
      return (
        <div className="flex-1 overflow-y-auto">
          <ProposalMessagingBoard proposalId={id || ''} isCoordinator={isCoordinator} />
        </div>
      );
    }
    if (activeSection.id === 'task-allocator') {
      return (
        <div className="flex-1 overflow-y-auto p-6 bg-muted/30">
          <div className="max-w-7xl mx-auto space-y-6">
            <h1 className="text-xl font-bold text-foreground">Tasks & Workload</h1>
            <Tabs defaultValue="tasks">
              <TabsList>
                <TabsTrigger value="tasks">Tasks</TabsTrigger>
                <TabsTrigger value="workload">Workload</TabsTrigger>
              </TabsList>
              <TabsContent value="tasks">
                <ProposalTaskAllocator proposalId={id || ''} isCoordinator={isCoordinator} />
              </TabsContent>
              <TabsContent value="workload">
                <WorkloadDashboard proposalId={id || ''} />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      );
    }
    if (activeSection.id === 'part-b') {
      return (
        <div className="flex-1 overflow-y-auto p-6 bg-muted/30">
          <div className="max-w-7xl mx-auto space-y-6">
            <h1 className="text-xl font-bold text-foreground">Part B: Technical Description</h1>
            <Tabs defaultValue="scoring">
              <TabsList>
                <TabsTrigger value="scoring">Scoring</TabsTrigger>
                <TabsTrigger value="evaluate">Evaluate</TabsTrigger>
                <TabsTrigger value="cross-refs">Cross-references</TabsTrigger>
              </TabsList>
              <TabsContent value="scoring">
                <ProposalScoringAssessment proposalId={id || ''} />
              </TabsContent>
              <TabsContent value="evaluate">
                <SectionEvaluatePanel proposalId={id || ''} sections={allSections} />
              </TabsContent>
              <TabsContent value="cross-refs">
                <CrossReferenceChecker proposalId={id || ''} isOpen={true} onClose={() => {}} />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      );
    }
    if (activeSection.id === 'progress-tracker') {
      return (
        <div className="flex-1 overflow-y-auto">
          <ProposalProgressTracker
            proposalId={id || ''}
            isCoordinator={isCoordinator}
            sections={[]}
            onNavigateToWP={(wpId) => {
              const wpSection = allSections
                .flatMap(s => s.subsections || [])
                .find(s => s.id === `wp-${wpId}`) as WPSection | undefined;
              if (wpSection) {
                setActiveSection(wpSection);
              }
            }}
          />
        </div>
      );
    }
    if (activeSection.id === 'availability') {
      const proposalStart = proposal?.createdAt ? new Date(proposal.createdAt) : new Date();
      const proposalEnd = proposal?.deadline ? new Date(proposal.deadline) : addDays(proposalStart, 90);
      return (
        <AvailabilityGantt
          proposalId={id || ''}
          startDate={proposalStart}
          endDate={proposalEnd}
        />
      );
    }

    // Topic Information page
    if (activeSection.id === 'topic-info') {
      return (
        <div className="flex-1 overflow-y-auto">
          <TopicInformationPage
            proposalId={id || ''}
            proposal={proposal ? {
              ...proposal,
              members: [],
              sections: allSections,
            } : null}
            canEdit={canEdit && isCoordinator}
            isCoordinator={isCoordinator}
            onUpdateProposal={updateProposal}
            participants={participants}
            budgetItems={budgetItems.map((b) => ({
              amount: b.amount,
              participantId: b.participantId,
            }))}
          />
        </div>
      );
    }

    // Part A sections
    if (activeSection.isPartA) {
      // A1 - General Information (form-based) - matches "a1"
      // Only admins/owners can edit A1, but all users can view it
      if (activeSection.id === 'a1' || activeSection.id === 'general-info') {
        return (
          <div className="flex-1 overflow-y-auto">
            <GeneralInfoForm
              proposalId={id || ''}
              proposal={proposal ? {
                ...proposal,
                members: [],
                sections: allSections,
              } : null}
              section={activeSection}
              canEdit={canEdit && isCoordinator}
              isCoordinator={isCoordinator}
              onUpdateProposal={updateProposal}
              participants={participants}
              budgetItems={budgetItems.map((b) => ({
                amount: b.amount,
                participantId: b.participantId,
              }))}
              onExport={handleExport}
              onStatusChange={handleStatusChangeRequest}
              updatingStatus={updatingStatus}
              canChangeStatus={isGlobalOwner || isCoordinator}
            />
          </div>
        );
      }

      // A2 - Participants (list or detail view) - matches "a2" or "a2-{participantId}"
      if (activeSection.id === 'a2' || activeSection.id === 'participants') {
        // Check if a specific participant is selected (from navigation or state)
        if (selectedParticipantId) {
          const selectedParticipant = participants.find(p => p.id === selectedParticipantId);
          if (selectedParticipant) {
            // Admins/Owners can edit any participant, members can edit their own
            const userParticipantMembers = participantMembers.filter(m => m.userId === user?.id);
            const isUserMemberOfParticipant = userParticipantMembers.some(m => m.participantId === selectedParticipantId);
            // isAdmin already includes owner (owner || admin), so admins AND owners can edit any participant
            const canEditThisParticipant = canEdit;
            
            return (
              <div className="flex-1 overflow-y-auto">
                <ParticipantDetailForm
                  participant={selectedParticipant}
                  participantMembers={participantMembers}
                  allParticipants={participants.map(p => ({
                    id: p.id,
                    participant_number: p.participantNumber,
                    organisation_short_name: p.organisationShortName || null,
                    organisation_name: p.organisationName || '',
                  }))}
                  onUpdateParticipant={updateParticipant}
                  onDeleteParticipant={(id) => {
                    deleteParticipant(id);
                    setSelectedParticipantId(null);
                  }}
                  onAddMember={addParticipantMember}
                  onUpdateMember={updateParticipantMember}
                  onDeleteMember={deleteParticipantMember}
                  canEdit={canEditThisParticipant}
                  canDelete={canEdit}
                  canGrant={isGlobalOwner || isCoordinator}
                  proposalId={id}
                  proposalAcronym={proposal?.acronym}
                />
              </div>
            );
          }
        }

        // All users with proposal access can see all participants
        const visibleParticipants = participants;

        return (
          <div className="flex-1 overflow-y-auto">
            <ParticipantListView
              participants={visibleParticipants}
              proposalId={id || ''}
              proposalAcronym={proposal?.acronym || ''}
              section={activeSection}
              onSelectParticipant={(p) => setSelectedParticipantId(p.id)}
              onReorderParticipants={reorderParticipants}
              onMemberAdded={(member) => {
                addParticipantMember(member);
              }}
              onAddParticipant={async (participantData) => {
                await addParticipant({
                  ...participantData,
                  proposalId: id || '',
                  participantNumber: participants.length + 1,
                });
              }}
              onUpdateParticipant={updateParticipant}
              canInvite={canEdit}
              canReorder={canEdit && isCoordinator}
              canAddParticipant={canEdit}
              canEdit={canEdit}
              wpLeadership={wpLeadership}
              caseLeadership={caseLeadership}
            />
          </div>
        );
      }

      // Handle specific participant section (a2-{id})
      if (activeSection.id.startsWith('a2-')) {
        const participantId = activeSection.id.replace('a2-', '');
        const participant = participants.find(p => p.id === participantId);
        
        if (participant) {
          const userParticipantMembers = participantMembers.filter(m => m.userId === user?.id);
          const isUserMemberOfParticipant = userParticipantMembers.some(m => m.participantId === participantId);
          const canEditThisParticipant = canEdit;
          
          return (
            <div className="flex-1 overflow-y-auto">
              <ParticipantDetailForm
                participant={participant}
                participantMembers={participantMembers}
                allParticipants={participants.map(p => ({
                  id: p.id,
                  participant_number: p.participantNumber,
                  organisation_short_name: p.organisationShortName || null,
                  organisation_name: p.organisationName || '',
                }))}
                onUpdateParticipant={updateParticipant}
                onDeleteParticipant={(id) => {
                  deleteParticipant(id);
                  const a2Section = allSections.find(s => s.id === 'a2') || 
                    allSections.flatMap(s => s.subsections || []).find(s => s.id === 'a2');
                  if (a2Section) setActiveSection(a2Section);
                }}
                onAddMember={addParticipantMember}
                onUpdateMember={updateParticipantMember}
                onDeleteMember={deleteParticipantMember}
                canEdit={canEditThisParticipant}
                canDelete={canEdit}
                
                canGrant={isGlobalOwner || isCoordinator}
                proposalId={id}
                proposalAcronym={proposal?.acronym}
              />
            </div>
          );
        }
      }

      // Handle specific participant budget section (a3-{id})
      if (activeSection.id.startsWith('a3-')) {
        const participantId = activeSection.id.replace('a3-', '');
        return (
          <div className="flex-1 overflow-y-auto">
            <BudgetParticipantForm
              proposalId={id || ''}
              participantId={participantId}
              proposalType={proposal?.type || null}
              canEdit={canEdit}
              isCoordinator={isCoordinator}
            />
          </div>
        );
      }

      // A3 - Budget (overview) - matches "a3"
      if (activeSection.id === 'a3' || activeSection.id === 'budget') {
        return (
          <div className="flex-1 overflow-y-auto">
            <BudgetPortalSheet
              proposalId={id || ''}
              proposalType={proposal?.type || null}
              canEdit={canEdit}
              isCoordinator={isCoordinator}
            />
          </div>
        );
      }

      // A4 - Ethics & Security (form) - matches "a4"
      if (activeSection.id === 'a4' || activeSection.id === 'ethics') {
        return (
          <div className="flex-1 overflow-y-auto">
            <EthicsForm
              ethics={ethics}
              onUpdateEthics={updateEthics}
              canEdit={canEdit}
            />
          </div>
        );
      }

      // A5 - Other Questions (form) - matches "a5"
      if (activeSection.id === 'a5' || activeSection.id === 'other-questions') {
        return (
          <div className="flex-1 overflow-y-auto">
            <OtherQuestionsForm
              proposalId={id || ''}
              isTwoStageSecondStage={proposal?.isTwoStageSecondStage}
              canEdit={canEdit}
            />
          </div>
        );
      }


      // Default Part A fallback
      return (
        <DocumentEditor
          section={activeSection}
          proposalId={id || ''}
          proposalAcronym={proposal?.acronym || ''}
          proposalType={proposal?.type}
          topicTitle={proposal?.topicTitle}
          readOnly={!canEdit}
          topicId={proposal?.topicId}
          workProgramme={proposal?.workProgramme}
          destination={proposal?.destination}
           acronymSegments={(proposal as any)?.acronymSegments}
           openPanel={openPanel}
        />
      );
    }

    // Figures section
    if (activeSection.id === 'figures') {
      // Extract Part B leaf sections for figures (sections with actual content, not container sections)
      const getPartBLeafSections = (sections: Section[]): { id: string; number: string; label: string }[] => {
        const result: { id: string; number: string; label: string }[] = [];
        
        const traverse = (section: Section) => {
          // Skip Part A sections, figures section itself, and container sections like "Part B", "B1", "B2"
          if (section.isPartA || section.id === 'figures') return;
          
          // If this section has subsections that are content sections, it's a container - skip it but process children
          const hasContentSubsections = section.subsections?.some(sub => 
            sub.number && sub.number.match(/^B?\d+\.\d+/)
          );
          
          if (hasContentSubsections) {
            section.subsections?.forEach(traverse);
          } else if (section.number && section.number.match(/^B?\d+\.\d+/)) {
            // This is a leaf content section (e.g., B1.1, B2.1)
            // Convert section number like "B1.1" to internal ID like "1.1"
            const internalId = section.number.replace(/^B/, '');
            result.push({
              id: internalId,
              number: section.number.startsWith('B') ? section.number : `B${section.number}`,
              label: section.title,
            });
          } else if (section.subsections) {
            // Container without matching number pattern, traverse children
            section.subsections.forEach(traverse);
          }
        };
        
        sections.forEach(traverse);
        return result;
      };
      
      const partBSections = getPartBLeafSections(allSections);
      
      return (
        <div className="flex-1 overflow-y-auto">
          <FigureManager
            proposalId={id || ''}
            canEdit={canEdit}
            availableSections={partBSections}
          />
        </div>
      );
    }

    // Assignments section (legacy fallback)
    if (activeSection.id === 'assignments') {
      return (
        <div className="flex-1 overflow-y-auto">
          <SectionProgressDashboard
            proposalId={id || ''}
            proposalAcronym={proposal?.acronym}
            currentUserId={user?.id}
          />
        </div>
      );
    }

    // WP Drafts container section
    if (activeSection.id === 'wp-drafts') {
      const handleToggleCases = async (enabled: boolean) => {
        await supabase
          .from('proposals')
          .update({ cases_enabled: enabled })
          .eq('id', id);
        // Refetch proposal data
        window.location.reload();
      };
      
      return (
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <WPManagementCard
            proposalId={id || ''}
            isCoordinator={canEdit}
            isFullProposal={proposal?.submissionStage !== 'stage_1'}
          />
          <CaseManagementCard
            proposalId={id || ''}
            isCoordinator={canEdit && isCoordinator}
            casesEnabled={proposal?.casesEnabled || false}
            onToggleCases={handleToggleCases}
          />
        </div>
      );
    }


    // Individual Case Draft (case-{uuid})
    const caseSection = activeSection as CaseSection;
    if (activeSection.id.startsWith('case-') && caseSection.caseId) {
      return (
        <div className="flex-1 overflow-y-auto">
          <CaseDraftEditor
            caseId={caseSection.caseId}
            proposalId={id || ''}
            canEdit={canEdit}
            isCoordinator={isCoordinator}
          />
        </div>
      );
    }

    // Individual WP Draft editor (wp-{uuid})
    const wpSection = activeSection as WPSection;
    if (activeSection.id.startsWith('wp-') && wpSection.wpId) {
      return (
        <div className="flex-1 overflow-y-auto">
          <WPDraftEditor
            wpId={wpSection.wpId}
            proposalId={id || ''}
            canEdit={canEdit}
            projectDuration={proposal?.duration || 36}
          />
        </div>
      );
    }

    // Part B, B1, B2 are collapsible headings - navigation redirects to first child

    // Part B document sections - use rich text editor
    // Matches: "b1-1", "b1-2", "b2-1", etc.
    return (
      <DocumentEditor
        section={activeSection}
        proposalId={id || ''}
        proposalAcronym={proposal?.acronym || ''}
        proposalTitle={proposal?.title}
        proposalType={proposal?.type}
        topicTitle={proposal?.topicTitle}
        readOnly={!canEdit}
        topicId={proposal?.topicId}
        topicUrl={proposal?.topicUrl}
        workProgramme={proposal?.workProgramme}
        destination={proposal?.destination}
        acronymSegments={(proposal as any)?.acronymSegments}
        openPanel={openPanel}
      />
    );
  };

  // Get work programme and destination info
  const workProgramme = WORK_PROGRAMMES.find(wp => wp.id === proposal?.workProgramme);
  const destination = DESTINATIONS.find(d => d.id === proposal?.destination);

  // Combined status info with icons (matches dashboard)
  const getCombinedStatusInfo = () => {
    const status = proposal?.status;
    const deadline = proposal?.deadline;
    
    if (status === 'draft' && deadline) {
      const daysLeft = differenceInDays(new Date(deadline), new Date());
      
      if (daysLeft <= 28) {
        return {
          label: 'Draft – critical',
          days: daysLeft,
          icon: AlertTriangle,
          className: 'bg-red-500/15 text-red-600 border border-red-500/30',
          iconColor: 'text-red-600',
          alertBg: 'bg-red-500/10 border-b-red-500'
        };
      } else if (daysLeft <= 56) {
        return {
          label: 'Draft – due soon',
          days: daysLeft,
          icon: Clock,
          className: 'bg-orange-500/15 text-orange-600 border border-orange-500/30',
          iconColor: 'text-orange-600',
          alertBg: 'bg-orange-500/10 border-b-orange-500'
        };
      } else {
        return {
          label: 'Draft – on track',
          days: daysLeft,
          icon: CheckCircle2,
          className: 'bg-green-500/15 text-green-600 border border-green-500/30',
          iconColor: 'text-green-600',
          alertBg: 'bg-green-500/10 border-b-green-500'
        };
      }
    } else if (status === 'draft') {
      return {
        label: 'Draft',
        icon: Clock,
        className: 'bg-yellow-500/15 text-yellow-600 border border-yellow-500/30',
        iconColor: 'text-yellow-600',
        alertBg: 'bg-yellow-500/10 border-b-yellow-500'
      };
    } else if (status === 'submitted') {
      return {
        label: 'Under evaluation',
        icon: Send,
        className: 'bg-orange-500/15 text-orange-600 border border-orange-500/30',
        iconColor: 'text-orange-600',
        alertBg: 'bg-orange-500/10 border-b-orange-500'
      };
    } else if (status === 'funded') {
      return {
        label: 'Funded',
        icon: Trophy,
        className: 'bg-white text-green-600 border border-green-500/30',
        iconColor: 'text-green-600',
        alertBg: 'bg-green-500/10 border-b-green-500'
      };
    } else if (status === 'not_funded') {
      return {
        label: 'Not funded',
        icon: XCircle,
        className: 'bg-white text-red-600 border border-red-500/30',
        iconColor: 'text-red-600',
        alertBg: 'bg-red-500/10 border-b-red-500'
      };
    }
    
    return {
      label: status || 'Unknown',
      icon: Clock,
      className: 'bg-muted text-muted-foreground',
      iconColor: 'text-muted-foreground',
      alertBg: 'bg-muted/50 border-b-muted'
    };
  };

  const statusInfo = getCombinedStatusInfo();
  const StatusIcon = statusInfo.icon;

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <Header />
      {/* Proposal Top Bar */}
      <header className="h-10 border-b border-border bg-card/80 backdrop-blur-sm sticky top-10 z-40">
        <div className="h-full px-4 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0 flex-1 overflow-x-auto scrollbar-none">
            
            {/* Logo */}
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center overflow-hidden flex-shrink-0">
              {proposal?.logoUrl ? (
                <img src={proposal.logoUrl} alt={proposal.acronym} className="w-full h-full object-cover" />
              ) : (
                <FileText className="w-4 h-4 text-primary" />
              )}
            </div>
            
            {/* Acronym */}
            <h1 className="font-semibold flex items-center gap-1">
              {loading ? <Skeleton className="h-5 w-24" /> : (
                (proposal as any)?.acronymSegments?.length > 0 ? (
                  <ColoredAcronym segments={(proposal as any).acronymSegments} />
                ) : (
                  proposal?.acronym || 'Unknown'
                )
              )}
              {proposal?.submissionStage === 'stage_1' && <span className="font-normal text-muted-foreground text-sm"> (Stage 1)</span>}
            </h1>
            
            {/* Type */}
            {proposal?.type && (
              <span className="proposal-badge bg-white text-foreground border border-foreground text-[10px]">
                {proposal.type}
              </span>
            )}
            
            {/* Work Programme */}
            {workProgramme && (
              <span className="proposal-badge bg-gray-300 text-gray-700 text-[10px]" title={workProgramme.fullName}>
                {workProgramme.abbreviation}
              </span>
            )}
            
            {/* Destination */}
            {destination && (
              <span className="proposal-badge bg-gray-200 text-gray-600 text-[10px]" title={destination.fullName}>
                {destination.abbreviation}
              </span>
            )}
            
            {/* Status Badge */}
            {proposal && (
              <span className={`proposal-badge ${statusInfo.className} flex items-center gap-0.5 text-[10px]`}>
                <StatusIcon className="w-3 h-3" />
                {statusInfo.label}
                {statusInfo.days !== undefined && ` (${statusInfo.days}d)`}
              </span>
            )}
            
            {/* Topic Link */}
            {proposal && (
              proposal.topicUrl ? (
                <a 
                  href={proposal.topicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 h-5 px-1.5 text-[10px] font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground rounded-md transition-colors shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  Topic
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              ) : (
                <span className="inline-flex items-center gap-1 h-5 px-1.5 text-[10px] font-medium border border-input bg-muted text-muted-foreground rounded-md shrink-0 opacity-60 cursor-default">
                  Topic
                  <ExternalLink className="w-2.5 h-2.5" />
                </span>
              )
            )}
          </div>

          <div className="flex items-center gap-2">
            
            {/* Read-only indicator for non-draft proposals */}
            {!isDraft && (
              <Badge variant="outline" className="gap-1 bg-muted">
                <Eye className="w-3 h-3" />
                View Only
              </Badge>
            )}

            {/* Online collaborators from real-time presence */}
            <div className="hidden md:flex items-center gap-1 mr-2">
              {collaborators.map((collaborator, idx) => (
                <Tooltip key={collaborator.id}>
                  <TooltipTrigger asChild>
                    <div
                      className="w-7 h-7 rounded-full bg-primary/10 border-2 border-card flex items-center justify-center relative cursor-pointer"
                      style={{ marginLeft: idx > 0 ? '-8px' : 0, zIndex: 10 - idx }}
                    >
                      <span className="text-xs font-medium text-primary">
                        {collaborator.name.split(' ').map((n) => n[0]).join('').toUpperCase()}
                      </span>
                      <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-success border-2 border-card" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="font-medium">{collaborator.name}</p>
                    {collaborator.sectionId && (
                      <p className="text-xs text-muted-foreground">
                        Editing: {allSections.find(s => s.id === collaborator.sectionId)?.title || 'Unknown section'}
                      </p>
                    )}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>

            {/* Version history now section-specific in DocumentEditor */}
            {/* PDF export button removed from header - only available on Proposal Overview */}
          </div>
        </div>
      </header>




      {/* Main Content */}
      <div className="flex-1 flex min-h-0">
        {/* Sidebar - scrolls independently */}
        <aside
          className={cn(
            "border-r border-border bg-card flex flex-col transition-all duration-300 flex-shrink-0",
            isSidebarCollapsed ? "w-0 overflow-hidden" : "w-60"
          )}
        >
          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            <SectionNavigator
              sections={allSections}
              activeSectionId={selectedParticipantId ? `a2-${selectedParticipantId}` : (activeSection?.id || null)}
              onSectionClick={handleSectionClick}
              participants={participants}
              isCoordinator={isCoordinator}
              currentUserId={user?.id}
              participantMembers={participantMembers.map(m => ({ participantId: m.participantId, userId: m.userId }))}
              assignments={assignments}
              collaborators={collaborators}
            />
          </div>
        </aside>

        {/* Collapse Toggle */}
        <button
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="w-4 flex items-center justify-center bg-muted/50 hover:bg-muted transition-colors border-r border-border"
        >
          {isSidebarCollapsed ? (
            <ChevronRight className="w-3 h-3 text-muted-foreground" />
          ) : (
            <ChevronLeft className="w-3 h-3 text-muted-foreground" />
          )}
        </button>

        {/* Content Area - key resets scroll position on section change */}
        <main className="flex-1 flex flex-col min-h-0 overflow-hidden" key={activeSection?.id || 'none'}>
          {renderContent()}
        </main>
      </div>

      {/* Version History is now section-specific in DocumentEditor */}

      {/* Duplicate Proposal Dialog */}
      {proposal && (
        <DuplicateProposalDialog
          isOpen={isDuplicateOpen}
          onClose={() => setIsDuplicateOpen(false)}
          proposal={{
            ...proposal,
            members: [],
            sections: allSections,
          }}
          onDuplicate={handleDuplicateProposal}
        />
      )}

      {/* Submission Confirmation Dialog */}
      <AlertDialog open={isSubmitConfirmOpen} onOpenChange={setIsSubmitConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit proposal for evaluation?</AlertDialogTitle>
            <AlertDialogDescription>
              Changing the status to <strong>Under Evaluation</strong> will automatically downgrade all <strong>Editor</strong> roles on this proposal to <strong>Viewer</strong>. Editors will no longer be able to make changes.
              <br /><br />
              This action can be reversed by changing the status back to Draft.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleConfirmedStatusChange('submitted')}
              disabled={updatingStatus}
            >
              {updatingStatus && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirm submission
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
