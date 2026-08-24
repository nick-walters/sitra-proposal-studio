import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { FeatureButton } from '@/components/EditorChrome';
import { PartACollapseProvider, usePartACollapseAll } from '@/components/PartACard';

interface PartAPageLayoutProps {
  /** Page title text, e.g. "A1. General information" */
  title: string;
  /** Title element, default h1. Use h2 for sub-pages like BudgetParticipantForm */
  titleAs?: 'h1' | 'h2';
  /** Title size, default 'text-xl font-bold'. Override for sub-pages */
  titleClassName?: string;
  /** If provided, renders instead of the default <TitleTag>{title}</TitleTag>. `title` is still required for accessibility/fallback. */
  titleNode?: React.ReactNode;
  /** Optional element rendered to the LEFT of the title (e.g. participant number badge) */
  titleLeftAdornment?: React.ReactNode;
  /** Optional subtitle line below the title */
  subtitle?: React.ReactNode;
  /** Optional element rendered to the RIGHT of the title row (e.g. status badge, action buttons) */
  titleRightSlot?: React.ReactNode;
  /** Optional element rendered to the LEFT of the save indicator in the toolbar row below the title */
  saveIndicatorLeftSlot?: React.ReactNode;
  /** Optional PartAGuidelinesDialog — rendered in the toolbar row below the title */
  guidelines?: React.ReactNode;
  /** Optional SaveIndicator — rendered in the toolbar row below the title */
  saveIndicator?: React.ReactNode;
  /** Container max-width class. Default 'max-w-7xl'. */
  maxWidth?: string;
  /** Content spacing class. Default 'space-y-6' */
  spacing?: string;
  /** Outer padding class. Default 'p-6' */
  padding?: string;
  /** Page body content */
  children: React.ReactNode;
  /**
   * Proposal the page belongs to. Supplying it turns on the page-wide
   * "Collapse all" control and persists each card's collapse state per user.
   */
  proposalId?: string | null;
}

export function PartAPageLayout({
  title,
  titleAs: TitleTag = 'h1',
  titleClassName = 'text-xl font-bold text-foreground',
  titleNode,
  titleLeftAdornment,
  subtitle,
  titleRightSlot,
  saveIndicatorLeftSlot,
  guidelines,
  saveIndicator,
  maxWidth = 'max-w-7xl',
  spacing = 'space-y-6',
  padding = 'p-6',
  children,
  proposalId,
}: PartAPageLayoutProps) {
  // Collapse state is a view preference only: it never touches the proposal's
  // data, validation, exports or numbering.
  const [collapseState, setCollapseState] = useState<{
    keys: string[];
    allCollapsed: boolean;
    pending: boolean;
  }>({ keys: [], allCollapsed: false, pending: false });
  const setCollapsed = usePartACollapseAll(proposalId);

  const collapseAllControl =
    proposalId && collapseState.keys.length > 0 ? (
      <FeatureButton
        icon={
          collapseState.allCollapsed ? (
            <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.5} />
          ) : (
            <ChevronUp className="h-3.5 w-3.5" strokeWidth={2.5} />
          )
        }
        primary={collapseState.allCollapsed ? 'Expand' : 'Collapse'}
        secondary="all cards"
        secondarySmall
        disabled={collapseState.pending}
        tooltip={collapseState.allCollapsed ? 'Expand all cards' : 'Collapse all cards'}
        onClick={() =>
          setCollapsed.mutate({
            keys: collapseState.keys,
            collapsed: !collapseState.allCollapsed,
          })
        }
      />
    ) : null;

  return (
    <div className={`flex-1 overflow-auto ${padding} bg-muted/30`}>
      <div className={`${maxWidth} mx-auto ${spacing}`}>
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {titleLeftAdornment}
              <div>
                {titleNode ?? <TitleTag className={titleClassName}>{title}</TitleTag>}
                {subtitle}
              </div>
            </div>
            {titleRightSlot}
          </div>
          {(guidelines || saveIndicatorLeftSlot || saveIndicator || collapseAllControl) && (
            <div className="flex items-center gap-3">
              {collapseAllControl}
              {guidelines}
              {saveIndicatorLeftSlot}
              {saveIndicator}
            </div>
          )}
        </div>
        {/* Body */}
        <PartACollapseProvider proposalId={proposalId} onStateChange={setCollapseState}>
          {children}
        </PartACollapseProvider>
      </div>
    </div>
  );
}
