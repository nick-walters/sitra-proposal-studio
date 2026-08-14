import type { ReactNode } from 'react';
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
  tone?: 'default' | 'destructive' | 'muted';
  disabled?: boolean;
  onClick?: () => void;
}

export function FeatureButton({
  icon,
  leading,
  primary,
  secondary,
  secondarySmall,
  tone = 'default',
  disabled,
  onClick,
}: FeatureButtonProps) {
  const toneClass =
    tone === 'destructive'
      ? 'border-destructive/50 text-destructive hover:bg-destructive/10'
      : tone === 'muted'
        ? 'border-border text-muted-foreground'
        : 'border-border text-foreground hover:bg-accent';

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()}
      className={cn(
        'flex items-center gap-1.5 self-stretch rounded-md border bg-transparent px-2 py-1 text-left transition-colors',
        toneClass,
        disabled && 'cursor-default opacity-70 hover:bg-transparent',
      )}
    >
      <span className="flex shrink-0 items-center justify-center">{leading ?? icon}</span>
      <span className="flex flex-col leading-tight">
        <span className="text-[11px] font-medium">{primary}</span>
        {secondary && (
          <span className={secondarySmall ? 'text-[9px] opacity-80' : 'text-[11px] opacity-80'}>
            {secondary}
          </span>
        )}
      </span>
    </button>
  );
}

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
  trackChangesOn?: boolean;
  pendingChangeCount?: number;
  commentCount?: number;
  previewLabel?: string;
}

export function EditorFeatureBar({
  hasFocusedField,
  onOpenGuidelines,
  saving,
  lastSaved,
  savedMode,
  onSaveNow,
  trackChangesOn = false,
  pendingChangeCount,
  commentCount,
  previewLabel = 'Part B1.2',
}: EditorFeatureBarProps) {
  const savePrimary = saving
    ? 'Saving…'
    : lastSaved
      ? `${savedMode === 'manual' ? 'Saved' : 'Autosaved'} at ${formatTime(lastSaved)}`
      : 'Not saved yet';

  return (
    <div className="flex items-stretch gap-1.5 px-2 py-1.5">
      <FeatureButton
        icon={<Info className="h-3.5 w-3.5" />}
        primary="Guidelines"
        secondary={hasFocusedField ? 'for this field' : 'Select a field'}
        secondarySmall
        tone={hasFocusedField ? 'destructive' : 'muted'}
        disabled={!hasFocusedField}
        onClick={onOpenGuidelines}
      />

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
        onClick={onSaveNow}
      />

      <FeatureButton icon={<History className="h-3.5 w-3.5" />} primary="Version" secondary="history" />

      <FeatureButton icon={<Search className="h-3.5 w-3.5" />} primary="Find &" secondary="replace" />

      <FeatureButton
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

      <FeatureButton
        icon={<FileText className="h-3.5 w-3.5" />}
        primary="Preview"
        secondary={previewLabel}
        secondarySmall
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Chrome                                                              */
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
      <StickyToolbarWrapper>
        <div className="rounded-md border border-border bg-card shadow-sm">
          <div className="border-b border-border">
            <ScrollableToolbarRow>{featureBar}</ScrollableToolbarRow>
          </div>
          <ScrollableToolbarRow>{formattingBar}</ScrollableToolbarRow>
        </div>
      </StickyToolbarWrapper>
      {children}
    </>
  );
}

export default EditorChrome;
