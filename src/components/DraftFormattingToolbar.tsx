import { ReactNode, useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  EditorTopBar,
  EditorFieldBar,
  type EditorTopBarProps,
  type EditorFieldBarProps,
} from '@/components/EditorChrome';
import { FULL_FIELD_CAPABILITIES, type FieldCapabilityFlags } from '@/lib/fieldCapabilities';
import { ParagraphSpacingExecPopover } from '@/components/ParagraphSpacingExecPopover';
import {
  BookOpen, List, ListOrdered,
  ImageIcon, FileText, Link2, Undo2, Redo2,
} from 'lucide-react';
import {
  ToolbarButton,
  TextFormattingGroup,
  AlignmentGroup,
  TableGridPicker,
  SubheadingDropdown,
  FontColorToolbarButton,
  type Alignment,
} from './toolbar';

export interface DraftToolbarFontColorProps {
  proposalId?: string | null;
  canManageCustom?: boolean;
  /** Resolve the active contentEditable element (for post-remove input dispatch). */
  getEditableElement?: () => HTMLElement | null;
  /** Optional live HTML sources to include in colour in-use checks before autosave persists. */
  getLiveHtmlSources?: () => Array<string | null | undefined>;
  /** Resolve the focused TipTap editor so colour is applied to the document. */
  getEditor?: () => Editor | null;
}

export interface DraftToolbarSaveProps {
  saving: boolean;
  lastSaved: Date | null;
  saveError?: string | null;
  onSaveNow?: () => void;
  /** Drives the grey/green state on the unified save button. */
  isDirty?: boolean;
  savedMode?: 'auto' | 'manual';
}

export interface DraftFormattingToolbarTableProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hoveredCell: { row: number; col: number } | null;
  onHoverCell: (cell: { row: number; col: number } | null) => void;
  onInsert: (rows: number, cols: number) => void;
}

export interface DraftFormattingToolbarProps {
  /** Callback to open the guidelines dialog. Required when showGuidelinesRow is true. */
  onOpenGuidelines?: () => void;
  /** Save state passed through to <SaveIndicator />. Required when showGuidelinesRow is true. */
  save?: DraftToolbarSaveProps;
  /** If true, the toolbar renders only the guidelines + save row. */
  isReadOnly?: boolean;
  /** If true, render nothing at all. */
  hideToolbar?: boolean;
  /** If true, disable all formatting buttons. */
  disabled?: boolean;
  /** Show the Guidelines + Save row (default true). */
  showGuidelinesRow?: boolean;

  // Subheading dropdown (optional — WPSimpleEditor uses this)
  showSubheading?: boolean;
  onSubheadingNumbered?: () => void;
  onSubheadingUnnumbered?: () => void;

  // Undo / Redo (optional — only WP has these)
  undo?: {
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
    undoLabel?: string;
    redoLabel?: string;
  };

  // Formatting commands — caller decides how (execCommand for both drafts today)
  onCommand: (command: string, value?: string) => void;

  // Table picker — when omitted, toolbar manages its own popover state and inserts via onCommand('insertHTML', ...)
  table?: DraftFormattingToolbarTableProps;

  // Paragraph-spacing popover container (optional — WP only)
  paragraphSpacingContainer?: () => HTMLElement | null;

  // Cross-ref / figure / citation handlers (all optional)
  onSaveSelection?: () => void;
  onOpenFigureDialog?: () => void;
  onOpenCitationDialog?: () => void;
  /** Cross-ref dropdown menu items rendered inside the toolbar's Cross-ref dropdown. */
  crossRefMenuItems?: ReactNode;
  /** Extra trailing nodes (e.g. <InsertTDMSReferenceDropdowns dialogsOnly />). */
  trailing?: ReactNode;

  /** Font-colour picker (shared per-proposal library). Optional. */
  fontColor?: DraftToolbarFontColorProps;

  /**
   * Capabilities of the FOCUSED field. Controls the field cannot use are
   * hidden (not disabled). Omit for the full control set.
   */
  capabilities?: Partial<FieldCapabilityFlags>;

  /**
   * Whether a rich text field currently has focus. When false the toolbar
   * shows only its focus-independent controls (the save state): the
   * formatting row and the Guidelines button are hidden, exactly as the
   * methodologies board behaves. Defaults to true for callers that have not
   * been wired to a focus context yet.
   */
  hasFocusedField?: boolean;

  /**
   * TOP TIER — page-wide controls, always visible. Controls that do not apply
   * to a surface are simply omitted (no handler supplied).
   */
  topBar?: Omit<EditorTopBarProps, 'saving' | 'lastSaved' | 'isDirty' | 'onSaveNow' | 'savedMode'>;

  /** MIDDLE TIER — extra field-specific features beyond Guidelines. */
  fieldBar?: Omit<EditorFieldBarProps, 'hasFocusedField' | 'onOpenGuidelines'>;
}



/**
 * True while the caret sits inside a table cell.
 *
 * Nested tables are never offered. The RichTextEditor toolbar derives this
 * from `editor.isActive('table')`; this toolbar drives contentEditable fields
 * (and cell-level editors that cannot see their own container), so it reads
 * the live DOM selection instead.
 */
function useSelectionInTable(): boolean {
  const [inTable, setInTable] = useState(false);

  useEffect(() => {
    const check = () => {
      const sel = document.getSelection();
      const node = sel?.anchorNode ?? null;
      const el = node
        ? node.nodeType === Node.ELEMENT_NODE
          ? (node as Element)
          : node.parentElement
        : null;
      setInTable(!!el?.closest('td, th'));
    };
    check();
    document.addEventListener('selectionchange', check);
    return () => document.removeEventListener('selectionchange', check);
  }, []);

  return inTable;
}

function buildDefaultTableHtml(rows: number, cols: number): string {
  let html = '<table style="width:100%; border-collapse:collapse; margin:8px 0;">';
  for (let r = 0; r < rows; r++) {
    html += '<tr>';
    for (let c = 0; c < cols; c++) {
      if (r === 0) {
        html += '<th style="border:1px solid #000; padding:4px; background:#000; color:#fff; font-weight:bold;">&nbsp;</th>';
      } else {
        html += '<td style="border:1px solid #000; padding:4px;">&nbsp;</td>';
      }
    }
    html += '</tr>';
  }
  html += '</table><p><br></p>';
  return html;
}

export function DraftFormattingToolbar({
  onOpenGuidelines,
  save,
  isReadOnly = false,
  hideToolbar = false,
  disabled = false,
  showGuidelinesRow = true,
  showSubheading = false,
  onSubheadingNumbered,
  onSubheadingUnnumbered,
  undo,
  onCommand,
  table,
  paragraphSpacingContainer,
  onSaveSelection,
  onOpenFigureDialog,
  onOpenCitationDialog,
  crossRefMenuItems,
  trailing,
  fontColor,
  capabilities,
  hasFocusedField = true,
  topBar,
  fieldBar,
}: DraftFormattingToolbarProps) {
  // Internal table-popover state used only when `table` prop is not supplied.
  // These hooks must run on EVERY render, so the `hideToolbar` guard sits
  // below them rather than at the top of the component.
  const [internalTableOpen, setInternalTableOpen] = useState(false);
  const selectionInTable = useSelectionInTable();
  const [internalHoveredCell, setInternalHoveredCell] = useState<{ row: number; col: number } | null>(null);

  if (hideToolbar) return null;


  const caps: FieldCapabilityFlags = { ...FULL_FIELD_CAPABILITIES, ...(capabilities ?? {}) };

  const exec = (cmd: string, value?: string) => onCommand(cmd, value);

  const effectiveTable: DraftFormattingToolbarTableProps = table ?? {
    open: internalTableOpen,
    onOpenChange: setInternalTableOpen,
    hoveredCell: internalHoveredCell,
    onHoverCell: setInternalHoveredCell,
    onInsert: (rows, cols) => {
      onCommand('insertHTML', buildDefaultTableHtml(rows, cols));
      setInternalTableOpen(false);
    },
  };

  // Opaque on every tier. The rounded card cannot carry the sticky background
  // on its own: outside its corner radius the element is transparent, so page
  // content (the pilot header most visibly) shows through at the corners. The
  // sticky element is therefore a square, fully opaque backdrop and the rounded
  // card lives inside it — the same structure as EditorChrome.
  const containerClass = showGuidelinesRow
    ? 'rounded-md border bg-card divide-y divide-border overflow-hidden shadow-sm'
    : 'p-1.5 border-b bg-card';

  const row2Class = showGuidelinesRow
    ? 'flex items-center gap-0.5 flex-wrap px-2 py-1.5 bg-card'
    : 'flex items-center gap-0 flex-wrap';

  const content = (
    <div className={containerClass}>

      {/* TOP TIER — page-wide controls, always visible */}
      {showGuidelinesRow && (
        <EditorTopBar
          saving={save?.saving ?? false}
          lastSaved={save?.lastSaved ?? null}
          savedMode={save?.savedMode ?? 'auto'}
          isDirty={save?.isDirty ?? false}
          onSaveNow={save?.onSaveNow}
          {...(topBar ?? {})}
        />
      )}

      {/* MIDDLE TIER — field-specific features, only with a focused field */}
      {showGuidelinesRow && (
        <EditorFieldBar
          hasFocusedField={hasFocusedField}
          onOpenGuidelines={onOpenGuidelines}
          {...(fieldBar ?? {})}
        />
      )}


      {/* Row 2: Formatting toolbar */}
      {!isReadOnly && hasFocusedField && (
        <div className={row2Class}>
          {undo && (
            <>
              <ToolbarButton
                icon={<Undo2 className="h-3.5 w-3.5" />}
                label={undo.undoLabel ?? 'Undo'}
                onClick={undo.onUndo}
                disabled={disabled || !undo.canUndo}
              />
              <ToolbarButton
                icon={<Redo2 className="h-3.5 w-3.5" />}
                label={undo.redoLabel ?? 'Redo'}
                onClick={undo.onRedo}
                disabled={disabled || !undo.canRedo}
              />
              <Separator orientation="vertical" className="h-5 mx-1.5" />
            </>
          )}

          {/* Subheading dropdown */}
          {showSubheading && caps.headings && (
            <SubheadingDropdown
              onNumbered={() => onSubheadingNumbered?.()}
              onUnnumbered={() => onSubheadingUnnumbered?.()}
              disabled={disabled}
              numberedLabel="Numbered subheading"
              unnumberedLabel="Unnumbered subheading"
            />
          )}

          {/* Bold / Italic / Underline */}
          <TextFormattingGroup
            onBold={() => exec('bold')}
            onItalic={() => exec('italic')}
            onUnderline={() => exec('underline')}
            disabled={disabled}
          />

          {fontColor && caps.colour && (
            <FontColorToolbarButton
              proposalId={fontColor.proposalId ?? null}
              canManageCustom={fontColor.canManageCustom}
              disabled={disabled}
              getEditableElement={fontColor.getEditableElement}
              getLiveHtmlSources={fontColor.getLiveHtmlSources}
              getEditor={fontColor.getEditor}
            />
          )}


          {(caps.bulletList || caps.orderedList) && (
            <>
              <Separator orientation="vertical" className="h-5 mx-1.5" />

              {/* Lists */}
              {caps.bulletList && (
                <ToolbarButton
                  icon={<List className="h-4 w-4" />}
                  label="Bullet list"
                  onClick={() => exec('insertUnorderedList')}
                  disabled={disabled}
                />
              )}
              {caps.orderedList && (
                <ToolbarButton
                  icon={<ListOrdered className="h-4 w-4" />}
                  label="Numbered list"
                  onClick={() => exec('insertOrderedList')}
                  disabled={disabled}
                />
              )}
            </>
          )}

          {caps.alignment && (
            <>
              <Separator orientation="vertical" className="h-5 mx-1.5" />

              {/* Alignment */}
              <AlignmentGroup
                disabled={disabled}
                onAlign={(a: Alignment) => {
                  const cmd = a === 'left' ? 'justifyLeft'
                    : a === 'center' ? 'justifyCenter'
                    : a === 'right' ? 'justifyRight'
                    : 'justifyFull';
                  exec(cmd);
                }}
              />
            </>
          )}

          {paragraphSpacingContainer && caps.paragraphSpacing && (
            <ParagraphSpacingExecPopover getContainer={paragraphSpacingContainer} />
          )}

          {((caps.tables && !selectionInTable) || (onOpenFigureDialog && caps.figures) || (onOpenCitationDialog && caps.citations) || (crossRefMenuItems && caps.crossReferences)) && (
            <Separator orientation="vertical" className="h-5 mx-1.5" />
          )}

          {/* Table picker — hidden inside a cell: no nested tables. */}
          {caps.tables && !selectionInTable && (
            <TableGridPicker
              disabled={disabled}
              open={effectiveTable.open}
              onOpenChange={effectiveTable.onOpenChange}
              onInsert={effectiveTable.onInsert}
            />
          )}

          {/* Figure */}
          {onOpenFigureDialog && caps.figures && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 gap-1" disabled={disabled} aria-label="Insert figure" onClick={onOpenFigureDialog} onMouseDown={onSaveSelection}>
                  <ImageIcon className="h-4 w-4" />
                  <span className="text-xs">Figure</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Insert figure</TooltipContent>
            </Tooltip>
          )}

          {/* Citations */}
          {onOpenCitationDialog && caps.citations && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 gap-1" disabled={disabled} aria-label="Manage citations" onClick={onOpenCitationDialog} onMouseDown={onSaveSelection}>
                  <FileText className="h-4 w-4" />
                  <span className="text-xs">Citations</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Manage citations</TooltipContent>
            </Tooltip>
          )}

          {/* Cross-ref dropdown */}
          {crossRefMenuItems && caps.crossReferences && (
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 gap-1" disabled={disabled} aria-label="Insert cross-reference" onMouseDown={onSaveSelection}>
                      <Link2 className="w-4 h-4" />
                      <span className="text-xs">Cross-ref</span>
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Insert cross-reference</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="start" className="w-64 bg-popover z-50">
                {crossRefMenuItems}
              </DropdownMenuContent>
            </DropdownMenu>
          )}


          {trailing}
        </div>
      )}
    </div>
  );

  if (!showGuidelinesRow) return content;

  return (
    <div className="sticky top-0 z-40 -mx-1 bg-background px-1 py-1">{content}</div>
  );
}

