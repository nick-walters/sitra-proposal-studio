import React, { useState } from 'react';
import { PartACollapseProvider, usePartACollapseAll } from '@/components/PartACard';
import { MethodologyEditorFocusProvider } from '@/components/MethodologyEditorFocusContext';
import {
  EditorToolbars,
  type EditorToolbarsFormattingProps,
} from '@/components/editor/EditorToolbars';
import type { EditorFieldBarProps, SaveStateButtonProps } from '@/components/EditorChrome';

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
  /** Extra page-wide control, rendered in the shared toolbar's top tier. */
  saveIndicatorLeftSlot?: React.ReactNode;
  /** Optional PartAGuidelinesDialog — rendered in the shared toolbar's top tier. */
  guidelines?: React.ReactNode;
  /** Save state for the shared toolbar's save button. */
  save?: SaveStateButtonProps;
  /** Field-level features this page wires beyond what capabilities decide. */
  fieldBar?: Omit<EditorFieldBarProps, 'hasFocusedField'>;
  /** Bottom formatting tier configuration. */
  formatting?: EditorToolbarsFormattingProps;
  /** Container max-width class. Default 'max-w-[21cm]' (one printed page). */
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
  save,
  fieldBar,
  formatting,
  maxWidth = 'max-w-[21cm]',
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

  const collapseAll =
    proposalId && collapseState.keys.length > 0
      ? {
          allCollapsed: collapseState.allCollapsed,
          disabled: collapseState.pending,
          onToggle: () =>
            setCollapsed.mutate({
              keys: collapseState.keys,
              collapsed: !collapseState.allCollapsed,
            }),
        }
      : undefined;

  const trailing =
    guidelines || saveIndicatorLeftSlot ? (
      <>
        {guidelines}
        {saveIndicatorLeftSlot}
      </>
    ) : undefined;

  return (
    // No overflow container here: every Part A page is already mounted inside
    // a scrolling wrapper, and a second (non-scrolling) one would become the
    // toolbar's nearest scrollport and stop `position: sticky` from floating.
    <div className={`flex-1 ${padding} bg-muted/30`}>
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
        </div>
        {/* The SAME three-tier toolbar every other surface uses. The focus
            provider wraps the body too, so any rich-text field on a Part A
            page drives the field and formatting tiers. */}
        <MethodologyEditorFocusProvider>
          <EditorToolbars
            proposalId={proposalId || undefined}
            save={save ?? { saving: false, lastSaved: null }}
            topBar={{ collapseAll, trailing }}
            fieldBar={fieldBar}
            formatting={formatting}
          />
          <PartACollapseProvider proposalId={proposalId} onStateChange={setCollapseState}>
            {children}
          </PartACollapseProvider>
        </MethodologyEditorFocusProvider>
      </div>
    </div>
  );
}
