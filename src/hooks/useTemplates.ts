import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Json } from '@/integrations/supabase/types';
import type { 
  FundingProgramme, 
  TemplateType, 
  TemplateSection, 
  SectionGuideline,
  TemplateFormField,
  GuidelineType
} from '@/types/templates';

export function useTemplates() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [fundingProgrammes, setFundingProgrammes] = useState<FundingProgramme[]>([]);
  const [templateTypes, setTemplateTypes] = useState<TemplateType[]>([]);

  const fetchFundingProgrammes = useCallback(async () => {
    const { data, error } = await supabase
      .from('funding_programmes')
      .select('*')
      .eq('is_active', true)
      .order('name');
    
    if (error) {
      console.error('Error fetching funding programmes:', error);
      return [];
    }
    return data as FundingProgramme[];
  }, []);

  const fetchTemplateTypes = useCallback(async () => {
    const { data, error } = await supabase
      .from('template_types')
      .select('*, funding_programme:funding_programmes(*)')
      .eq('is_active', true)
      .order('code');
    
    if (error) {
      console.error('Error fetching template types:', error);
      return [];
    }
    return data as TemplateType[];
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const [programmes, types] = await Promise.all([
        fetchFundingProgrammes(),
        fetchTemplateTypes(),
      ]);
      setFundingProgrammes(programmes);
      setTemplateTypes(types);
      setLoading(false);
    };
    loadData();
  }, [fetchFundingProgrammes, fetchTemplateTypes]);

  // CRUD operations for funding programmes
  const createFundingProgramme = async (data: { name: string; short_name?: string; description?: string }) => {
    const { data: result, error } = await supabase
      .from('funding_programmes')
      .insert([data])
      .select()
      .single();
    
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return null;
    }
    
    setFundingProgrammes(prev => [...prev, result as FundingProgramme]);
    toast({ title: 'Success', description: 'Funding programme created' });
    return result;
  };

  const updateFundingProgramme = async (id: string, data: Partial<FundingProgramme>) => {
    const { data: result, error } = await supabase
      .from('funding_programmes')
      .update(data)
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return null;
    }
    
    setFundingProgrammes(prev => prev.map(p => p.id === id ? result as FundingProgramme : p));
    toast({ title: 'Success', description: 'Funding programme updated' });
    return result;
  };

  const deleteFundingProgramme = async (id: string) => {
    const { error } = await supabase
      .from('funding_programmes')
      .delete()
      .eq('id', id);
    
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return false;
    }
    
    setFundingProgrammes(prev => prev.filter(p => p.id !== id));
    toast({ title: 'Success', description: 'Funding programme deleted' });
    return true;
  };

  // CRUD operations for template types
  const createTemplateType = async (data: { code: string; name: string; funding_programme_id?: string; description?: string }) => {
    const { data: result, error } = await supabase
      .from('template_types')
      .insert([data])
      .select('*, funding_programme:funding_programmes(*)')
      .single();
    
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return null;
    }
    
    setTemplateTypes(prev => [...prev, result as TemplateType]);
    toast({ title: 'Success', description: 'Template type created' });
    return result;
  };

  const updateTemplateType = async (id: string, data: Partial<TemplateType>) => {
    const { data: result, error } = await supabase
      .from('template_types')
      .update(data)
      .eq('id', id)
      .select('*, funding_programme:funding_programmes(*)')
      .single();
    
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return null;
    }
    
    setTemplateTypes(prev => prev.map(t => t.id === id ? result as TemplateType : t));
    toast({ title: 'Success', description: 'Template type updated' });
    return result;
  };

  const deleteTemplateType = async (id: string) => {
    const { error } = await supabase
      .from('template_types')
      .delete()
      .eq('id', id);
    
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return false;
    }
    
    setTemplateTypes(prev => prev.filter(t => t.id !== id));
    toast({ title: 'Success', description: 'Template type deleted' });
    return true;
  };

  const duplicateTemplateType = async (id: string, newCode: string, newName: string) => {
    // Fetch the original template type with all sections
    const { data: original, error: fetchError } = await supabase
      .from('template_types')
      .select('*')
      .eq('id', id)
      .single();
    
    if (fetchError || !original) {
      toast({ title: 'Error', description: 'Could not fetch original template', variant: 'destructive' });
      return null;
    }

    // Create new template type with all configuration fields
    const { data: newType, error: createError } = await supabase
      .from('template_types')
      .insert([{
        funding_programme_id: original.funding_programme_id,
        code: newCode,
        name: newName,
        description: original.description,
        parent_type_id: id, // Reference original as parent
        base_page_limit: original.base_page_limit,
        submission_stage: original.submission_stage,
        includes_branding: original.includes_branding,
        includes_participant_table: original.includes_participant_table,
        action_types: original.action_types,
      }])
      .select('*, funding_programme:funding_programmes(*)')
      .single();

    if (createError) {
      toast({ title: 'Error', description: createError.message, variant: 'destructive' });
      return null;
    }

    // Fetch and duplicate sections
    const { data: sections } = await supabase
      .from('template_sections')
      .select('*, guidelines:section_guidelines(*), form_fields:template_form_fields(*)')
      .eq('template_type_id', id);

    if (sections && sections.length > 0) {
      const sectionIdMap: Record<string, string> = {};
      
      // First pass: create sections without parent references
      for (const section of sections) {
        const { data: newSection } = await supabase
          .from('template_sections')
          .insert([{
            template_type_id: newType.id,
            part: section.part,
            section_number: section.section_number,
            title: section.title,
            description: section.description,
            editor_type: section.editor_type,
            word_limit: section.word_limit,
            page_limit: section.page_limit,
            order_index: section.order_index,
            is_required: section.is_required,
          }])
          .select()
          .single();
        
        if (newSection) {
          sectionIdMap[section.id] = newSection.id;

          // Duplicate guidelines
          const guidelines = section.guidelines as SectionGuideline[] | null;
          if (guidelines && guidelines.length > 0) {
            await supabase.from('section_guidelines').insert(
              guidelines.map((g) => ({
                section_id: newSection.id,
                guideline_type: g.guideline_type,
                title: g.title,
                content: g.content,
                order_index: g.order_index,
              }))
            );
          }

          // Duplicate form fields
          const formFields = section.form_fields as TemplateFormField[] | null;
          if (formFields && formFields.length > 0) {
            await supabase.from('template_form_fields').insert(
              formFields.map((f) => ({
                section_id: newSection.id,
                field_name: f.field_name,
                field_label: f.field_label,
                field_type: f.field_type,
                placeholder: f.placeholder,
                options: f.options,
                validation_rules: f.validation_rules,
                help_text: f.help_text,
                is_required: f.is_required,
                is_participant_specific: f.is_participant_specific,
                order_index: f.order_index,
              }))
            );
          }
        }
      }

      // Second pass: update parent references
      for (const section of sections) {
        if (section.parent_section_id && sectionIdMap[section.id]) {
          await supabase
            .from('template_sections')
            .update({ parent_section_id: sectionIdMap[section.parent_section_id] })
            .eq('id', sectionIdMap[section.id]);
        }
      }
    }

    setTemplateTypes(prev => [...prev, newType as TemplateType]);
    toast({ title: 'Success', description: 'Template duplicated successfully' });
    return newType;
  };

  return {
    loading,
    fundingProgrammes,
    templateTypes,
    createFundingProgramme,
    updateFundingProgramme,
    deleteFundingProgramme,
    createTemplateType,
    updateTemplateType,
    deleteTemplateType,
    duplicateTemplateType,
    refetch: async () => {
      const [programmes, types] = await Promise.all([
        fetchFundingProgrammes(),
        fetchTemplateTypes(),
      ]);
      setFundingProgrammes(programmes);
      setTemplateTypes(types);
    },
  };
}

// Hook for managing sections within a template type
export function useTemplateSections(templateTypeId: string | null) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [sections, setSections] = useState<TemplateSection[]>([]);

  const fetchSections = useCallback(async () => {
    if (!templateTypeId) {
      setSections([]);
      return;
    }
    
    setLoading(true);
    const { data, error } = await supabase
      .from('template_sections')
      .select('*, guidelines:section_guidelines(*), form_fields:template_form_fields(*)')
      .eq('template_type_id', templateTypeId)
      .eq('is_active', true)
      .order('order_index');
    
    if (error) {
      console.error('Error fetching sections:', error);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      // Build hierarchical structure
      const sectionMap = new Map<string, TemplateSection>();
      const rootSections: TemplateSection[] = [];
      
      // Transform DB data to our types
      const typedData: TemplateSection[] = (data || []).map(s => ({
        id: s.id,
        template_type_id: s.template_type_id,
        part: s.part as 'A' | 'B',
        section_number: s.section_number,
        title: s.title,
        description: s.description,
        editor_type: s.editor_type as 'form' | 'rich_text' | 'summary',
        word_limit: s.word_limit,
        page_limit: s.page_limit,
        order_index: s.order_index,
        parent_section_id: s.parent_section_id,
        is_required: s.is_required,
        is_active: s.is_active,
        created_at: s.created_at,
        updated_at: s.updated_at,
        children: [],
        guidelines: (s.guidelines as unknown as SectionGuideline[]) || [],
        form_fields: (s.form_fields as unknown as TemplateFormField[]) || [],
      }));
      
      typedData.forEach(section => {
        sectionMap.set(section.id, section);
      });
      
      typedData.forEach(section => {
        if (section.parent_section_id) {
          const parent = sectionMap.get(section.parent_section_id);
          if (parent) {
            parent.children?.push(section);
          }
        } else {
          rootSections.push(section);
        }
      });
      
      setSections(rootSections);
    }
    setLoading(false);
  }, [templateTypeId, toast]);

  useEffect(() => {
    fetchSections();
  }, [fetchSections]);

  const createSection = async (data: { 
    part: 'A' | 'B'; 
    section_number: string; 
    title: string; 
    editor_type: string;
    description?: string;
    word_limit?: number;
    page_limit?: number;
    order_index?: number;
    parent_section_id?: string;
    is_required?: boolean;
  }) => {
    const { data: result, error } = await supabase
      .from('template_sections')
      .insert([{ ...data, template_type_id: templateTypeId }])
      .select('*, guidelines:section_guidelines(*), form_fields:template_form_fields(*)')
      .single();
    
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return null;
    }
    
    await fetchSections();
    toast({ title: 'Success', description: 'Section created' });
    return result;
  };

  const updateSection = async (id: string, data: Partial<TemplateSection>) => {
    const { data: result, error } = await supabase
      .from('template_sections')
      .update(data)
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return null;
    }
    
    await fetchSections();
    toast({ title: 'Success', description: 'Section updated' });
    return result;
  };

  const deleteSection = async (id: string) => {
    const { error } = await supabase
      .from('template_sections')
      .delete()
      .eq('id', id);
    
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return false;
    }
    
    await fetchSections();
    toast({ title: 'Success', description: 'Section deleted' });
    return true;
  };

  // Guideline operations
  const createGuideline = async (sectionId: string, data: { 
    guideline_type: GuidelineType;
    title: string;
    content: string;
    order_index?: number;
  }) => {
    const { data: result, error } = await supabase
      .from('section_guidelines')
      .insert([{ ...data, section_id: sectionId }])
      .select()
      .single();
    
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return null;
    }
    
    await fetchSections();
    toast({ title: 'Success', description: 'Guideline created' });
    return result;
  };

  const updateGuideline = async (id: string, data: Partial<SectionGuideline>) => {
    const { error } = await supabase
      .from('section_guidelines')
      .update(data)
      .eq('id', id);
    
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return false;
    }
    
    await fetchSections();
    toast({ title: 'Success', description: 'Guideline updated' });
    return true;
  };

  const deleteGuideline = async (id: string) => {
    const { error } = await supabase
      .from('section_guidelines')
      .delete()
      .eq('id', id);
    
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return false;
    }
    
    await fetchSections();
    toast({ title: 'Success', description: 'Guideline deleted' });
    return true;
  };

  // Form field operations
  const createFormField = async (sectionId: string, data: { 
    field_name: string;
    field_label: string;
    field_type: string;
    placeholder?: string;
    options?: Json;
    validation_rules?: Json;
    help_text?: string;
    is_required?: boolean;
    is_participant_specific?: boolean;
    order_index?: number;
  }) => {
    const { data: result, error } = await supabase
      .from('template_form_fields')
      .insert([{ ...data, section_id: sectionId }])
      .select()
      .single();
    
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return null;
    }
    
    await fetchSections();
    toast({ title: 'Success', description: 'Form field created' });
    return result;
  };

  const updateFormField = async (id: string, data: Partial<TemplateFormField>) => {
    const { error } = await supabase
      .from('template_form_fields')
      .update(data)
      .eq('id', id);
    
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return false;
    }
    
    await fetchSections();
    toast({ title: 'Success', description: 'Form field updated' });
    return true;
  };

  const deleteFormField = async (id: string) => {
    const { error } = await supabase
      .from('template_form_fields')
      .delete()
      .eq('id', id);
    
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return false;
    }
    
    await fetchSections();
    toast({ title: 'Success', description: 'Form field deleted' });
    return true;
  };

  return {
    loading,
    sections,
    refetch: fetchSections,
    createSection,
    updateSection,
    deleteSection,
    createGuideline,
    updateGuideline,
    deleteGuideline,
    createFormField,
    updateFormField,
    deleteFormField,
  };
}

// Hook to check if current user is an owner
export function useIsOwner() {
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkOwner = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsOwner(false);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'owner')
        .maybeSingle();
      
      setIsOwner(!error && !!data);
      setLoading(false);
    };

    checkOwner();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkOwner();
    });

    return () => subscription.unsubscribe();
  }, []);

  return { isOwner, loading };
}
