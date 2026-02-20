import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useUserRole } from './useUserRole';
import { toast } from 'sonner';

interface UseSectionLockingProps {
  proposalId: string;
  sectionId: string;
}

interface LockInfo {
  isLocked: boolean;
  lockedBy: string | null;
  lockedAt: string | null;
  lockReason: string | null;
  lockedByName: string | null;
}

export function useSectionLocking({ proposalId, sectionId }: UseSectionLockingProps) {
  const [lockInfo, setLockInfo] = useState<LockInfo>({
    isLocked: false,
    lockedBy: null,
    lockedAt: null,
    lockReason: null,
    lockedByName: null,
  });
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const { user } = useAuth();
  const { isAdminOrOwner } = useUserRole();

  // Check if current user can lock/unlock sections (admin or owner)
  // Any admin/owner can lock or unlock any section, regardless of who locked it
  const canManageLock = isAdminOrOwner;
  
  // Check if current user locked this section (used for display purposes)
  const isLockedByMe = lockInfo.isLocked && lockInfo.lockedBy === user?.id;
  
  // Admins/owners can always edit locked sections
  const canEditWhenLocked = isAdminOrOwner;

  // Fetch lock status
  useEffect(() => {
    if (!proposalId || !sectionId) return;

    const fetchLockStatus = async () => {
      setLoading(true);
      
      try {
        // Get the proposal_template_section for this section
        const { data: templateData, error: templateError } = await supabase
          .from('proposal_templates')
          .select('id')
          .eq('proposal_id', proposalId)
          .maybeSingle();

        // If no template exists yet, just return - lock status defaults to unlocked
        if (templateError && templateError.code !== 'PGRST116') {
          console.error('Error fetching template:', templateError);
        }
        
        if (!templateData) {
          setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from('proposal_template_sections')
          .select(`
            is_locked,
            locked_by,
            locked_at,
            lock_reason
          `)
          .eq('proposal_template_id', templateData.id)
          .eq('section_tag', sectionId)
          .maybeSingle();

        if (error && error.code !== 'PGRST116') {
          console.error('Error fetching lock status:', error);
        }

        if (data) {
          let lockedByName: string | null = null;
          
          // Fetch the name of the user who locked it
          if (data.locked_by) {
            const { data: profileData } = await supabase
              .from('profiles_basic')
              .select('full_name, first_name, last_name')
              .eq('id', data.locked_by)
              .maybeSingle();
            
            if (profileData) {
              lockedByName = profileData.full_name || 
                `${profileData.first_name || ''} ${profileData.last_name || ''}`.trim() ||
                'Unknown user';
            }
          }

          setLockInfo({
            isLocked: data.is_locked || false,
            lockedBy: data.locked_by,
            lockedAt: data.locked_at,
            lockReason: data.lock_reason,
            lockedByName,
          });
        }
      } catch (error) {
        console.error('Error fetching lock status:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchLockStatus();
  }, [proposalId, sectionId]);

  // Toggle lock status
  const toggleLock = useCallback(async (reason?: string) => {
    if (!proposalId || !sectionId || !user?.id) return false;
    if (!canManageLock) {
      toast.error('Only admins and owners can lock/unlock sections');
      return false;
    }

    setUpdating(true);

    try {
      // Get the proposal template
      let { data: templateData, error: templateError } = await supabase
        .from('proposal_templates')
        .select('id')
        .eq('proposal_id', proposalId)
        .maybeSingle();

      if (templateError && templateError.code !== 'PGRST116') throw templateError;
      
      // If no template exists, try to auto-create one from the proposal's template type
      if (!templateData) {
        const { data: proposal } = await supabase
          .from('proposals')
          .select('template_type_id')
          .eq('id', proposalId)
          .maybeSingle();

        if (!proposal?.template_type_id) {
          toast.error('This proposal has no template configured. Please set a template type first.');
          return false;
        }

        const { data: sourceTemplate } = await supabase
          .from('template_types')
          .select('base_page_limit, includes_branding, includes_participant_table')
          .eq('id', proposal.template_type_id)
          .maybeSingle();

        const { data: newTemplate, error: createErr } = await supabase
          .from('proposal_templates')
          .insert({
            proposal_id: proposalId,
            source_template_type_id: proposal.template_type_id,
            base_page_limit: sourceTemplate?.base_page_limit || 45,
            includes_branding: sourceTemplate?.includes_branding ?? true,
            includes_participant_table: sourceTemplate?.includes_participant_table ?? true,
            is_customized: false,
          })
          .select('id')
          .single();

        if (createErr) throw createErr;

        // Copy template sections
        const { data: sourceSections } = await supabase
          .from('template_sections')
          .select('*')
          .eq('template_type_id', proposal.template_type_id)
          .eq('is_active', true)
          .order('order_index');

        if (sourceSections && sourceSections.length > 0) {
          const sectionInserts = sourceSections.map((s: any) => ({
            proposal_template_id: newTemplate.id,
            source_section_id: s.id,
            section_number: s.section_number,
            title: s.title,
            description: s.description,
            part: s.part,
            editor_type: s.editor_type,
            page_limit: s.page_limit,
            word_limit: s.word_limit,
            section_tag: s.section_tag,
            order_index: s.order_index,
            is_required: s.is_required,
            is_active: s.is_active,
            placeholder_content: s.placeholder_content,
          }));

          await supabase.from('proposal_template_sections').insert(sectionInserts);
        }

        templateData = newTemplate;
      }

      const newLockState = !lockInfo.isLocked;

      const { error } = await supabase
        .from('proposal_template_sections')
        .update({
          is_locked: newLockState,
          locked_by: newLockState ? user.id : null,
          locked_at: newLockState ? new Date().toISOString() : null,
          lock_reason: newLockState ? (reason || 'Locked for review') : null,
        })
        .eq('proposal_template_id', templateData.id)
        .eq('section_tag', sectionId);

      if (error) throw error;

      // Update local state
      setLockInfo({
        isLocked: newLockState,
        lockedBy: newLockState ? user.id : null,
        lockedAt: newLockState ? new Date().toISOString() : null,
        lockReason: newLockState ? (reason || 'Locked for review') : null,
        lockedByName: newLockState ? 'You' : null,
      });

      toast.success(newLockState ? 'Section locked' : 'Section unlocked');
      return true;
    } catch (error) {
      console.error('Error toggling lock:', error);
      toast.error('Failed to update lock status');
      return false;
    } finally {
      setUpdating(false);
    }
  }, [proposalId, sectionId, user?.id, lockInfo.isLocked, canManageLock]);

  return {
    ...lockInfo,
    loading,
    updating,
    canManageLock,
    canEditWhenLocked,
    isLockedByMe,
    toggleLock,
  };
}
