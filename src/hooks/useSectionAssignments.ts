import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SectionAssignment {
  sectionNumber: string;
  assignedTo: string | null;
  assignedToName: string | null;
  assignedToAvatar: string | null;
  dueDate: string | null;
}

export function useSectionAssignments(proposalId: string | null) {
  const [assignments, setAssignments] = useState<Map<string, SectionAssignment>>(new Map());
  const [loading, setLoading] = useState(true);

  const fetchAssignments = useCallback(async () => {
    if (!proposalId) {
      setAssignments(new Map());
      setLoading(false);
      return;
    }

    // First get the proposal template
    const { data: templateData, error: templateError } = await supabase
      .from('proposal_templates')
      .select('id')
      .eq('proposal_id', proposalId)
      .maybeSingle();

    if (templateError || !templateData) {
      setLoading(false);
      return;
    }

    // Fetch all sections with assignments
    const { data: sectionsData, error: sectionsError } = await supabase
      .from('proposal_template_sections')
      .select(`
        section_number,
        assigned_to,
        due_date
      `)
      .eq('proposal_template_id', templateData.id)
      .not('assigned_to', 'is', null);

    if (sectionsError) {
      console.error('Error fetching section assignments:', sectionsError);
      setLoading(false);
      return;
    }

    // Get profile info for all assigned users
    const userIds = [...new Set(sectionsData.map(s => s.assigned_to).filter(Boolean))];
    
    let profilesMap = new Map<string, { full_name: string | null; avatar_url: string | null }>();
    
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', userIds);
      
      if (profiles) {
        profiles.forEach(p => {
          profilesMap.set(p.id, { full_name: p.full_name, avatar_url: p.avatar_url });
        });
      }
    }

    // Build assignments map
    const assignmentsMap = new Map<string, SectionAssignment>();
    sectionsData.forEach(section => {
      const profile = profilesMap.get(section.assigned_to);
      assignmentsMap.set(section.section_number, {
        sectionNumber: section.section_number,
        assignedTo: section.assigned_to,
        assignedToName: profile?.full_name || null,
        assignedToAvatar: profile?.avatar_url || null,
        dueDate: section.due_date,
      });
    });

    setAssignments(assignmentsMap);
    setLoading(false);
  }, [proposalId]);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  // Real-time subscription for assignment updates
  useEffect(() => {
    if (!proposalId) return;

    // Subscribe to changes on proposal_template_sections
    const channel = supabase
      .channel(`section_assignments:${proposalId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'proposal_template_sections',
        },
        () => {
          // Refetch assignments when any section is updated
          fetchAssignments();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [proposalId, fetchAssignments]);

  return {
    assignments,
    loading,
    refetch: fetchAssignments,
    getAssignment: (sectionNumber: string) => assignments.get(sectionNumber),
  };
}
