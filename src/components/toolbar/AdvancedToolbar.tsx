import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  FileCode,
  GitCompare,
  History,
  Info,
  PanelRight,
  PanelRightClose,
  Route,
  Search,
  SplitSquareHorizontal,
  Wand2,
} from "lucide-react";

export interface AdvancedToolbarProps {
  onOpenGuidelines: () => void;
  saveIndicator?: React.ReactNode;
  onOpenSearch: () => void;
  isSplitViewOpen: boolean;
  onToggleSplitView: () => void;
  onOpenComparison: () => void;
  onOpenWritingAssistant: () => void;
  isWritingAssistantDisabled?: boolean;
  onOpenSnippets: () => void;
  showSnippets?: boolean;
  isSnippetsDisabled?: boolean;
  onOpenVersionHistory: () => void;
  isCollaborationPanelOpen: boolean;
  onToggleCollaborationPanel: () => void;
  onOpenImpactPathway?: () => void;
  showImpactPathway?: boolean;
  isImpactPathwayDisabled?: boolean;
  isReadOnly?: boolean;
}

export function AdvancedToolbar({
  onOpenGuidelines,
  saveIndicator,
  onOpenSearch,
  isSplitViewOpen,
  onToggleSplitView,
  onOpenComparison,
  onOpenWritingAssistant,
  isWritingAssistantDisabled,
  onOpenSnippets,
  showSnippets,
  isSnippetsDisabled,
  onOpenVersionHistory,
  isCollaborationPanelOpen,
  onToggleCollaborationPanel,
  onOpenImpactPathway,
  showImpactPathway,
  isImpactPathwayDisabled,
}: AdvancedToolbarProps) {
  return (
    <div className="flex items-center gap-1 min-w-0 flex-1 overflow-x-auto">
      {/* Guidelines */}
      <Button
        variant="outline"
        size="sm"
        className="h-6 px-2 text-xs gap-1 text-destructive border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
        onClick={onOpenGuidelines}
      >
        <Info className="w-3 h-3" />
        Guidelines
      </Button>

      <Separator orientation="vertical" className="h-4 mx-1" />

      {/* Save */}
      {saveIndicator}

      <Separator orientation="vertical" className="h-4 mx-1" />

      {/* Find */}
      <Button
        variant="outline"
        size="sm"
        className="h-6 px-2 text-xs gap-1"
        onClick={onOpenSearch}
      >
        <Search className="w-3 h-3" />
        Find
      </Button>

      <Separator orientation="vertical" className="h-4 mx-1" />

      {/* Split + Compare */}
      <Button
        variant={isSplitViewOpen ? "default" : "outline"}
        size="sm"
        className="h-6 px-2 text-xs gap-1"
        onClick={onToggleSplitView}
      >
        <SplitSquareHorizontal className="w-3 h-3" />
        Split
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-6 px-2 text-xs gap-1"
        onClick={onOpenComparison}
      >
        <GitCompare className="w-3 h-3" />
        Compare
      </Button>

      <Separator orientation="vertical" className="h-4 mx-1" />

      {/* AI + Snippets */}
      <Button
        variant="outline"
        size="sm"
        className="h-6 px-2 text-xs gap-1"
        onClick={onOpenWritingAssistant}
        disabled={isWritingAssistantDisabled}
      >
        <Wand2 className="w-3 h-3" />
        AI tools
      </Button>
      {showSnippets && (
        <Button
          variant="outline"
          size="sm"
          className="h-6 px-2 text-xs gap-1"
          onClick={onOpenSnippets}
          disabled={isSnippetsDisabled}
        >
          <FileCode className="w-3 h-3" />
          Snippets
        </Button>
      )}

      <Separator orientation="vertical" className="h-4 mx-1" />

      {/* History */}
      <Button
        variant="outline"
        size="sm"
        className="h-6 px-2 text-xs gap-1"
        onClick={onOpenVersionHistory}
      >
        <History className="w-3 h-3" />
        History
      </Button>

      <Separator orientation="vertical" className="h-4 mx-1" />

      {/* Review panel */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={isCollaborationPanelOpen ? "default" : "outline"}
            size="sm"
            className="h-6 px-2 text-xs gap-1"
            onClick={onToggleCollaborationPanel}
          >
            {isCollaborationPanelOpen ? (
              <PanelRightClose className="w-3 h-3" />
            ) : (
              <PanelRight className="w-3 h-3" />
            )}
            Review panel
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {isCollaborationPanelOpen
            ? "Hide collaboration panel"
            : "Show collaboration panel"}
        </TooltipContent>
      </Tooltip>

      {/* Impact pathway (section-specific) */}
      {showImpactPathway && (
        <Button
          variant="outline"
          size="sm"
          className="h-6 px-2 text-xs gap-1 bg-primary/5 border-primary/30 hover:bg-primary/10"
          onClick={onOpenImpactPathway!}
          disabled={isImpactPathwayDisabled}
        >
          <Route className="w-3 h-3" />
          Impact Mapper
        </Button>
      )}
    </div>
  );
}
