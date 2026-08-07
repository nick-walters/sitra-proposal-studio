import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ImpactCanvasTextBox } from '@/components/ImpactCanvasTextBox';
import { ImpactCanvasTextToolbar } from '@/components/ImpactCanvasTextToolbar';

describe('canvas colour UI', () => {
  it('applies colour to the selected run', async () => {
    const onChange = vi.fn();
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <ImpactCanvasTextToolbar proposalId={null as unknown as string} canEdit />
        <ImpactCanvasTextBox html="<p>hello world</p>" editing autoFocus onChange={onChange} />
      </QueryClientProvider>
    );
    const pm = await waitFor(() => document.querySelector('.ProseMirror') as HTMLElement);
    pm.focus();
    // select "hello"
    const textNode = pm.querySelector('p')!.firstChild!;
    const sel = window.getSelection()!;
    const range = document.createRange();
    range.setStart(textNode, 0); range.setEnd(textNode, 5);
    sel.removeAllRanges(); sel.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    await new Promise(r => setTimeout(r, 50));

    const openBtn = screen.getByLabelText('Text formatting');
    fireEvent.pointerDown(openBtn, { button: 0, ctrlKey: false });
    fireEvent.mouseDown(openBtn); fireEvent.click(openBtn);
    const colorBtn = await screen.findByLabelText('Text colour');
    fireEvent.pointerDown(colorBtn, { button: 0 });
    fireEvent.mouseDown(colorBtn); fireEvent.click(colorBtn);
    await new Promise(r => setTimeout(r, 50));
    const dialogs = document.querySelectorAll('[role="dialog"]');
    console.log('dialog count', dialogs.length);
    const last = dialogs[dialogs.length - 1];
    console.log('last dialog text', last.textContent?.slice(0,80));
    const swatches = last.querySelectorAll('button[style]');
    console.log('swatch count', swatches.length, (swatches[0] as HTMLElement)?.getAttribute('style'));
    fireEvent.mouseDown(swatches[0]); fireEvent.click(swatches[0]);
    await new Promise(r => setTimeout(r, 100));
    console.log('onChange calls', onChange.mock.calls.map(c => c[0]));
    expect(onChange.mock.calls.some(c => String(c[0]).includes('color'))).toBe(true);
  });
});
