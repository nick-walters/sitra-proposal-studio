/**
 * Cross-section review data — every tracked change and comment across Part B.
 *
 * Deliberately CHEAP: three plain table reads (blocks, modules, comments) plus
 * the Part B section list. Tracked changes are parsed out of the stored module
 * HTML with DOMParser — nothing is compiled, no figures are fetched, and no
 * editor has to be mounted. Opening this view costs a handful of queries.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { htmlToPlainText } from '@/lib/htmlToPlainText';
import { fetchPartBSections, type PartBSection } from '@/lib/typst/partBDocument';

export interface ReviewChangeItem {
  kind: 'change';
  id: string;
  sectionId: string;
  authorId: string;
  authorName: string;
  timestamp: string | null;
  type: 'insertion' | 'deletion';
  text: string;
  moduleLabel: string;
  /** DOM id the editor scrolls to when the item is clicked. */
  anchorId: string;
}

export interface ReviewCommentItem {
  kind: 'comment';
  id: string;
  sectionId: string;
  authorId: string;
  authorName: string;
  timestamp: string | null;
  content: string;
  resolved: boolean;
  moduleLabel: string;
}

export type ReviewItem = ReviewChangeItem | ReviewCommentItem;

export interface ReviewGroup {
  sectionId: string;
  sectionLabel: string;
  items: ReviewItem[];
  changeCount: number;
  commentCount: number;
}

interface CardRow {
  id: string;
  section_id: string;
  title: string | null;
}

interface FieldRow {
  id: string;
  card_id: string;
  heading: string | null;
  content_html: string | null;
}

interface CommentRow {
  id: string;
  section_id: string;
  user_id: string;
  content: string;
  status: string | null;
  created_at: string;
  anchor_payload: unknown;
  profiles?: { full_name: string | null; email: string | null } | null;
}

const parser = typeof DOMParser !== 'undefined' ? new DOMParser() : null;

/** Pull tracked-change runs out of stored HTML, merged by change id. */
function extractChanges(
  html: string | null,
  sectionId: string,
  moduleLabel: string,
  anchorId: string,
): ReviewChangeItem[] {
  if (!html || !parser || !/data-track-(insertion|deletion)/.test(html)) return [];
  const doc = parser.parseFromString(html, 'text/html');
  const spans = doc.querySelectorAll<HTMLElement>('[data-track-insertion],[data-track-deletion]');
  const byChange = new Map<string, ReviewChangeItem>();
  spans.forEach((span, index) => {
    const type: 'insertion' | 'deletion' = span.hasAttribute('data-track-insertion')
      ? 'insertion'
      : 'deletion';
    const changeId = span.getAttribute('data-change-id') || `${anchorId}:${type}:${index}`;
    const existing = byChange.get(changeId);
    const text = span.textContent || '';
    if (existing) {
      existing.text += text;
      return;
    }
    byChange.set(changeId, {
      kind: 'change',
      id: `${anchorId}:${changeId}`,
      sectionId,
      authorId: span.getAttribute('data-author-id') || '',
      authorName: span.getAttribute('data-author-name') || 'Unknown',
      timestamp: span.getAttribute('data-timestamp') || null,
      type,
      text,
      moduleLabel,
      anchorId,
    });
  });
  return [...byChange.values()].filter((c) => c.text.trim().length > 0);
}

export function usePartBReview(proposalId: string) {
  const { data: sections = [], isPending: sectionsPending } = useQuery({
    queryKey: ['partb-sections', proposalId],
    enabled: !!proposalId,
    queryFn: () => fetchPartBSections(proposalId),
  });

  const { data: blocks, isPending: blocksPending } = useQuery({
    queryKey: ['partb-review-blocks', proposalId],
    enabled: !!proposalId,
    staleTime: 30_000,
    queryFn: async () => {
      const [cards, fields] = await Promise.all([
        supabase
          .from('proposal_cards')
          .select('id, section_id, title')
          .eq('proposal_id', proposalId)
          .is('deleted_at', null),
        supabase
          .from('card_fields')
          .select('id, card_id, heading, content_html')
          .eq('proposal_id', proposalId)
          .is('deleted_at', null),
      ]);
      if (cards.error) throw cards.error;
      if (fields.error) throw fields.error;
      return {
        cards: (cards.data || []) as CardRow[],
        fields: (fields.data || []) as FieldRow[],
      };
    },
  });

  const { data: comments = [], isPending: commentsPending } = useQuery({
    queryKey: ['partb-review-comments', proposalId],
    enabled: !!proposalId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('section_comments')
        .select(
          'id, section_id, user_id, content, status, created_at, anchor_payload, profiles:user_id (full_name, email)',
        )
        .eq('proposal_id', proposalId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as CommentRow[];
    },
  });

  const groups = useMemo<ReviewGroup[]>(() => {
    const sectionById = new Map<string, PartBSection>(sections.map((s) => [s.id, s]));
    const buckets = new Map<string, ReviewItem[]>();
    const push = (sectionId: string, item: ReviewItem) => {
      const arr = buckets.get(sectionId);
      if (arr) arr.push(item);
      else buckets.set(sectionId, [item]);
    };

    const cardById = new Map((blocks?.cards || []).map((c) => [c.id, c]));
    for (const field of blocks?.fields || []) {
      const card = cardById.get(field.card_id);
      if (!card || !sectionById.has(card.section_id)) continue;
      const blockLabel = htmlToPlainText(card.title || '').trim() || 'Untitled block';
      const moduleName = htmlToPlainText(field.heading || '').trim();
      const label = moduleName ? `${blockLabel} › ${moduleName}` : blockLabel;
      for (const change of extractChanges(
        field.content_html,
        card.section_id,
        label,
        `card-module-${field.id}`,
      )) {
        push(card.section_id, change);
      }
    }

    for (const row of comments) {
      if (!sectionById.has(row.section_id)) continue;
      const payload = row.anchor_payload as { label?: string } | null;
      push(row.section_id, {
        kind: 'comment',
        id: row.id,
        sectionId: row.section_id,
        authorId: row.user_id,
        authorName:
          row.profiles?.full_name || row.profiles?.email?.split('@')[0] || 'Unknown',
        timestamp: row.created_at,
        content: row.content,
        resolved: row.status === 'resolved' || row.status === 'rejected',
        moduleLabel: payload?.label || 'Section',
      });
    }

    return sections
      .map((section) => {
        const items = (buckets.get(section.id) || []).slice().sort((a, b) => {
          const ta = a.timestamp ? Date.parse(a.timestamp) : 0;
          const tb = b.timestamp ? Date.parse(b.timestamp) : 0;
          return tb - ta;
        });
        return {
          sectionId: section.id,
          sectionLabel: `${section.number} ${section.title}`.trim(),
          items,
          changeCount: items.filter((i) => i.kind === 'change').length,
          commentCount: items.filter((i) => i.kind === 'comment').length,
        };
      })
      .filter((g) => g.items.length > 0);
  }, [sections, blocks, comments]);

  const authors = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of groups) {
      for (const item of group.items) {
        if (item.authorId) map.set(item.authorId, item.authorName);
      }
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [groups]);

  const totals = useMemo(
    () =>
      groups.reduce(
        (acc, g) => ({
          changes: acc.changes + g.changeCount,
          comments: acc.comments + g.commentCount,
        }),
        { changes: 0, comments: 0 },
      ),
    [groups],
  );

  return {
    groups,
    authors,
    totals,
    loading: sectionsPending || blocksPending || commentsPending,
  };
}
