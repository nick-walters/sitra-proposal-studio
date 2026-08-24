import { useState, type ReactNode } from 'react';
import type { Editor } from '@tiptap/react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Link2 } from 'lucide-react';
import { KeyboardShortcutsDialog } from '@/components/KeyboardShortcutsDialog';
import {
  EditorChrome,
  EditorTopBar,
  EditorFieldBar,
  type EditorTopBarProps,
  type EditorFieldBarProps,
  type SaveStateButtonProps,
} from '@/components/EditorChrome';
import { FormattingToolbar } from '@/components/RichTextEditor';
import { useMethodologyEditorFocus } from '@/components/MethodologyEditorFocusContext';

/**
 * THE toolbar for every editing surface on the platform.
 *
 * There is deliberately no second implementation. A surface says which
 * page-wide actions it HAS (by supplying a handler) and supplies the dialogs
 * its formatting controls open; everything else — which formatting and
 * field-level controls appear — is decided by the focused field's own
 * capabilities, never by the surface.
 *
 * Three tiers, in order:
 *   TOP     page-wide actions, always visible
 *   MIDDLE  field-specific features, only with a focused field
 *   BOTTOM  formatting, only with a focused field
 */

export interface EditorToolbarsFormattingProps {
  proposalId?: string | null;
  canManageCustomColors?: boolean;
  /** Section number, used to label the numbered-subheading item. */
  sectionNumber?: string;
  isPartB?: boolean;
  isReadOnly?: boolean;
  onOpenFigureDialog?: () => void;
  onOpenCitationDialog?: () => void;
  onOpenFormulaDialog?: () => void;
  /** Surface-supplied cross-reference menu (the chip sets differ per proposal). */
  /** Node, or a callback given the focused editor (chip menus need it). */
  crossRefDropdown?: ReactNode | ((editor: Editor) => ReactNode);
  /** B3.1 only: the React tables are not ProseMirror nodes. */
  hideTableInsert?: boolean;
  b31TableFocus?: string | null;
  onB31AutoResize?: () => void;
}

export interface EditorToolbarsProps {
  proposalId?: string;
  /** Save state for the unified autosave-indicator-in-button. */
  save: SaveStateButtonProps;
  /** Page-wide actions this surface HAS. Omit a handler and the control goes. */
  topBar?: Omit<EditorTopBarProps, keyof SaveStateButtonProps>;
  /** Field-level features this surface HAS, beyond what capabilities decide. */
  fieldBar?: Omit<EditorFieldBarProps, 'hasFocusedField'>;
  /** Bottom tier configuration. Omit entirely on surfaces with no rich text. */
  formatting?: EditorToolbarsFormattingProps;
  children?: ReactNode;
}

/**
 * The Cross-ref control, identical on every surface. Only the MENU ITEMS
 * differ (a surface knows which chip types its proposal offers), so those are
 * the only thing a caller supplies.
 */
export function CrossRefMenu({
  items,
  disabled,
  onSaveSelection,
}: {
  items: ReactNode;
  disabled?: boolean;
  onSaveSelection?: () => void;
}) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 gap-1"
              disabled={disabled}
              aria-label="Insert cross-reference"
              onMouseDown={onSaveSelection}
            >
              <Link2 className="h-4 w-4" />
              <span className="text-xs">Cross-ref</span>
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          Insert cross-reference
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" className="w-64 bg-popover z-50">
        {items}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function EditorToolbars({
  proposalId,
  save,
  topBar,
  fieldBar,
  formatting,
  children,
}: EditorToolbarsProps) {
  const { activeEditor, scalarField } = useMethodologyEditorFocus();
  const hasFocusedEditor = !!activeEditor && !activeEditor.isDestroyed;
  // Scalar controls open the FEATURES tier only: they have no marks to
  // format, but their block's guidelines and version history stay reachable.
  const hasFocusedField = hasFocusedEditor || !!scalarField;

  // Keyboard shortcuts apply to every editing surface, so the control and its
  // dialog belong to the shared toolbar rather than to each page.
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  return (
    <>
    <EditorChrome
      proposalId={proposalId}
      topBar={
        <EditorTopBar
          saving={save.saving}
          lastSaved={save.lastSaved}
          savedMode={save.savedMode}
          isDirty={save.isDirty}
          onSaveNow={save.onSaveNow}
          {...(topBar ?? {})}
          onOpenShortcuts={topBar?.onOpenShortcuts ?? (() => setShortcutsOpen(true))}
        />
      }
      fieldBar={<EditorFieldBar hasFocusedField={hasFocusedField} {...(fieldBar ?? {})} />}
      formattingBar={
        formatting && hasFocusedField ? (
          <div
            onMouseDown={(e) => {
              // Keep the caret in the field the toolbar is acting on, unless
              // the click landed in one of the toolbar's own inputs.
              const target = e.target as HTMLElement | null;
              if (target?.closest('input, textarea, [contenteditable="true"]')) return;
              e.preventDefault();
            }}
          >
            <FormattingToolbar
              editor={activeEditor}
              proposalId={formatting.proposalId ?? proposalId ?? null}
              canManageCustomColors={formatting.canManageCustomColors}
              sectionNumber={formatting.sectionNumber}
              isPartB={formatting.isPartB ?? true}
              isReadOnly={formatting.isReadOnly}
              hideTableInsert={formatting.hideTableInsert}
              b31TableFocus={formatting.b31TableFocus}
              onB31AutoResize={formatting.onB31AutoResize}
              onOpenFigureDialog={formatting.onOpenFigureDialog}
              onOpenCitationDialog={formatting.onOpenCitationDialog}
              onOpenFormulaDialog={formatting.onOpenFormulaDialog}
              crossRefDropdown={
                typeof formatting.crossRefDropdown === 'function'
                  ? formatting.crossRefDropdown(activeEditor)
                  : formatting.crossRefDropdown
              }
            />
          </div>
        ) : null
      }
    >
      {children}
    </EditorChrome>
    <KeyboardShortcutsDialog isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </>
  );
}

export default EditorToolbars;
