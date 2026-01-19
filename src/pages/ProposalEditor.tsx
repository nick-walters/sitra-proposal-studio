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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Section, HORIZON_EUROPE_SECTIONS, PART_A_SECTIONS, BudgetType, ProposalStatus } from "@/types/proposal";
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePdfExport } from "@/hooks/usePdfExport";
import { useRealtimePresence } from "@/hooks/useRealtimePresence";
import { useProposalData } from "@/hooks/useProposalData";
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

  // Combine Part A and Part B sections
  const allSections = [...PART_A_SECTIONS, ...HORIZON_EUROPE_SECTIONS];

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
      switch (activeSection.id) {
        case 'summary':
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

        case 'admin-forms':
        case 'participant-info':
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

        case 'team-members':
          return (
            <WorkPackageManager
              proposalId={id || ''}
              participants={participants}
              participantMembers={participantMembers}
              canEdit={canEdit}
            />
          );

        case 'budget':
        case 'budget-overview':
        case 'budget-details':
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

        case 'ethics':
          return (
            <EthicsForm
              ethics={ethics}
              onUpdateEthics={updateEthics}
              canEdit={canEdit}
            />
          );

        case 'declarations':
          return (
            <DeclarationsForm
              participants={participants}
              proposalId={id || ''}
              canEdit={canEdit}
            />
          );

        default:
          return (
            <DocumentEditor
              section={activeSection}
              proposalId={id || ''}
              proposalAcronym={proposal?.acronym || ''}
            />
          );
      }
    }

    // Part B sections - use rich text editor
    return (
      <DocumentEditor
        section={activeSection}
        proposalId={id || ''}
        proposalAcronym={proposal?.acronym || ''}
      />
    );
  };

  const statusBadgeVariant = proposal?.status === 'draft' 
    ? 'default' 
    : proposal?.status === 'funded' 
      ? 'default' 
      : 'secondary';

  const statusLabel = {
    draft: 'Draft',
    submitted: 'Submitted',
    funded: 'Funded',
    not_funded: 'Not Funded',
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top Bar */}
      <header className="h-14 border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="h-full px-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <Separator orientation="vertical" className="h-6" />
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="proposal-badge-ria">
                {proposal?.type || 'RIA'}
              </Badge>
              <h1 className="font-semibold">{proposal?.acronym || 'Loading...'}</h1>
              <span className="text-muted-foreground hidden sm:inline">—</span>
              <span className="text-muted-foreground text-sm hidden sm:inline truncate max-w-[300px]">
                {proposal?.title || ''}
              </span>
              <Badge variant={statusBadgeVariant} className="ml-2">
                {proposal?.status ? statusLabel[proposal.status] : ''}
              </Badge>
            </div>
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

      {/* Read-only alert for non-draft proposals */}
      {!isDraft && (
        <Alert className="rounded-none border-x-0 border-t-0 bg-muted/50">
          <Lock className="h-4 w-4" />
          <AlertDescription>
            This proposal is {proposal?.status === 'submitted' ? 'submitted' : proposal?.status === 'funded' ? 'funded' : 'not funded'} and cannot be edited. 
            You can view all sections but editing is disabled.
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
    </div>
  );
}
