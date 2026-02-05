import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { createAssignmentNotification } from '@/hooks/useNotifications';

/**
 * useSectionAssignment - Manages assignment for a SINGLE section
 * 
 * Use case: Section editor assignment panel where you need full CRUD operations
 * for managing who is assigned to a specific section, due dates, etc.
 * 
 * For batch assignment data (e.g., section navigator overview), use useSectionAssignments instead.
 */

interface AssignmentInfo {
  assignedTo: string | null;
  assignedToName: string | null;
  assignedToEmail: string | null;
  assignedToAvatar: string | null;
  assignedBy: string | null;
  assignedByName: string | null;
  assignedAt: string | null;
  dueDate: string | null;
}

interface TeamMember {
  id: string;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  organisation: string | null;
}

interface UseSectionAssignmentProps {
  proposalId: string;
  sectionId: string;
}

export function useSectionAssignment({ proposalId, sectionId }: UseSectionAssignmentProps) {
  const { user } = useAuth();
  const { isAdminOrOwner } = useUserRole();
  const [assignmentInfo, setAssignmentInfo] = useState<AssignmentInfo>({
    assignedTo: null,
    assignedToName: null,
    assignedToEmail: null,
    assignedToAvatar: null,
    assignedBy: null,
    assignedByName: null,
    assignedAt: null,
    dueDate: null,
  });
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  // Check if current user can manage assignments (admin or owner)
  const canManageAssignment = isAdminOrOwner;

  // Check if current user is the assignee
  const isAssignedToMe = assignmentInfo.assignedTo === user?.id;

  // Fetch assignment info
  const fetchAssignmentInfo = useCallback(async () => {
    if (!proposalId || !sectionId) return;

    try {
      // Find the proposal_template_section by matching section_number or title
      const { data: templateData } = await supabase
        .from('proposal_templates')
        .select('id')
        .eq('proposal_id', proposalId)
        .single();

      if (!templateData) return;

      const { data: sectionData, error } = await supabase
        .from('proposal_template_sections')
        .select(`
          assigned_to,
          assigned_by,
          assigned_at,
          due_date
        `)
        .eq('proposal_template_id', templateData.id)
        .eq('section_number', sectionId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching assignment info:', error);
        return;
      }

      if (sectionData) {
        let assignedToName = null;
        let assignedToEmail = null;
        let assignedToAvatar = null;
        let assignedByName = null;

        // Fetch assignee profile
        if (sectionData.assigned_to) {
          const { data: assigneeProfile } = await supabase
            .from('profiles')
            .select('first_name, last_name, email, avatar_url')
            .eq('id', sectionData.assigned_to)
            .single();

          if (assigneeProfile) {
            assignedToName = [assigneeProfile.first_name, assigneeProfile.last_name].filter(Boolean).join(' ') || assigneeProfile.email;
            assignedToEmail = assigneeProfile.email;
            assignedToAvatar = assigneeProfile.avatar_url;
          }
        }

        // Fetch assigner profile
        if (sectionData.assigned_by) {
          const { data: assignerProfile } = await supabase
            .from('profiles')
            .select('first_name, last_name, email')
            .eq('id', sectionData.assigned_by)
            .single();

          if (assignerProfile) {
            assignedByName = [assignerProfile.first_name, assignerProfile.last_name].filter(Boolean).join(' ') || assignerProfile.email;
          }
        }

        setAssignmentInfo({
          assignedTo: sectionData.assigned_to,
          assignedToName,
          assignedToEmail,
          assignedToAvatar,
          assignedBy: sectionData.assigned_by,
          assignedByName,
          assignedAt: sectionData.assigned_at,
          dueDate: sectionData.due_date,
        });
      }
    } catch (err) {
      console.error('Error in fetchAssignmentInfo:', err);
    } finally {
      setLoading(false);
    }
  }, [proposalId, sectionId]);

  // Fetch team members (users with roles on this proposal)
  const fetchTeamMembers = useCallback(async () => {
    if (!proposalId) return;

    try {
      // Get all users with roles on this proposal
      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('proposal_id', proposalId);

      if (rolesError) {
        console.error('Error fetching user roles:', rolesError);
        return;
      }

      const userIds = [...new Set(rolesData?.map(r => r.user_id) || [])];
      
      if (userIds.length === 0) return;

      // Fetch profiles for these users
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email, avatar_url, organisation')
        .in('id', userIds);

      if (profilesError) {
        console.error('Error fetching profiles:', profilesError);
        return;
      }

      setTeamMembers(
        (profilesData || []).map(p => ({
          id: p.id,
          fullName: [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email,
          email: p.email,
          avatarUrl: p.avatar_url,
          organisation: p.organisation,
        }))
      );
    } catch (err) {
      console.error('Error in fetchTeamMembers:', err);
    }
  }, [proposalId]);

  // Assign section to a team member
  const assignSection = useCallback(async (userId: string | null, dueDate: string | null, sectionTitle?: string) => {
    if (!proposalId || !sectionId || !user) return;

    setUpdating(true);
    try {
      // Get the template id
      const { data: templateData } = await supabase
        .from('proposal_templates')
        .select('id')
        .eq('proposal_id', proposalId)
        .single();

      if (!templateData) return;

      // Check if this is a new assignment or reassignment
      const previousAssignee = assignmentInfo.assignedTo;
      const isNewAssignment = !previousAssignee && userId;
      const isReassignment = previousAssignee && userId && previousAssignee !== userId;

      const { error } = await supabase
        .from('proposal_template_sections')
        .update({
          assigned_to: userId,
          assigned_by: userId ? user.id : null,
          assigned_at: userId ? new Date().toISOString() : null,
          due_date: dueDate,
        })
        .eq('proposal_template_id', templateData.id)
        .eq('section_number', sectionId);

      if (error) {
        console.error('Error assigning section:', error);
        return;
      }

      // Create notification for the assigned user
      if (userId && (isNewAssignment || isReassignment)) {
        await createAssignmentNotification({
          proposalId,
          userId,
          assignedBy: user.id,
          sectionId,
          sectionTitle: sectionTitle || sectionId,
          dueDate: dueDate || undefined,
        });
      }

      // Refresh assignment info
      await fetchAssignmentInfo();
    } catch (err) {
      console.error('Error in assignSection:', err);
    } finally {
      setUpdating(false);
    }
  }, [proposalId, sectionId, user, assignmentInfo.assignedTo, fetchAssignmentInfo]);

  // Update just the due date
  const updateDueDate = useCallback(async (dueDate: string | null) => {
    if (!proposalId || !sectionId) return;

    setUpdating(true);
    try {
      const { data: templateData } = await supabase
        .from('proposal_templates')
        .select('id')
        .eq('proposal_id', proposalId)
        .single();

      if (!templateData) return;

      const { error } = await supabase
        .from('proposal_template_sections')
        .update({ due_date: dueDate })
        .eq('proposal_template_id', templateData.id)
        .eq('section_number', sectionId);

      if (error) {
        console.error('Error updating due date:', error);
        return;
      }

      await fetchAssignmentInfo();
    } catch (err) {
      console.error('Error in updateDueDate:', err);
    } finally {
      setUpdating(false);
    }
  }, [proposalId, sectionId, fetchAssignmentInfo]);

  // Clear assignment
  const clearAssignment = useCallback(async () => {
    await assignSection(null, null);
  }, [assignSection]);

  useEffect(() => {
    fetchAssignmentInfo();
    fetchTeamMembers();
  }, [fetchAssignmentInfo, fetchTeamMembers]);

  return {
    assignmentInfo,
    teamMembers,
    loading,
    updating,
    canManageAssignment,
    isAssignedToMe,
    assignSection,
    updateDueDate,
    clearAssignment,
  };
}
