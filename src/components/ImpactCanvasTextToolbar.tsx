import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { Bold, Italic, Underline as UnderlineIcon, Superscript as SupIcon, Subscript as SubIcon, Type } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WPColorPicker } from './WPColorPicker';
import { subscribeFocusedCanvasEditor } from '@/lib/impactCanvasFocusedEditor';
import { DEFAULT_PT, DEFAULT_TEXT_COLOR, FONT_SIZE_OPTIONS } from '@/lib/impactCanvasTextSizing';
import { cn } from '@/lib/utils';
// Side-effect imports so declaration-merged commands (toggleSubscript,
// toggleSuperscript, setColor, canvas marks) are visible to TS here too.
import '@tiptap/extension-subscript';
import '@tiptap/extension-superscript';
import '@tiptap/extension-underline';
import '@tiptap/extension-color';
import '@/extensions/CanvasFontSize';
import '@/extensions/CanvasHeader';

/**
 * Impact Canvas text formatting dropdown — SINGLE toolbar control that
 * holds every per-run mark: Bold, Italic, Underline, Superscript,
 * Subscript, Header-style (Arial Black), Font size (9–14pt), Font
 * colour. Replaces the old per-object font-colour button.
 *
 * Acts on the CURRENTLY-FOCUSED canvas editor's selection (registered
 * via `setFocusedCanvasEditor` on TipTap focus). All controls use
 * `onMouseDown → preventDefault` so clicking the toolbar does NOT
 * blur the underlying editor.
 */
interface Props {
  proposalId: string;
  canEdit: boolean;
}

export function ImpactCanvasTextToolbar({ proposalId, canEdit }: Props) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => subscribeFocusedCanvasEditor(setEditor), []);

  // Re-render when the editor's selection changes so active marks + current
  // pt/colour reflect the caret position live.
  useEffect(() => {
    if (!editor) return;
    const bump = () => setTick((n) => n + 1);
    editor.on('selectionUpdate', bump);
    editor.on('transaction', bump);
    return () => {
      editor.off('selectionUpdate', bump);
      editor.off('transaction', bump);
    };
  }, [editor]);

  const disabled = !canEdit || !editor;

  const activeBold = !!editor?.isActive('bold');
  const activeItalic = !!editor?.isActive('italic');
  const activeUnderline = !!editor?.isActive('underline');
  const activeSup = !!editor?.isActive('superscript');
  const activeSub = !!editor?.isActive('subscript');
  const activeHeader = !!editor?.isActive('canvasHeader');
  const currentPt = (editor?.getAttributes('canvasFontSize')?.pt as number | null | undefined) ?? DEFAULT_PT;
  const currentColor = (editor?.getAttributes('textStyle')?.color as string | undefined) ?? DEFAULT_TEXT_COLOR;

  const run = (fn: () => void) => {
    if (!editor) return;
    fn();
  };

  return (
    <div className="inline-flex" data-impact-canvas-toolbar>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={!canEdit}
            className="inline-flex items-center justify-center h-7 w-8 rounded-md bg-transparent hover:bg-accent transition-colors disabled:opacity-40"
            title="Text formatting"
            aria-label="Text formatting"
            onMouseDown={(e) => e.preventDefault()}
          >
            <Type className="w-4 h-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-72 p-2"
          data-impact-canvas-toolbar
          onOpenAutoFocus={(e) => e.preventDefault()}
          onMouseDown={(e) => {
            // Prevent editor blur while interacting with the toolbar.
            e.preventDefault();
          }}
        >
          {!editor && (
            <div className="text-[11px] text-muted-foreground px-1 pb-2">
              Double-click a text box, shape, or cell to edit, then select text and use these controls.
            </div>
          )}

          <div className="flex items-center gap-0.5 flex-wrap">
            <FormatToggle disabled={disabled} pressed={activeBold} onClick={() => run(() => editor!.chain().focus().toggleBold().run())} label="Bold"><Bold className="w-3.5 h-3.5" /></FormatToggle>
            <FormatToggle disabled={disabled} pressed={activeItalic} onClick={() => run(() => editor!.chain().focus().toggleItalic().run())} label="Italic"><Italic className="w-3.5 h-3.5" /></FormatToggle>
            <FormatToggle disabled={disabled} pressed={activeUnderline} onClick={() => run(() => editor!.chain().focus().toggleUnderline().run())} label="Underline"><UnderlineIcon className="w-3.5 h-3.5" /></FormatToggle>
            <Separator orientation="vertical" className="h-5 mx-1" />
            <FormatToggle disabled={disabled} pressed={activeSup} onClick={() => run(() => editor!.chain().focus().toggleSuperscript().run())} label="Superscript"><SupIcon className="w-3.5 h-3.5" /></FormatToggle>
            <FormatToggle disabled={disabled} pressed={activeSub} onClick={() => run(() => editor!.chain().focus().toggleSubscript().run())} label="Subscript"><SubIcon className="w-3.5 h-3.5" /></FormatToggle>
            <Separator orientation="vertical" className="h-5 mx-1" />
            <FormatToggle disabled={disabled} pressed={activeHeader} onClick={() => run(() => editor!.chain().focus().toggleCanvasHeader().run())} label="Header style (Arial Black)">
              <span className="text-[11px] font-black" style={{ fontFamily: '"Arial Black", Arial, sans-serif' }}>Aa</span>
            </FormatToggle>
          </div>

          <div className="flex items-center gap-2 mt-2">
            <label className="text-[11px] text-muted-foreground">Size</label>
            <Select
              value={String(currentPt)}
              disabled={disabled}
              onValueChange={(v) => {
                const pt = parseInt(v, 10);
                if (!Number.isFinite(pt)) return;
                run(() => editor!.chain().focus().setCanvasFontSize(pt).run());
              }}
            >
              <SelectTrigger className="h-7 w-20 text-xs" onMouseDown={(e) => e.preventDefault()}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent onMouseDown={(e) => e.preventDefault()}>
                {FONT_SIZE_OPTIONS.map((pt) => (
                  <SelectItem key={pt} value={String(pt)}>{pt} pt</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-1 ml-2">
              <label className="text-[11px] text-muted-foreground">Colour</label>
              <WPColorPicker
                color={currentColor}
                onChange={(c) => run(() => editor!.chain().focus().setColor(c).run())}
                disabled={disabled}
                proposalId={proposalId}
                canManageCustom={canEdit}
                label="Text colour"
                showGreyscale
                trigger={
                  <button
                    type="button"
                    disabled={disabled}
                    className="inline-flex items-center justify-center h-7 w-7 rounded-md bg-transparent hover:bg-accent transition-colors disabled:opacity-40"
                    onMouseDown={(e) => e.preventDefault()}
                    aria-label="Text colour"
                    title="Text colour"
                  >
                    <span className="text-[13px] font-semibold leading-none" style={{ fontFamily: 'Arial, sans-serif' }}>A</span>
                    <span className="ml-0.5 block h-3 w-1.5 rounded-sm border border-black/20" style={{ background: currentColor }} />
                  </button>
                }
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function FormatToggle({
  pressed,
  disabled,
  onClick,
  label,
  children,
}: {
  pressed: boolean;
  disabled: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={pressed ? 'secondary' : 'ghost'}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      className={cn('h-7 w-7 p-0')}
    >
      {children}
    </Button>
  );
}
