import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock dependencies before importing component
vi.mock('@/hooks/useNotifications', () => ({
  useNotifications: vi.fn(),
}));

vi.mock('date-fns', () => ({
  formatDistanceToNow: vi.fn(() => '5 minutes ago'),
}));

import { useNotifications } from '@/hooks/useNotifications';
import { NotificationCenter } from '@/components/NotificationCenter';

const mockUseNotifications = useNotifications as ReturnType<typeof vi.fn>;

function createNotification(overrides: Record<string, unknown> = {}) {
  return {
    id: 'n1',
    user_id: 'u1',
    proposal_id: 'p1',
    type: 'assignment' as const,
    title: 'Section Assigned',
    message: 'You have been assigned to "Introduction"',
    section_id: 's1',
    section_title: 'Introduction',
    metadata: {},
    is_read: false,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('NotificationCenter', () => {
  const baseMock = {
    notifications: [],
    unreadCount: 0,
    loading: false,
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    deleteNotification: vi.fn(),
    clearAll: vi.fn(),
    refetch: vi.fn(),
  };

  it('renders bell icon', () => {
    mockUseNotifications.mockReturnValue(baseMock);
    render(<NotificationCenter />);
    // The bell button should exist
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('shows unread badge when unreadCount > 0', () => {
    mockUseNotifications.mockReturnValue({ ...baseMock, unreadCount: 3 });
    render(<NotificationCenter />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows 9+ for high unread counts', () => {
    mockUseNotifications.mockReturnValue({ ...baseMock, unreadCount: 15 });
    render(<NotificationCenter />);
    expect(screen.getByText('9+')).toBeInTheDocument();
  });

  it('does not show badge when unreadCount is 0', () => {
    mockUseNotifications.mockReturnValue(baseMock);
    render(<NotificationCenter />);
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('notification item has group class for hover delete visibility', () => {
    const notification = createNotification();
    mockUseNotifications.mockReturnValue({
      ...baseMock,
      notifications: [notification],
      unreadCount: 1,
    });
    render(<NotificationCenter />);

    // Open popover
    fireEvent.click(screen.getByRole('button'));

    // The notification item wrapper should have the 'group' class
    const notificationTitle = screen.getByText('Section Assigned');
    // Walk up to find the wrapper div with 'group' class
    const wrapper = notificationTitle.closest('.group');
    expect(wrapper).not.toBeNull();
  });

  it('delete button exists and calls deleteNotification on click', () => {
    const deleteFn = vi.fn();
    const notification = createNotification();
    mockUseNotifications.mockReturnValue({
      ...baseMock,
      notifications: [notification],
      unreadCount: 1,
      deleteNotification: deleteFn,
    });
    render(<NotificationCenter />);

    // Open popover
    fireEvent.click(screen.getByRole('button'));

    // Find the delete button (icon button with trash icon)
    const deleteButtons = screen.getAllByRole('button');
    // The last small button in the notification item is the delete button
    const deleteButton = deleteButtons.find(btn =>
      btn.querySelector('svg') && btn.classList.contains('h-6')
    );
    expect(deleteButton).toBeDefined();

    if (deleteButton) {
      fireEvent.click(deleteButton);
      expect(deleteFn).toHaveBeenCalledWith('n1');
    }
  });

  it('marks notification as read when clicked', () => {
    const markReadFn = vi.fn();
    const notification = createNotification();
    mockUseNotifications.mockReturnValue({
      ...baseMock,
      notifications: [notification],
      unreadCount: 1,
      markAsRead: markReadFn,
    });
    render(<NotificationCenter />);

    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByText('Section Assigned'));
    expect(markReadFn).toHaveBeenCalledWith('n1');
  });

  it('does not call markAsRead for already-read notifications', () => {
    const markReadFn = vi.fn();
    const notification = createNotification({ is_read: true });
    mockUseNotifications.mockReturnValue({
      ...baseMock,
      notifications: [notification],
      markAsRead: markReadFn,
    });
    render(<NotificationCenter />);

    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByText('Section Assigned'));
    expect(markReadFn).not.toHaveBeenCalled();
  });

  it('shows "Mark all read" button when there are unread notifications', () => {
    mockUseNotifications.mockReturnValue({
      ...baseMock,
      notifications: [createNotification()],
      unreadCount: 1,
    });
    render(<NotificationCenter />);

    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Mark all read')).toBeInTheDocument();
  });

  it('shows empty state when no notifications', () => {
    mockUseNotifications.mockReturnValue(baseMock);
    render(<NotificationCenter />);

    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('No notifications')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    mockUseNotifications.mockReturnValue({ ...baseMock, loading: true });
    render(<NotificationCenter />);

    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('unread notification has blue dot indicator', () => {
    mockUseNotifications.mockReturnValue({
      ...baseMock,
      notifications: [createNotification()],
      unreadCount: 1,
    });
    render(<NotificationCenter />);

    fireEvent.click(screen.getByRole('button'));
    // Unread dot should exist
    const dot = document.querySelector('.bg-blue-500.rounded-full');
    expect(dot).not.toBeNull();
  });

  it('read notification does not have blue dot', () => {
    mockUseNotifications.mockReturnValue({
      ...baseMock,
      notifications: [createNotification({ is_read: true })],
    });
    render(<NotificationCenter />);

    fireEvent.click(screen.getByRole('button'));
    const dot = document.querySelector('.bg-blue-500.rounded-full');
    expect(dot).toBeNull();
  });
});
