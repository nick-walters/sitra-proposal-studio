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
  Plus,
  Recycle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Tip } from '@/components/ui/control-tip';
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
  /** Hover tooltip; also becomes the control's aria-label. */
  tooltip?: string;
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
      tooltip,
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
        // TOOLBAR_CONTROL_H: every control in all three tiers is this tall.
        'flex h-7 items-center gap-1.5 rounded-md border bg-transparent px-2 py-0 text-left transition-colors',
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
        <span className="flex min-w-0 flex-col justify-center leading-none">
          <span className="text-[11px] font-medium">{primary}</span>
          {secondary && (
            <span className={secondarySmall ? 'text-[9px] opacity-80' : 'text-[10px] opacity-80'}>
              {secondary}
            </span>
          )}
        </span>
      </>
    );

    const element = asDiv ? (
      <div {...commonProps}>{content}</div>
    ) : (
      <button type="button" disabled={disabled} {...commonProps}>
        {content}
      </button>
    );

    return tooltip ? <Tip label={tooltip}>{element}</Tip> : element;
  },
);

/* ------------------------------------------------------------------ */
/* Shared save-state button (the unified autosave-indicator-in-button) */
/* ------------------------------------------------------------------ */

export interface SaveStateButtonProps {
  saving: boolean;
  lastSaved: Date | null;
  savedMode?: 'auto' | 'manual';
  /** True when there are edits not yet persisted; drives the grey/green state. */
  isDirty?: boolean;
  onSaveNow?: () => void;
}

export function SaveStateButton({
  saving,
  lastSaved,
  savedMode = 'auto',
  isDirty = false,
  onSaveNow,
}: SaveStateButtonProps) {
  const primary = saving
    ? 'Saving…'
    : lastSaved
      ? `${savedMode === 'manual' ? 'Saved' : 'Autosaved'} at ${formatTime(lastSaved)}`
      : 'Not saved yet';

  const tone: 'muted' | 'success' = !saving && !isDirty && lastSaved ? 'success' : 'muted';

  return (
    <FeatureButton
      icon={
        saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Cloud className="h-3.5 w-3.5" />
      }
      primary={primary}
      tooltip="Save all changes now"
      secondary="Click to save now"
      secondarySmall
      tone={tone}
      onClick={onSaveNow}
    />
  );
}

/* ------------------------------------------------------------------ */
/* TOP TIER — page-wide controls, always visible                       */
/* ------------------------------------------------------------------ */

export interface EditorTopBarProps extends SaveStateButtonProps {
  /** Preview button — omitted entirely when no handler is supplied. */
  onPreview?: () => void;
  previewLabel?: string;
  /** Expand / collapse all blocks. Omitted when no handler is supplied. */
  collapseAll?: {
    allCollapsed: boolean;
    disabled?: boolean;
    onToggle: () => void;
  };
  onAddBlock?: () => void;
  addBlockDisabled?: boolean;
  onRestoreBlock?: () => void;
  restoreBlockCount?: number;
  /** Comments panel. */
  onOpenComments?: () => void;
  commentCount?: number;
  /** Find and replace. */
  onFindReplace?: () => void;
  /** Keyboard shortcuts — always pinned to the far right. */
  onOpenShortcuts?: () => void;
  /** Extra page-wide controls appended before the shortcuts button. */
  trailing?: ReactNode;
}

export function EditorTopBar({
  saving,
  lastSaved,
  savedMode = 'auto',
  isDirty = false,
  onSaveNow,
  onPreview,
  previewLabel = 'Part B1.2',
  collapseAll,
  onAddBlock,
  addBlockDisabled,
  onRestoreBlock,
  restoreBlockCount = 0,
  onOpenComments,
  commentCount,
  onFindReplace,
  onOpenShortcuts,
  trailing,
}: EditorTopBarProps) {
  return (
    <div className="flex w-full items-center gap-1.5 px-2 py-1">
      <SaveStateButton
        saving={saving}
        lastSaved={lastSaved}
        savedMode={savedMode}
        isDirty={isDirty}
        onSaveNow={onSaveNow}
      />

      {onPreview && (
        <FeatureButton
          icon={<FileText className="h-3.5 w-3.5" />}
          primary="Preview"
          tooltip={`Preview ${previewLabel}`}
          secondary={previewLabel}
          secondarySmall
          onClick={onPreview}
        />
      )}

      {/* Collapse all, Comments, Find and replace and Shortcuts are page-wide
          controls EVERY surface carries; they show disabled where a surface
          has not wired them. Preview / Add block / Restore block are Part B
          only and appear solely when their handler is supplied. */}
      <FeatureButton
        icon={
          collapseAll?.allCollapsed ? (
            <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.5} />
          ) : (
            <ChevronUp className="h-3.5 w-3.5" strokeWidth={2.5} />
          )
        }
        primary={collapseAll?.allCollapsed ? 'Expand' : 'Collapse'}
        secondary="all blocks"
        secondarySmall
        disabled={!collapseAll || collapseAll.disabled}
        tooltip={collapseAll?.allCollapsed ? 'Expand all blocks' : 'Collapse all blocks'}
        onClick={collapseAll?.onToggle}
      />


      {onAddBlock && (
        <FeatureButton
          icon={<Plus className="h-3.5 w-3.5" />}
          primary="Add"
          secondary="block"
          secondarySmall
          tooltip="Add block"
          disabled={addBlockDisabled}
          onClick={onAddBlock}
        />
      )}

      {onRestoreBlock && (
        <FeatureButton
          icon={<Recycle className="h-3.5 w-3.5 text-emerald-600" strokeWidth={2.5} />}
          primary="Restore"
          secondary={restoreBlockCount > 0 ? `block · ${restoreBlockCount}` : 'block'}
          secondarySmall
          tooltip={`Restore deleted block (${restoreBlockCount} in the recycle bin)`}
          onClick={onRestoreBlock}
        />
      )}

      <FeatureButton
        icon={<MessageSquare className="h-3.5 w-3.5" />}
        primary="Comments"
        secondary={typeof commentCount === 'number' ? `panel · ${commentCount}` : 'panel'}
        secondarySmall
        tooltip="Open the comments panel"
        disabled={!onOpenComments}
        onClick={onOpenComments}
      />

      <FeatureButton
        icon={<Search className="h-3.5 w-3.5" />}
        primary="Find &"
        secondary="replace"
        tooltip="Find and replace text"
        disabled={!onFindReplace}
        onClick={onFindReplace}
      />

      {trailing}

      <FeatureButton
        icon={<Keyboard className="h-3.5 w-3.5" />}
        primary="Keyboard"
        tooltip="Show keyboard shortcuts"
        secondary="shortcuts"
        secondarySmall
        disabled={!onOpenShortcuts}
        onClick={onOpenShortcuts}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* MIDDLE TIER — field-specific features, only with a focused field    */
/* ------------------------------------------------------------------ */

export interface EditorFieldBarProps {
  hasFocusedField: boolean;
  onOpenGuidelines?: () => void;
  onOpenVersionHistory?: () => void;
  trackChanges?: {
    enabled: boolean;
    onToggle?: () => void;
  };
  onReviewChanges?: () => void;
  pendingChangeCount?: number;
  onOpenAiTools?: () => void;
  /** Extra field-specific controls. */
  trailing?: ReactNode;
}

export function EditorFieldBar({
  hasFocusedField,
  onOpenGuidelines,
  onOpenVersionHistory,
  trackChanges,
  onReviewChanges,
  pendingChangeCount,
  onOpenAiTools,
  trailing,
}: EditorFieldBarProps) {
  if (!hasFocusedField) return null;

  // The features tier is UNIFORM on every surface and for every field type:
  // all five controls always appear. A surface that has not wired one yet
  // shows it disabled rather than omitting it.
  return (
    <div className="flex items-center gap-1.5 px-2 py-1">
      <FeatureButton
        icon={<Info className="h-3.5 w-3.5" />}
        primary="Guidelines"
        tooltip="Commission guidelines for the focused field"
        secondary="for this field"
        secondarySmall
        tone="destructive"
        disabled={!onOpenGuidelines}
        onClick={onOpenGuidelines}
      />

      <FeatureButton
        icon={<History className="h-3.5 w-3.5" />}
        primary="Version"
        tooltip="Version history for the focused text box"
        secondary="history"
        disabled={!onOpenVersionHistory}
        onClick={onOpenVersionHistory}
      />

      <FeatureButton
        asDiv={!trackChanges?.onToggle}
        leading={
          <Switch checked={!!trackChanges?.enabled} className="pointer-events-none scale-75" />
        }
        primary="Track my"
        tooltip="Track my changes while editing"
        secondary="changes"
        disabled={!trackChanges?.onToggle}
        onClick={trackChanges?.onToggle}
      />

      <FeatureButton
        icon={<GitCompare className="h-3.5 w-3.5" />}
        primary="Review"
        tooltip="Review tracked changes"
        secondary={
          typeof pendingChangeCount === 'number' ? `changes · ${pendingChangeCount}` : 'changes'
        }
        secondarySmall
        disabled={!onReviewChanges}
        onClick={onReviewChanges}
      />

      <FeatureButton
        icon={<Sparkles className="h-3.5 w-3.5" />}
        primary="AI"
        secondary="tools"
        tooltip="AI writing tools"
        disabled={!onOpenAiTools}
        onClick={onOpenAiTools}
      />

      {trailing}
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* Chrome — three tiers                                                 */
/* ------------------------------------------------------------------ */

interface EditorChromeProps {
  proposalId?: string;
  /** Page-wide controls (always visible). */
  topBar: ReactNode;
  /** Field-specific features (rendered only when it returns content). */
  fieldBar?: ReactNode;
  formattingBar: ReactNode;
  children?: ReactNode;
}

export function EditorChrome({ topBar, fieldBar, formattingBar, children }: EditorChromeProps) {
  return (
    <>
      {/* Permanently pinned: present from first paint, never scroll-triggered.
          The bars carry a solid background so page content never shows through. */}
      <div data-editor-chrome className="sticky top-0 z-40 -mx-1 px-1 py-1 bg-background">
        <div className="rounded-md border border-border bg-card shadow-sm">
          <div className="border-b border-border bg-card">
            <ScrollableToolbarRow>{topBar}</ScrollableToolbarRow>
          </div>
          {fieldBar && (
            <div className="border-b border-border bg-card empty:hidden">
              <ScrollableToolbarRow>{fieldBar}</ScrollableToolbarRow>
            </div>
          )}
          <div className="bg-card">
            <ScrollableToolbarRow>{formattingBar}</ScrollableToolbarRow>
          </div>
        </div>
      </div>
      {children}
    </>
  );
}


export default EditorChrome;
