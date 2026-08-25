import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  applicableModifiers, mergeModifierEffects, normaliseModifierRow,
  type MergedEffects, type ProposalAttributes, type ResolvedModifier,
} from '@/lib/templateModifiers';

export type TemplateModifier = ResolvedModifier;

export type ModifierInput = Omit<TemplateModifier, 'id'>;

/** Admin CRUD over the single modifier table. */
export function useTemplateModifiers() {
  const [modifiers, setModifiers] = useState<TemplateModifier[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('template_modifiers')
        .select('*')
        .order('priority')
        .order('code');
      if (error) throw error;
      setModifiers((data ?? []).map(normaliseModifierRow));
    } catch (error) {
      console.error('Error loading template modifiers:', error);
      toast.error('Failed to load modifiers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const createModifier = async (modifier: ModifierInput) => {
    try {
      const { data, error } = await supabase
        .from('template_modifiers')
        .insert(modifier as any)
        .select()
        .single();
      if (error) throw error;
      const row = normaliseModifierRow(data);
      setModifiers((prev) => [...prev, row]);
      toast.success('Modifier created');
      return row;
    } catch (error) {
      console.error('Error creating modifier:', error);
      toast.error('Failed to create modifier');
      return null;
    }
  };

  const updateModifier = async (id: string, updates: Partial<TemplateModifier>) => {
    try {
      const { data, error } = await supabase
        .from('template_modifiers')
        .update(updates as any)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      const row = normaliseModifierRow(data);
      setModifiers((prev) => prev.map((m) => (m.id === id ? row : m)));
      toast.success('Modifier updated');
      return row;
    } catch (error) {
      console.error('Error updating modifier:', error);
      toast.error('Failed to update modifier');
      return null;
    }
  };

  const deleteModifier = async (id: string) => {
    try {
      const { error } = await supabase.from('template_modifiers').delete().eq('id', id);
      if (error) throw error;
      setModifiers((prev) => prev.filter((m) => m.id !== id));
      toast.success('Modifier deleted');
      return true;
    } catch (error) {
      console.error('Error deleting modifier:', error);
      toast.error('Failed to delete modifier');
      return false;
    }
  };

  return { modifiers, loading, refresh: loadData, createModifier, updateModifier, deleteModifier };
}

/** Every active modifier, for resolution against a proposal. */
export function useAllModifiers() {
  return useQuery({
    queryKey: ['template-modifiers', 'active'],
    queryFn: async (): Promise<ResolvedModifier[]> => {
      const { data } = await supabase
        .from('template_modifiers')
        .select('*')
        .eq('is_active', true)
        .order('priority')
        .order('code');
      return (data ?? []).map(normaliseModifierRow);
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * The modifiers that apply to one proposal, and their merged effects.
 * Reconstructed from the proposal's attributes on every read — nothing is
 * snapshotted at creation.
 */
export function useProposalModifiers(proposalId: string | null | undefined) {
  return useQuery({
    queryKey: ['proposal-modifiers', proposalId],
    enabled: !!proposalId,
    queryFn: async (): Promise<{ modifiers: ResolvedModifier[]; merged: MergedEffects }> => {
      const [{ data: prop }, { data: rows }] = await Promise.all([
        supabase
          .from('proposals')
          .select('type, budget_type, work_programme, submission_stage, uses_fstp')
          .eq('id', proposalId!)
          .maybeSingle(),
        supabase.from('template_modifiers').select('*').eq('is_active', true),
      ]);
      const attrs: ProposalAttributes = {
        actionType: prop?.type ?? null,
        budgetType: prop?.budget_type ?? null,
        workProgramme: (prop as any)?.work_programme ?? null,
        submissionStage: (prop as any)?.submission_stage ?? null,
        usesFstp: (prop as any)?.uses_fstp ?? false,
      };
      const mods = applicableModifiers((rows ?? []).map(normaliseModifierRow), attrs);
      return { modifiers: mods, merged: mergeModifierEffects(mods) };
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * One-shot resolution used inside other queries: the modifier codes that apply
 * to a proposal and the wording substitutions they carry.
 */
export async function fetchProposalModifierContext(
  proposalId: string | null | undefined,
): Promise<{ codes: string[]; substitutions: Record<string, string> }> {
  if (!proposalId) return { codes: [], substitutions: {} };
  const [{ data: prop }, { data: rows }] = await Promise.all([
    supabase
      .from('proposals')
      .select('type, budget_type, work_programme, submission_stage, uses_fstp')
      .eq('id', proposalId)
      .maybeSingle(),
    supabase.from('template_modifiers').select('*').eq('is_active', true),
  ]);
  const mods = applicableModifiers((rows ?? []).map(normaliseModifierRow), {
    actionType: prop?.type ?? null,
    budgetType: prop?.budget_type ?? null,
    workProgramme: (prop as any)?.work_programme ?? null,
    submissionStage: (prop as any)?.submission_stage ?? null,
    usesFstp: (prop as any)?.uses_fstp ?? false,
  });
  const merged = mergeModifierEffects(mods);
  return { codes: merged.codes, substitutions: merged.substitutions };
}
