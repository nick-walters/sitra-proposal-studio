import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { CaseSubsectionTemplate } from '@/hooks/useCaseSubsectionTemplates';

/**
 * Case guidance = template default + optional per-proposal override.
 *
 * DEFAULT  `case_guideline_defaults` — one row per subsection key, shared by
 *          every proposal and owned by Sitra. Not tied to a template version,
 *          so a version change never disturbs it.
 * OVERRIDE `case_subsection_templates.guideline` — the proposal's own copy of
 *          the subsection. NULL means "inherit"; any text wins over the
 *          default, for that proposal only.
 *
 * Scope: case drafts only. Part B and WP guidance stays template-owned and is
 * authored in Template Management.
 */

export interface CaseGuidelineDefault {
  key: string;
  title: string;
  content: string;
  order_index: number;
}

export interface ResolvedCaseGuidance {
  key: string;
  title: string;
  content: string;
  /** True when this proposal has written its own guidance for the subsection. */
  isOverride: boolean;
  /** Row id of the proposal's subsection, needed to save an override. */
  templateId: string | null;
}

export function useCaseGuidelineDefaults() {
  return useQuery({
    queryKey: ['case-guideline-defaults'],
    queryFn: async (): Promise<CaseGuidelineDefault[]> => {
      const { data, error } = await supabase
        .from('case_guideline_defaults')
        .select('key, title, content, order_index')
        .order('order_index');
      if (error) throw error;
      return (data || []) as CaseGuidelineDefault[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Resolves one subsection's guidance: override first, default otherwise. */
export function resolveCaseGuidance(
  subsectionKey: string | null,
  templates: CaseSubsectionTemplate[],
  defaults: CaseGuidelineDefault[],
): ResolvedCaseGuidance | null {
  if (!subsectionKey) return null;
  const row = templates.find((t) => t.key === subsectionKey) ?? null;
  const override = (row?.guideline ?? '').trim();
  const fallback = defaults.find((d) => d.key === subsectionKey);
  if (!override && !fallback) {
    return row ? { key: subsectionKey, title: row.heading, content: '', isOverride: false, templateId: row.id } : null;
  }
  return {
    key: subsectionKey,
    title: row?.heading || fallback?.title || 'Guidance',
    content: override || fallback?.content || '',
    isOverride: !!override,
    templateId: row?.id ?? null,
  };
}

/** Coordinator-or-above write of a proposal-specific override (RPC-enforced). */
export async function saveCaseGuidanceOverride(templateId: string, guideline: string) {
  const { error } = await supabase.rpc('save_case_subsection_guideline', {
    p_template_id: templateId,
    p_guideline: guideline,
  });
  if (error) {
    toast.error(error.message || 'Could not save the guidance');
    return false;
  }
  return true;
}
