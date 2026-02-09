import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';
import type { Participant, ParticipantMember, BudgetType } from '@/types/proposal';

// Helper to convert camelCase to snake_case
function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

// Helper to convert snake_case to camelCase
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

// Dynamic ethics assessment interface - supports all fields from EthicsForm
interface EthicsAssessment {
  id?: string;
  proposalId: string;
  [key: string]: string | boolean | null | undefined;
}

interface ProposalData {
  id: string;
  acronym: string;
  title: string;
  type: 'RIA' | 'IA' | 'CSA';
  budgetType: BudgetType;
  status: 'draft' | 'submitted' | 'funded' | 'not_funded';
  submissionStage?: 'full' | 'stage_1';
  isTwoStageSecondStage?: boolean;
  totalBudget?: number;
  deadline?: Date;
  description?: string;
  duration?: number;
  topicId?: string;
  topicUrl?: string;
  topicTitle?: string;
  topicDescription?: string;
  topicDestinationDescription?: string;
  topicContentImportedAt?: Date;
  workProgramme?: string;
  destination?: string;
  logoUrl?: string;
  submittedAt?: Date;
  decisionDate?: Date;
  templateTypeId?: string;
  expectedProjects?: string;
  usesFstp?: boolean;
  casesEnabled?: boolean;
  casesType?: string;
  createdAt: Date;
  updatedAt: Date;
}

export function useProposalData(proposalId: string) {
  const { user } = useAuth();
  const [proposal, setProposal] = useState<ProposalData | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [participantMembers, setParticipantMembers] = useState<ParticipantMember[]>([]);
  const [ethics, setEthics] = useState<EthicsAssessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<'owner' | 'admin' | 'editor' | 'viewer' | null>(null);

  // Fetch proposal data
  const fetchProposal = useCallback(async () => {
    if (!proposalId) return;

    const { data, error } = await supabase
      .from('proposals')
      .select('*')
      .eq('id', proposalId)
      .single();

    if (error) {
      console.error('Error fetching proposal:', error);
      return;
    }

    if (data) {
      setProposal({
        id: data.id,
        acronym: data.acronym,
        title: data.title,
        type: data.type as 'RIA' | 'IA' | 'CSA',
        budgetType: data.budget_type as BudgetType,
        status: data.status as ProposalData['status'],
        submissionStage: ((data as any).submission_stage as 'full' | 'stage_1') || undefined,
        isTwoStageSecondStage: (data as any).is_two_stage_second_stage || false,
        totalBudget: data.total_budget || undefined,
        deadline: data.deadline ? new Date(data.deadline) : undefined,
        description: data.description || undefined,
        duration: data.duration || undefined,
        topicId: data.topic_id || undefined,
        topicUrl: data.topic_url || undefined,
        topicTitle: data.topic_title || undefined,
        topicDescription: (data as any).topic_description || undefined,
        topicDestinationDescription: (data as any).topic_destination_description || undefined,
        topicContentImportedAt: (data as any).topic_content_imported_at ? new Date((data as any).topic_content_imported_at) : undefined,
        workProgramme: data.work_programme || undefined,
        destination: data.destination || undefined,
        logoUrl: data.logo_url || undefined,
        submittedAt: data.submitted_at ? new Date(data.submitted_at) : undefined,
        decisionDate: data.decision_date ? new Date(data.decision_date) : undefined,
        templateTypeId: data.template_type_id || undefined,
        expectedProjects: (data as any).expected_projects || undefined,
        usesFstp: data.uses_fstp || false,
        casesEnabled: (data as any).cases_enabled || false,
        casesType: (data as any).cases_type || undefined,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at),
      });
    }
  }, [proposalId]);

  // Fetch user role
  const fetchUserRole = useCallback(async () => {
    if (!proposalId || !user) return;

    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('proposal_id', proposalId)
      .eq('user_id', user.id)
      .single();

    if (data) {
      setUserRole(data.role as 'owner' | 'admin' | 'editor' | 'viewer');
    }
  }, [proposalId, user]);

  // Fetch participants
  const fetchParticipants = useCallback(async () => {
    if (!proposalId) return;

    const { data, error } = await supabase
      .from('participants')
      .select('*')
      .eq('proposal_id', proposalId)
      .order('participant_number', { ascending: true });

    if (error) {
      console.error('Error fetching participants:', error);
      return;
    }

    setParticipants(
      (data || []).map((p: any) => ({
        id: p.id,
        proposalId: p.proposal_id,
        organisationName: p.organisation_name,
        organisationShortName: p.organisation_short_name || undefined,
        organisationType: p.organisation_type as Participant['organisationType'],
        country: p.country || undefined,
        logoUrl: p.logo_url || undefined,
        picNumber: p.pic_number || undefined,
        legalEntityType: p.legal_entity_type || undefined,
        isSme: p.is_sme || false,
        participantNumber: p.participant_number || 1,
        contactEmail: p.contact_email || undefined,
        address: p.address || undefined,
        organisationCategory: p.organisation_category || undefined,
        englishName: p.english_name || undefined,
      }))
    );
  }, [proposalId]);

  // Fetch participant members
  const fetchParticipantMembers = useCallback(async () => {
    if (!proposalId) return;

    const { data, error } = await supabase
      .from('participant_members')
      .select('*, participants!inner(proposal_id)')
      .eq('participants.proposal_id', proposalId);

    if (error) {
      console.error('Error fetching participant members:', error);
      return;
    }

    setParticipantMembers(
      (data || []).map((m: any) => ({
        id: m.id,
        participantId: m.participant_id,
        userId: m.user_id || undefined,
        fullName: m.full_name,
        email: m.email || undefined,
        roleInProject: m.role_in_project || undefined,
        personMonths: m.person_months || undefined,
        isPrimaryContact: m.is_primary_contact || false,
      }))
    );
  }, [proposalId]);

  // Fetch ethics assessment
  const fetchEthics = useCallback(async () => {
    if (!proposalId) return;

    const { data, error } = await supabase
      .from('ethics_assessment')
      .select('*')
      .eq('proposal_id', proposalId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching ethics:', error);
      return;
    }

    if (data) {
      // Dynamically convert snake_case database fields to camelCase
      const ethicsData: EthicsAssessment = {
        id: data.id,
        proposalId: data.proposal_id,
      };
      
      for (const [key, value] of Object.entries(data)) {
        if (key === 'id' || key === 'proposal_id' || key === 'created_at' || key === 'updated_at') continue;
        const camelKey = snakeToCamel(key);
        ethicsData[camelKey] = value ?? undefined;
      }
      
      setEthics(ethicsData);
    }
  }, [proposalId]);

  // Load all data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([
        fetchProposal(),
        fetchUserRole(),
        fetchParticipants(),
        fetchParticipantMembers(),
        fetchEthics(),
      ]);
      setLoading(false);
    };
    loadData();
  }, [fetchProposal, fetchUserRole, fetchParticipants, fetchParticipantMembers, fetchEthics]);

  // Update proposal
  const updateProposal = async (updates: Partial<ProposalData>) => {
    if (!proposalId) return;

    const dbUpdates: any = {};
    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.acronym !== undefined) dbUpdates.acronym = updates.acronym;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.duration !== undefined) dbUpdates.duration = updates.duration;
    if (updates.topicId !== undefined) dbUpdates.topic_id = updates.topicId;
    if (updates.topicUrl !== undefined) dbUpdates.topic_url = updates.topicUrl;
    if (updates.topicTitle !== undefined) dbUpdates.topic_title = updates.topicTitle;
    if (updates.totalBudget !== undefined) dbUpdates.total_budget = updates.totalBudget;
    if (updates.deadline !== undefined) dbUpdates.deadline = updates.deadline?.toISOString();
    if (updates.decisionDate !== undefined) dbUpdates.decision_date = updates.decisionDate?.toISOString();
    if (updates.workProgramme !== undefined) dbUpdates.work_programme = updates.workProgramme;
    if (updates.destination !== undefined) dbUpdates.destination = updates.destination;
    if (updates.logoUrl !== undefined) dbUpdates.logo_url = updates.logoUrl;
    if (updates.budgetType !== undefined) dbUpdates.budget_type = updates.budgetType;
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.expectedProjects !== undefined) dbUpdates.expected_projects = updates.expectedProjects;
    if (updates.usesFstp !== undefined) dbUpdates.uses_fstp = updates.usesFstp;

    const { error } = await supabase
      .from('proposals')
      .update(dbUpdates)
      .eq('id', proposalId);

    if (error) {
      toast.error('Failed to update proposal');
      console.error(error);
    } else {
      setProposal((prev) => (prev ? { ...prev, ...updates } : null));
    }
  };

  // Add participant
  const addParticipant = async (participant: Omit<Participant, 'id'> & { organisationCategory?: string; englishName?: string; logoUrl?: string }) => {
    // Check for duplicate PIC before adding
    // Note: Same organisation name is allowed as orgs can have multiple PICs (e.g., different departments/offices)
    const picNumber = participant.picNumber?.trim();
    
    if (picNumber) {
      const existingByPic = participants.find(
        p => p.picNumber?.trim() === picNumber
      );
      if (existingByPic) {
        toast.error(`This PIC (${picNumber}) is already in the consortium as "${existingByPic.organisationShortName || existingByPic.organisationName}"`);
        throw new Error('Duplicate participant');
      }
    }

    // Upsert to shared organisations registry (by PIC number)
    if (picNumber) {
      const { data: existingOrg } = await supabase
        .from('organisations')
        .select('id')
        .eq('pic_number', picNumber)
        .maybeSingle();
      
      if (!existingOrg) {
        // Insert new organisation to shared registry
        await supabase.from('organisations').insert({
          name: participant.organisationName,
          short_name: participant.organisationShortName,
          pic_number: picNumber,
          country: participant.country,
          legal_entity_type: participant.legalEntityType,
          is_sme: participant.isSme,
          english_name: participant.englishName,
          logo_url: participant.logoUrl,
        });
      }
    }

    const { data, error } = await supabase
      .from('participants')
      .insert({
        proposal_id: proposalId,
        organisation_name: participant.organisationName,
        organisation_short_name: participant.organisationShortName,
        organisation_type: participant.organisationType,
        country: participant.country,
        pic_number: participant.picNumber,
        legal_entity_type: participant.legalEntityType,
        is_sme: participant.isSme,
        participant_number: participant.participantNumber,
        contact_email: participant.contactEmail,
        address: participant.address,
        organisation_category: participant.organisationCategory,
        english_name: participant.englishName,
        logo_url: participant.logoUrl,
      })
      .select()
      .single();

    if (error) {
      toast.error('Failed to add participant');
      console.error(error);
      throw error;
    } else if (data) {
      await fetchParticipants();
    }
  };

  // Update participant
  const updateParticipant = async (id: string, updates: Partial<Participant> & { organisationCategory?: string; englishName?: string }) => {
    const dbUpdates: any = {};
    if (updates.organisationName !== undefined) dbUpdates.organisation_name = updates.organisationName;
    if (updates.organisationShortName !== undefined) dbUpdates.organisation_short_name = updates.organisationShortName;
    if (updates.organisationType !== undefined) dbUpdates.organisation_type = updates.organisationType;
    if (updates.country !== undefined) dbUpdates.country = updates.country;
    if (updates.picNumber !== undefined) dbUpdates.pic_number = updates.picNumber;
    if (updates.legalEntityType !== undefined) dbUpdates.legal_entity_type = updates.legalEntityType;
    if (updates.isSme !== undefined) dbUpdates.is_sme = updates.isSme;
    if (updates.contactEmail !== undefined) dbUpdates.contact_email = updates.contactEmail;
    if (updates.address !== undefined) dbUpdates.address = updates.address;
    if (updates.organisationCategory !== undefined) dbUpdates.organisation_category = updates.organisationCategory;
    if (updates.englishName !== undefined) dbUpdates.english_name = updates.englishName;
    // Handle logoUrl - use null check to allow clearing (null means delete, undefined means no change)
    if ('logoUrl' in updates) dbUpdates.logo_url = updates.logoUrl || null;

    const { error } = await supabase.from('participants').update(dbUpdates).eq('id', id);

    if (error) {
      toast.error('Failed to update participant');
      console.error(error);
    } else {
      // Update local state
      setParticipants((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
      );

      // Sync to centralized organisations registry (by PIC number)
      // Find the participant to get its PIC
      const participant = participants.find(p => p.id === id);
      const picNumber = updates.picNumber?.trim() || participant?.picNumber?.trim();
      
      if (picNumber) {
        // Build registry updates - only sync org-level fields, not proposal-specific ones
        const registryUpdates: any = {};
        if (updates.organisationName !== undefined) registryUpdates.name = updates.organisationName;
        if (updates.organisationShortName !== undefined) registryUpdates.short_name = updates.organisationShortName;
        if (updates.country !== undefined) registryUpdates.country = updates.country;
        if (updates.legalEntityType !== undefined) registryUpdates.legal_entity_type = updates.legalEntityType;
        if (updates.isSme !== undefined) registryUpdates.is_sme = updates.isSme;
        if (updates.englishName !== undefined) registryUpdates.english_name = updates.englishName;
        if ('logoUrl' in updates) registryUpdates.logo_url = updates.logoUrl || null;
        
        if (Object.keys(registryUpdates).length > 0) {
          // Upsert to registry - update if exists, insert if not
          const { data: existingOrg } = await supabase
            .from('organisations')
            .select('id')
            .eq('pic_number', picNumber)
            .maybeSingle();
          
          if (existingOrg) {
            // Update existing registry entry
            await supabase
              .from('organisations')
              .update(registryUpdates)
              .eq('pic_number', picNumber);
          } else {
            // Create new registry entry with full participant data
            const fullParticipant = { ...participant, ...updates };
            await supabase.from('organisations').insert({
              name: fullParticipant.organisationName || '',
              short_name: fullParticipant.organisationShortName,
              pic_number: picNumber,
              country: fullParticipant.country,
              legal_entity_type: fullParticipant.legalEntityType,
              is_sme: fullParticipant.isSme,
              english_name: fullParticipant.englishName,
              logo_url: fullParticipant.logoUrl,
            });
          }
        }
      }
    }
  };

  // Reorder participants (batch update participant numbers)
  const reorderParticipants = async (reorderedParticipants: Participant[]) => {
    // Update participant numbers in the reordered array
    const updatedParticipants = reorderedParticipants.map((p, index) => ({
      ...p,
      participantNumber: index + 1,
    }));
    
    // Optimistic update with correct participant numbers
    setParticipants(updatedParticipants);

    // Batch update all participant numbers in the database
    const updates = updatedParticipants.map((p) => ({
      id: p.id,
      participant_number: p.participantNumber,
    }));

    // Update each participant's number
    const promises = updates.map(({ id, participant_number }) =>
      supabase.from('participants').update({ participant_number }).eq('id', id)
    );

    const results = await Promise.all(promises);
    const errors = results.filter((r) => r.error);

    if (errors.length > 0) {
      toast.error('Failed to save participant order');
      console.error('Reorder errors:', errors);
      // Refresh to get correct state from database
      await fetchParticipants();
    } else {
      toast.success('Participant order saved');
    }
  };

  // Delete participant
  const deleteParticipant = async (id: string) => {
    const { error } = await supabase.from('participants').delete().eq('id', id);

    if (error) {
      toast.error('Failed to delete participant');
      console.error(error);
    } else {
      setParticipants((prev) => prev.filter((p) => p.id !== id));
      toast.success('Participant deleted');
    }
  };

  // Add participant member
  const addParticipantMember = async (member: Omit<ParticipantMember, 'id'>) => {
    const { data, error } = await supabase
      .from('participant_members')
      .insert({
        participant_id: member.participantId,
        full_name: member.fullName,
        email: member.email,
        role_in_project: member.roleInProject,
        person_months: member.personMonths,
        is_primary_contact: member.isPrimaryContact,
        user_id: member.userId,
        person_id: member.personId,
      })
      .select()
      .single();

    if (error) {
      toast.error('Failed to add team member');
      console.error(error);
    } else if (data) {
      await fetchParticipantMembers();
      toast.success('Team member added');
    }
  };

  // Update participant member
  const updateParticipantMember = async (id: string, updates: Partial<ParticipantMember>) => {
    const dbUpdates: any = {};
    if (updates.fullName !== undefined) dbUpdates.full_name = updates.fullName;
    if (updates.email !== undefined) dbUpdates.email = updates.email;
    if (updates.roleInProject !== undefined) dbUpdates.role_in_project = updates.roleInProject;
    if (updates.personMonths !== undefined) dbUpdates.person_months = updates.personMonths;
    if (updates.isPrimaryContact !== undefined) dbUpdates.is_primary_contact = updates.isPrimaryContact;

    const { error } = await supabase.from('participant_members').update(dbUpdates).eq('id', id);

    if (error) {
      toast.error('Failed to update team member');
      console.error(error);
    } else {
      setParticipantMembers((prev) =>
        prev.map((m) => (m.id === id ? { ...m, ...updates } : m))
      );
    }
  };

  // Delete participant member
  const deleteParticipantMember = async (id: string) => {
    const { error } = await supabase.from('participant_members').delete().eq('id', id);

    if (error) {
      toast.error('Failed to delete team member');
      console.error(error);
    } else {
      setParticipantMembers((prev) => prev.filter((m) => m.id !== id));
      toast.success('Team member deleted');
    }
  };

  // Update ethics - dynamically handles all fields
  const updateEthics = async (updates: Partial<EthicsAssessment>) => {
    // Dynamically convert camelCase to snake_case for all updates
    const dbUpdates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (key === 'id' || key === 'proposalId') continue;
      const snakeKey = camelToSnake(key);
      dbUpdates[snakeKey] = value;
    }

    if (ethics?.id) {
      const { error } = await supabase.from('ethics_assessment').update(dbUpdates).eq('id', ethics.id);
      if (error) {
        toast.error('Failed to update ethics assessment');
        console.error(error);
      } else {
        setEthics((prev) => (prev ? { ...prev, ...updates } : null));
      }
    } else {
      // Create new ethics assessment
      const { data, error } = await supabase
        .from('ethics_assessment')
        .insert({ proposal_id: proposalId, ...dbUpdates })
        .select()
        .single();

      if (error) {
        toast.error('Failed to create ethics assessment');
        console.error(error);
      } else if (data) {
        await fetchEthics();
      }
    }
  };

  const isDraft = proposal?.status === 'draft';
  const canEdit = isDraft && (userRole === 'owner' || userRole === 'admin' || userRole === 'editor');
  const isAdmin = userRole === 'owner' || userRole === 'admin';

  return {
    proposal,
    participants,
    participantMembers,
    ethics,
    loading,
    userRole,
    isDraft,
    canEdit,
    isAdmin,
    updateProposal,
    addParticipant,
    updateParticipant,
    deleteParticipant,
    reorderParticipants,
    addParticipantMember,
    updateParticipantMember,
    deleteParticipantMember,
    updateEthics,
    refreshProposal: fetchProposal,
    refreshParticipants: fetchParticipants,
  };
}
