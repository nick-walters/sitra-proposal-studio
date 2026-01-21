import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Section } from '@/types/proposal';
import { PART_A_SECTIONS, HORIZON_EUROPE_SECTIONS, FIGURES_SECTION } from '@/types/proposal';

interface TemplateSectionData {
  id: string;
  template_type_id: string;
  part: 'A' | 'B';
  section_number: string;
  title: string;
  description: string | null;
  editor_type: 'form' | 'rich_text' | 'summary';
  word_limit: number | null;
  page_limit: number | null;
  order_index: number;
  parent_section_id: string | null;
  is_required: boolean;
  is_active: boolean;
  guidelines?: {
    id: string;
    guideline_type: 'official' | 'sitra_tip';
    title: string;
    content: string;
    order_index: number;
  }[];
  form_fields?: {
    id: string;
    field_name: string;
    field_label: string;
    field_type: string;
    placeholder: string | null;
    options: any;
    validation_rules: any;
    help_text: string | null;
    is_required: boolean;
    is_participant_specific: boolean;
    order_index: number;
  }[];
}

// Convert database template section to proposal Section type
function convertToSection(dbSection: TemplateSectionData): Section {
  // Build guidelines array with proper types
  const guidelinesArray = dbSection.guidelines
    ?.sort((a, b) => a.order_index - b.order_index)
    .map(g => ({
      id: g.id,
      type: g.guideline_type,
      title: g.title,
      content: g.content,
      orderIndex: g.order_index,
    })) || [];

  // Also keep legacy text format for backward compatibility
  const officialGuidelines = dbSection.guidelines
    ?.filter(g => g.guideline_type === 'official')
    .map(g => g.content)
    .join('\n\n');

  return {
    id: dbSection.section_number.toLowerCase().replace(/\./g, '-'),
    number: dbSection.section_number,
    title: dbSection.title,
    wordLimit: dbSection.word_limit || undefined,
    pageLimit: dbSection.page_limit || undefined,
    guidelines: officialGuidelines ? { text: officialGuidelines } : undefined,
    guidelinesArray: guidelinesArray.length > 0 ? guidelinesArray : undefined,
    isPartA: dbSection.part === 'A',
    subsections: [],
  };
}

// Build hierarchical section structure
function buildSectionHierarchy(sections: TemplateSectionData[]): Section[] {
  const sectionMap = new Map<string, Section>();
  const rootSections: Section[] = [];

  // First pass: convert all sections
  sections.forEach(dbSection => {
    const section = convertToSection(dbSection);
    // Use the DB id as key for parent lookup
    sectionMap.set(dbSection.id, section);
  });

  // Second pass: build hierarchy
  sections.forEach(dbSection => {
    const section = sectionMap.get(dbSection.id);
    if (!section) return;

    if (dbSection.parent_section_id) {
      const parent = sectionMap.get(dbSection.parent_section_id);
      if (parent) {
        if (!parent.subsections) parent.subsections = [];
        parent.subsections.push(section);
      } else {
        rootSections.push(section);
      }
    } else {
      rootSections.push(section);
    }
  });

  return rootSections;
}

export function useProposalSections(templateTypeId: string | null) {
  const [loading, setLoading] = useState(true);
  const [templateSections, setTemplateSections] = useState<Section[]>([]);
  const [hasTemplateSections, setHasTemplateSections] = useState(false);

  const fetchSections = useCallback(async () => {
    if (!templateTypeId) {
      setTemplateSections([]);
      setHasTemplateSections(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('template_sections')
        .select(`
          *,
          guidelines:section_guidelines(*),
          form_fields:template_form_fields(*)
        `)
        .eq('template_type_id', templateTypeId)
        .eq('is_active', true)
        .order('order_index');

      if (error) {
        console.error('Error fetching template sections:', error);
        setTemplateSections([]);
        setHasTemplateSections(false);
      } else if (data && data.length > 0) {
        const sections = buildSectionHierarchy(data as TemplateSectionData[]);
        setTemplateSections(sections);
        setHasTemplateSections(true);
      } else {
        setTemplateSections([]);
        setHasTemplateSections(false);
      }
    } catch (error) {
      console.error('Error fetching template sections:', error);
      setTemplateSections([]);
      setHasTemplateSections(false);
    }
    setLoading(false);
  }, [templateTypeId]);

  useEffect(() => {
    fetchSections();
  }, [fetchSections]);

  // Return either template sections or fallback to hardcoded sections
  const allSections = useMemo(() => {
    if (hasTemplateSections && templateSections.length > 0) {
      // Separate Part A and Part B sections
      const partASections = templateSections.filter(s => s.isPartA);
      const partBSections = templateSections.filter(s => !s.isPartA);
      
      // Always include figures section
      return [...partASections, ...partBSections, FIGURES_SECTION];
    }
    
    // Fallback to hardcoded sections
    return [...PART_A_SECTIONS, ...HORIZON_EUROPE_SECTIONS, FIGURES_SECTION];
  }, [templateSections, hasTemplateSections]);

  return {
    loading,
    sections: allSections,
    hasTemplateSections,
    templateSections,
    refetch: fetchSections,
  };
}
