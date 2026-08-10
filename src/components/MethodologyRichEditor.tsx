import { useEffect, useId } from 'react';
import { EditorContent } from '@tiptap/react';
import { FormattingToolbar, useRichTextEditor } from './RichTextEditor';
import { PartBCrossRefControls } from './PartBCrossRefControls';

interface MethodologyRichEditorProps {
  proposalId: string;
  value: string;
  onChange: (html: string) => void;
  canEdit: boolean;
  isCoordinator: boolean;
  minHeight?: string;
}

/**
 * Full Part B rich text editor for a single Methodologies subsection card.
 * Uses the same TipTap machinery as Part B section editors.
 */
export function MethodologyRichEditor({
  proposalId,
  value,
  onChange,
  canEdit,
  isCoordinator,
  minHeight = '2.5rem',
}: MethodologyRichEditorProps) {
  // Stable, unique per mounted instance — several editors live on one page.
  const instanceKey = useId();

  const editor = useRichTextEditor({
    content: value,
    onChange,
    isReady: true,
    instanceKey,
  });

  useEffect(() => {
    if (editor) editor.setEditable(canEdit);
  }, [editor, canEdit]);

  return (
    <div className="space-y-2">
      <FormattingToolbar
        editor={editor}
        proposalId={proposalId}
        canManageCustomColors={isCoordinator}
        isPartB
        isReadOnly={!canEdit}
        crossRefDropdown={
          <PartBCrossRefControls
            editor={editor}
            proposalId={proposalId}
            disabled={!canEdit}
            showKeyboardButton={false}
          />
        }
      />
      <div
        className="cursor-text overflow-visible rounded-md border border-border bg-background px-4 py-2 [&_.ProseMirror]:!min-h-0 [&_.ProseMirror]:overflow-visible [&_.document-content]:!min-h-0"
        style={{ minHeight }}
        onMouseDown={(e) => {
          // Clicking the padding focuses the editor rather than doing nothing.
          if (e.target === e.currentTarget && editor) {
            e.preventDefault();
            editor.chain().focus('end').run();
          }
        }}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

export default MethodologyRichEditor;
