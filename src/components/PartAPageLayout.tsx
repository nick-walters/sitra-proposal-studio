import React from 'react';

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
}

export function PartAPageLayout({
  title,
  titleAs: TitleTag = 'h1',
  titleClassName = 'text-xl font-bold text-foreground',
  titleNode,
  titleLeftAdornment,
  subtitle,
  titleRightSlot,
  guidelines,
  saveIndicator,
  maxWidth = 'max-w-7xl',
  spacing = 'space-y-6',
  padding = 'p-6',
  children,
}: PartAPageLayoutProps) {
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
          {(guidelines || saveIndicator) && (
            <div className="flex items-center gap-3">
              {guidelines}
              {saveIndicator}
            </div>
          )}
        </div>
        {/* Body */}
        {children}
      </div>
    </div>
  );
}
