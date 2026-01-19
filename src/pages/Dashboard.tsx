import { Header } from "@/components/Header";
import { ProposalCard } from "@/components/ProposalCard";
import { CreateProposalDialog } from "@/components/CreateProposalDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Proposal, ProposalType, ProposalStatus, HORIZON_EUROPE_SECTIONS, WORK_PROGRAMMES, PROPOSAL_STATUS_LABELS } from "@/types/proposal";
import { Plus, Search, LayoutGrid, List, X } from "lucide-react";
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";

// Sample data
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
    deadline: new Date('2024-06-15'),
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
];

export function Dashboard() {
  const navigate = useNavigate();
  const [proposals, setProposals] = useState<Proposal[]>(sampleProposals);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  // Filter states
  const [statusFilter, setStatusFilter] = useState<ProposalStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<ProposalType | 'all'>('all');
  const [wpFilter, setWpFilter] = useState<string>('all');

  const filteredProposals = useMemo(() => {
    return proposals.filter((p) => {
      // Search filter
      const matchesSearch = 
        p.acronym.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.title.toLowerCase().includes(searchQuery.toLowerCase());
      
      // Status filter
      const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
      
      // Type filter
      const matchesType = typeFilter === 'all' || p.type === typeFilter;
      
      // Work Programme filter
      const matchesWp = wpFilter === 'all' || p.workProgramme === wpFilter;
      
      return matchesSearch && matchesStatus && matchesType && matchesWp;
    });
  }, [proposals, searchQuery, statusFilter, typeFilter, wpFilter]);

  const activeFiltersCount = [statusFilter, typeFilter, wpFilter].filter(f => f !== 'all').length;

  const clearFilters = () => {
    setStatusFilter('all');
    setTypeFilter('all');
    setWpFilter('all');
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
              Co-develop Horizon Europe proposals with your consortium
            </p>
          </div>
          <Button onClick={() => setIsCreateDialogOpen(true)} className="gap-2" size="sm">
            <Plus className="w-4 h-4" />
            New Proposal
          </Button>
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
            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ProposalStatus | 'all')}>
              <SelectTrigger className="w-32 h-9 text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {Object.entries(PROPOSAL_STATUS_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Type Filter */}
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as ProposalType | 'all')}>
              <SelectTrigger className="w-28 h-9 text-xs">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="RIA">RIA</SelectItem>
                <SelectItem value="IA">IA</SelectItem>
                <SelectItem value="CSA">CSA</SelectItem>
              </SelectContent>
            </Select>

            {/* Work Programme Filter */}
            <Select value={wpFilter} onValueChange={setWpFilter}>
              <SelectTrigger className="w-32 h-9 text-xs">
                <SelectValue placeholder="Programme" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Programmes</SelectItem>
                {WORK_PROGRAMMES.map(wp => (
                  <SelectItem key={wp.id} value={wp.id}>{wp.abbreviation}</SelectItem>
                ))}
              </SelectContent>
            </Select>

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

        {/* Stats - Inline compact */}
        <div className="flex items-center gap-4 mb-4 text-sm">
          <div className="flex items-center gap-1.5">
            <span className="font-bold">{proposals.length}</span>
            <span className="text-muted-foreground">Total</span>
          </div>
          <span className="text-muted-foreground/30">|</span>
          <div className="flex items-center gap-1.5">
            <span className="font-bold">{proposals.filter((p) => p.status === 'draft').length}</span>
            <span className="text-muted-foreground">Draft</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-blue-600">{proposals.filter((p) => p.status === 'submitted').length}</span>
            <span className="text-muted-foreground">Submitted</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-success">{proposals.filter((p) => p.status === 'funded').length}</span>
            <span className="text-muted-foreground">Funded</span>
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
