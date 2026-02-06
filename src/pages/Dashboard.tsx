import { Header } from "@/components/Header";
import { ProposalCard } from "@/components/ProposalCard";
import { ProposalTableView } from "@/components/ProposalTableView";
import { ProposalKanbanView } from "@/components/ProposalKanbanView";
import { CreateProposalDialog } from "@/components/CreateProposalDialog";
import { ProposalGridSkeleton, ProposalListSkeleton, ProposalTableSkeleton, ProposalKanbanSkeleton } from "@/components/ProposalCardSkeleton";
import { ProfileCompletionDialog } from "@/components/ProfileCompletionDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Proposal, ProposalType, ProposalStatus, BudgetType, SubmissionStage, HORIZON_EUROPE_SECTIONS, WORK_PROGRAMMES, DESTINATIONS, PROPOSAL_STATUS_LABELS, getDestinationsForWorkProgramme } from "@/types/proposal";
import { Plus, Search, LayoutGrid, List, X, Filter, Leaf, Brain, Zap, Wheat, Shield, Apple, Atom, HeartPulse, Table2, Columns3, AlertTriangle, Clock, CheckCircle2, Send, PartyPopper, XCircle } from "lucide-react";
import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useProfileCompletion } from "@/hooks/useProfileCompletion";
import { useProposalTemplateCreation } from "@/hooks/useProposalTemplateCreation";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import { differenceInDays } from "date-fns";

// Helper to get urgency level for a draft proposal
const getUrgencyLevel = (deadline: Date | undefined): string | null => {
  if (!deadline) return null;
  const daysLeft = differenceInDays(deadline, new Date());
  if (daysLeft <= 28) return 'critical';
  if (daysLeft <= 56) return 'due_soon';
  return 'on_track';
};

// Icon mapping for topic-focused icons
const topicIcons: Record<string, React.ReactNode> = {
  'GreenTech': <Leaf className="w-7 h-7 text-green-600" />,
  'HealthAI': <Brain className="w-7 h-7 text-purple-600" />,
  'CleanEnergy': <Zap className="w-7 h-7 text-yellow-600" />,
  'BioSmart': <Wheat className="w-7 h-7 text-amber-600" />,
  'CyberShield': <Shield className="w-7 h-7 text-blue-600" />,
  'FoodSafe': <Apple className="w-7 h-7 text-red-600" />,
  'QuantumNet': <Atom className="w-7 h-7 text-cyan-600" />,
  'HealthData': <HeartPulse className="w-7 h-7 text-pink-600" />,
};

// Sample data with varying urgency levels
const sampleProposals: Proposal[] = [
  {
    id: '1',
    acronym: 'GreenTech',
    title: 'Green technologies for sustainable urban development',
    type: 'RIA',
    budgetType: 'traditional',
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-01-20'),
    status: 'draft',
    workProgramme: 'CL5',
    destination: 'CL5-D2',
    deadline: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000), // 45 days - Priority
    topicUrl: 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/horizon-cl5-2024-d2-01-01',
    sections: HORIZON_EUROPE_SECTIONS,
    members: [
      { user: { id: '1', name: 'John Doe', email: 'john@example.com' }, role: 'admin' },
      { user: { id: '2', name: 'Jane Smith', email: 'jane@example.com' }, role: 'editor' },
      { user: { id: '3', name: 'Bob Wilson', email: 'bob@example.com' }, role: 'viewer' },
    ],
  },
  {
    id: '2',
    acronym: 'HealthAI',
    title: 'Artificial intelligence solutions for personalized healthcare',
    type: 'IA',
    budgetType: 'traditional',
    createdAt: new Date('2024-01-10'),
    updatedAt: new Date('2024-01-18'),
    status: 'submitted',
    workProgramme: 'CL1',
    destination: 'CL1-TOOL',
    deadline: new Date('2025-09-15'),
    submittedAt: new Date('2025-09-14'),
    topicUrl: 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/horizon-hlth-2024-tool-11-01',
    sections: HORIZON_EUROPE_SECTIONS,
    members: [
      { user: { id: '1', name: 'John Doe', email: 'john@example.com' }, role: 'editor' },
      { user: { id: '4', name: 'Alice Brown', email: 'alice@example.com' }, role: 'admin' },
    ],
  },
  {
    id: '3',
    acronym: 'CleanEnergy',
    title: 'Coordination network for clean energy transition in Europe',
    type: 'CSA',
    budgetType: 'lump_sum',
    createdAt: new Date('2024-01-05'),
    updatedAt: new Date('2024-01-12'),
    status: 'funded',
    workProgramme: 'CL5',
    destination: 'CL5-D3',
    deadline: new Date('2023-09-15'),
    submittedAt: new Date('2023-09-14'),
    decisionDate: new Date('2024-01-05'),
    topicUrl: 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/horizon-cl5-2024-d3-01-01',
    sections: HORIZON_EUROPE_SECTIONS,
    members: [
      { user: { id: '5', name: 'Chris Davis', email: 'chris@example.com' }, role: 'admin' },
      { user: { id: '1', name: 'John Doe', email: 'john@example.com' }, role: 'editor' },
      { user: { id: '6', name: 'Eva Martinez', email: 'eva@example.com' }, role: 'editor' },
      { user: { id: '7', name: 'Frank Lee', email: 'frank@example.com' }, role: 'viewer' },
      { user: { id: '8', name: 'Grace Chen', email: 'grace@example.com' }, role: 'viewer' },
    ],
  },
  {
    id: '4',
    acronym: 'BioSmart',
    title: 'Smart bioeconomy solutions for circular agriculture',
    type: 'RIA',
    budgetType: 'traditional',
    createdAt: new Date('2023-06-01'),
    updatedAt: new Date('2023-12-01'),
    status: 'not_funded',
    workProgramme: 'CL6',
    destination: 'CL6-CIRCBIO',
    deadline: new Date('2023-10-15'),
    submittedAt: new Date('2023-10-14'),
    decisionDate: new Date('2023-12-20'),
    topicUrl: 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/horizon-cl6-2024-circbio-01-01',
    sections: HORIZON_EUROPE_SECTIONS,
    members: [
      { user: { id: '1', name: 'John Doe', email: 'john@example.com' }, role: 'admin' },
    ],
  },
  {
    id: '5',
    acronym: 'CyberShield',
    title: 'Advanced cybersecurity framework for critical infrastructure',
    type: 'IA',
    budgetType: 'traditional',
    createdAt: new Date('2024-12-01'),
    updatedAt: new Date('2025-01-10'),
    status: 'draft',
    workProgramme: 'CL3',
    destination: 'CL3-CS',
    deadline: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 days - Critical
    topicUrl: 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/horizon-cl3-2024-cs-01-01',
    sections: HORIZON_EUROPE_SECTIONS,
    members: [
      { user: { id: '1', name: 'John Doe', email: 'john@example.com' }, role: 'admin' },
      { user: { id: '9', name: 'Sarah Kim', email: 'sarah@example.com' }, role: 'editor' },
    ],
  },
  {
    id: '6',
    acronym: 'FoodSafe',
    title: 'Innovative food safety monitoring systems',
    type: 'RIA',
    budgetType: 'traditional',
    createdAt: new Date('2024-11-15'),
    updatedAt: new Date('2025-01-05'),
    status: 'draft',
    workProgramme: 'CL6',
    destination: 'CL6-FARM2FORK',
    deadline: new Date(Date.now() + 85 * 24 * 60 * 60 * 1000), // 85 days - Upcoming
    topicUrl: 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/horizon-cl6-2024-farm2fork-01-4',
    sections: HORIZON_EUROPE_SECTIONS,
    members: [
      { user: { id: '10', name: 'Marco Rossi', email: 'marco@example.com' }, role: 'admin' },
      { user: { id: '1', name: 'John Doe', email: 'john@example.com' }, role: 'viewer' },
    ],
  },
  {
    id: '7',
    acronym: 'QuantumNet',
    title: 'Quantum communication networks for secure data transmission',
    type: 'RIA',
    budgetType: 'traditional',
    createdAt: new Date('2024-10-01'),
    updatedAt: new Date('2025-01-12'),
    status: 'draft',
    workProgramme: 'CL4',
    destination: 'CL4-DIGITAL-EMERGING',
    deadline: new Date('2026-10-15'), // On Track - autumn 2026
    topicUrl: 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/horizon-cl4-2024-digital-emerging-01-01',
    sections: HORIZON_EUROPE_SECTIONS,
    members: [
      { user: { id: '11', name: 'Lisa Zhang', email: 'lisa@example.com' }, role: 'admin' },
      { user: { id: '12', name: 'Tom Brown', email: 'tom@example.com' }, role: 'editor' },
      { user: { id: '1', name: 'John Doe', email: 'john@example.com' }, role: 'editor' },
    ],
  },
  {
    id: '8',
    acronym: 'HealthData',
    title: 'European Health Data Space integration platform',
    type: 'CSA',
    budgetType: 'lump_sum',
    createdAt: new Date('2024-08-01'),
    updatedAt: new Date('2024-11-20'),
    status: 'submitted',
    workProgramme: 'CL1',
    destination: 'CL1-CARE',
    deadline: new Date('2025-10-20'),
    submittedAt: new Date('2025-10-19'),
    topicUrl: 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/horizon-hlth-2024-care-06-01',
    sections: HORIZON_EUROPE_SECTIONS,
    members: [
      { user: { id: '13', name: 'Anna Mueller', email: 'anna@example.com' }, role: 'admin' },
      { user: { id: '14', name: 'Peter Schmidt', email: 'peter@example.com' }, role: 'editor' },
    ],
  },
  {
    id: '9',
    acronym: 'AquaSense',
    title: 'Smart water quality monitoring for urban water systems',
    type: 'RIA',
    budgetType: 'traditional',
    createdAt: new Date('2025-01-10'),
    updatedAt: new Date('2025-01-20'),
    status: 'draft',
    submissionStage: 'stage_1',
    workProgramme: 'CL6',
    destination: 'CL6-ZEROPOLLUTION',
    deadline: new Date('2026-01-15'), // Winter 2026 - Stage 1 proposal
    topicUrl: 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/horizon-cl6-2026-zeropollution-01-01',
    sections: HORIZON_EUROPE_SECTIONS,
    members: [
      { user: { id: '15', name: 'Henrik Larsson', email: 'henrik@example.com' }, role: 'admin' },
      { user: { id: '1', name: 'John Doe', email: 'john@example.com' }, role: 'editor' },
    ],
  },
];

export function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isComplete: isProfileComplete, isLoading: isProfileLoading, checkProfile } = useProfileCompletion();
  const { createProposalTemplate } = useProposalTemplateCreation();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [isLoadingProposals, setIsLoadingProposals] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'table' | 'kanban'>('grid');
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // Fetch proposals from database
  const fetchProposals = useCallback(async () => {
    if (!user) return;
    
    setIsLoadingProposals(true);
    try {
      const { data, error } = await supabase
        .from('proposals')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Transform database rows to Proposal type
      const transformedProposals: Proposal[] = (data || []).map(row => ({
        id: row.id,
        acronym: row.acronym,
        title: row.title,
        type: row.type as ProposalType,
        budgetType: row.budget_type as BudgetType,
        submissionStage: row.submission_stage as SubmissionStage,
        status: row.status as ProposalStatus,
        workProgramme: row.work_programme || undefined,
        destination: row.destination || undefined,
        topicUrl: row.topic_url || undefined,
        topicId: row.topic_id || undefined,
        topicTitle: row.topic_title || undefined,
        duration: row.duration || undefined,
        logoUrl: row.logo_url || undefined,
        totalBudget: row.total_budget || undefined,
        deadline: row.deadline ? new Date(row.deadline) : undefined,
        submittedAt: row.submitted_at ? new Date(row.submitted_at) : undefined,
        decisionDate: row.decision_date ? new Date(row.decision_date) : undefined,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
        description: row.description || undefined,
        sections: HORIZON_EUROPE_SECTIONS,
        members: [],
      }));

      setProposals(transformedProposals);
    } catch (error) {
      console.error('Error fetching proposals:', error);
      toast.error('Failed to load proposals');
    } finally {
      setIsLoadingProposals(false);
    }
  }, [user]);

  useEffect(() => {
    fetchProposals();
  }, [fetchProposals]);

  // Real-time subscription for proposals
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('proposals-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'proposals',
        },
        (payload) => {
          // Refetch proposals on any change
          fetchProposals();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchProposals]);
  
  // Multi-select filter states
  // Combined status filter: 'draft_critical', 'draft_due_soon', 'draft_on_track', 'submitted', 'funded', 'not_funded'
  const [combinedStatusFilters, setCombinedStatusFilters] = useState<Set<string>>(new Set());
  const [typeFilters, setTypeFilters] = useState<Set<ProposalType>>(new Set());
  const [stageFilters, setStageFilters] = useState<Set<string>>(new Set());
  const [wpFilters, setWpFilters] = useState<Set<string>>(new Set());
  const [destFilters, setDestFilters] = useState<Set<string>>(new Set());

  const toggleCombinedStatus = (status: string) => {
    setCombinedStatusFilters(prev => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

  // Helper to get the combined status key for a proposal
  const getCombinedStatusKey = (proposal: Proposal): string => {
    if (proposal.status === 'draft') {
      const urgency = getUrgencyLevel(proposal.deadline);
      return `draft_${urgency || 'no_deadline'}`;
    }
    return proposal.status;
  };

  // Check if user is Sitra staff (based on email domain)
  const isSitraStaff = user?.email?.endsWith('@sitra.fi') || user?.email?.endsWith('@sitra.dev') || false;

  // Get available destinations based on selected work programmes
  const availableDestinations = useMemo(() => {
    if (wpFilters.size === 0) return [];
    const destinations: typeof DESTINATIONS = [];
    wpFilters.forEach(wp => {
      destinations.push(...getDestinationsForWorkProgramme(wp));
    });
    return destinations;
  }, [wpFilters]);

  const toggleType = (type: ProposalType) => {
    setTypeFilters(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const toggleStage = (stage: string) => {
    setStageFilters(prev => {
      const next = new Set(prev);
      if (next.has(stage)) next.delete(stage);
      else next.add(stage);
      return next;
    });
  };

  const toggleWp = (wp: string) => {
    setWpFilters(prev => {
      const next = new Set(prev);
      if (next.has(wp)) {
        next.delete(wp);
        // Clear destinations for removed WP
        setDestFilters(prevDest => {
          const nextDest = new Set(prevDest);
          getDestinationsForWorkProgramme(wp).forEach(d => nextDest.delete(d.id));
          return nextDest;
        });
      } else {
        next.add(wp);
      }
      return next;
    });
  };

  const toggleDest = (dest: string) => {
    setDestFilters(prev => {
      const next = new Set(prev);
      if (next.has(dest)) next.delete(dest);
      else next.add(dest);
      return next;
    });
  };

  // Get urgency priority for sorting (lower = more urgent)
  const getUrgencyPriority = (proposal: Proposal): number => {
    if (proposal.status !== 'draft') return 999;
    const level = getUrgencyLevel(proposal.deadline);
    if (level === 'critical') return 0;
    if (level === 'due_soon') return 1;
    if (level === 'on_track') return 2;
    return 3; // No deadline
  };

  // Get status priority for sorting
  const getStatusPriority = (status: ProposalStatus): number => {
    switch (status) {
      case 'draft': return 0;
      case 'submitted': return 1;
      case 'funded': return 2;
      case 'not_funded': return 3;
      default: return 4;
    }
  };

  const filteredProposals = useMemo(() => {
    const filtered = proposals.filter((p) => {
      // Search filter
      const matchesSearch = 
        p.acronym.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.title.toLowerCase().includes(searchQuery.toLowerCase());
      
      // Combined status filter (empty = all)
      const proposalCombinedStatus = getCombinedStatusKey(p);
      const matchesCombinedStatus = combinedStatusFilters.size === 0 || combinedStatusFilters.has(proposalCombinedStatus);
      
      // Type filter (empty = all)
      const matchesType = typeFilters.size === 0 || typeFilters.has(p.type);
      
      // Stage filter (empty = all)
      const proposalStage = p.submissionStage === 'stage_1' ? 'stage_1' : 'full';
      const matchesStage = stageFilters.size === 0 || stageFilters.has(proposalStage);
      
      // Work Programme filter (empty = all)
      const matchesWp = wpFilters.size === 0 || (p.workProgramme && wpFilters.has(p.workProgramme));
      
      // Destination filter (empty = all)
      const matchesDest = destFilters.size === 0 || (p.destination && destFilters.has(p.destination));
      
      return matchesSearch && matchesCombinedStatus && matchesType && matchesStage && matchesWp && matchesDest;
    });

    // Sort: status priority → urgency (for drafts) → acronym alphabetically
    return filtered.sort((a, b) => {
      // First by status priority
      const statusDiff = getStatusPriority(a.status) - getStatusPriority(b.status);
      if (statusDiff !== 0) return statusDiff;

      // For drafts, sort by urgency
      if (a.status === 'draft' && b.status === 'draft') {
        const urgencyDiff = getUrgencyPriority(a) - getUrgencyPriority(b);
        if (urgencyDiff !== 0) return urgencyDiff;
      }

      // Then alphabetically by acronym
      return a.acronym.localeCompare(b.acronym);
    });
  }, [proposals, searchQuery, combinedStatusFilters, typeFilters, stageFilters, wpFilters, destFilters]);

  const activeFiltersCount = combinedStatusFilters.size + typeFilters.size + stageFilters.size + wpFilters.size + destFilters.size;

  const clearFilters = () => {
    setCombinedStatusFilters(new Set());
    setTypeFilters(new Set());
    setStageFilters(new Set());
    setWpFilters(new Set());
    setDestFilters(new Set());
    setSearchQuery('');
  };

  const handleCreateProposal = async (data: { 
    acronym: string; 
    title: string; 
    type: ProposalType;
    budgetType: BudgetType;
    submissionStage: SubmissionStage;
    workProgramme?: string;
    destination?: string;
    topicUrl?: string;
    deadline?: Date;
    templateTypeId?: string;
    usesFstp?: boolean;
    isTwoStageSecondStage?: boolean;
  }) => {
    if (!user) {
      toast.error('You must be logged in to create a proposal');
      return;
    }

    try {
      // Use RPC function to create proposal and assign role atomically
      const { data: newProposalId, error: proposalError } = await supabase
        .rpc('create_proposal_with_role', {
          p_acronym: data.acronym,
          p_title: data.title || data.acronym,
          p_type: data.type,
          p_budget_type: data.budgetType,
          p_submission_stage: data.submissionStage,
          p_work_programme: data.workProgramme || null,
          p_destination: data.destination || null,
          p_topic_url: data.topicUrl || null,
          p_deadline: data.deadline?.toISOString() || null,
          p_template_type_id: data.templateTypeId || null,
          p_uses_fstp: data.usesFstp || false,
        });

      if (proposalError) throw proposalError;

      // Update the is_two_stage_second_stage field if provided
      if (newProposalId && data.isTwoStageSecondStage !== undefined) {
        await supabase
          .from('proposals')
          .update({ is_two_stage_second_stage: data.isTwoStageSecondStage })
          .eq('id', newProposalId);
      }

      // If a template was selected, create the proposal template with copied sections
      if (data.templateTypeId && newProposalId) {
        const templateResult = await createProposalTemplate({
          proposalId: newProposalId,
          sourceTemplateTypeId: data.templateTypeId,
          budgetType: data.budgetType,
          actionType: data.type,
          submissionStage: data.submissionStage,
          workProgramme: data.workProgramme,
        });

        if (!templateResult.success) {
          console.warn('Failed to create proposal template:', templateResult.error);
          // Don't fail the whole operation, just warn
          toast.warning('Proposal created but template sections could not be loaded');
        }
      }

      toast.success('Proposal created successfully');
      
      // Refresh proposals list
      await fetchProposals();
      
      // Navigate to the new proposal
      if (newProposalId) {
        navigate(`/proposal/${newProposalId}`);
      }
    } catch (error: any) {
      console.error('Error creating proposal:', error);
      toast.error(error.message || 'Failed to create proposal');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Profile Completion Dialog - blocks interaction until profile is complete */}
      {!isProfileLoading && !isProfileComplete && (
        <ProfileCompletionDialog
          open={true}
          userId={user.id}
          userEmail={user.email || ''}
          onComplete={checkProfile}
        />
      )}

      <main className="container py-6">
        {/* Page Header with Search and Toggle */}
        <div className="flex flex-col gap-3 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="flex-shrink-0">
              <h1 className="page-title text-2xl text-foreground">My Proposals</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Edit proposal drafts or view previously submitted proposals
              </p>
            </div>
            
            {/* New Proposal button - visible on mobile at top */}
            {isSitraStaff && (
              <Button onClick={() => setIsCreateDialogOpen(true)} className="gap-2 w-full sm:w-auto" size="sm">
                <Plus className="w-4 h-4" />
                New Proposal
              </Button>
            )}
          </div>
          
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search proposals..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 w-48"
              />
            </div>

            {/* Filter Button with Popover - disabled for Kanban view */}
            <Popover open={isFilterOpen} onOpenChange={setIsFilterOpen}>
              <PopoverTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="gap-2 h-9"
                  disabled={viewMode === 'kanban'}
                >
                  <Filter className="w-4 h-4" />
                  {activeFiltersCount > 0 && viewMode !== 'kanban' && (
                    <span className="px-1.5 py-0.5 text-xs bg-primary text-primary-foreground rounded-full">
                      {activeFiltersCount}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-96 p-4" align="end">
                <h3 className="font-bold text-base mb-3">Filter</h3>
                <div className="space-y-4">
                  {/* Combined Status Section */}
                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm">Status</h4>
                    <div className="flex flex-wrap gap-2">
                      {(() => {
                        const draftProposals = proposals.filter(p => p.status === 'draft');
                        const criticalCount = draftProposals.filter(p => getUrgencyLevel(p.deadline) === 'critical').length;
                        const dueSoonCount = draftProposals.filter(p => getUrgencyLevel(p.deadline) === 'due_soon').length;
                        const onTrackCount = draftProposals.filter(p => getUrgencyLevel(p.deadline) === 'on_track').length;
                        const submittedCount = proposals.filter(p => p.status === 'submitted').length;
                        const fundedCount = proposals.filter(p => p.status === 'funded').length;
                        const notFundedCount = proposals.filter(p => p.status === 'not_funded').length;
                        
                        return (
                          <>
                            {/* Draft urgency categories */}
                            {criticalCount > 0 && (
                              <button
                                onClick={() => toggleCombinedStatus('draft_critical')}
                                className={`px-2.5 py-1 rounded-md transition-colors text-sm flex items-center gap-1 ${
                                  combinedStatusFilters.has('draft_critical') 
                                    ? 'bg-red-500 text-white' 
                                    : 'bg-red-500/15 text-red-600 border border-red-500/30 hover:bg-red-500/25'
                                }`}
                              >
                                <AlertTriangle className="w-3 h-3" />
                                <span className="font-bold">{criticalCount}</span>
                                <span>Draft – critical</span>
                              </button>
                            )}
                            {dueSoonCount > 0 && (
                              <button
                                onClick={() => toggleCombinedStatus('draft_due_soon')}
                                className={`px-2.5 py-1 rounded-md transition-colors text-sm flex items-center gap-1 ${
                                  combinedStatusFilters.has('draft_due_soon') 
                                    ? 'bg-orange-500 text-white' 
                                    : 'bg-orange-500/15 text-orange-600 border border-orange-500/30 hover:bg-orange-500/25'
                                }`}
                              >
                                <Clock className="w-3 h-3" />
                                <span className="font-bold">{dueSoonCount}</span>
                                <span>Draft – due soon</span>
                              </button>
                            )}
                            {onTrackCount > 0 && (
                              <button
                                onClick={() => toggleCombinedStatus('draft_on_track')}
                                className={`px-2.5 py-1 rounded-md transition-colors text-sm flex items-center gap-1 ${
                                  combinedStatusFilters.has('draft_on_track') 
                                    ? 'bg-green-500 text-white' 
                                    : 'bg-green-500/15 text-green-600 border border-green-500/30 hover:bg-green-500/25'
                                }`}
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                <span className="font-bold">{onTrackCount}</span>
                                <span>Draft – on track</span>
                              </button>
                            )}
                            {/* Under evaluation */}
                            {submittedCount > 0 && (
                              <button
                                onClick={() => toggleCombinedStatus('submitted')}
                                className={`px-2.5 py-1 rounded-md transition-colors text-sm flex items-center gap-1 ${
                                  combinedStatusFilters.has('submitted') 
                                    ? 'bg-orange-500 text-white' 
                                    : 'bg-orange-500/15 text-orange-600 border border-orange-500/30 hover:bg-orange-500/25'
                                }`}
                              >
                                <Send className="w-3 h-3" />
                                <span className="font-bold">{submittedCount}</span>
                                <span>Under evaluation</span>
                              </button>
                            )}
                            {/* Funded */}
                            {fundedCount > 0 && (
                              <button
                                onClick={() => toggleCombinedStatus('funded')}
                                className={`px-2.5 py-1 rounded-md transition-colors text-sm flex items-center gap-1 border ${
                                  combinedStatusFilters.has('funded') 
                                    ? 'bg-green-500 text-white border-green-500' 
                                    : 'bg-white text-green-600 border-green-500/30 hover:bg-green-50'
                                }`}
                              >
                                <PartyPopper className="w-3 h-3" />
                                <span className="font-bold">{fundedCount}</span>
                                <span>Funded</span>
                              </button>
                            )}
                            {/* Not funded */}
                            {notFundedCount > 0 && (
                              <button
                                onClick={() => toggleCombinedStatus('not_funded')}
                                className={`px-2.5 py-1 rounded-md transition-colors text-sm flex items-center gap-1 border ${
                                  combinedStatusFilters.has('not_funded') 
                                    ? 'bg-red-500 text-white border-red-500' 
                                    : 'bg-white text-red-600 border-red-500/30 hover:bg-red-50'
                                }`}
                              >
                                <XCircle className="w-3 h-3" />
                                <span className="font-bold">{notFundedCount}</span>
                                <span>Not funded</span>
                              </button>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Type of Action Section */}
                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm">Type of Action</h4>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => toggleType('RIA')}
                        className={`px-2.5 py-1 rounded-md transition-colors text-sm border ${typeFilters.has('RIA') ? 'bg-foreground text-background border-foreground' : 'bg-white text-foreground border-foreground hover:bg-gray-50'}`}
                      >
                        <span className="font-bold">{proposals.filter((p) => p.type === 'RIA').length}</span>
                        <span className="ml-1">RIA</span>
                      </button>
                      <button
                        onClick={() => toggleType('IA')}
                        className={`px-2.5 py-1 rounded-md transition-colors text-sm border ${typeFilters.has('IA') ? 'bg-foreground text-background border-foreground' : 'bg-white text-foreground border-foreground hover:bg-gray-50'}`}
                      >
                        <span className="font-bold">{proposals.filter((p) => p.type === 'IA').length}</span>
                        <span className="ml-1">IA</span>
                      </button>
                      <button
                        onClick={() => toggleType('CSA')}
                        className={`px-2.5 py-1 rounded-md transition-colors text-sm border ${typeFilters.has('CSA') ? 'bg-foreground text-background border-foreground' : 'bg-white text-foreground border-foreground hover:bg-gray-50'}`}
                      >
                        <span className="font-bold">{proposals.filter((p) => p.type === 'CSA').length}</span>
                        <span className="ml-1">CSA</span>
                      </button>
                    </div>
                  </div>

                  {/* Stage Section */}
                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm">Stage</h4>
                    <div className="flex flex-wrap gap-2">
                      {(() => {
                        const stage1Count = proposals.filter(p => p.submissionStage === 'stage_1').length;
                        const fullCount = proposals.filter(p => p.submissionStage !== 'stage_1').length;
                        return (
                          <>
                            {stage1Count > 0 && (
                              <button
                                onClick={() => toggleStage('stage_1')}
                                className={`px-2.5 py-1 rounded-md transition-colors text-sm border ${stageFilters.has('stage_1') ? 'bg-foreground text-background border-foreground' : 'bg-white text-foreground border-foreground hover:bg-gray-50'}`}
                              >
                                <span className="font-bold">{stage1Count}</span>
                                <span className="ml-1">Stage 1 of 2</span>
                              </button>
                            )}
                            {fullCount > 0 && (
                              <button
                                onClick={() => toggleStage('full')}
                                className={`px-2.5 py-1 rounded-md transition-colors text-sm border ${stageFilters.has('full') ? 'bg-foreground text-background border-foreground' : 'bg-white text-foreground border-foreground hover:bg-gray-50'}`}
                              >
                                <span className="font-bold">{fullCount}</span>
                                <span className="ml-1">Full proposal</span>
                              </button>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Work Programme & Destination Section */}
                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm">Work Programme & Destination</h4>
                    <div className="flex flex-wrap gap-2">
                      {WORK_PROGRAMMES.map(wp => {
                        const count = proposals.filter(p => p.workProgramme === wp.id).length;
                        if (count === 0) return null;
                        return (
                          <button
                            key={wp.id}
                            onClick={() => toggleWp(wp.id)}
                            className={`px-2.5 py-1 rounded-md transition-colors text-sm ${wpFilters.has(wp.id) ? 'bg-gray-500 text-white' : 'bg-gray-300 text-gray-700 hover:bg-gray-400'}`}
                          >
                            <span className="font-bold">{count}</span>
                            <span className="ml-1">{wp.abbreviation}</span>
                          </button>
                        );
                      })}
                    </div>
                    
                    {/* Destinations - shown when WP selected */}
                    {availableDestinations.length > 0 && (
                      <div className="mt-2 pt-2 border-t">
                        <div className="flex flex-wrap gap-2">
                          {availableDestinations.map(dest => {
                            const count = proposals.filter(p => p.destination === dest.id).length;
                            if (count === 0) return null;
                            return (
                              <button
                                key={dest.id}
                                onClick={() => toggleDest(dest.id)}
                                className={`px-2.5 py-1 rounded-md transition-colors text-sm ${destFilters.has(dest.id) ? 'bg-gray-400 text-white' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}
                              >
                                <span className="font-bold">{count}</span>
                                <span className="ml-1">{dest.abbreviation}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Clear Filters Button */}
                  {activeFiltersCount > 0 && (
                    <div className="pt-2 border-t">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={clearFilters}
                        className="w-full text-muted-foreground hover:text-foreground"
                      >
                        <X className="w-3 h-3 mr-1" />
                        Clear all filters ({activeFiltersCount})
                      </Button>
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
            
            <div className="flex items-center border rounded-md h-9">
              <Button
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                size="icon"
                className="h-8 w-8 rounded-r-none"
                onClick={() => setViewMode('grid')}
                title="Grid view"
              >
                <LayoutGrid className="w-4 h-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="icon"
                className="h-8 w-8 rounded-none border-x"
                onClick={() => setViewMode('list')}
                title="List view"
              >
                <List className="w-4 h-4" />
              </Button>
              <Button
                variant={viewMode === 'table' ? 'secondary' : 'ghost'}
                size="icon"
                className="h-8 w-8 rounded-none"
                onClick={() => setViewMode('table')}
                title="Table view"
              >
                <Table2 className="w-4 h-4" />
              </Button>
              <Button
                variant={viewMode === 'kanban' ? 'secondary' : 'ghost'}
                size="icon"
                className="h-8 w-8 rounded-l-none"
                onClick={() => setViewMode('kanban')}
                title="Kanban board"
              >
                <Columns3 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Proposals Views */}
        {isLoadingProposals ? (
          viewMode === 'table' ? (
            <ProposalTableSkeleton />
          ) : viewMode === 'kanban' ? (
            <ProposalKanbanSkeleton />
          ) : viewMode === 'list' ? (
            <ProposalListSkeleton />
          ) : (
            <ProposalGridSkeleton />
          )
        ) : filteredProposals.length > 0 ? (
          viewMode === 'table' ? (
            <ProposalTableView 
              proposals={filteredProposals}
              onProposalClick={(proposal) => navigate(`/proposal/${proposal.id}`)}
              topicIcons={topicIcons}
            />
          ) : viewMode === 'kanban' ? (
            <ProposalKanbanView 
              proposals={filteredProposals}
              onProposalClick={(proposal) => navigate(`/proposal/${proposal.id}`)}
              topicIcons={topicIcons}
            />
          ) : (
            <div className={viewMode === 'grid' ? 'grid gap-3 md:grid-cols-2 lg:grid-cols-3' : 'space-y-3'}>
              {filteredProposals.map((proposal) => (
                <ProposalCard
                  key={proposal.id}
                  proposal={proposal}
                  onClick={() => navigate(`/proposal/${proposal.id}`)}
                  compact={viewMode === 'list'}
                  topicIcon={topicIcons[proposal.acronym]}
                />
              ))}
            </div>
          )
        ) : (
          <div className="text-center py-12">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
              <Search className="w-6 h-6 text-muted-foreground" />
            </div>
            <h3 className="text-sm font-medium text-muted-foreground">No proposals found</h3>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Try adjusting your filters or create a new proposal
            </p>
          </div>
        )}
      </main>

      <CreateProposalDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onCreateProposal={handleCreateProposal}
      />
    </div>
  );
}
