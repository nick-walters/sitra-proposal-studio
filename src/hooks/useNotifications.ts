import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export type NotificationType = 'assignment' | 'due_soon' | 'overdue' | 'assignment_changed' | 'assignment_removed' | 'mention' | 'profile_incomplete';

export interface Notification {
  id: string;
  user_id: string;
  proposal_id: string;
  type: NotificationType;
  title: string;
  message: string;
  section_id: string | null;
  section_title: string | null;
  metadata: Record<string, any>;
  is_read: boolean;
  created_at: string;
  /** If true, this notification cannot be dismissed, marked read, or deleted */
  persistent?: boolean;
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [profileIncomplete, setProfileIncomplete] = useState(false);
  const { user } = useAuth();

  // Check profile completeness
  const checkProfile = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single();
    
    if (!data?.full_name || !data.full_name.trim().includes(' ')) {
      setProfileIncomplete(true);
    } else {
      setProfileIncomplete(false);
    }
  }, [user?.id]);

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return;

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error fetching notifications:', error);
      return;
    }

    setNotifications(data as Notification[]);
    setUnreadCount(data.filter((n: any) => !n.is_read).length);
    setLoading(false);
  }, [user?.id]);

  // Mark notification as read
  const markAsRead = useCallback(async (notificationId: string) => {
    if (!user?.id) return;

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId);

    if (error) {
      console.error('Error marking notification as read:', error);
      return;
    }

    setNotifications(prev => 
      prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, [user?.id]);

  // Mark notification as unread
  const markAsUnread = useCallback(async (notificationId: string) => {
    if (!user?.id) return;

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: false })
      .eq('id', notificationId);

    if (error) {
      console.error('Error marking notification as unread:', error);
      return;
    }

    setNotifications(prev => 
      prev.map(n => n.id === notificationId ? { ...n, is_read: false } : n)
    );
    setUnreadCount(prev => prev + 1);
  }, [user?.id]);

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    if (!user?.id) return;

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false);

    if (error) {
      console.error('Error marking all notifications as read:', error);
      return;
    }

    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }, [user?.id]);

  // Delete notification
  const deleteNotification = useCallback(async (notificationId: string) => {
    if (!user?.id) return;

    const wasUnread = notifications.find(n => n.id === notificationId)?.is_read === false;

    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', notificationId);

    if (error) {
      console.error('Error deleting notification:', error);
      return;
    }

    setNotifications(prev => prev.filter(n => n.id !== notificationId));
    if (wasUnread) {
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
  }, [user?.id, notifications]);

  // Clear all notifications
  const clearAll = useCallback(async () => {
    if (!user?.id) return;

    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('user_id', user.id);

    if (error) {
      console.error('Error clearing notifications:', error);
      return;
    }

    setNotifications([]);
    setUnreadCount(0);
  }, [user?.id]);

  // Initial fetch
  useEffect(() => {
    fetchNotifications();
    checkProfile();
  }, [fetchNotifications, checkProfile]);

  // Real-time subscription
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newNotification = payload.new as Notification;
          setNotifications(prev => [newNotification, ...prev]);
          setUnreadCount(prev => prev + 1);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const updated = payload.new as Notification;
          setNotifications(prev => 
            prev.map(n => n.id === updated.id ? updated : n)
          );
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const deleted = payload.old as { id: string };
          setNotifications(prev => {
            const removedNotification = prev.find(n => n.id === deleted.id);
            if (removedNotification && !removedNotification.is_read) {
              setUnreadCount(c => Math.max(0, c - 1));
            }
            return prev.filter(n => n.id !== deleted.id);
          });
        }
      )
      .subscribe();

    // Also listen for profile changes to auto-clear the notification
    const profileChannel = supabase
      .channel('profile-name-check')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
        filter: `id=eq.${user.id}`,
      }, () => {
        checkProfile();
      })
      .subscribe();

    // Poll every 5s to catch deletions that realtime may miss
    const pollInterval = setInterval(() => {
      fetchNotifications();
    }, 5000);

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(profileChannel);
      clearInterval(pollInterval);
    };
  }, [user?.id, fetchNotifications, checkProfile]);

  // Build the profile-incomplete virtual notification
  const profileNotification: Notification | null = profileIncomplete && user ? {
    id: 'profile-incomplete',
    user_id: user.id,
    proposal_id: '',
    type: 'profile_incomplete',
    title: 'Complete your profile',
    message: 'Please add your first and last name to your profile.',
    section_id: null,
    section_title: null,
    metadata: { source: 'profile' },
    is_read: false,
    created_at: new Date().toISOString(),
    persistent: true,
  } : null;

  const allNotifications = profileNotification
    ? [profileNotification, ...notifications]
    : notifications;

  const totalUnread = unreadCount + (profileIncomplete ? 1 : 0);

  return {
    notifications: allNotifications,
    unreadCount: totalUnread,
    loading,
    markAsRead,
    markAsUnread,
    markAllAsRead,
    deleteNotification,
    clearAll,
    refetch: fetchNotifications,
  };
}

// Helper to create assignment notifications
export async function createAssignmentNotification(params: {
  proposalId: string;
  userId: string;
  assignedBy: string;
  sectionId: string;
  sectionTitle: string;
  dueDate?: string;
}) {
  const { proposalId, userId, assignedBy, sectionId, sectionTitle, dueDate } = params;

  const dueDateText = dueDate 
    ? ` (due ${new Date(dueDate).toLocaleDateString()})` 
    : '';

  const { error } = await supabase
    .from('notifications')
    .insert({
      user_id: userId,
      proposal_id: proposalId,
      type: 'assignment',
      title: 'Section Assigned',
      message: `You have been assigned to "${sectionTitle}"${dueDateText}`,
      section_id: sectionId,
      section_title: sectionTitle,
      metadata: { assigned_by: assignedBy, due_date: dueDate },
    });

  if (error) {
    console.error('Error creating assignment notification:', error);
  }
}

// Helper to create due date reminder notifications
export async function createDueDateNotification(params: {
  proposalId: string;
  userId: string;
  sectionId: string;
  sectionTitle: string;
  dueDate: string;
  type: 'due_soon' | 'overdue';
}) {
  const { proposalId, userId, sectionId, sectionTitle, dueDate, type } = params;

  const title = type === 'overdue' ? 'Section Overdue' : 'Section Due Soon';
  const message = type === 'overdue'
    ? `"${sectionTitle}" was due on ${new Date(dueDate).toLocaleDateString()}`
    : `"${sectionTitle}" is due on ${new Date(dueDate).toLocaleDateString()}`;

  const { error } = await supabase
    .from('notifications')
    .insert({
      user_id: userId,
      proposal_id: proposalId,
      type,
      title,
      message,
      section_id: sectionId,
      section_title: sectionTitle,
      metadata: { due_date: dueDate },
    });

  if (error) {
    console.error('Error creating due date notification:', error);
  }
}
