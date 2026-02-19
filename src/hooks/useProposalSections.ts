import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Section } from '@/types/proposal';
import { PART_A_SECTIONS, HORIZON_EUROPE_SECTIONS } from '@/types/proposal';

interface WPTheme {
  id: string;
  number: number;
  short_name: string | null;
  name: string | null;
  color: string;
  order_index: number;
}

// Extended section type with WP-specific fields
export interface WPSection extends Section {
  wpId?: string;
  wpNumber?: number;
  wpColor?: string;
}

// Extended section type with Case-specific fields
export interface CaseSection extends Section {
  caseId?: string;
  caseNumber?: number;
  caseColor?: string;
  caseType?: string;
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

export function useProposalSections(templateTypeId: string | null, proposalId?: string | null, proposalLoaded?: boolean) {
  const [loading, setLoading] = useState(true);
  const [templateSections, setTemplateSections] = useState<Section[]>([]);
  const [hasTemplateSections, setHasTemplateSections] = useState(false);
  const queryClient = useQueryClient();

  // Use useEffect directly with templateTypeId as dependency for proper reactivity
  useEffect(() => {
    // If proposal is still loading (proposalId present but not yet loaded), stay in loading state
    if (proposalLoaded === false && proposalId) {
      setLoading(true);
      return;
    }

    const fetchSections = async () => {
      if (!templateTypeId) {
        // Proposal has loaded but has no templateTypeId — legacy proposal, use fallback
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
  }, [templateTypeId, proposalLoaded, proposalId]);

  // Fetch WP drafts using react-query to share cache with WPManagementCard
  const { data: wpDraftsData = [] } = useQuery({
    queryKey: ['wp-drafts', proposalId],
    queryFn: async () => {
      if (!proposalId) return [];
      const { data, error } = await supabase
        .from('wp_drafts')
        .select('id, number, short_name, title, color, order_index, theme_id')
        .eq('proposal_id', proposalId)
        .order('order_index');
      if (error) throw error;
      return data || [];
    },
    enabled: !!proposalId,
  });

  // Fetch proposal's use_wp_themes flag
  const { data: proposalData } = useQuery({
    queryKey: ['proposal-themes-flag', proposalId],
    queryFn: async () => {
      if (!proposalId) return null;
      const { data, error } = await supabase
        .from('proposals')
        .select('use_wp_themes')
        .eq('id', proposalId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!proposalId,
  });

  // Fetch themes for the proposal
  const { data: themesData = [] } = useQuery({
    queryKey: ['wp-themes', proposalId],
    queryFn: async () => {
      if (!proposalId) return [];
      const { data, error } = await supabase
        .from('wp_themes')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('order_index');
      if (error) throw error;
      return data || [];
    },
    enabled: !!proposalId,
  });

  const useWpThemes = proposalData?.use_wp_themes ?? false;
  const themesMap = useMemo(() => {
    return new Map(themesData.map((t: WPTheme) => [t.id, t]));
  }, [themesData]);

  // Convert WP drafts to sections
  const wpDraftSections: WPSection[] = useMemo(() => {
    return wpDraftsData.map(wp => {
      // Resolve effective color: use theme color if themes are enabled and WP has a theme
      let effectiveColor = wp.color;
      if (useWpThemes && wp.theme_id) {
        const theme = themesMap.get(wp.theme_id);
        if (theme) {
          effectiveColor = theme.color;
        }
      }
      return {
        id: `wp-${wp.id}`,
        number: `WP${wp.number}`,
        title: wp.short_name || wp.title || `Work Package ${wp.number}`,
        wpId: wp.id,
        wpNumber: wp.number,
        wpColor: effectiveColor,
      };
    });
  }, [wpDraftsData, useWpThemes, themesMap]);

  // Fetch Case drafts using react-query
  const { data: caseDraftsData = [] } = useQuery({
    queryKey: ['case-drafts', proposalId],
    queryFn: async () => {
      if (!proposalId) return [];
      const { data, error } = await supabase
        .from('case_drafts')
        .select('id, number, short_name, title, color, order_index, case_type')
        .eq('proposal_id', proposalId)
        .order('order_index');
      if (error) throw error;
      return data || [];
    },
    enabled: !!proposalId,
  });

  // Get case prefix based on type
  const getCasePrefix = (caseType: string): string => {
    switch (caseType) {
      case 'case_study': return 'CS';
      case 'use_case': return 'UC';
      case 'living_lab': return 'LL';
      case 'pilot': return 'P';
      case 'demonstration': return 'D';
      default: return 'C';
    }
  };

  // Convert Case drafts to sections
  const caseDraftSections: CaseSection[] = useMemo(() => {
    return caseDraftsData.map(c => ({
      id: `case-${c.id}`,
      number: `${getCasePrefix(c.case_type)}${c.number}`,
      title: c.short_name || c.title || `Case ${c.number}`,
      caseId: c.id,
      caseNumber: c.number,
      caseColor: c.color,
      caseType: c.case_type,
    }));
  }, [caseDraftsData]);

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

  // Subscribe to realtime updates for themes
  useEffect(() => {
    if (!proposalId) return;

    const channel = supabase
      .channel(`wp-themes-nav-${proposalId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'wp_themes',
          filter: `proposal_id=eq.${proposalId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['wp-themes', proposalId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [proposalId, queryClient]);

  // Subscribe to realtime updates for proposal use_wp_themes flag
  useEffect(() => {
    if (!proposalId) return;

    const channel = supabase
      .channel(`proposal-themes-flag-${proposalId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'proposals',
          filter: `id=eq.${proposalId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['proposal-themes-flag', proposalId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [proposalId, queryClient]);

  // Subscribe to realtime updates for Case drafts
  useEffect(() => {
    if (!proposalId) return;

    const channel = supabase
      .channel(`case-drafts-nav-${proposalId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'case_drafts',
          filter: `proposal_id=eq.${proposalId}`,
        },
        () => {
          // Invalidate react-query cache to trigger refetch
          queryClient.invalidateQueries({ queryKey: ['case-drafts', proposalId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [proposalId, queryClient]);

  // Return either template sections or fallback to hardcoded sections
  const allSections = useMemo(() => {
    // Proposal management section (always at top, not a page itself)
    const proposalManagementSection: Section = {
      id: 'proposal-management',
      number: '',
      title: 'Proposal management',
      subsections: [
        { id: 'messaging', number: '', title: 'Message board' },
        { id: 'task-allocator', number: '', title: 'Tasks' },
        { id: 'progress-tracker', number: '', title: 'Progress' },
      ],
    };

    // Define the Figures section (always needed for Part B)
    const figuresSection: Section = {
      id: 'figures',
      number: '',
      title: 'Figures',
      guidelines: {
        text: 'Manage and edit figures referenced in Part B sections. Figures are numbered based on their parent section (e.g., Figure 1.1.a).',
      },
    };

    // Combined WPs & cases section
    const wpAndCasesSection: Section = {
      id: 'wp-drafts',
      number: '',
      title: 'Draft WP & case manager',
      subsections: [...wpDraftSections, ...caseDraftSections],
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
      
      // Build result: Proposal Management, Part A, Part B, then WP Drafts, then Case Drafts, then Figures
      const result = [proposalManagementSection, ...partASections, ...partBSections];
      
      // Add combined WPs & cases section if there are any WP or case drafts
      if (wpDraftSections.length > 0 || caseDraftSections.length > 0) {
        result.push(wpAndCasesSection);
      }
      
      // Add Figures as standalone top-level section (after Case Drafts)
      result.push(figuresSection);
      
      return result;
    }
    
    // Fallback to hardcoded sections
    const fallbackSections = [proposalManagementSection, ...PART_A_SECTIONS, ...HORIZON_EUROPE_SECTIONS];
    
    // Add combined WPs & cases section
    if (wpDraftSections.length > 0 || caseDraftSections.length > 0) {
      fallbackSections.push(wpAndCasesSection);
    }
    
    // Add Figures as standalone top-level section (after Case Drafts)
    fallbackSections.push(figuresSection);
    
    return fallbackSections;
  }, [templateSections, hasTemplateSections, wpDraftSections, caseDraftSections, useWpThemes, themesData]);

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
