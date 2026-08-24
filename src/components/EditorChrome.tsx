import { forwardRef, type ReactNode, type Ref, type MouseEvent } from 'react';
import {
  Info,
  Cloud,
  History,
  Search,
  GitCompare,
  MessageSquare,
  Sparkles,
  FileText,
  Loader2,
  Keyboard,

} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { ScrollableToolbarRow } from '@/components/ScrollableToolbarRow';
import { formatTime } from '@/lib/formatDate';


/* ------------------------------------------------------------------ */
/* Feature bar button primitive                                        */
/* ------------------------------------------------------------------ */

interface FeatureButtonProps {
  icon?: ReactNode;
  leading?: ReactNode;
  primary: string;
  secondary?: string;
  secondarySmall?: boolean;
  tone?: 'default' | 'destructive' | 'muted' | 'success';
  disabled?: boolean;
  asDiv?: boolean;
  onClick?: () => void;
}

export const FeatureButton = forwardRef<HTMLButtonElement | HTMLDivElement, FeatureButtonProps>(
  function FeatureButton(
    {
      icon,
      leading,
      primary,
      secondary,
      secondarySmall,
      tone = 'default',
      disabled,
      asDiv,
      onClick,
    },
    ref,
  ) {
    const toneClass =
      tone === 'destructive'
        ? 'border-destructive/50 text-destructive hover:bg-destructive/10'
        : tone === 'success'
          ? 'border-success/50 text-success hover:bg-success/10'
          : tone === 'muted'
            ? 'border-border text-muted-foreground'
            : 'border-border text-foreground hover:bg-accent';

    const commonProps = {
      ref: ref as Ref<HTMLButtonElement & HTMLDivElement>,
      className: cn(
        'flex items-center gap-1.5 self-stretch rounded-md border bg-transparent px-2 py-1 text-left transition-colors',
        toneClass,
        disabled && 'cursor-default opacity-70 hover:bg-transparent',
        asDiv && 'cursor-default',
      ),
      onClick,
      onMouseDown: (e: MouseEvent<HTMLElement>) => e.preventDefault(),
    };

    const content = (
      <>
        <span className="flex shrink-0 items-center justify-center">{leading ?? icon}</span>
        <span className="flex flex-col leading-tight">
          <span className="text-[11px] font-medium">{primary}</span>
          {secondary && (
            <span className={secondarySmall ? 'text-[9px] opacity-80' : 'text-[11px] opacity-80'}>
              {secondary}
            </span>
          )}
        </span>
      </>
    );

    return asDiv ? (
      <div {...commonProps}>{content}</div>
    ) : (
      <button type="button" disabled={disabled} {...commonProps}>
        {content}
      </button>
    );
  },
);

/* ------------------------------------------------------------------ */
/* Standard feature bar                                                */
/* ------------------------------------------------------------------ */

export interface EditorFeatureBarProps {
  hasFocusedField: boolean;
  onOpenGuidelines?: () => void;
  saving: boolean;
  lastSaved: Date | null;
  savedMode: 'auto' | 'manual';
  onSaveNow?: () => void;
  /** True when there are edits not yet persisted; drives the grey/green state. */
  isDirty?: boolean;
  trackChangesOn?: boolean;
  pendingChangeCount?: number;
  commentCount?: number;
  previewLabel?: string;
  /** Handler for the Preview button; without one the button stays inert. */
  onPreview?: () => void;
  onOpenShortcuts?: () => void;
  /** Opens version history for the text box that currently has the cursor. */
  onOpenVersionHistory?: () => void;
}

export function EditorFeatureBar({
  hasFocusedField,
  onOpenGuidelines,
  saving,
  lastSaved,
  savedMode,
  onSaveNow,
  isDirty = false,
  trackChangesOn = false,
  pendingChangeCount,
  commentCount,
  previewLabel = 'Part B1.2',
  onPreview,
  onOpenShortcuts,
  onOpenVersionHistory,
}: EditorFeatureBarProps) {
  const savePrimary = saving
    ? 'Saving…'
    : lastSaved
      ? `${savedMode === 'manual' ? 'Saved' : 'Autosaved'} at ${formatTime(lastSaved)}`
      : 'Not saved yet';

  const saveTone: 'muted' | 'success' = !saving && !isDirty && lastSaved ? 'success' : 'muted';

  return (
    <div className="flex items-stretch gap-1.5 px-2 py-1.5">
      {/* Save state is page-wide, so it stays visible with no field focused. */}
      <FeatureButton
        icon={
          saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Cloud className="h-3.5 w-3.5" />
          )
        }
        primary={savePrimary}
        secondary="Click to save now"
        secondarySmall
        tone={saveTone}
        onClick={onSaveNow}
      />

      {onOpenShortcuts && (
        <FeatureButton
          icon={<Keyboard className="h-3.5 w-3.5" />}
          primary="Keyboard"
          secondary="shortcuts"
          secondarySmall
          onClick={onOpenShortcuts}
        />
      )}

      {hasFocusedField && (
        <>
          <FeatureButton
            icon={<Info className="h-3.5 w-3.5" />}
            primary="Guidelines"
            secondary="for this field"
            secondarySmall
            tone="destructive"
            onClick={onOpenGuidelines}
          />

          <FeatureButton
            icon={<History className="h-3.5 w-3.5" />}
            primary="Version"
            secondary="history"
            onClick={onOpenVersionHistory}
          />

          <FeatureButton icon={<Search className="h-3.5 w-3.5" />} primary="Find &" secondary="replace" />

          <FeatureButton
            asDiv
            leading={<Switch checked={trackChangesOn} className="pointer-events-none scale-75" />}
            primary="Track my"
            secondary="changes"
          />

          <FeatureButton
            icon={<GitCompare className="h-3.5 w-3.5" />}
            primary="Review"
            secondary={
              typeof pendingChangeCount === 'number' ? `changes · ${pendingChangeCount}` : 'changes'
            }
            secondarySmall
          />

          <FeatureButton
            icon={<MessageSquare className="h-3.5 w-3.5" />}
            primary="Comment"
            secondary={typeof commentCount === 'number' ? `panel · ${commentCount}` : 'panel'}
            secondarySmall
          />

          <FeatureButton icon={<Sparkles className="h-3.5 w-3.5" />} primary="AI" secondary="tools" />
        </>
      )}

      <FeatureButton
        icon={<FileText className="h-3.5 w-3.5" />}
        primary="Preview"
        secondary={previewLabel}
        secondarySmall
        onClick={onPreview}
      />
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* Chrome                                                                */
/* ------------------------------------------------------------------ */

interface EditorChromeProps {
  proposalId: string;
  featureBar: ReactNode;
  formattingBar: ReactNode;
  children: ReactNode;
}

export function EditorChrome({ featureBar, formattingBar, children }: EditorChromeProps) {
  return (
    <>
      {/* Permanently pinned: present from first paint, never scroll-triggered. */}
      <div data-editor-chrome className="sticky top-0 z-40 -mx-1 px-1 py-1 bg-background">
        <div className="rounded-md border border-border bg-card shadow-sm">
          <div className="border-b border-border">
            <ScrollableToolbarRow>{featureBar}</ScrollableToolbarRow>
          </div>
          <ScrollableToolbarRow>{formattingBar}</ScrollableToolbarRow>
        </div>
      </div>
      {children}
    </>
  );
}


export default EditorChrome;
