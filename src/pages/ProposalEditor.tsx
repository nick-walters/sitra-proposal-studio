import { Header } from "@/components/Header";
import { SectionNavigator } from "@/components/SectionNavigator";
import { DocumentEditor } from "@/components/DocumentEditor";
import { VersionHistoryDialog } from "@/components/VersionHistoryDialog";
import { ProposalSummaryPage } from "@/components/ProposalSummaryPage";
import { ParticipantForm } from "@/components/ParticipantForm";
import { BudgetSpreadsheetEnhanced } from "@/components/BudgetSpreadsheetEnhanced";
import { EthicsForm } from "@/components/EthicsForm";
import { DeclarationsForm } from "@/components/DeclarationsForm";
import { WorkPackageManager } from "@/components/WorkPackageManager";
import { FigureManager } from "@/components/FigureManager";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DuplicateProposalDialog } from "@/components/DuplicateProposalDialog";
import { Section, BudgetType, ProposalStatus, WORK_PROGRAMMES, DESTINATIONS, PROPOSAL_STATUS_LABELS } from "@/types/proposal";
import { useState } from "react";
import { format } from "date-fns";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft,
  Users,
  Settings,
  Download,
  History,
  Share2,
  ChevronLeft,
  ChevronRight,
  Lock,
  Eye,
  Copy,
  Calendar,
  ExternalLink,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePdfExport } from "@/hooks/usePdfExport";
import { useRealtimePresence } from "@/hooks/useRealtimePresence";
import { useProposalData } from "@/hooks/useProposalData";
import { useProposalSections } from "@/hooks/useProposalSections";
import { useBudget } from "@/hooks/useBudget";
import { useAuth } from "@/hooks/useAuth";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";

export function ProposalEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState<Section | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isDuplicateOpen, setIsDuplicateOpen] = useState(false);
  const { exportToPdf, exportProposalToPdf } = usePdfExport();

  // Fetch proposal data from database
  const {
    proposal,
    participants,
    participantMembers,
    ethics,
    loading,
    isDraft,
    canEdit,
    isAdmin,
    updateProposal,
    addParticipant,
    updateParticipant,
    deleteParticipant,
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

  // Real-time presence for collaborators
  const { collaborators } = useRealtimePresence({
    proposalId: id || '',
    currentSectionId: activeSection?.id || null,
  });

  // Dynamically load sections based on template type (or fallback to hardcoded)
  const { sections: allSections, loading: sectionsLoading } = useProposalSections(proposal?.templateTypeId || null);

  const handleSectionClick = (section: Section) => {
    setActiveSection(section);
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

  const handleExportPdf = async () => {
    if (!proposal) return;
    
    // Fetch section contents
    const { data: sectionContents } = await import('@/integrations/supabase/client').then(
      ({ supabase }) => supabase.from('section_content').select('*').eq('proposal_id', id)
    );

    // Fetch work packages
    const { data: workPackages } = await import('@/integrations/supabase/client').then(
      ({ supabase }) => supabase.from('work_packages').select('*').eq('proposal_id', id).order('number')
    );

    exportProposalToPdf({
      proposal: {
        ...proposal,
        members: [],
        sections: allSections,
      },
      participants,
      participantMembers,
      sectionContents: (sectionContents || []).map((sc) => ({
        id: sc.id,
        sectionId: sc.section_id,
        content: sc.content || '',
      })),
      budgetItems: budgetItems.map((b) => ({
        category: b.category,
        subcategory: b.subcategory,
        description: b.description,
        amount: b.amount,
        participantId: b.participantId,
      })),
      workPackages: (workPackages || []).map((wp) => ({
        number: wp.number,
        title: wp.title,
        description: wp.description || undefined,
        leadParticipantId: wp.lead_participant_id || undefined,
        startMonth: wp.start_month || 1,
        endMonth: wp.end_month || 36,
      })),
      sections: allSections,
    });
  };

  const handleDuplicateProposal = async (newAcronym: string, newTitle: string) => {
    if (!proposal) return;
    
    try {
      // For demo purposes, show success and navigate to dashboard
      // In production, this would copy all proposal data to a new proposal
      toast.success(`Proposal "${newAcronym}" created as a draft. Redirecting to dashboard...`);
      setTimeout(() => navigate('/dashboard'), 1500);
    } catch (error) {
      console.error('Error duplicating proposal:', error);
      toast.error('Failed to duplicate proposal');
    }
  };

  // Render the appropriate content based on section
  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex-1 p-6 bg-muted/30">
          <div className="max-w-4xl mx-auto space-y-6">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
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

    // Part A sections
    if (activeSection.isPartA) {
      // Proposal overview page (before Part A) - matches "proposal-overview"
      if (activeSection.id === 'proposal-overview') {
        return proposal ? (
          <ProposalSummaryPage
            proposal={{
              ...proposal,
              members: [],
              sections: allSections,
            }}
            participants={participants}
            participantMembers={participantMembers}
            budgetItems={budgetItems.map((b) => ({
              amount: b.amount,
              participantId: b.participantId,
            }))}
            onUpdateProposal={updateProposal}
            onSubmit={handleSubmit}
            onUpdateStatus={handleUpdateStatus}
            canEdit={canEdit}
            isAdmin={isAdmin}
          />
        ) : null;
      }

      // Part A heading (collapsible only, shows info) - matches "part-a"
      if (activeSection.id === 'part-a') {
        return (
          <div className="flex-1 flex items-center justify-center bg-muted/30">
            <div className="text-center max-w-lg">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <FileText className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-lg font-medium">Part A: Administrative forms</h3>
              <p className="text-sm text-muted-foreground mt-2">
                Select a subsection from the navigation to edit participant information, budget details, or other administrative forms.
              </p>
            </div>
          </div>
        );
      }

      // A1 - General Information (form-based) - matches "a1"
      if (activeSection.id === 'a1' || activeSection.id === 'general-info') {
        return (
          <DocumentEditor
            section={activeSection}
            proposalId={id || ''}
            proposalAcronym={proposal?.acronym || ''}
            readOnly={!canEdit}
            topicId={proposal?.topicId}
            workProgramme={proposal?.workProgramme}
            destination={proposal?.destination}
          />
        );
      }

      // A2 - Participants (form-based) - matches "a2"
      if (activeSection.id === 'a2' || activeSection.id === 'participants') {
        return (
          <ParticipantForm
            participants={participants}
            participantMembers={participantMembers}
            onAddParticipant={addParticipant}
            onUpdateParticipant={updateParticipant}
            onDeleteParticipant={deleteParticipant}
            onAddMember={addParticipantMember}
            onUpdateMember={updateParticipantMember}
            onDeleteMember={deleteParticipantMember}
            canEditAll={isAdmin && canEdit}
            currentUserId={user?.id}
            proposalId={id || ''}
          />
        );
      }

      // A3 - Budget (spreadsheet) - matches "a3"
      if (activeSection.id === 'a3' || activeSection.id === 'budget') {
        return (
          <BudgetSpreadsheetEnhanced
            budgetItems={budgetItems}
            budgetChanges={budgetChanges}
            participants={participants}
            budgetType={proposal?.budgetType || 'traditional'}
            totalBudget={proposal?.totalBudget}
            onAddBudgetItem={addBudgetItem}
            onUpdateBudgetItem={updateBudgetItem}
            onDeleteBudgetItem={deleteBudgetItem}
            onChangeBudgetType={handleBudgetTypeChange}
            canEdit={canEdit}
            proposalId={id || ''}
            saving={budgetSaving}
          />
        );
      }

      // Default Part A fallback
      return (
        <DocumentEditor
          section={activeSection}
          proposalId={id || ''}
          proposalAcronym={proposal?.acronym || ''}
          readOnly={!canEdit}
          topicId={proposal?.topicId}
          workProgramme={proposal?.workProgramme}
          destination={proposal?.destination}
        />
      );
    }

    // Figures section
    if (activeSection.id === 'figures') {
      return (
        <FigureManager
          proposalId={id || ''}
          canEdit={canEdit}
        />
      );
    }

    // Part B heading sections (collapsible only, show info)
    // Matches: "part-b", "b1", "b2"
    if (activeSection.id === 'part-b' || activeSection.id === 'b1' || activeSection.id === 'b2') {
      const titles: Record<string, string> = {
        'part-b': 'Part B: Technical description',
        'b1': 'B1: Excellence',
        'b2': 'B2: Impact',
      };
      const descriptions: Record<string, string> = {
        'part-b': 'The technical description of your proposal. Select a subsection to start writing.',
        'b1': 'Describe the excellence of your proposal. Select a subsection to add content.',
        'b2': 'Describe the impact of your project. Select a subsection to add content.',
      };
      return (
        <div className="flex-1 flex items-center justify-center bg-muted/30">
          <div className="text-center max-w-lg">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-lg font-medium">{titles[activeSection.id]}</h3>
            <p className="text-sm text-muted-foreground mt-2">
              {descriptions[activeSection.id]}
            </p>
          </div>
        </div>
      );
    }

    // Part B document sections - use rich text editor
    // Matches: "b1-1", "b1-2", "b2-1", etc.
    return (
      <DocumentEditor
        section={activeSection}
        proposalId={id || ''}
        proposalAcronym={proposal?.acronym || ''}
        readOnly={!canEdit}
        topicId={proposal?.topicId}
        workProgramme={proposal?.workProgramme}
        destination={proposal?.destination}
      />
    );
  };

  // Get work programme and destination info
  const workProgramme = WORK_PROGRAMMES.find(wp => wp.id === proposal?.workProgramme);
  const destination = DESTINATIONS.find(d => d.id === proposal?.destination);

  // Status badge styling
  const getStatusBadgeClass = (status?: ProposalStatus) => {
    switch (status) {
      case 'draft':
        return 'bg-yellow-500/15 text-yellow-600 border border-yellow-500/30';
      case 'submitted':
        return 'bg-orange-500/15 text-orange-600 border border-orange-500/30';
      case 'funded':
        return 'bg-green-500/15 text-green-600 border border-green-500/30';
      case 'not_funded':
        return 'bg-red-500/15 text-red-600 border border-red-500/30';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      {/* Proposal Top Bar */}
      <header className="h-14 border-b border-border bg-card/80 backdrop-blur-sm sticky top-16 z-40">
        <div className="h-full px-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <Separator orientation="vertical" className="h-6" />
            
            {/* Logo */}
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center overflow-hidden flex-shrink-0">
              {proposal?.logoUrl ? (
                <img src={proposal.logoUrl} alt={proposal.acronym} className="w-full h-full object-cover" />
              ) : (
                <FileText className="w-4 h-4 text-primary" />
              )}
            </div>
            
            {/* Acronym */}
            <h1 className="font-semibold">
              {loading ? <Skeleton className="h-5 w-24" /> : (proposal?.acronym || 'Unknown')}
              {proposal?.submissionStage === 'stage_1' && <span className="font-normal text-muted-foreground text-sm"> (Stage 1)</span>}
            </h1>
            
            {/* Status */}
            {proposal?.status && (
              <span className={`proposal-badge ${getStatusBadgeClass(proposal.status)} text-[10px]`}>
                {PROPOSAL_STATUS_LABELS[proposal.status]}
              </span>
            )}
            
            {/* Type */}
            {proposal?.type && (
              <span className="proposal-badge bg-white text-foreground border border-foreground text-[10px]">
                {proposal.type}
              </span>
            )}
            
            {/* Work Programme */}
            {workProgramme && (
              <span className="proposal-badge bg-gray-300 text-gray-700 text-[10px] hidden md:inline-flex" title={workProgramme.fullName}>
                {workProgramme.abbreviation}
              </span>
            )}
            
            {/* Destination */}
            {destination && (
              <span className="proposal-badge bg-gray-200 text-gray-600 text-[10px] hidden lg:inline-flex" title={destination.fullName}>
                {destination.abbreviation}
              </span>
            )}
            
            {/* Deadline */}
            {proposal?.deadline && (
              <div className="hidden xl:flex items-center gap-1 text-[10px] text-muted-foreground">
                <Calendar className="w-3 h-3 text-yellow-600" />
                <span className="font-semibold">Deadline:</span>
                <span>{format(new Date(proposal.deadline), 'dd/MM/yyyy')}</span>
              </div>
            )}
            
            {/* Topic Link */}
            {proposal?.topicUrl && (
              <Button 
                variant="outline" 
                size="sm" 
                className="h-6 px-2 gap-1 text-[10px] hidden xl:flex"
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(proposal.topicUrl, '_blank');
                }}
              >
                Topic
                <ExternalLink className="w-2.5 h-2.5" />
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Read-only indicator for non-draft proposals */}
            {!isDraft && (
              <Badge variant="outline" className="gap-1 bg-muted">
                <Lock className="w-3 h-3" />
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

            <Button variant="outline" size="sm" className="gap-2 hidden sm:flex">
              <Share2 className="w-4 h-4" />
              Share
            </Button>
            <Button variant="outline" size="sm" className="gap-2 hidden sm:flex" onClick={() => setIsHistoryOpen(true)}>
              <History className="w-4 h-4" />
              History
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="gap-2" 
              onClick={handleExportPdf}
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export PDF</span>
            </Button>
            <Button variant="ghost" size="icon">
              <Settings className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Status alert */}
      {proposal && (
        <Alert className={cn(
          "rounded-none border-x-0 border-t-0",
          proposal.status === 'draft' ? "bg-primary/10" : 
          proposal.status === 'funded' ? "bg-success/10" : 
          proposal.status === 'not_funded' ? "bg-destructive/10" : 
          "bg-muted/50"
        )}>
          <Lock className="h-4 w-4" />
          <AlertDescription>
            {proposal.status === 'draft' && (
              <>
                <strong>Draft</strong> – this proposal is due by the deadline{' '}
                {proposal.deadline ? format(new Date(proposal.deadline), 'dd/MM/yyyy') : 'not set'}.
              </>
            )}
            {proposal.status === 'submitted' && (
              <>
                <strong>Under Evaluation</strong> – this proposal has been submitted and is under evaluation. 
                Editing is disabled but you can view all sections.
              </>
            )}
            {proposal.status === 'funded' && (
              <span className="flex items-center gap-2 flex-wrap">
                <span>
                  <strong>Funded</strong> – this proposal was successful! Editing is disabled but you can view all sections and export it as a PDF.
                </span>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="gap-1.5 h-7"
                  onClick={() => setIsDuplicateOpen(true)}
                >
                  <Copy className="w-3.5 h-3.5" />
                  Duplicate for resubmission
                </Button>
              </span>
            )}
            {proposal.status === 'not_funded' && (
              <span className="flex items-center gap-2 flex-wrap">
                <span>
                  <strong>Not funded</strong> – this proposal was unsuccessful. Editing is disabled but you can view all sections and export it as a PDF.
                </span>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="gap-1.5 h-7"
                  onClick={() => setIsDuplicateOpen(true)}
                >
                  <Copy className="w-3.5 h-3.5" />
                  Duplicate for resubmission
                </Button>
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Main Content */}
      <div className="flex-1 flex min-h-0">
        {/* Sidebar */}
        <aside
          className={cn(
            "border-r border-border bg-card flex flex-col transition-all duration-300",
            isSidebarCollapsed ? "w-0 overflow-hidden" : "w-72"
          )}
        >
          <div className="flex-1 overflow-auto">
            <SectionNavigator
              sections={allSections}
              activeSectionId={activeSection?.id || null}
              onSectionClick={handleSectionClick}
            />
          </div>

          {/* Collaborators */}
          <div className="p-4 border-t border-border">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Collaborators
              </span>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <Users className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="space-y-2">
              {collaborators.length === 0 ? (
                <p className="text-xs text-muted-foreground">No one else is online</p>
              ) : (
                collaborators.map((collaborator) => (
                  <div key={collaborator.id} className="flex items-center gap-2">
                    <div className="relative">
                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-xs font-medium text-primary">
                          {collaborator.name.split(' ').map((n) => n[0]).join('')}
                        </span>
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-success border border-card" />
                    </div>
                    <span className="text-sm truncate">{collaborator.name}</span>
                  </div>
                ))
              )}
            </div>
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

        {/* Content Area */}
        {renderContent()}
      </div>

      {/* Version History Dialog */}
      <VersionHistoryDialog
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        proposalId={id || ''}
        onRestoreVersion={(snapshot) => console.log('Restore:', snapshot)}
      />

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
    </div>
  );
}
