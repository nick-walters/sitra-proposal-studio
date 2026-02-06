import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  ParticipantResearcher,
  ParticipantOrganisationRole,
  ParticipantAchievement,
  ParticipantPreviousProject,
  ParticipantInfrastructure,
  ParticipantDependency,
  ParticipantDetails,
  transformResearcherFromRow,
  transformResearcherToRow,
  transformAchievementFromRow,
  transformPreviousProjectFromRow,
  transformInfrastructureFromRow,
  transformDependencyFromRow,
  transformOrganisationRoleFromRow,
} from '@/types/participantDetails';

export function useParticipantDetails(participantId: string | undefined) {
  const [loading, setLoading] = useState(true);
  const [researchers, setResearchers] = useState<ParticipantResearcher[]>([]);
  const [organisationRoles, setOrganisationRoles] = useState<ParticipantOrganisationRole[]>([]);
  const [achievements, setAchievements] = useState<ParticipantAchievement[]>([]);
  const [previousProjects, setPreviousProjects] = useState<ParticipantPreviousProject[]>([]);
  const [infrastructure, setInfrastructure] = useState<ParticipantInfrastructure[]>([]);
  const [dependencies, setDependencies] = useState<ParticipantDependency[]>([]);

  // Fetch all participant details
  const fetchDetails = useCallback(async () => {
    if (!participantId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [
        researchersRes,
        rolesRes,
        achievementsRes,
        projectsRes,
        infraRes,
        depsRes,
      ] = await Promise.all([
        supabase
          .from('participant_researchers')
          .select('*')
          .eq('participant_id', participantId)
          .order('order_index'),
        supabase
          .from('participant_organisation_roles')
          .select('*')
          .eq('participant_id', participantId),
        supabase
          .from('participant_achievements')
          .select('*')
          .eq('participant_id', participantId)
          .order('order_index'),
        supabase
          .from('participant_previous_projects')
          .select('*')
          .eq('participant_id', participantId)
          .order('order_index'),
        supabase
          .from('participant_infrastructure')
          .select('*')
          .eq('participant_id', participantId)
          .order('order_index'),
        supabase
          .from('participant_dependencies')
          .select('*')
          .eq('participant_id', participantId),
      ]);

      if (researchersRes.data) {
        setResearchers(researchersRes.data.map(transformResearcherFromRow));
      }
      if (rolesRes.data) {
        setOrganisationRoles(rolesRes.data.map(transformOrganisationRoleFromRow));
      }
      if (achievementsRes.data) {
        setAchievements(achievementsRes.data.map(transformAchievementFromRow));
      }
      if (projectsRes.data) {
        setPreviousProjects(projectsRes.data.map(transformPreviousProjectFromRow));
      }
      if (infraRes.data) {
        setInfrastructure(infraRes.data.map(transformInfrastructureFromRow));
      }
      if (depsRes.data) {
        setDependencies(depsRes.data.map(transformDependencyFromRow));
      }
    } catch (error) {
      console.error('Error fetching participant details:', error);
    } finally {
      setLoading(false);
    }
  }, [participantId]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  // ============================================
  // Researchers CRUD
  // ============================================
  const addResearcher = async (researcher: Omit<ParticipantResearcher, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!participantId) return;
    
    const { data, error } = await supabase
      .from('participant_researchers')
      .insert({
        participant_id: participantId,
        title: researcher.title || null,
        first_name: researcher.firstName,
        last_name: researcher.lastName,
        gender: researcher.gender || null,
        nationality: researcher.nationality || null,
        email: researcher.email || null,
        career_stage: researcher.careerStage || null,
        role_in_project: researcher.roleInProject || null,
        reference_identifier: researcher.referenceIdentifier || null,
        identifier_type: researcher.identifierType || null,
        order_index: researcher.orderIndex,
      })
      .select()
      .single();

    if (error) {
      toast.error('Failed to add researcher');
      console.error(error);
      return;
    }

    setResearchers(prev => [...prev, transformResearcherFromRow(data)]);
    toast.success('Researcher added');
    return data;
  };

  const updateResearcher = async (id: string, updates: Partial<ParticipantResearcher>) => {
    const { error } = await supabase
      .from('participant_researchers')
      .update(transformResearcherToRow(updates))
      .eq('id', id);

    if (error) {
      toast.error('Failed to update researcher');
      console.error(error);
      return;
    }

    setResearchers(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  };

  const deleteResearcher = async (id: string) => {
    const { error } = await supabase
      .from('participant_researchers')
      .delete()
      .eq('id', id);

    if (error) {
      toast.error('Failed to delete researcher');
      console.error(error);
      return;
    }

    setResearchers(prev => prev.filter(r => r.id !== id));
    toast.success('Researcher removed');
  };

  // ============================================
  // Organisation Roles CRUD
  // ============================================
  const setOrganisationRole = async (roleType: string, enabled: boolean, otherDescription?: string) => {
    if (!participantId) return;

    if (enabled) {
      // Check if role already exists
      const existing = organisationRoles.find(r => r.roleType === roleType);
      if (existing) {
        if (otherDescription !== undefined) {
          const { error } = await supabase
            .from('participant_organisation_roles')
            .update({ other_description: otherDescription || null })
            .eq('id', existing.id);

          if (!error) {
            setOrganisationRoles(prev => 
              prev.map(r => r.id === existing.id ? { ...r, otherDescription } : r)
            );
          }
        }
        return;
      }

      const { data, error } = await supabase
        .from('participant_organisation_roles')
        .insert({
          participant_id: participantId,
          role_type: roleType,
          other_description: otherDescription || null,
        })
        .select()
        .single();

      if (!error && data) {
        setOrganisationRoles(prev => [...prev, transformOrganisationRoleFromRow(data)]);
      }
    } else {
      const existing = organisationRoles.find(r => r.roleType === roleType);
      if (existing) {
        const { error } = await supabase
          .from('participant_organisation_roles')
          .delete()
          .eq('id', existing.id);

        if (!error) {
          setOrganisationRoles(prev => prev.filter(r => r.id !== existing.id));
        }
      }
    }
  };

  // ============================================
  // Achievements CRUD
  // ============================================
  const addAchievement = async (achievement: Omit<ParticipantAchievement, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!participantId) return;
    if (achievements.length >= 5) {
      toast.error('Maximum of 5 achievements allowed');
      return;
    }

    const { data, error } = await supabase
      .from('participant_achievements')
      .insert({
        participant_id: participantId,
        achievement_type: achievement.achievementType,
        description: achievement.description,
        order_index: achievement.orderIndex,
      })
      .select()
      .single();

    if (error) {
      toast.error('Failed to add achievement');
      console.error(error);
      return;
    }

    setAchievements(prev => [...prev, transformAchievementFromRow(data)]);
    toast.success('Achievement added');
    return data;
  };

  const updateAchievement = async (id: string, updates: Partial<ParticipantAchievement>) => {
    const updateData: Record<string, unknown> = {};
    if (updates.achievementType !== undefined) updateData.achievement_type = updates.achievementType;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.orderIndex !== undefined) updateData.order_index = updates.orderIndex;

    const { error } = await supabase
      .from('participant_achievements')
      .update(updateData)
      .eq('id', id);

    if (error) {
      toast.error('Failed to update achievement');
      console.error(error);
      return;
    }

    setAchievements(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
  };

  const deleteAchievement = async (id: string) => {
    const { error } = await supabase
      .from('participant_achievements')
      .delete()
      .eq('id', id);

    if (error) {
      toast.error('Failed to delete achievement');
      console.error(error);
      return;
    }

    setAchievements(prev => prev.filter(a => a.id !== id));
    toast.success('Achievement removed');
  };

  // ============================================
  // Previous Projects CRUD
  // ============================================
  const addPreviousProject = async (project: Omit<ParticipantPreviousProject, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!participantId) return;
    if (previousProjects.length >= 5) {
      toast.error('Maximum of 5 previous projects allowed');
      return;
    }

    const { data, error } = await supabase
      .from('participant_previous_projects')
      .insert({
        participant_id: participantId,
        project_name: project.projectName,
        description: project.description || null,
        order_index: project.orderIndex,
      })
      .select()
      .single();

    if (error) {
      toast.error('Failed to add project');
      console.error(error);
      return;
    }

    setPreviousProjects(prev => [...prev, transformPreviousProjectFromRow(data)]);
    toast.success('Project added');
    return data;
  };

  const updatePreviousProject = async (id: string, updates: Partial<ParticipantPreviousProject>) => {
    const updateData: Record<string, unknown> = {};
    if (updates.projectName !== undefined) updateData.project_name = updates.projectName;
    if (updates.description !== undefined) updateData.description = updates.description || null;
    if (updates.orderIndex !== undefined) updateData.order_index = updates.orderIndex;

    const { error } = await supabase
      .from('participant_previous_projects')
      .update(updateData)
      .eq('id', id);

    if (error) {
      toast.error('Failed to update project');
      console.error(error);
      return;
    }

    setPreviousProjects(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  const deletePreviousProject = async (id: string) => {
    const { error } = await supabase
      .from('participant_previous_projects')
      .delete()
      .eq('id', id);

    if (error) {
      toast.error('Failed to delete project');
      console.error(error);
      return;
    }

    setPreviousProjects(prev => prev.filter(p => p.id !== id));
    toast.success('Project removed');
  };

  // ============================================
  // Infrastructure CRUD
  // ============================================
  const addInfrastructure = async (infra: Omit<ParticipantInfrastructure, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!participantId) return;

    const { data, error } = await supabase
      .from('participant_infrastructure')
      .insert({
        participant_id: participantId,
        name: infra.name,
        description: infra.description || null,
        order_index: infra.orderIndex,
      })
      .select()
      .single();

    if (error) {
      toast.error('Failed to add infrastructure');
      console.error(error);
      return;
    }

    setInfrastructure(prev => [...prev, transformInfrastructureFromRow(data)]);
    toast.success('Infrastructure added');
    return data;
  };

  const updateInfrastructure = async (id: string, updates: Partial<ParticipantInfrastructure>) => {
    const updateData: Record<string, unknown> = {};
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined) updateData.description = updates.description || null;
    if (updates.orderIndex !== undefined) updateData.order_index = updates.orderIndex;

    const { error } = await supabase
      .from('participant_infrastructure')
      .update(updateData)
      .eq('id', id);

    if (error) {
      toast.error('Failed to update infrastructure');
      console.error(error);
      return;
    }

    setInfrastructure(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));
  };

  const deleteInfrastructure = async (id: string) => {
    const { error } = await supabase
      .from('participant_infrastructure')
      .delete()
      .eq('id', id);

    if (error) {
      toast.error('Failed to delete infrastructure');
      console.error(error);
      return;
    }

    setInfrastructure(prev => prev.filter(i => i.id !== id));
    toast.success('Infrastructure removed');
  };

  // ============================================
  // Dependencies CRUD
  // ============================================
  const addDependency = async (dep: Omit<ParticipantDependency, 'id' | 'createdAt'>) => {
    if (!participantId) return;

    const { data, error } = await supabase
      .from('participant_dependencies')
      .insert({
        participant_id: participantId,
        linked_participant_id: dep.linkedParticipantId || null,
        link_type: dep.linkType,
        notes: dep.notes || null,
      })
      .select()
      .single();

    if (error) {
      toast.error('Failed to add dependency');
      console.error(error);
      return;
    }

    setDependencies(prev => [...prev, transformDependencyFromRow(data)]);
    toast.success('Dependency added');
    return data;
  };

  const updateDependency = async (id: string, updates: Partial<ParticipantDependency>) => {
    const updateData: Record<string, unknown> = {};
    if (updates.linkedParticipantId !== undefined) updateData.linked_participant_id = updates.linkedParticipantId || null;
    if (updates.linkType !== undefined) updateData.link_type = updates.linkType;
    if (updates.notes !== undefined) updateData.notes = updates.notes || null;

    const { error } = await supabase
      .from('participant_dependencies')
      .update(updateData)
      .eq('id', id);

    if (error) {
      toast.error('Failed to update dependency');
      console.error(error);
      return;
    }

    setDependencies(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
  };

  const deleteDependency = async (id: string) => {
    const { error } = await supabase
      .from('participant_dependencies')
      .delete()
      .eq('id', id);

    if (error) {
      toast.error('Failed to delete dependency');
      console.error(error);
      return;
    }

    setDependencies(prev => prev.filter(d => d.id !== id));
    toast.success('Dependency removed');
  };

  return {
    loading,
    researchers,
    organisationRoles,
    achievements,
    previousProjects,
    infrastructure,
    dependencies,
    // Researchers
    addResearcher,
    updateResearcher,
    deleteResearcher,
    // Organisation Roles
    setOrganisationRole,
    // Achievements
    addAchievement,
    updateAchievement,
    deleteAchievement,
    // Previous Projects
    addPreviousProject,
    updatePreviousProject,
    deletePreviousProject,
    // Infrastructure
    addInfrastructure,
    updateInfrastructure,
    deleteInfrastructure,
    // Dependencies
    addDependency,
    updateDependency,
    deleteDependency,
    // Refresh
    refetch: fetchDetails,
  };
}
