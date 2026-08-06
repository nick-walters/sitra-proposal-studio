import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { InlineRichEditor } from '@/components/InlineRichEditor';
import {
  buildDeliverableBadge,
  insertIntoRememberedContentEditable,
  rememberContentEditableSelection,
} from '@/lib/contentEditableRefBadges';

describe('badge insertion into InlineRichEditor', () => {
  it('emits HTML containing the deliverable badge', async () => {
    const onChange = vi.fn();
    const { container } = render(
      <InlineRichEditor value="Existing text" onChange={onChange} debounceMs={5000} />,
    );
    const editor = container.querySelector('[contenteditable="true"]') as HTMLElement;
    expect(editor).toBeTruthy();
    expect(editor.innerHTML).toContain('Existing text');

    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    rememberContentEditableSelection(editor);

    const ok = insertIntoRememberedContentEditable(
      buildDeliverableBadge({ id: 'x', number: '1.2', title: 'T', color: '#73C92D' } as never),
    );
    expect(ok).toBe(true);
    expect(editor.innerHTML).toContain('data-deliverable-reference');

    // no debounce wait: badge insert must flush immediately
    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls.at(-1)![0]).toContain('data-deliverable-reference');
  });
});
