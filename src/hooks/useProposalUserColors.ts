import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';

const USER_COLORS = [
  '#E91E63', // Pink
  '#9C27B0', // Purple
  '#673AB7', // Deep Purple
  '#3F51B5', // Indigo
  '#2196F3', // Blue
  '#00BCD4', // Cyan
  '#009688', // Teal
  '#4CAF50', // Green
  '#FF9800', // Orange
  '#FF5722', // Deep Orange
];

/**
 * Returns a stable, proposal-scoped color for each user based on the order
 * they were assigned a role. All viewers see the same mapping.
 */
export function useProposalUserColors(proposalId: string | undefined) {
  const [userIds, setUserIds] = useState<string[]>([]);

  useEffect(() => {
    if (!proposalId) return;

    const fetch = async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('user_id, created_at')
        .eq('proposal_id', proposalId)
        .order('created_at', { ascending: true });

      if (error || !data) return;

      // Deduplicate, keeping earliest appearance order
      const seen = new Set<string>();
      const ordered: string[] = [];
      for (const row of data) {
        if (!seen.has(row.user_id)) {
          seen.add(row.user_id);
          ordered.push(row.user_id);
        }
      }
      setUserIds(ordered);
    };

    fetch();
  }, [proposalId]);

  const getUserColor = useMemo(() => {
    const map = new Map<string, string>();
    userIds.forEach((id, i) => {
      map.set(id, USER_COLORS[i % USER_COLORS.length]);
    });
    return (userId: string): string => map.get(userId) || USER_COLORS[0];
  }, [userIds]);

  return { getUserColor };
}

