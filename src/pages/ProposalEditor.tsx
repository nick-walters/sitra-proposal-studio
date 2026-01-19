import { Header } from "@/components/Header";
import { SectionNavigator } from "@/components/SectionNavigator";
import { DocumentEditor } from "@/components/DocumentEditor";
import { VersionHistoryDialog } from "@/components/VersionHistoryDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Section, HORIZON_EUROPE_SECTIONS } from "@/types/proposal";
import { useState } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePdfExport } from "@/hooks/usePdfExport";

export function ProposalEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState<Section | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const { exportToPdf } = usePdfExport();

  // Sample proposal data
  const proposal = {
    id,
    acronym: 'GREENTECH',
    title: 'Green Technologies for Sustainable Urban Development',
    type: 'RIA' as const,
    status: 'draft' as const,
    sections: HORIZON_EUROPE_SECTIONS,
    members: [
      { id: '1', name: 'John Doe', online: true },
      { id: '2', name: 'Jane Smith', online: true },
      { id: '3', name: 'Bob Wilson', online: false },
    ],
  };

  const handleSectionClick = (section: Section) => {
    setActiveSection(section);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top Bar */}
      <header className="h-14 border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="h-full px-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <Separator orientation="vertical" className="h-6" />
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="proposal-badge-ria">
                {proposal.type}
              </Badge>
              <h1 className="font-semibold">{proposal.acronym}</h1>
              <span className="text-muted-foreground hidden sm:inline">—</span>
              <span className="text-muted-foreground text-sm hidden sm:inline truncate max-w-[300px]">
                {proposal.title}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Online collaborators */}
            <div className="hidden md:flex items-center gap-1 mr-2">
              {proposal.members.filter((m) => m.online).map((member, idx) => (
                <div
                  key={member.id}
                  className="w-7 h-7 rounded-full bg-primary/10 border-2 border-card flex items-center justify-center relative"
                  style={{ marginLeft: idx > 0 ? '-8px' : 0, zIndex: 3 - idx }}
                >
                  <span className="text-xs font-medium text-primary">
                    {member.name.split(' ').map((n) => n[0]).join('')}
                  </span>
                  <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-success border-2 border-card" />
                </div>
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
            <Button variant="outline" size="sm" className="gap-2" onClick={() => exportToPdf({ title: proposal.title, acronym: proposal.acronym, sections: [] })}>
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export PDF</span>
            </Button>
            <Button variant="ghost" size="icon">
              <Settings className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

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
              sections={proposal.sections}
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
              {proposal.members.map((member) => (
                <div key={member.id} className="flex items-center gap-2">
                  <div className="relative">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-xs font-medium text-primary">
                        {member.name.split(' ').map((n) => n[0]).join('')}
                      </span>
                    </div>
                    {member.online && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-success border border-card" />
                    )}
                  </div>
                  <span className="text-sm truncate">{member.name}</span>
                </div>
              ))}
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

        {/* Editor */}
        <DocumentEditor section={activeSection} proposalAcronym={proposal.acronym} />
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
