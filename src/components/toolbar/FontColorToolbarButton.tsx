import { useCallback, useRef, useState } from 'react';
import { Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WPColorPicker } from '@/components/WPColorPicker';

/**
 * Font-colour picker for contentEditable toolbars (WP drafts, case drafts,
 * A2 participant fields). Applies via document.execCommand('foreColor'),
 * removes by stripping inline color styles from spans in the selection.
 *
 * Reuses the shared per-proposal colour library via <WPColorPicker />.
 */
interface FontColorToolbarButtonProps {
  proposalId?: string | null;
  canManageCustom?: boolean;
  disabled?: boolean;
  /**
   * Resolve the contentEditable element to notify (for input dispatch after
   * remove-colour). Optional — if not provided, we walk from the current
   * selection.
   */
  getEditableElement?: () => HTMLElement | null;
  /** Optional live HTML sources to include in colour in-use checks before autosave persists. */
  getLiveHtmlSources?: () => Array<string | null | undefined>;
  /** Notified when the picker popover opens/closes (for parent focus retention). */
  onOpenChange?: (open: boolean) => void;
}


function currentColorFromSelection(): string {
  try {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return '';
    const node = sel.getRangeAt(0).startContainer;
    const el = (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement) as HTMLElement | null;
    if (!el) return '';
    const inline = el.closest<HTMLElement>('[style*="color"]');
    if (inline) {
      const c = inline.style.color;
      if (c) return c;
    }
  } catch {
    /* ignore */
  }
  return '';
}

function findEditableFromNode(node: Node | null): HTMLElement | null {
  let cur: Node | null = node;
  while (cur) {
    if (cur.nodeType === Node.ELEMENT_NODE) {
      const el = cur as HTMLElement;
      if (el.isContentEditable) return el.closest<HTMLElement>('[contenteditable="true"]') ?? el;
    }
    cur = cur.parentNode;
  }
  return null;
}

export function FontColorToolbarButton({
  proposalId,
  canManageCustom,
  disabled,
  getEditableElement,
  getLiveHtmlSources,
  onOpenChange,
}: FontColorToolbarButtonProps) {

  const savedRangeRef = useRef<Range | null>(null);
  const [currentColor, setCurrentColor] = useState<string>('');

  const saveSelection = useCallback(() => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
      setCurrentColor(currentColorFromSelection());
    }
  }, []);

  const restoreSelection = useCallback((): Range | null => {
    const range = savedRangeRef.current;
    if (!range) return null;
    const sel = window.getSelection();
    if (!sel) return null;
    sel.removeAllRanges();
    sel.addRange(range);
    return range;
  }, []);

  const resolveEditable = useCallback((range: Range | null): HTMLElement | null => {
    if (getEditableElement) {
      const el = getEditableElement();
      if (el) return el;
    }
    if (range) return findEditableFromNode(range.startContainer);
    return null;
  }, [getEditableElement]);

  const applyColor = useCallback((hex: string) => {
    const range = restoreSelection();
    const editable = resolveEditable(range);
    if (editable && document.activeElement !== editable) {
      editable.focus({ preventScroll: true });
      if (range) {
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
    try { document.execCommand('styleWithCSS', false, 'true' as unknown as string); } catch { /* noop */ }
    document.execCommand('foreColor', false, hex);
    editable?.dispatchEvent(new Event('input', { bubbles: true }));
  }, [restoreSelection, resolveEditable]);

  const removeColor = useCallback(() => {
    const range = restoreSelection();
    if (!range) return;
    const editable = resolveEditable(range);
    if (editable && document.activeElement !== editable) {
      editable.focus({ preventScroll: true });
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
    const container = range.commonAncestorContainer;
    const root = (container.nodeType === Node.ELEMENT_NODE
      ? container as Element
      : container.parentElement) ?? editable;
    if (!root) return;
    const targets = Array.from(
      root.querySelectorAll<HTMLElement>('span[style*="color"], font[color]')
    ).filter((el) => {
      try { return range.intersectsNode(el); } catch { return false; }
    });
    targets.forEach((el) => {
      if (el.tagName === 'FONT') el.removeAttribute('color');
      if (el instanceof HTMLElement) {
        el.style.removeProperty('color');
        if (el.getAttribute('style') === '') el.removeAttribute('style');
      }
    });
    editable?.dispatchEvent(new Event('input', { bubbles: true }));
  }, [restoreSelection, resolveEditable]);

  const trigger = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-7 w-7 relative"
      aria-label="Text colour"
      title="Text colour"
      disabled={disabled}
      onMouseDown={(e) => {
        // Preserve the editor's selection when opening the popover.
        e.preventDefault();
        saveSelection();
      }}
    >
      <Palette className="w-4 h-4" />
      {currentColor && (
        <span
          className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-3.5 h-0.5 rounded-full"
          style={{ backgroundColor: currentColor }}
        />
      )}
    </Button>
  );

  return (
    <WPColorPicker
      color={currentColor || '#000000'}
      onChange={applyColor}
      onRemove={removeColor}
      removeLabel="Remove colour"
      proposalId={proposalId ?? null}
      canManageCustom={canManageCustom}
      trigger={trigger}
      label="Text colour"
      disabled={disabled}
      onOpenChange={onOpenChange}
      getLiveHtmlSources={getLiveHtmlSources ?? (() => {
        const editable = resolveEditable(savedRangeRef.current);
        return editable ? [editable.innerHTML] : [];
      })}
    />

  );
}
