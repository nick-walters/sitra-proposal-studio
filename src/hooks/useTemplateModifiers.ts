import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Json } from '@/integrations/supabase/types';

export interface TemplateModifier {
  id: string;
  code: string;
  name: string;
  description: string | null;
  conditions: Json;
  effects: Json;
  is_admin_editable: boolean;
  is_active: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface WorkProgrammeExtension {
  id: string;
  work_programme_code: string;
  name: string;
  description: string | null;
  extra_section_ids: string[] | null;
  extra_part_a_fields: Json | null;
  funding_overrides: Json | null;
  page_limit_delta: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useTemplateModifiers() {
  const [modifiers, setModifiers] = useState<TemplateModifier[]>([]);
  const [extensions, setExtensions] = useState<WorkProgrammeExtension[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [modifiersRes, extensionsRes] = await Promise.all([
        supabase.from('template_modifiers').select('*').order('priority'),
        supabase.from('work_programme_extensions').select('*').order('work_programme_code'),
      ]);

      if (modifiersRes.error) throw modifiersRes.error;
      if (extensionsRes.error) throw extensionsRes.error;

      setModifiers(modifiersRes.data || []);
      setExtensions(extensionsRes.data || []);
    } catch (error) {
      console.error('Error loading template modifiers:', error);
      toast.error('Failed to load template modifiers');
    } finally {
      setLoading(false);
    }
  };

  const createModifier = async (modifier: Omit<TemplateModifier, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      const { data, error } = await supabase
        .from('template_modifiers')
        .insert(modifier as any)
        .select()
        .single();

      if (error) throw error;
      setModifiers(prev => [...prev, data as TemplateModifier]);
      toast.success('Modifier created');
      return data as TemplateModifier;
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
      setModifiers(prev => prev.map(m => m.id === id ? data as TemplateModifier : m));
      toast.success('Modifier updated');
      return data as TemplateModifier;
    } catch (error) {
      console.error('Error updating modifier:', error);
      toast.error('Failed to update modifier');
      return null;
    }
  };

  const deleteModifier = async (id: string) => {
    try {
      const { error } = await supabase
        .from('template_modifiers')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setModifiers(prev => prev.filter(m => m.id !== id));
      toast.success('Modifier deleted');
      return true;
    } catch (error) {
      console.error('Error deleting modifier:', error);
      toast.error('Failed to delete modifier');
      return false;
    }
  };

  const createExtension = async (extension: Omit<WorkProgrammeExtension, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      const { data, error } = await supabase
        .from('work_programme_extensions')
        .insert(extension as any)
        .select()
        .single();

      if (error) throw error;
      setExtensions(prev => [...prev, data as WorkProgrammeExtension]);
      toast.success('Extension created');
      return data as WorkProgrammeExtension;
    } catch (error) {
      console.error('Error creating extension:', error);
      toast.error('Failed to create extension');
      return null;
    }
  };

  const updateExtension = async (id: string, updates: Partial<WorkProgrammeExtension>) => {
    try {
      const { data, error } = await supabase
        .from('work_programme_extensions')
        .update(updates as any)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      setExtensions(prev => prev.map(e => e.id === id ? data as WorkProgrammeExtension : e));
      toast.success('Extension updated');
      return data as WorkProgrammeExtension;
    } catch (error) {
      console.error('Error updating extension:', error);
      toast.error('Failed to update extension');
      return null;
    }
  };

  const deleteExtension = async (id: string) => {
    try {
      const { error } = await supabase
        .from('work_programme_extensions')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setExtensions(prev => prev.filter(e => e.id !== id));
      toast.success('Extension deleted');
      return true;
    } catch (error) {
      console.error('Error deleting extension:', error);
      toast.error('Failed to delete extension');
      return false;
    }
  };

  return {
    modifiers,
    extensions,
    loading,
    refresh: loadData,
    createModifier,
    updateModifier,
    deleteModifier,
    createExtension,
    updateExtension,
    deleteExtension,
  };
}
