import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Section } from '@/types/proposal';
import { PART_A_SECTIONS, HORIZON_EUROPE_SECTIONS } from '@/types/proposal';

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
  section_tag: string | null; // Official HE tag for PDF export
  guidelines?: {
    id: string;
    guideline_type: 'official' | 'sitra_tip' | 'evaluation';
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

  // Generate a proper ID from section_number or title
  let sectionId: string;
  if (dbSection.section_number && dbSection.section_number.trim() !== '') {
    // Use section number: "Part A" -> "part-a", "A1" -> "a1", "B1.1" -> "b1-1"
    sectionId = dbSection.section_number.toLowerCase().replace(/\s+/g, '-').replace(/\./g, '-');
  } else {
    // Fallback to title-based ID: "Proposal overview" -> "proposal-overview"
    sectionId = dbSection.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  }

  return {
    id: sectionId,
    number: dbSection.section_number,
    title: dbSection.title,
    wordLimit: dbSection.word_limit || undefined,
    pageLimit: dbSection.page_limit || undefined,
    guidelines: officialGuidelines ? { text: officialGuidelines } : undefined,
    guidelinesArray: guidelinesArray.length > 0 ? guidelinesArray : undefined,
    isPartA: dbSection.part === 'A',
    sectionTag: dbSection.section_tag || undefined,
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

  // Use useEffect directly with templateTypeId as dependency for proper reactivity
  useEffect(() => {
    const fetchSections = async () => {
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
    };

    fetchSections();
  }, [templateTypeId]);

  // Return either template sections or fallback to hardcoded sections
  const allSections = useMemo(() => {
    if (hasTemplateSections && templateSections.length > 0) {
      // Separate Part A and Part B sections
      const partASections = templateSections.filter(s => s.isPartA);
      const partBSections = templateSections.filter(s => !s.isPartA);
      
      // Note: Figures section is now included within Part B subsections
      return [...partASections, ...partBSections];
    }
    
    // Fallback to hardcoded sections (Figures is now inside Part B subsections)
    return [...PART_A_SECTIONS, ...HORIZON_EUROPE_SECTIONS];
  }, [templateSections, hasTemplateSections]);

  // Create a refetch function that can be called externally
  const refetch = useCallback(async () => {
    if (!templateTypeId) return;
    
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

  return {
    loading,
    sections: allSections,
    hasTemplateSections,
    templateSections,
    refetch,
  };
}
