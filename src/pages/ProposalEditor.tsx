import { Header } from "@/components/Header";
import { StorageImage } from "@/components/StorageImage";
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
import { FigureManager } from "@/components/FigureManager";
import { WPDraftEditor } from "@/components/WPDraftEditor";
import { WPManagementCard } from "@/components/WPManagementCard";
import { SaveIndicator } from "@/components/SaveIndicator";

import { CaseManagementCard } from "@/components/CaseManagementCard";
import { ProposalMilestonesRisksManager } from "@/components/ProposalMilestonesRisksManager";
import { CaseDraftEditor } from "@/components/CaseDraftEditor";
import { WPProgressTracker } from "@/components/WPProgressTracker";
import { AvailabilityGantt } from "@/components/AvailabilityGantt";
import { ProposalMessagingBoard } from "@/components/ProposalMessagingBoard";
import { ProposalTaskAllocator } from "@/components/ProposalTaskAllocator";
import { ProposalProgressTracker } from "@/components/ProposalProgressTracker";
import { WorkloadDashboard } from "@/components/WorkloadDashboard";
import { ProposalBackupsPanel } from "@/components/ProposalBackupsPanel";
import { PanelEvaluator } from "@/components/PanelEvaluator";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";

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
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePdfExport } from "@/hooks/usePdfExport";
import { useDocxExport } from "@/hooks/useDocxExport";
import { ExportDialog, type ExportFormat } from "@/components/ExportDialog";
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
  
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isAddParticipantOpen, setIsAddParticipantOpen] = useState(false);
  const [isSubmitConfirmOpen, setIsSubmitConfirmOpen] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [openPanel, setOpenPanel] = useState<'comments' | 'changes' | null>(null);
  const [managerLastSaved, setManagerLastSaved] = useState<Date | null>(null);
  const handleManagerSaveEvent = useCallback(() => setManagerLastSaved(new Date()), []);
  const { exportProposalToPdf } = usePdfExport();
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
    refreshProposal,
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
  const { sections: allSections, loading: sectionsLoading } = useProposalSections(proposal?.templateTypeId || null, id, !loading, isCoordinator);

  // Section assignments for sidebar indicators
  const { assignments } = useSectionAssignments(id || null);

  // First-access onboarding: welcome message + starter tasks
  useProposalOnboarding(id);

  // Section visibility locks
  const { lockedSections, toggleLock: toggleSectionLock } = useSectionVisibility(id);

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
    if (caseType === 'other') {
      return customTypeName ? customTypeName.toUpperCase() : '';
    }
    switch (caseType) {
      case 'case_study': return 'CS';
      case 'use_case': return 'UC';
      case 'living_lab': return 'LL';
      case 'pilot': return 'P';
      case 'demonstration': return 'D';
      default: return '';
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
          prefix: getCaseTypePrefix(c.case_type, c.custom_type_name),
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

  const handleExport = async (format: ExportFormat) => {
    if (!proposal) return;
    
    // Fetch section contents
    const { data: sectionContents } = await supabase.from('section_content').select('*').eq('proposal_id', id);

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
      exportProposalToDocx(exportData);
    } else {
      exportProposalToPdf(exportData);
    }
  };


  // Render the appropriate content based on section.
  // Uses a dispatch map (static IDs) + prefix table (dynamic IDs) instead of a long if/else chain.
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

    // Default DocumentEditor for Part A unknown sections (no proposalTitle / topicUrl)
    const renderPartADefault = () => (
      <DocumentEditor
        section={activeSection}
        proposalId={id || ''}
        proposalAcronym={proposal?.acronym || ''}
        proposalType={proposal?.type}
        topicTitle={proposal?.topicTitle}
        readOnly={!canEdit}
        submissionStage={proposal?.submissionStage}
        topicId={proposal?.topicId}
        workProgramme={proposal?.workProgramme}
        destination={proposal?.destination}
        allSections={allSections}
        acronymSegments={(proposal as any)?.acronymSegments}
        openPanel={openPanel}
      />
    );

    // Default DocumentEditor for Part B leaf sections (b1-1, b2-1, b3-1, …)
    const renderPartBDefault = () => (
      <DocumentEditor
        section={activeSection}
        proposalId={id || ''}
        proposalAcronym={proposal?.acronym || ''}
        proposalTitle={proposal?.title}
        proposalType={proposal?.type}
        topicTitle={proposal?.topicTitle}
        readOnly={!canEdit}
        submissionStage={proposal?.submissionStage}
        topicId={proposal?.topicId}
        topicUrl={proposal?.topicUrl}
        workProgramme={proposal?.workProgramme}
        destination={proposal?.destination}
        allSections={allSections}
        acronymSegments={(proposal as any)?.acronymSegments}
        openPanel={openPanel}
      />
    );

    type Renderer = () => React.ReactNode;

    // ── Static dispatch: exact ID → component ────────────────────────────────
    const staticDispatch: Record<string, Renderer> = {
      'messaging': () => (
        <div className="flex-1 overflow-y-auto">
          <ProposalMessagingBoard proposalId={id || ''} isCoordinator={isCoordinator} />
        </div>
      ),
      'backups': () => {
        if (!isCoordinator) {
          return (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              Backups are only visible to coordinators &amp; admins.
            </div>
          );
        }
        return (
          <div className="flex-1 overflow-y-auto">
            <ProposalBackupsPanel proposalId={id || ''} />
          </div>
        );
      },
      'task-allocator': () => (
        <div className="flex-1 overflow-y-auto p-6 bg-muted/30">
          <div className="max-w-7xl mx-auto space-y-6">
            <h1 className="text-xl font-bold text-foreground">Assignments & Workload</h1>
            <Tabs defaultValue="tasks">
              <TabsList>
                <TabsTrigger value="tasks">Assignments</TabsTrigger>
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
      ),
      'part-b': () => (
        <div className="flex-1 overflow-y-auto p-6 bg-muted/30">
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-bold text-foreground">Part B: Technical Description</h1>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => {
                  if (isCoordinator) {
                    setIsExportOpen(true);
                  } else {
                    handleExport('pdf');
                  }
                }}
              >
                <Download className="h-4 w-4" />
                Export part B
              </Button>
            </div>
            {isCoordinator && <PanelEvaluator proposalId={id || ''} />}
          </div>
        </div>
      ),
      'progress-tracker': () => (
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
      ),
      'availability': () => {
        const proposalStart = proposal?.createdAt ? new Date(proposal.createdAt) : new Date();
        const proposalEnd = proposal?.deadline ? new Date(proposal.deadline) : addDays(proposalStart, 90);
        return (
          <AvailabilityGantt
            proposalId={id || ''}
            startDate={proposalStart}
            endDate={proposalEnd}
          />
        );
      },
      'topic-info': () => (
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
      ),
      'a1': () => (
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
      ),
      'a2': () => {
        // Specific participant selected → detail view
        if (selectedParticipantId) {
          const selectedParticipant = participants.find(p => p.id === selectedParticipantId);
          if (selectedParticipant) {
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
                  proposalType={proposal?.type}
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
      },
      'a3': () => {
        return (
        <div className="flex-1 overflow-y-auto">
          <BudgetPortalSheet
            proposalId={id || ''}
            proposalType={proposal?.type || null}
            canEdit={canEdit}
            isCoordinator={isCoordinator}
            usesFstp={proposal?.usesFstp}
            fstpType={(proposal as any)?.fstpType || 'grant'}
            proposalAcronym={proposal?.acronym || ''}
            onNavigateToParticipantBudget={(participantId) => {
              handleSectionClick({ id: `a3-${participantId}`, title: 'Budget', isPartA: true } as any);
            }}
          />
        </div>
        );
      },
      'a4': () => (
        <div className="flex-1 overflow-y-auto">
          <EthicsForm
            ethics={ethics}
            onUpdateEthics={updateEthics}
            canEdit={canEdit}
          />
        </div>
      ),
      'a5': () => (
        <div className="flex-1 overflow-y-auto">
          <OtherQuestionsForm
            proposalId={id || ''}
            isTwoStageSecondStage={proposal?.isTwoStageSecondStage}
            canEdit={canEdit}
          />
        </div>
      ),
      'figures': () => {
        // Extract Part B leaf sections for figures
        const getPartBLeafSections = (sections: Section[]): { id: string; number: string; label: string }[] => {
          const result: { id: string; number: string; label: string }[] = [];
          const traverse = (section: Section) => {
            if (section.isPartA || section.id === 'figures') return;
            const hasContentSubsections = section.subsections?.some(sub =>
              sub.number && sub.number.match(/^B?\d+\.\d+/)
            );
            if (hasContentSubsections) {
              section.subsections?.forEach(traverse);
            } else if (section.number && section.number.match(/^B?\d+\.\d+/)) {
              const internalId = section.number.replace(/^B/, '');
              result.push({
                id: internalId,
                number: section.number.startsWith('B') ? section.number : `B${section.number}`,
                label: section.title,
              });
            } else if (section.subsections) {
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
      },
      'wp-drafts': () => {
        const handleToggleCases = async (enabled: boolean) => {
          await supabase
            .from('proposals')
            .update({ cases_enabled: enabled })
            .eq('id', id);
          await refreshProposal();
        };
        return (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="space-y-2">
              <h1 className="text-xl font-bold text-foreground">WP/case manager & drafts</h1>
              <div className="flex items-center gap-3">
                <SaveIndicator saving={false} lastSaved={managerLastSaved} onSaveNow={handleManagerSaveEvent} />
              </div>
            </div>
            <WPManagementCard
              proposalId={id || ''}
              isCoordinator={canEdit && isCoordinator}
              isFullProposal={proposal?.submissionStage !== 'stage_1'}
              onDraftVisibilityChange={refreshProposal}
              onSaveEvent={handleManagerSaveEvent}
            />
            <CaseManagementCard
              proposalId={id || ''}
              isCoordinator={canEdit && isCoordinator}
              casesEnabled={proposal?.casesEnabled || false}
              onToggleCases={handleToggleCases}
              onSaveEvent={handleManagerSaveEvent}
            />
          </div>
        );
      },
      'milestones-risks': () => (
        <div className="flex-1 overflow-y-auto">
          <ProposalMilestonesRisksManager proposalId={id || ''} canEdit={canEdit} projectDuration={proposal?.duration || 36} />
        </div>
      ),
    };


    // ── Prefix dispatch: ID startsWith → component (returning null falls through) ─
    type PrefixHandler = { prefix: string; render: (sectionId: string) => React.ReactNode };
    const prefixDispatch: PrefixHandler[] = [
      {
        prefix: 'a2-',
        render: (sid) => {
          const participantId = sid.replace('a2-', '');
          const participant = participants.find(p => p.id === participantId);
          if (!participant) return null; // fall through to Part A default
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
                proposalType={proposal?.type}
              />
            </div>
          );
        },
      },
      {
        prefix: 'a3-',
        render: (sid) => {
          const participantId = sid.replace('a3-', '');
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
        },
      },
      {
        prefix: 'case-',
        render: () => {
          const caseSection = activeSection as CaseSection;
          if (!caseSection.caseId) return null;
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
        },
      },
      {
        prefix: 'wp-',
        render: () => {
          const wpSection = activeSection as WPSection;
          if (!wpSection.wpId) return null;
          return (
            <div className="flex-1 overflow-y-auto">
              <WPDraftEditor
                wpId={wpSection.wpId}
                proposalId={id || ''}
                canEdit={canEdit}
                isCoordinator={isCoordinator}
                projectDuration={proposal?.duration || 36}
              />
            </div>
          );
        },
      },
    ];

    const sectionId = activeSection.id;

    // 1. Static dispatch (exact ID match)
    const staticEntry = staticDispatch[sectionId];
    if (staticEntry) return staticEntry();

    // 2. Prefix dispatch (dynamic IDs)
    for (const { prefix, render } of prefixDispatch) {
      if (sectionId.startsWith(prefix)) {
        const result = render(sectionId);
        if (result !== null && result !== undefined) return result;
      }
    }

    // 3. Default fallback: Part A → Part A DocumentEditor; otherwise Part B DocumentEditor
    if (activeSection.isPartA) return renderPartADefault();
    return renderPartBDefault();
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
    <div className="h-dvh bg-background flex flex-col overflow-hidden">
      <Header />
      {/* Proposal Top Bar */}
      <header className="h-10 border-b border-border bg-card/80 backdrop-blur-sm sticky top-10 z-40">
        <div className="h-full px-4 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0 flex-1 overflow-x-auto scrollbar-none">
            
            {/* Logo */}
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center overflow-hidden flex-shrink-0">
              {proposal?.logoUrl ? (
                <StorageImage storedPath={proposal.logoUrl} alt={proposal.acronym} className="w-full h-full object-cover" />
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
            
            {/* Work programme */}
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
              lockedSections={lockedSections}
              onToggleLock={toggleSectionLock}
              wpDraftsVisible={proposal?.wpDraftsVisible !== false}
              caseDraftsVisible={proposal?.caseDraftsVisible !== false}
            />
          </div>

          {/* Export Part B Dialog (opened from left panel) */}
          {isCoordinator && proposal && (
            <ExportDialog
              open={isExportOpen}
              onOpenChange={setIsExportOpen}
              onExport={handleExport}
              proposalId={proposal.id}
            />
          )}
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

        {/* Content Area */}
        <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {renderContent()}
        </main>
      </div>

      {/* Version History is now section-specific in DocumentEditor */}


      {/* Submission Confirmation Dialog */}
      <AlertDialog open={isSubmitConfirmOpen} onOpenChange={setIsSubmitConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit proposal for evaluation?</AlertDialogTitle>
            <AlertDialogDescription>
              Changing the status to <strong>Under evaluation</strong> will automatically downgrade all <strong>Editor</strong> roles on this proposal to <strong>Viewer</strong>. Editors will no longer be able to make changes.
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
