import { useState, useCallback, useEffect, useRef } from 'react';
import { Image as ImageLucide, Table2 } from 'lucide-react';
import {
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { InsertTDMSReferenceDropdowns } from '@/components/InsertTDMSReferenceDropdowns';
import { DraftFormattingToolbar } from '@/components/DraftFormattingToolbar';

interface AcronymSegment {
  text: string;
  color: string;
}

interface WPSimpleEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  minHeight?: string;
  hideToolbar?: boolean;
  proposalId?: string;
  // Dialog handlers for advanced features
  onOpenCitationDialog?: () => void;
  /** Open the figure/table cross-reference dialog, optionally pre-filtered to figure or table */
  onOpenCrossRefDialog?: (filterType?: 'figure' | 'table') => void;
  onOpenWPRefDialog?: () => void;
  onOpenParticipantRefDialog?: () => void;
  onOpenFigureDialog?: () => void;
  onInsertTaskRef?: (task: any) => void;
  onInsertDeliverableRef?: (del: any) => void;
  onInsertMilestoneRef?: (ms: any) => void;
  onInsertAcronymRef?: () => void;
  onOpenCaseRefDialog?: () => void;
  acronymSegments?: AcronymSegment[];
  hasCases?: boolean;
  /** Called before opening a cross-ref dialog so the parent can save the cursor position */
  onSaveSelection?: () => void;
}

export function WPSimpleEditor({
  value,
  onChange,
  placeholder = '',
  className,
  disabled = false,
  minHeight = '100px',
  hideToolbar = false,
  proposalId,
  onOpenCitationDialog,
  onOpenCrossRefDialog,
  onOpenWPRefDialog,
  onOpenParticipantRefDialog,
  onOpenFigureDialog,
  onInsertTaskRef,
  onInsertDeliverableRef,
  onInsertMilestoneRef,
  onInsertAcronymRef,
  onOpenCaseRefDialog,
  acronymSegments,
  hasCases,
  onSaveSelection,
}: WPSimpleEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [isTaskRefOpen, setIsTaskRefOpen] = useState(false);
  const [isDeliverableRefOpen, setIsDeliverableRefOpen] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialMount = useRef(true);
  const hasPendingLocalChangesRef = useRef(false);

  // Set initial content
  useEffect(() => {
    if (editorRef.current && isInitialMount.current) {
      editorRef.current.innerHTML = value || '';
      hasPendingLocalChangesRef.current = false;
      isInitialMount.current = false;
    }
  }, []);

  // Sync external value changes
  useEffect(() => {
    if (!editorRef.current || isFocused) return;

    const nextValue = value || '';
    const currentContent = editorRef.current.innerHTML;

    if (currentContent === nextValue) {
      hasPendingLocalChangesRef.current = false;
      return;
    }

    if (hasPendingLocalChangesRef.current) {
      return;
    }

    editorRef.current.innerHTML = nextValue;
  }, [value, isFocused]);

  const emitChange = useCallback((nextValue: string) => {
    hasPendingLocalChangesRef.current = true;
    onChange(nextValue);
  }, [onChange]);

  const flushPendingChange = useCallback(() => {
    if (!editorRef.current) return;

    const currentValue = editorRef.current.innerHTML;
    if (!debounceRef.current && currentValue === (value || '')) {
      return;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    emitChange(currentValue);
  }, [emitChange, value]);

  const handleInput = useCallback(() => {
    if (!editorRef.current) return;

    const newValue = editorRef.current.innerHTML;
    hasPendingLocalChangesRef.current = true;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      emitChange(newValue);
    }, 500);
  }, [emitChange]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const execCommand = useCallback((command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    handleInput();
  }, [handleInput]);

  const handleNumberedSubheading = useCallback(() => {
    const h3s = editorRef.current?.querySelectorAll('h3') || [];
    const nextNum = h3s.length + 1;
    execCommand('formatBlock', '<h3>');
    execCommand('insertText', `${nextNum}. `);
  }, [execCommand]);

  const handleUnnumberedSubheading = useCallback(() => {
    // Apply both bold and underline as inline character styles
    execCommand('bold');
    execCommand('underline');
  }, [execCommand]);

  const showPlaceholder = !value && !isFocused;

  const hasCrossRef =
    !!onOpenCrossRefDialog ||
    !!onOpenWPRefDialog ||
    !!onInsertTaskRef ||
    !!onInsertDeliverableRef ||
    !!onOpenParticipantRefDialog;

  const crossRefMenuItems = hasCrossRef ? (
    <>
      {onOpenCrossRefDialog && (
        <DropdownMenuItem onClick={onOpenCrossRefDialog} className="flex items-center gap-2">
          <span className="w-16 flex justify-start shrink-0"><ImageIcon className="w-3.5 h-3.5 text-foreground" /></span>
          <span>Figure / Table number</span>
        </DropdownMenuItem>
      )}
      {onOpenWPRefDialog && (
        <DropdownMenuItem onClick={onOpenWPRefDialog} className="flex items-center gap-2">
          <span className="w-16 flex justify-start shrink-0">
            <span style={{ display: 'inline-block', width: '22px', height: '14px', backgroundColor: '#2563EB', border: '1.5px solid #2563EB', borderRadius: '9999px' }} />
          </span>
          <span>Work package</span>
        </DropdownMenuItem>
      )}
      {onInsertTaskRef && (
        <DropdownMenuItem onClick={() => setIsTaskRefOpen(true)} className="flex items-center gap-2">
          <span className="w-16 flex justify-start shrink-0">
            <span style={{ display: 'inline-block', width: '22px', height: '14px', borderRadius: '9999px', border: '1.5px solid #2563EB', background: '#ffffff' }} />
          </span>
          <span>Task</span>
        </DropdownMenuItem>
      )}
      {onInsertDeliverableRef && (
        <DropdownMenuItem onClick={() => setIsDeliverableRefOpen(true)} className="flex items-center gap-2">
          <span className="w-16 flex justify-start shrink-0">
            <span style={{ display: 'inline-block', width: '22px', height: '14px', background: '#2563EB', clipPath: 'polygon(0% 0%, calc(100% - 6px) 0%, 100% 50%, calc(100% - 6px) 100%, 0% 100%)', position: 'relative' }}>
              <span style={{ position: 'absolute', inset: '1.5px', right: '2px', background: '#ffffff', clipPath: 'polygon(0% 0%, calc(100% - 5px) 0%, 100% 50%, calc(100% - 5px) 100%, 0% 100%)' }} />
            </span>
          </span>
          <span>Deliverable</span>
        </DropdownMenuItem>
      )}
      {onOpenParticipantRefDialog && (
        <DropdownMenuItem onClick={onOpenParticipantRefDialog} className="flex items-center gap-2">
          <span className="w-16 flex justify-start shrink-0">
            <span style={{ display: 'inline-block', width: '22px', height: '14px', backgroundColor: '#000000', border: '1.5px solid #000000', borderRadius: '9999px' }} />
          </span>
          <span>Participant</span>
        </DropdownMenuItem>
      )}
    </>
  ) : null;

  const trailing =
    proposalId && onInsertTaskRef && onInsertDeliverableRef && onInsertMilestoneRef ? (
      <InsertTDMSReferenceDropdowns
        proposalId={proposalId}
        disabled={disabled}
        onInsertTask={onInsertTaskRef}
        onInsertDeliverable={onInsertDeliverableRef}
        onInsertMilestone={onInsertMilestoneRef}
        dialogsOnly
        openTask={isTaskRefOpen}
        onOpenTaskChange={setIsTaskRefOpen}
        openDeliverable={isDeliverableRefOpen}
        onOpenDeliverableChange={setIsDeliverableRefOpen}
        hideMilestone
      />
    ) : null;

  return (
    <div className={cn("border rounded-md overflow-hidden", disabled && "opacity-50", className)}>
      {/* Toolbar - matches Part B formatting toolbar order */}
      <DraftFormattingToolbar
        onCommand={execCommand}
        showGuidelinesRow={false}
        showSubheading={true}
        onSubheadingNumbered={handleNumberedSubheading}
        onSubheadingUnnumbered={handleUnnumberedSubheading}
        hideToolbar={hideToolbar || disabled}
        disabled={disabled}
        onOpenFigureDialog={onOpenFigureDialog}
        onOpenCitationDialog={onOpenCitationDialog}
        onSaveSelection={onSaveSelection}
        crossRefMenuItems={crossRefMenuItems}
        trailing={trailing}
      />

      {/* Editor */}
      <div className="relative">
        <div
          ref={editorRef}
          contentEditable={!disabled}
          onInput={handleInput}
          onPaste={(e: React.ClipboardEvent) => {
            e.preventDefault();
            const text = e.clipboardData.getData('text/plain');
            document.execCommand('insertText', false, text);
          }}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            flushPendingChange();
            setIsFocused(false);
          }}
          className={cn(
            "p-3 outline-none resize-y overflow-auto text-draft",
            "[&_p]:mt-[6pt] [&_p]:mb-[6pt] [&_div]:mt-[6pt] [&_div]:mb-[6pt]",
            "[&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4",
            "[&_table]:w-full [&_table]:border-collapse",
            "[&_th]:border [&_th]:border-foreground [&_th]:p-1 [&_th]:bg-foreground [&_th]:text-background [&_th]:font-bold",
            "[&_td]:border [&_td]:border-foreground [&_td]:p-1",
            disabled && "cursor-not-allowed"
          )}
          style={{ minHeight, fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '11pt' }}
          suppressContentEditableWarning
        />
        {showPlaceholder && (
          <div className="absolute top-3 left-3 text-muted-foreground text-draft pointer-events-none">
            {placeholder}
          </div>
        )}
      </div>
    </div>
  );
}
