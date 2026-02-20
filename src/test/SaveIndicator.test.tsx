import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SaveIndicator } from '@/components/SaveIndicator';

describe('SaveIndicator', () => {
  it('shows "Autosaves after 5 sec" when idle', () => {
    render(<SaveIndicator saving={false} lastSaved={null} />);
    expect(screen.getByText('Autosaves')).toBeInTheDocument();
    expect(screen.getByText('after 5 sec')).toBeInTheDocument();
  });

  it('shows "Saving..." with spinner when actively saving', () => {
    render(<SaveIndicator saving={true} lastSaved={null} />);
    expect(screen.getByText('Saving...')).toBeInTheDocument();
    // Should NOT show "Autosaves"
    expect(screen.queryByText('Autosaves')).not.toBeInTheDocument();
  });

  it('shows "Autosaved" with time when saved', () => {
    const savedDate = new Date(2026, 0, 15, 14, 30);
    render(<SaveIndicator saving={false} lastSaved={savedDate} />);
    expect(screen.getByText('Autosaved')).toBeInTheDocument();
  });

  it('shows pending state when hasUnsavedChanges but not saving', () => {
    render(<SaveIndicator saving={false} lastSaved={null} hasUnsavedChanges={true} />);
    // Should show the idle/pending state, not saving spinner
    expect(screen.getByText('Autosaves')).toBeInTheDocument();
    expect(screen.queryByText('Saving...')).not.toBeInTheDocument();
  });

  it('saving state takes priority over hasUnsavedChanges', () => {
    render(<SaveIndicator saving={true} lastSaved={null} hasUnsavedChanges={true} />);
    expect(screen.getByText('Saving...')).toBeInTheDocument();
  });

  it('saving state takes priority over lastSaved', () => {
    render(<SaveIndicator saving={true} lastSaved={new Date()} />);
    expect(screen.getByText('Saving...')).toBeInTheDocument();
    expect(screen.queryByText('Autosaved')).not.toBeInTheDocument();
  });
});
