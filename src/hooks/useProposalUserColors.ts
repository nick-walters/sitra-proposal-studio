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

interface UserProfile {
  color: string;
  avatarUrl: string | null;
  fullName: string;
}

/**
 * Returns a stable, proposal-scoped color for each user based on the order
 * they were assigned a role. All viewers see the same mapping.
 * Also returns avatar URLs and full names for displaying in cards.
 */
export function useProposalUserColors(proposalId: string | undefined) {
  const [profiles, setProfiles] = useState<Map<string, UserProfile>>(new Map());

  useEffect(() => {
    if (!proposalId) return;

    const fetchData = async () => {
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, created_at')
        .eq('proposal_id', proposalId)
        .order('created_at', { ascending: true });

      if (rolesError || !roles) return;

      // Deduplicate, keeping earliest appearance order
      const seen = new Set<string>();
      const ordered: string[] = [];
      for (const row of roles) {
        if (!seen.has(row.user_id)) {
          seen.add(row.user_id);
          ordered.push(row.user_id);
        }
      }

      // Fetch profiles for all users
      if (ordered.length === 0) return;
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', ordered);

      const profileMap = new Map<string, { full_name: string | null; avatar_url: string | null }>();
      if (profileData) {
        for (const p of profileData) {
          profileMap.set(p.id, { full_name: p.full_name, avatar_url: p.avatar_url });
        }
      }

      const map = new Map<string, UserProfile>();
      ordered.forEach((id, i) => {
        const prof = profileMap.get(id);
        map.set(id, {
          color: USER_COLORS[i % USER_COLORS.length],
          avatarUrl: prof?.avatar_url || null,
          fullName: prof?.full_name || 'Unknown',
        });
      });
      setProfiles(map);
    };

    fetchData();
  }, [proposalId]);

  const getUserColor = useMemo(() => {
    return (userId: string): string => profiles.get(userId)?.color || USER_COLORS[0];
  }, [profiles]);

  const getUserAvatar = useMemo(() => {
    return (userId: string): string | null => profiles.get(userId)?.avatarUrl || null;
  }, [profiles]);

  const getUserName = useMemo(() => {
    return (userId: string): string => profiles.get(userId)?.fullName || 'Unknown';
  }, [profiles]);

  return { getUserColor, getUserAvatar, getUserName };
}
