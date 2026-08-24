import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * The template version a proposal was created from.
 *
 * Template content is versioned copy-on-write: every guideline and every block
 * template row belongs to exactly one version. A proposal is pinned to the
 * version it was created from, so later template editing can never reach it.
 * Everything that reads template content for a proposal must resolve through
 * here rather than taking "the latest".
 *
 * Proposals created before versioning have no pin; those fall back to the
 * latest published version of their type, which is the 1.0 cut of the content
 * they were created against.
 */
export function useProposalTemplateVersion(proposalId: string | null | undefined) {
  return useQuery({
    queryKey: ['proposal-template-version', proposalId],
    enabled: !!proposalId,
    queryFn: async (): Promise<string | null> => {
      const { data: proposal } = await supabase
        .from('proposals')
        .select('template_version_id, template_type_id')
        .eq('id', proposalId!)
        .maybeSingle();
      if (!proposal) return null;
      if (proposal.template_version_id) return proposal.template_version_id;
      if (!proposal.template_type_id) return null;

      const { data: latest } = await supabase
        .from('template_versions')
        .select('id')
        .eq('template_type_id', proposal.template_type_id)
        .eq('status', 'published')
        .order('major', { ascending: false })
        .order('minor', { ascending: false })
        .limit(1)
        .maybeSingle();
      return latest?.id ?? null;
    },
    staleTime: 30 * 60 * 1000,
  });
}

/** The latest published version of a template type — used at proposal creation. */
export function useTemplateVersions(templateTypeId: string | null | undefined) {
  return useQuery({
    queryKey: ['template-versions', templateTypeId],
    enabled: !!templateTypeId,
    queryFn: async () => {
      const { data } = await supabase
        .from('template_versions')
        .select('id, major, minor, name, status, published_at, notes')
        .eq('template_type_id', templateTypeId!)
        .eq('status', 'published')
        .order('major', { ascending: false })
        .order('minor', { ascending: false });
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function formatVersionLabel(v: {
  major: number | null;
  minor: number | null;
  name?: string | null;
}): string {
  const num = `${v.major ?? 0}.${v.minor ?? 0}`;
  return v.name ? `${num} — ${v.name}` : num;
}
