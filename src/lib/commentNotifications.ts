/**
 * NOTIFICATIONS FOR MODULE COMMENTS
 *
 * Only two things notify: being @tagged in a comment or reply, and being
 * assigned a comment. An ordinary reply in a thread notifies nobody, and no
 * one is ever notified of their own action.
 *
 * Storage is the existing `notifications` table, which already requires a
 * `proposal_id` — every comment has one, so that fits without change. Type is
 * `'mention'` for a tag and `'assignment'` for an assignment; both carry
 * `metadata.source = 'module_comment'`, which is what tells the notification
 * centre to open the proposal at the commented module rather than at a task or
 * the message board.
 */
import { supabase } from '@/integrations/supabase/client';

/** Marks a notification as coming from the comments panel. */
export const MODULE_COMMENT_SOURCE = 'module_comment';

export interface CommentNotificationTarget {
  proposalId: string;
  /** Template section id, or the draft id the comments panel runs on. */
  sectionId: string;
  /** Human-readable name of the section or draft, for the message text. */
  sectionTitle?: string | null;
  commentId: string;
  /** Anchor target key, so the click can scroll straight to the module. */
  targetKey: string;
  /** Module label, e.g. "T2.3 description". */
  moduleLabel: string;
  /** Who did it — never notified about their own action. */
  actorId: string;
  actorName: string;
}

interface Row {
  user_id: string;
  proposal_id: string;
  type: 'mention' | 'assignment';
  title: string;
  message: string;
  section_id: string;
  section_title: string | null;
  metadata: Record<string, string>;
}

function baseMetadata(t: CommentNotificationTarget) {
  return {
    source: MODULE_COMMENT_SOURCE,
    comment_id: t.commentId,
    target_key: t.targetKey,
    module_label: t.moduleLabel,
    actor_id: t.actorId,
  };
}

async function insert(rows: Row[]) {
  if (rows.length === 0) return;
  const { error } = await supabase.from('notifications').insert(rows);
  if (error) console.error('Failed to write comment notifications:', error);
}

/** One notification per tagged user, minus the author. */
export async function notifyCommentTags(
  taggedUserIds: string[],
  t: CommentNotificationTarget,
) {
  const unique = [...new Set(taggedUserIds)].filter((id) => id && id !== t.actorId);
  await insert(
    unique.map((userId) => ({
      user_id: userId,
      proposal_id: t.proposalId,
      type: 'mention' as const,
      title: 'You were tagged in a comment',
      message: `${t.actorName} tagged you in a comment on ${t.moduleLabel}`,
      section_id: t.sectionId,
      section_title: t.sectionTitle ?? null,
      metadata: baseMetadata(t),
    })),
  );
}

/** One notification for the new assignee, unless they assigned it to themselves. */
export async function notifyCommentAssignment(
  assigneeId: string | null,
  t: CommentNotificationTarget,
) {
  if (!assigneeId || assigneeId === t.actorId) return;
  await insert([
    {
      user_id: assigneeId,
      proposal_id: t.proposalId,
      type: 'assignment',
      title: 'A comment was assigned to you',
      message: `${t.actorName} assigned you a comment on ${t.moduleLabel}`,
      section_id: t.sectionId,
      section_title: t.sectionTitle ?? null,
      metadata: baseMetadata(t),
    },
  ]);
}
