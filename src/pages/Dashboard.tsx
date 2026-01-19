import { Header } from "@/components/Header";
import { ProposalCard } from "@/components/ProposalCard";
import { CreateProposalDialog } from "@/components/CreateProposalDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Proposal, ProposalType, HORIZON_EUROPE_SECTIONS } from "@/types/proposal";
import { Plus, Search, Filter, LayoutGrid, List } from "lucide-react";
import { useState } from "react";
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
    destination: 'CL1-D5',
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
    destination: 'CL6-D3',
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

  const filteredProposals = proposals.filter(
    (p) =>
      p.acronym.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

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

      <main className="container py-8">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">My Proposals</h1>
            <p className="text-muted-foreground mt-1">
              Co-develop Horizon Europe proposals with your consortium
            </p>
          </div>
          <Button onClick={() => setIsCreateDialogOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            New Proposal
          </Button>
        </div>

        {/* Filters Bar */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search proposals..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon">
              <Filter className="w-4 h-4" />
            </Button>
            <div className="flex items-center border rounded-lg p-1">
              <Button
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                size="icon"
                className="h-8 w-8"
                onClick={() => setViewMode('grid')}
              >
                <LayoutGrid className="w-4 h-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="icon"
                className="h-8 w-8"
                onClick={() => setViewMode('list')}
              >
                <List className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <div className="card-elevated p-4">
            <p className="text-2xl font-bold text-foreground">{proposals.length}</p>
            <p className="text-sm text-muted-foreground">Total Proposals</p>
          </div>
          <div className="card-elevated p-4">
            <p className="text-2xl font-bold text-foreground">
              {proposals.filter((p) => p.status === 'draft').length}
            </p>
            <p className="text-sm text-muted-foreground">In Draft</p>
          </div>
          <div className="card-elevated p-4">
            <p className="text-2xl font-bold text-blue-600">
              {proposals.filter((p) => p.status === 'submitted').length}
            </p>
            <p className="text-sm text-muted-foreground">Submitted</p>
          </div>
          <div className="card-elevated p-4">
            <p className="text-2xl font-bold text-success">
              {proposals.filter((p) => p.status === 'funded').length}
            </p>
            <p className="text-sm text-muted-foreground">Funded</p>
          </div>
        </div>

        {/* Proposals Grid */}
        {filteredProposals.length > 0 ? (
          <div className={viewMode === 'grid' ? 'grid gap-6 md:grid-cols-2 lg:grid-cols-3' : 'space-y-4'}>
            {filteredProposals.map((proposal) => (
              <ProposalCard
                key={proposal.id}
                proposal={proposal}
                onClick={() => navigate(`/proposal/${proposal.id}`)}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-muted-foreground">No proposals found</h3>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Try adjusting your search or create a new proposal
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
