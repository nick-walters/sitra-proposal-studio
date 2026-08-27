import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TemplateVersionRow {
  id: string;
  template_type_id: string;
  major: number;
  minor: number;
  name: string | null;
  status: string;
  notes: string | null;
  published_at: string | null;
  created_at: string;
  locked_by: string | null;
  locked_at: string | null;
}

export interface CardTemplateRow {
  id: string;
  template_version_id: string | null;
  template_type_id: string | null;
  section_number: string | null;
  document: string | null;
  key: string;
  kind: string | null;
  default_title: string | null;
  order_index: number | null;
  is_deletable: boolean | null;
  is_hideable: boolean | null;
  is_source_fed: boolean | null;
  is_fixed_position: boolean | null;
  default_visible: boolean | null;
  is_active: boolean | null;
}

export interface CardGuidelineRow {
  id: string;
  guideline_type: string;
  title: string | null;
  content: string;
  order_index: number | null;
  is_active: boolean | null;
}

/** Every version of a template type, newest first, drafts included. */
export function useAllTemplateVersions(templateTypeId: string | null) {
  return useQuery({
    queryKey: ['admin-template-versions', templateTypeId],
    enabled: !!templateTypeId,
    // Viewers must see a lock being taken or released without a reload.
    refetchInterval: 30_000,
    queryFn: async (): Promise<TemplateVersionRow[]> => {
      const { data, error } = await supabase
        .from('template_versions')
        .select('*')
        .eq('template_type_id', templateTypeId!)
        .order('major', { ascending: false })
        .order('minor', { ascending: false });
      if (error) throw error;
      return (data ?? []) as TemplateVersionRow[];
    },
  });
}

/** The blocks belonging to one version, grouped by subsection number. */
export function useVersionBlocks(versionId: string | null) {
  return useQuery({
    queryKey: ['admin-version-blocks', versionId],
    enabled: !!versionId,
    queryFn: async (): Promise<CardTemplateRow[]> => {
      const { data, error } = await supabase
        .from('card_templates')
        .select('*')
        .eq('template_version_id', versionId!)
        /* Part B blocks and the Drafts surfaces (WP and case draft fields) are
           authored in the same workspace, so both documents are loaded. */
        .in('document', ['part_b', 'drafts'])
        .order('section_number')
        .order('order_index');
      if (error) throw error;
      return (data ?? []) as CardTemplateRow[];
    },
  });
}

/** Guidelines attached to a single block, in link order. */
export function useBlockGuidelines(cardTemplateId: string | null) {
  return useQuery({
    queryKey: ['admin-block-guidelines', cardTemplateId],
    enabled: !!cardTemplateId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('card_guideline_templates')
        .select('id, order_index, guideline_id, card_guidelines(*)')
        .eq('card_template_id', cardTemplateId!)
        .order('order_index');
      if (error) throw error;
      return (data ?? []).map((l: any) => ({
        linkId: l.id as string,
        orderIndex: (l.order_index ?? 0) as number,
        guideline: l.card_guidelines as CardGuidelineRow,
      })).filter((r) => !!r.guideline);
    },
  });
}

/** Subsection-level criteria for one version. */
export function useSectionCriteriaAdmin(versionId: string | null, sectionSourceId: string | null) {
  return useQuery({
    queryKey: ['admin-section-criteria', versionId, sectionSourceId],
    enabled: !!versionId && !!sectionSourceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('card_guideline_sections')
        .select('id, guideline_id, card_guidelines(*)')
        .eq('template_version_id', versionId!)
        .eq('section_source_id', sectionSourceId!);
      if (error) throw error;
      return (data ?? [])
        .map((l: any) => ({ linkId: l.id as string, guideline: l.card_guidelines as CardGuidelineRow }))
        .filter((r) => !!r.guideline && r.guideline.guideline_type === 'criteria')
        .sort((a, b) => (a.guideline.order_index ?? 0) - (b.guideline.order_index ?? 0));
    },
  });
}

/** Name of the owner currently holding a draft's editing lock. */
export function useLockHolderName(userId: string | null | undefined) {
  return useQuery({
    queryKey: ['admin-lock-holder', userId],
    enabled: !!userId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<string> => {
      const { data } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', userId!)
        .maybeSingle();
      return (data?.full_name || data?.email || 'another owner') as string;
    },
  });
}

/** Opens (or reuses) the draft version every edit is written into. */
export function useEnsureDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (templateTypeId: string): Promise<string> => {
      const { data, error } = await supabase.rpc('ensure_template_draft', {
        p_template_type_id: templateTypeId,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_id, templateTypeId) => {
      qc.invalidateQueries({ queryKey: ['admin-template-versions', templateTypeId] });
    },
  });
}

/** Claims — or, with `takeover`, seizes — the editing lock on a type's draft.
 *  The draft itself is never discarded: a takeover only changes the holder. */
export function useClaimDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { templateTypeId: string; takeover?: boolean }) => {
      const { data, error } = await supabase.rpc('claim_template_draft', {
        p_template_type_id: args.templateTypeId,
        p_takeover: args.takeover ?? false,
      });
      if (error) throw error;
      return data as unknown as { ok: boolean; version_id: string; locked_by?: string | null };
    },
    onSuccess: (_r, args) => {
      qc.invalidateQueries({ queryKey: ['admin-template-versions', args.templateTypeId] });
    },
  });
}

export function usePublishVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { versionId: string; major: boolean; name?: string; notes?: string }) => {
      const { data, error } = await supabase.rpc('publish_template_version', {
        p_version_id: args.versionId,
        p_major: args.major,
        p_name: args.name ?? null,
        p_notes: args.notes ?? null,
      });
      if (error) throw error;
      const res = data as unknown as { ok: boolean; error?: string };
      if (res && res.ok === false) throw new Error(res.error ?? 'Could not publish this draft');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-template-versions'] });
      qc.invalidateQueries({ queryKey: ['template-versions'] });
    },
  });
}
