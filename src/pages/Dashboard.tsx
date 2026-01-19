import { Header } from "@/components/Header";
import { ProposalCard } from "@/components/ProposalCard";
import { CreateProposalDialog } from "@/components/CreateProposalDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Proposal, ProposalType, ProposalStatus, HORIZON_EUROPE_SECTIONS, WORK_PROGRAMMES, DESTINATIONS, PROPOSAL_STATUS_LABELS, getDestinationsForWorkProgramme } from "@/types/proposal";
import { Plus, Search, LayoutGrid, List, X } from "lucide-react";
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

import { differenceInDays } from "date-fns";

// Helper to get urgency level for a draft proposal
const getUrgencyLevel = (deadline: Date | undefined): string | null => {
  if (!deadline) return null;
  const daysLeft = differenceInDays(deadline, new Date());
  if (daysLeft <= 28) return 'critical';
  if (daysLeft <= 56) return 'urgent';
  if (daysLeft <= 112) return 'approaching';
  return 'on_track';
};

// Sample data with varying urgency levels
const sampleProposals: Proposal[] = [
  {
    id: '1',
    acronym: 'GREENTECH',
    title: 'Green Technologies for Sustainable Urban Development',
    type: 'RIA',
    budgetType: 'traditional',
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-01-20'),
    status: 'draft',
    workProgramme: 'CL5',
    destination: 'CL5-D2',
    deadline: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000), // 45 days - Urgent
    sections: HORIZON_EUROPE_SECTIONS,
    members: [
      { user: { id: '1', name: 'John Doe', email: 'john@example.com' }, role: 'admin' },
      { user: { id: '2', name: 'Jane Smith', email: 'jane@example.com' }, role: 'editor' },
      { user: { id: '3', name: 'Bob Wilson', email: 'bob@example.com' }, role: 'viewer' },
    ],
  },
  {
    id: '2',
    acronym: 'AIHEALTH',
    title: 'Artificial Intelligence Solutions for Personalized Healthcare',
    type: 'IA',
    budgetType: 'traditional',
    createdAt: new Date('2024-01-10'),
    updatedAt: new Date('2024-01-18'),
    status: 'submitted',
    workProgramme: 'CL1',
    destination: 'CL1-TOOL',
    deadline: new Date('2024-03-01'),
    submittedAt: new Date('2024-02-28'),
    sections: HORIZON_EUROPE_SECTIONS,
    members: [
      { user: { id: '1', name: 'John Doe', email: 'john@example.com' }, role: 'editor' },
      { user: { id: '4', name: 'Alice Brown', email: 'alice@example.com' }, role: 'admin' },
    ],
  },
  {
    id: '3',
    acronym: 'CLEANENERGY',
    title: 'Coordination Network for Clean Energy Transition in Europe',
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
    acronym: 'BIOSMART',
    title: 'Smart Bioeconomy Solutions for Circular Agriculture',
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
    sections: HORIZON_EUROPE_SECTIONS,
    members: [
      { user: { id: '1', name: 'John Doe', email: 'john@example.com' }, role: 'admin' },
    ],
  },
  {
    id: '5',
    acronym: 'CYBERSHIELD',
    title: 'Advanced Cybersecurity Framework for Critical Infrastructure',
    type: 'IA',
    budgetType: 'traditional',
    createdAt: new Date('2024-12-01'),
    updatedAt: new Date('2025-01-10'),
    status: 'draft',
    workProgramme: 'CL3',
    destination: 'CL3-CYBER',
    deadline: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 days - Critical
    sections: HORIZON_EUROPE_SECTIONS,
    members: [
      { user: { id: '1', name: 'John Doe', email: 'john@example.com' }, role: 'admin' },
      { user: { id: '9', name: 'Sarah Kim', email: 'sarah@example.com' }, role: 'editor' },
    ],
  },
  {
    id: '6',
    acronym: 'FOODSAFE',
    title: 'Innovative Food Safety Monitoring Systems',
    type: 'RIA',
    budgetType: 'traditional',
    createdAt: new Date('2024-11-15'),
    updatedAt: new Date('2025-01-05'),
    status: 'draft',
    workProgramme: 'CL6',
    destination: 'CL6-FARM2FORK',
    deadline: new Date(Date.now() + 85 * 24 * 60 * 60 * 1000), // 85 days - Approaching
    sections: HORIZON_EUROPE_SECTIONS,
    members: [
      { user: { id: '10', name: 'Marco Rossi', email: 'marco@example.com' }, role: 'admin' },
      { user: { id: '1', name: 'John Doe', email: 'john@example.com' }, role: 'viewer' },
    ],
  },
  {
    id: '7',
    acronym: 'QUANTUMNET',
    title: 'Quantum Communication Networks for Secure Data Transmission',
    type: 'RIA',
    budgetType: 'traditional',
    createdAt: new Date('2024-10-01'),
    updatedAt: new Date('2025-01-12'),
    status: 'draft',
    workProgramme: 'CL4',
    destination: 'CL4-DIGITAL',
    deadline: new Date(Date.now() + 150 * 24 * 60 * 60 * 1000), // 150 days - On Track
    sections: HORIZON_EUROPE_SECTIONS,
    members: [
      { user: { id: '11', name: 'Lisa Zhang', email: 'lisa@example.com' }, role: 'admin' },
      { user: { id: '12', name: 'Tom Brown', email: 'tom@example.com' }, role: 'editor' },
      { user: { id: '1', name: 'John Doe', email: 'john@example.com' }, role: 'editor' },
    ],
  },
  {
    id: '8',
    acronym: 'HEALTHDATA',
    title: 'European Health Data Space Integration Platform',
    type: 'CSA',
    budgetType: 'lump_sum',
    createdAt: new Date('2024-08-01'),
    updatedAt: new Date('2024-11-20'),
    status: 'submitted',
    workProgramme: 'CL1',
    destination: 'CL1-CARE',
    deadline: new Date('2024-11-15'),
    submittedAt: new Date('2024-11-14'),
    sections: HORIZON_EUROPE_SECTIONS,
    members: [
      { user: { id: '13', name: 'Anna Mueller', email: 'anna@example.com' }, role: 'admin' },
      { user: { id: '14', name: 'Peter Schmidt', email: 'peter@example.com' }, role: 'editor' },
    ],
  },
];

export function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [proposals, setProposals] = useState<Proposal[]>(sampleProposals);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  // Multi-select filter states
  const [statusFilters, setStatusFilters] = useState<Set<ProposalStatus>>(new Set());
  const [typeFilters, setTypeFilters] = useState<Set<ProposalType>>(new Set());
  const [wpFilters, setWpFilters] = useState<Set<string>>(new Set());
  const [destFilters, setDestFilters] = useState<Set<string>>(new Set());

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

  // Toggle helpers for multi-select
  const toggleStatus = (status: ProposalStatus) => {
    setStatusFilters(prev => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

  const toggleType = (type: ProposalType) => {
    setTypeFilters(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
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

  const filteredProposals = useMemo(() => {
    return proposals.filter((p) => {
      // Search filter
      const matchesSearch = 
        p.acronym.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.title.toLowerCase().includes(searchQuery.toLowerCase());
      
      // Status filter (empty = all)
      const matchesStatus = statusFilters.size === 0 || statusFilters.has(p.status);
      
      // Type filter (empty = all)
      const matchesType = typeFilters.size === 0 || typeFilters.has(p.type);
      
      // Work Programme filter (empty = all)
      const matchesWp = wpFilters.size === 0 || (p.workProgramme && wpFilters.has(p.workProgramme));
      
      // Destination filter (empty = all)
      const matchesDest = destFilters.size === 0 || (p.destination && destFilters.has(p.destination));
      
      return matchesSearch && matchesStatus && matchesType && matchesWp && matchesDest;
    });
  }, [proposals, searchQuery, statusFilters, typeFilters, wpFilters, destFilters]);

  const activeFiltersCount = statusFilters.size + typeFilters.size + wpFilters.size + destFilters.size;

  const clearFilters = () => {
    setStatusFilters(new Set());
    setTypeFilters(new Set());
    setWpFilters(new Set());
    setDestFilters(new Set());
    setSearchQuery('');
  };

  const handleCreateProposal = (data: { 
    acronym: string; 
    title: string; 
    type: ProposalType;
    workProgramme?: string;
    destination?: string;
  }) => {
    const newProposal: Proposal = {
      id: String(proposals.length + 1),
      acronym: data.acronym,
      title: data.title,
      type: data.type,
      workProgramme: data.workProgramme,
      destination: data.destination,
      budgetType: 'traditional',
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'draft',
      sections: HORIZON_EUROPE_SECTIONS,
      members: [
        { user: { id: '1', name: 'John Doe', email: 'john@example.com' }, role: 'admin' },
      ],
    };
    setProposals([newProposal, ...proposals]);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container py-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">My Proposals</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Edit proposal drafts or view previously submitted proposals
            </p>
          </div>
          {isSitraStaff && (
            <Button onClick={() => setIsCreateDialogOpen(true)} className="gap-2" size="sm">
              <Plus className="w-4 h-4" />
              New Proposal
            </Button>
          )}
        </div>

        {/* Filters Bar */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search proposals..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          
          <div className="flex items-center gap-2 flex-wrap">
            {activeFiltersCount > 0 && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={clearFilters}
                className="h-9 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="w-3 h-3 mr-1" />
                Clear ({activeFiltersCount})
              </Button>
            )}

            <div className="flex items-center border rounded-md p-0.5 ml-auto">
              <Button
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                size="icon"
                className="h-7 w-7"
                onClick={() => setViewMode('grid')}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="icon"
                className="h-7 w-7"
                onClick={() => setViewMode('list')}
              >
                <List className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Clickable Filter Buttons */}
        <div className="space-y-2 mb-4">
          {/* Row 1: Urgency and Status */}
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <button
              onClick={() => { clearFilters(); }}
              className={`px-2.5 py-1 rounded-md transition-colors ${activeFiltersCount === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}`}
            >
              <span className="font-bold">{proposals.length}</span>
              <span className="ml-1">Total</span>
            </button>
            <span className="text-muted-foreground/30 mx-1">|</span>
            {/* Urgency filters - only count drafts */}
            {(() => {
              const draftProposals = proposals.filter(p => p.status === 'draft');
              const criticalCount = draftProposals.filter(p => getUrgencyLevel(p.deadline) === 'critical').length;
              const urgentCount = draftProposals.filter(p => getUrgencyLevel(p.deadline) === 'urgent').length;
              const approachingCount = draftProposals.filter(p => getUrgencyLevel(p.deadline) === 'approaching').length;
              const onTrackCount = draftProposals.filter(p => getUrgencyLevel(p.deadline) === 'on_track').length;
              
              return (
                <>
                  {criticalCount > 0 && (
                    <span className="px-2.5 py-1 rounded-md bg-red-500/15 text-red-600 border border-red-500/30">
                      <span className="font-bold">{criticalCount}</span>
                      <span className="ml-1">Critical!</span>
                    </span>
                  )}
                  {urgentCount > 0 && (
                    <span className="px-2.5 py-1 rounded-md bg-orange-500/15 text-orange-600 border border-orange-500/30">
                      <span className="font-bold">{urgentCount}</span>
                      <span className="ml-1">Urgent</span>
                    </span>
                  )}
                  {approachingCount > 0 && (
                    <span className="px-2.5 py-1 rounded-md bg-yellow-500/15 text-yellow-600 border border-yellow-500/30">
                      <span className="font-bold">{approachingCount}</span>
                      <span className="ml-1">Approaching</span>
                    </span>
                  )}
                  {onTrackCount > 0 && (
                    <span className="px-2.5 py-1 rounded-md bg-green-500/15 text-green-600 border border-green-500/30">
                      <span className="font-bold">{onTrackCount}</span>
                      <span className="ml-1">On Track</span>
                    </span>
                  )}
                </>
              );
            })()}
            <span className="text-muted-foreground/30 mx-1">|</span>
            {/* Status filters */}
            <button
              onClick={() => toggleStatus('draft')}
              className={`px-2.5 py-1 rounded-md transition-colors ${statusFilters.has('draft') ? 'bg-yellow-500 text-white' : 'bg-muted hover:bg-muted/80'}`}
            >
              <span className="font-bold">{proposals.filter((p) => p.status === 'draft').length}</span>
              <span className="ml-1">Draft</span>
            </button>
            <button
              onClick={() => toggleStatus('submitted')}
              className={`px-2.5 py-1 rounded-md transition-colors ${statusFilters.has('submitted') ? 'bg-orange-500 text-white' : 'bg-muted hover:bg-muted/80'}`}
            >
              <span className="font-bold">{proposals.filter((p) => p.status === 'submitted').length}</span>
              <span className="ml-1">Submitted</span>
            </button>
            <button
              onClick={() => toggleStatus('funded')}
              className={`px-2.5 py-1 rounded-md transition-colors ${statusFilters.has('funded') ? 'bg-success text-success-foreground' : 'bg-muted hover:bg-muted/80'}`}
            >
              <span className="font-bold">{proposals.filter((p) => p.status === 'funded').length}</span>
              <span className="ml-1">Funded</span>
            </button>
            <button
              onClick={() => toggleStatus('not_funded')}
              className={`px-2.5 py-1 rounded-md transition-colors ${statusFilters.has('not_funded') ? 'bg-destructive text-destructive-foreground' : 'bg-muted hover:bg-muted/80'}`}
            >
              <span className="font-bold">{proposals.filter((p) => p.status === 'not_funded').length}</span>
              <span className="ml-1">Not Funded</span>
            </button>
          </div>

          {/* Row 2: Type, Work Programme, and Destination */}
          <div className="flex items-center gap-2 text-sm flex-wrap">
            {/* Type filters */}
            <button
              onClick={() => toggleType('RIA')}
              className={`px-2.5 py-1 rounded-md transition-colors ${typeFilters.has('RIA') ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}`}
            >
              <span className="font-bold">{proposals.filter((p) => p.type === 'RIA').length}</span>
              <span className="ml-1">RIA</span>
            </button>
            <button
              onClick={() => toggleType('IA')}
              className={`px-2.5 py-1 rounded-md transition-colors ${typeFilters.has('IA') ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}`}
            >
              <span className="font-bold">{proposals.filter((p) => p.type === 'IA').length}</span>
              <span className="ml-1">IA</span>
            </button>
            <button
              onClick={() => toggleType('CSA')}
              className={`px-2.5 py-1 rounded-md transition-colors ${typeFilters.has('CSA') ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}`}
            >
              <span className="font-bold">{proposals.filter((p) => p.type === 'CSA').length}</span>
              <span className="ml-1">CSA</span>
            </button>
            <span className="text-muted-foreground/30 mx-1">|</span>
            {/* Work Programme filters */}
            {WORK_PROGRAMMES.map(wp => {
              const count = proposals.filter(p => p.workProgramme === wp.id).length;
              if (count === 0) return null;
              return (
                <button
                  key={wp.id}
                  onClick={() => toggleWp(wp.id)}
                  className={`px-2.5 py-1 rounded-md transition-colors ${wpFilters.has(wp.id) ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}`}
                >
                  <span className="font-bold">{count}</span>
                  <span className="ml-1">{wp.abbreviation}</span>
                </button>
              );
            })}
            {/* Destination filters - inline after WP when selected */}
            {availableDestinations.length > 0 && (
              <>
                <span className="text-muted-foreground/30 mx-1">→</span>
                {availableDestinations.map(dest => {
                  const count = proposals.filter(p => p.destination === dest.id).length;
                  if (count === 0) return null;
                  return (
                    <button
                      key={dest.id}
                      onClick={() => toggleDest(dest.id)}
                      className={`px-2.5 py-1 rounded-md transition-colors ${destFilters.has(dest.id) ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}`}
                    >
                      <span className="font-bold">{count}</span>
                      <span className="ml-1">{dest.abbreviation}</span>
                    </button>
                  );
                })}
              </>
            )}
          </div>
        </div>

        {/* Proposals Grid */}
        {filteredProposals.length > 0 ? (
          <div className={viewMode === 'grid' ? 'grid gap-4 md:grid-cols-2 lg:grid-cols-3' : 'space-y-3'}>
            {filteredProposals.map((proposal) => (
              <ProposalCard
                key={proposal.id}
                proposal={proposal}
                onClick={() => navigate(`/proposal/${proposal.id}`)}
                compact={viewMode === 'list'}
              />
            ))}
          </div>
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
