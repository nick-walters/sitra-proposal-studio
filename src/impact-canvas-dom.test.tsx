import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ImpactCanvasBuilder } from './components/ImpactCanvasBuilder';

vi.mock('./hooks/useProposalRole', () => ({ useProposalRole: () => ({ roleTier: 'coordinator' }) }));
const mut = { mutate: vi.fn(), isPending: false };
vi.mock('./hooks/useImpactCanvas', () => ({
  useImpactCanvasColumns: () => ({
    columns: [{ id: 'c1', proposal_id: 'p1', key: 'needs', heading: 'Needs', guideline: null, order_index: 0, width_pct: null }],
    isLoading: false,
    updateCol: mut,
    addCol: mut,
    deleteCol: mut,
    reorder: mut,
  }),
  useImpactCanvasRows: () => ({
    rows: [{ id: 'r1', proposal_id: 'p1', order_index: 0, content: { needs: '<p>Hello</p>' } }],
    isLoading: false,
    addRow: mut,
    deleteRow: mut,
    updateCell: mut,
    reorderRows: mut,
  }),
}));

function setup() {
  const qc = new QueryClient();
  return render(<QueryClientProvider client={qc}><ImpactCanvasBuilder proposalId="p1" canEdit={true} /></QueryClientProvider>);
}

describe('ImpactCanvasBuilder DOM', () => {
  it('shows toolbar buttons and cross-ref trigger when cell focused', async () => {
    const { container } = setup();
    const status = screen.getByText(/Click a cell|Editing focused/);
    const toolbar = status.closest('div')!;
    console.log('TOOLBAR BEFORE:', toolbar.outerHTML);
    const editor = container.querySelector('.ProseMirror') as HTMLElement;
    expect(editor).toBeTruthy();
    fireEvent.focus(editor);
    console.log('ACTIVE STATUS:', screen.getByText(/focused cell|Click a cell/).textContent);
    console.log('TOOLBAR AFTER:', toolbar.outerHTML);
    const buttons = [...toolbar.querySelectorAll('button')] as HTMLButtonElement[];
    console.log('BUTTONS:', buttons.map((b) => ({text:b.textContent, aria:b.getAttribute('aria-label'), title:b.getAttribute('title'), disabled:b.disabled, class:b.className, rect:(b as any).getBoundingClientRect?.(), html:b.outerHTML})));
    const trigger = screen.getByLabelText('Insert cross-reference') as HTMLButtonElement;
    expect(trigger).toBeInTheDocument();
    expect(trigger.disabled).toBe(false);
  });
});
