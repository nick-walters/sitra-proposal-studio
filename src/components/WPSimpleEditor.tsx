import { useState, useCallback, useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';
import { stripWordHtml } from '@/lib/stripWordHtml';
import { Image as ImageLucide, Table2 } from 'lucide-react';
import {
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { InsertTDMSReferenceDropdowns } from '@/components/InsertTDMSReferenceDropdowns';
import { DraftFormattingToolbar } from '@/components/DraftFormattingToolbar';
import { caseWord } from '@/lib/caseTypeLabels';
import { useProposalCaseTypes } from '@/hooks/useProposalCaseTypes';


const SIMPLE_SANITIZE_CONFIG = {
  ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 's', 'ul', 'ol', 'li', 'span', 'a', 'h1', 'h2', 'h3', 'h4', 'sub', 'sup', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'figure', 'figcaption', 'div'],
  ALLOWED_ATTR: ['class', 'style', 'href', 'target', 'rel', 'colspan', 'rowspan', 'src', 'alt', 'data-type', 'data-id', 'data-wp-number', 'data-wp-short-name', 'data-wp-color', 'data-task-number', 'data-deliverable-number', 'data-milestone-number', 'data-participant-number', 'data-short-name', 'data-case-number', 'data-case-short-name', 'data-case-color', 'data-case-type', 'data-figure-id', 'data-table-key', 'data-ref-type', 'data-ref-id', 'data-citation-id', 'data-acronym', 'contenteditable'],
};

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
  /** Optional focus/blur listeners — fired in addition to the editor's internal handling. */
  onFocus?: () => void;
  onBlur?: () => void;
  /** Coordinator+? Enables deleting custom colours from the shared library. */
  canManageCustomColors?: boolean;
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
  onFocus,
  onBlur,
  canManageCustomColors = false,
}: WPSimpleEditorProps) {

  const editorRef = useRef<HTMLDivElement>(null);
  const { data: caseTypes = [] } = useProposalCaseTypes(proposalId);

  const [isFocused, setIsFocused] = useState(false);
  const [isTaskRefOpen, setIsTaskRefOpen] = useState(false);
  const [isDeliverableRefOpen, setIsDeliverableRefOpen] = useState(false);
  const [isMilestoneRefOpen, setIsMilestoneRefOpen] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialMount = useRef(true);
  const hasPendingLocalChangesRef = useRef(false);

  // Set initial content
  useEffect(() => {
    if (editorRef.current && isInitialMount.current) {
      editorRef.current.innerHTML = DOMPurify.sanitize(value || '', SIMPLE_SANITIZE_CONFIG);
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

    editorRef.current.innerHTML = DOMPurify.sanitize(nextValue, SIMPLE_SANITIZE_CONFIG);
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
    !!onInsertMilestoneRef ||
    !!onOpenParticipantRefDialog ||
    !!onOpenCaseRefDialog ||
    !!onInsertAcronymRef;

  const crossRefMenuItems = hasCrossRef ? (
    <>
      {onOpenCrossRefDialog && (
        <DropdownMenuItem onClick={() => onOpenCrossRefDialog('figure')} className="flex items-center gap-2">
          <span className="w-16 flex justify-start shrink-0"><ImageLucide className="w-3.5 h-3.5 text-foreground" /></span>
          <span>Figure number</span>
        </DropdownMenuItem>
      )}
      {onOpenCrossRefDialog && (
        <DropdownMenuItem onClick={() => onOpenCrossRefDialog('table')} className="flex items-center gap-2">
          <span className="w-16 flex justify-start shrink-0"><Table2 className="w-3.5 h-3.5 text-foreground" /></span>
          <span>Table number</span>
        </DropdownMenuItem>
      )}
      {onInsertAcronymRef && acronymSegments && acronymSegments.length > 0 && (
        <DropdownMenuItem onClick={onInsertAcronymRef} className="flex items-center gap-2">
          <span className="w-16 flex justify-start shrink-0">
            <span style={{ fontFamily: "'Arial Black', Arial, sans-serif", fontWeight: 900, fontSize: '9px', whiteSpace: 'nowrap' }}>
              {acronymSegments.map((seg, i) => <span key={i} style={{ color: seg.color }}>{seg.text}</span>)}
            </span>
          </span>
          <span>Acronym</span>
        </DropdownMenuItem>
      )}
      {onOpenWPRefDialog && (
        <DropdownMenuItem onClick={onOpenWPRefDialog} className="flex items-center gap-2">
          <span className="w-16 flex justify-start shrink-0">
            <span style={{ display: 'inline-block', width: '22px', height: '14px', backgroundColor: '#73C92D', border: '1.5px solid #73C92D', borderRadius: '9999px' }} />
          </span>
          <span>Work package</span>
        </DropdownMenuItem>
      )}
      {onInsertTaskRef && (
        <DropdownMenuItem onClick={() => setIsTaskRefOpen(true)} className="flex items-center gap-2">
          <span className="w-16 flex justify-start shrink-0">
            <span style={{ display: 'inline-block', width: '22px', height: '14px', borderRadius: '9999px', border: '1.5px solid #73C92D', background: '#ffffff' }} />
          </span>
          <span>Task</span>
        </DropdownMenuItem>
      )}
      {onInsertDeliverableRef && (
        <DropdownMenuItem onClick={() => setIsDeliverableRefOpen(true)} className="flex items-center gap-2">
          <span className="w-16 flex justify-start shrink-0">
            <span style={{ display: 'inline-block', width: '22px', height: '14px', background: '#73C92D', clipPath: 'polygon(0% 0%, calc(100% - 6px) 0%, 100% 50%, calc(100% - 6px) 100%, 0% 100%)', position: 'relative' }}>
              <span style={{ position: 'absolute', inset: '1.5px', right: '2px', background: '#ffffff', clipPath: 'polygon(0% 0%, calc(100% - 5px) 0%, 100% 50%, calc(100% - 5px) 100%, 0% 100%)' }} />
            </span>
          </span>
          <span>Deliverable</span>
        </DropdownMenuItem>
      )}
      {onInsertMilestoneRef && (
        <DropdownMenuItem onClick={() => setIsMilestoneRefOpen(true)} className="flex items-center gap-2">
          <span className="w-16 flex justify-start shrink-0">
            <span style={{ display: 'inline-block', width: '16px', height: '16px', background: '#000', clipPath: 'polygon(100% 0%, 0% 50%, 100% 100%)', margin: '-1px 0' }} />
          </span>
          <span>Milestone</span>
        </DropdownMenuItem>
      )}
      {onOpenCaseRefDialog && hasCases && (
        <DropdownMenuItem onClick={onOpenCaseRefDialog} className="flex items-center gap-2">
          <span className="w-16 flex justify-start shrink-0">
            <span style={{ display: 'inline-block', width: '22px', height: '14px', border: '1.5px solid #000000', borderRadius: '9999px', background: '#ffffff' }} />
          </span>
          <span>{caseWord(caseTypes, { capitalize: true })}</span>
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
        openMilestone={isMilestoneRefOpen}
        onOpenMilestoneChange={setIsMilestoneRefOpen}
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
        fontColor={{
          proposalId: proposalId ?? null,
          canManageCustom: canManageCustomColors,
          getEditableElement: () => editorRef.current,
        }}
      />

      {/* Editor */}
      <div className="relative">
        <div
          ref={editorRef}
          contentEditable={!disabled}
          onInput={handleInput}
          onPaste={(e: React.ClipboardEvent) => {
            e.preventDefault();
            const html = e.clipboardData.getData('text/html');
            if (html) {
              // Keep basic formatting (bold/italic/lists/links) but strip
              // Word/MSO junk and preserve any custom cross-ref nodes.
              const cleaned = stripWordHtml(html);
              document.execCommand('insertHTML', false, cleaned);
            } else {
              const text = e.clipboardData.getData('text/plain');
              document.execCommand('insertText', false, text);
            }
          }}
          onFocus={() => { setIsFocused(true); onFocus?.(); }}
          onBlur={() => {
            flushPendingChange();
            setIsFocused(false);
            onBlur?.();
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
