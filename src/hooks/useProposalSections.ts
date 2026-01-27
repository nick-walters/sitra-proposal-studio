import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Section } from '@/types/proposal';
import { PART_A_SECTIONS, HORIZON_EUROPE_SECTIONS } from '@/types/proposal';

// Extended section type with WP-specific fields
export interface WPSection extends Section {
  wpId?: string;
  wpNumber?: number;
  wpColor?: string;
}

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
  placeholder_content: string | null; // Pre-filled guidance text for writers
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
    placeholderContent: dbSection.placeholder_content || undefined,
    subsections: [],
  };
}

// Build hierarchical section structure
function buildSectionHierarchy(sections: TemplateSectionData[]): Section[] {
  const sectionMap = new Map<string, Section>();
  const dbSectionMap = new Map<string, TemplateSectionData>();
  const rootSections: Section[] = [];

  // First pass: convert all sections and keep track of db sections
  sections.forEach(dbSection => {
    const section = convertToSection(dbSection);
    // Use the DB id as key for parent lookup
    sectionMap.set(dbSection.id, section);
    dbSectionMap.set(dbSection.id, dbSection);
  });

  // Second pass: build hierarchy and inherit parent evaluation guidelines
  sections.forEach(dbSection => {
    const section = sectionMap.get(dbSection.id);
    if (!section) return;

    if (dbSection.parent_section_id) {
      const parent = sectionMap.get(dbSection.parent_section_id);
      if (parent) {
        if (!parent.subsections) parent.subsections = [];
        parent.subsections.push(section);
        
        // Inherit evaluation guidelines from parent to child
        // This ensures scoring info on B1/B2 appears on B1.1, B1.2, B2.1 etc.
        if (parent.guidelinesArray && parent.guidelinesArray.length > 0) {
          const parentEvalGuidelines = parent.guidelinesArray.filter(g => g.type === 'evaluation');
          if (parentEvalGuidelines.length > 0) {
            // Add parent evaluation guidelines at the end of child's guidelines
            const childGuidelines = section.guidelinesArray || [];
            section.guidelinesArray = [
              ...childGuidelines,
              ...parentEvalGuidelines.map(g => ({
                ...g,
                id: `${g.id}-inherited`, // Make ID unique
                orderIndex: g.orderIndex + 1000, // Ensure they appear after section-specific guidelines
              })),
            ];
          }
        }
      } else {
        rootSections.push(section);
      }
    } else {
      rootSections.push(section);
    }
  });

  return rootSections;
}

export function useProposalSections(templateTypeId: string | null, proposalId?: string | null) {
  const [loading, setLoading] = useState(true);
  const [templateSections, setTemplateSections] = useState<Section[]>([]);
  const [hasTemplateSections, setHasTemplateSections] = useState(false);
  const queryClient = useQueryClient();

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

  // Fetch WP drafts using react-query to share cache with WPManagementCard
  const { data: wpDraftsData = [] } = useQuery({
    queryKey: ['wp-drafts', proposalId],
    queryFn: async () => {
      if (!proposalId) return [];
      const { data, error } = await supabase
        .from('wp_drafts')
        .select('id, number, short_name, title, color, order_index')
        .eq('proposal_id', proposalId)
        .order('order_index');
      if (error) throw error;
      return data || [];
    },
    enabled: !!proposalId,
  });

  // Convert WP drafts to sections
  const wpDraftSections: WPSection[] = useMemo(() => {
    return wpDraftsData.map(wp => ({
      id: `wp-${wp.id}`,
      number: `WP${wp.number}`,
      title: wp.short_name || wp.title || `Work Package ${wp.number}`,
      wpId: wp.id,
      wpNumber: wp.number,
      wpColor: wp.color,
    }));
  }, [wpDraftsData]);

  // Subscribe to realtime updates for WP drafts and invalidate react-query cache
  useEffect(() => {
    if (!proposalId) return;

    const channel = supabase
      .channel(`wp-drafts-nav-${proposalId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'wp_drafts',
          filter: `proposal_id=eq.${proposalId}`,
        },
        () => {
          // Invalidate react-query cache to trigger refetch
          queryClient.invalidateQueries({ queryKey: ['wp-drafts', proposalId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [proposalId, queryClient]);

  // Return either template sections or fallback to hardcoded sections
  const allSections = useMemo(() => {
    // Define the Figures section (always needed for Part B)
    const figuresSection: Section = {
      id: 'figures',
      number: '',
      title: 'Figures',
      guidelines: {
        text: 'Manage and edit figures referenced in Part B sections. Figures are numbered based on their parent section (e.g., Figure 1.1.a).',
      },
    };

    // Define the WP drafts section with WP subsections
    const wpDraftsSection: Section = {
      id: 'wp-drafts',
      number: '',
      title: 'WP drafts',
      subsections: wpDraftSections,
    };

    if (hasTemplateSections && templateSections.length > 0) {
      // Separate Part A and Part B sections
      const partASections = templateSections.filter(s => s.isPartA);
      const partBSections = templateSections.filter(s => !s.isPartA);
      
      // Remove any Figures section that may be nested in Part B - we'll add it as standalone
      const partBRoot = partBSections.find(s => s.id === 'part-b' || s.number === 'Part B');
      if (partBRoot && partBRoot.subsections) {
        partBRoot.subsections = partBRoot.subsections.filter(s => s.id !== 'figures' && s.title !== 'Figures');
      }
      
      // Build result: Part A, Part B, then WP Drafts, then Figures (all at top level)
      const result = [...partASections, ...partBSections];
      
      // Add WP Drafts as standalone top-level section
      if (wpDraftSections.length > 0) {
        result.push(wpDraftsSection);
      }
      
      // Add Figures as standalone top-level section (after WP Drafts)
      result.push(figuresSection);
      
      return result;
    }
    
    // Fallback to hardcoded sections
    const fallbackSections = [...PART_A_SECTIONS, ...HORIZON_EUROPE_SECTIONS];
    
    // Add WP Drafts as standalone top-level section
    if (wpDraftSections.length > 0) {
      fallbackSections.push(wpDraftsSection);
    }
    
    // Add Figures as standalone top-level section (after WP Drafts)
    fallbackSections.push(figuresSection);
    
    return fallbackSections;
  }, [templateSections, hasTemplateSections, wpDraftSections]);

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
