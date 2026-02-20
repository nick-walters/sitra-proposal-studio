import { describe, it, expect } from 'vitest';

/**
 * Unit tests for notification unreadCount logic extracted from useNotifications.
 * Tests the core state update logic that handles INSERT, UPDATE, DELETE events.
 */

interface Notification {
  id: string;
  is_read: boolean;
}

// Extracted logic from the DELETE realtime handler
function handleDelete(
  notifications: Notification[],
  deletedId: string
): { notifications: Notification[]; unreadDelta: number } {
  const removed = notifications.find(n => n.id === deletedId);
  const unreadDelta = removed && !removed.is_read ? -1 : 0;
  return {
    notifications: notifications.filter(n => n.id !== deletedId),
    unreadDelta,
  };
}

describe('useNotifications DELETE handler logic', () => {
  it('decrements unreadCount when deleting unread notification', () => {
    const notifications = [
      { id: 'n1', is_read: false },
      { id: 'n2', is_read: true },
    ];
    const result = handleDelete(notifications, 'n1');
    expect(result.unreadDelta).toBe(-1);
    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0].id).toBe('n2');
  });

  it('does not decrement unreadCount when deleting read notification', () => {
    const notifications = [
      { id: 'n1', is_read: false },
      { id: 'n2', is_read: true },
    ];
    const result = handleDelete(notifications, 'n2');
    expect(result.unreadDelta).toBe(0);
    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0].id).toBe('n1');
  });

  it('handles deleting non-existent notification gracefully', () => {
    const notifications = [{ id: 'n1', is_read: false }];
    const result = handleDelete(notifications, 'n999');
    expect(result.unreadDelta).toBe(0);
    expect(result.notifications).toHaveLength(1);
  });

  it('handles empty notifications array', () => {
    const result = handleDelete([], 'n1');
    expect(result.unreadDelta).toBe(0);
    expect(result.notifications).toHaveLength(0);
  });

  it('correctly handles multiple unread notifications', () => {
    const notifications = [
      { id: 'n1', is_read: false },
      { id: 'n2', is_read: false },
      { id: 'n3', is_read: false },
    ];
    
    let unreadCount = 3;
    
    // Delete first unread
    const r1 = handleDelete(notifications, 'n1');
    unreadCount += r1.unreadDelta;
    expect(unreadCount).toBe(2);
    
    // Delete second unread
    const r2 = handleDelete(r1.notifications, 'n2');
    unreadCount += r2.unreadDelta;
    expect(unreadCount).toBe(1);
  });
});
