import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';
import type { Participant, ParticipantMember, BudgetType } from '@/types/proposal';

interface EthicsAssessment {
  id: string;
  proposalId: string;
  humanSubjects: boolean;
  humanSubjectsDetails?: string;
  personalData: boolean;
  personalDataDetails?: string;
  animals: boolean;
  animalsDetails?: string;
  humanCells: boolean;
  humanCellsDetails?: string;
  thirdCountries: boolean;
  thirdCountriesDetails?: string;
  environment: boolean;
  environmentDetails?: string;
  dualUse: boolean;
  dualUseDetails?: string;
  misuse: boolean;
  misuseDetails?: string;
  otherEthics: boolean;
  otherEthicsDetails?: string;
}

interface ProposalData {
  id: string;
  acronym: string;
  title: string;
  type: 'RIA' | 'IA' | 'CSA';
  budgetType: BudgetType;
  status: 'draft' | 'submitted' | 'funded' | 'not_funded';
  submissionStage?: 'full' | 'stage_1';
  totalBudget?: number;
  deadline?: Date;
  description?: string;
  topicId?: string;
  topicUrl?: string;
  workProgramme?: string;
  destination?: string;
  logoUrl?: string;
  submittedAt?: Date;
  decisionDate?: Date;
  templateTypeId?: string;
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
  const [userRole, setUserRole] = useState<'admin' | 'editor' | 'viewer' | null>(null);

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
        totalBudget: data.total_budget || undefined,
        deadline: data.deadline ? new Date(data.deadline) : undefined,
        description: data.description || undefined,
        topicId: data.topic_id || undefined,
        topicUrl: data.topic_url || undefined,
        workProgramme: data.work_programme || undefined,
        destination: data.destination || undefined,
        logoUrl: data.logo_url || undefined,
        submittedAt: data.submitted_at ? new Date(data.submitted_at) : undefined,
        decisionDate: data.decision_date ? new Date(data.decision_date) : undefined,
        templateTypeId: data.template_type_id || undefined,
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
      setUserRole(data.role as 'admin' | 'editor' | 'viewer');
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
      (data || []).map((p) => ({
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
      setEthics({
        id: data.id,
        proposalId: data.proposal_id,
        humanSubjects: data.human_subjects || false,
        humanSubjectsDetails: data.human_subjects_details || undefined,
        personalData: data.personal_data || false,
        personalDataDetails: data.personal_data_details || undefined,
        animals: data.animals || false,
        animalsDetails: data.animals_details || undefined,
        humanCells: data.human_cells || false,
        humanCellsDetails: data.human_cells_details || undefined,
        thirdCountries: data.third_countries || false,
        thirdCountriesDetails: data.third_countries_details || undefined,
        environment: data.environment || false,
        environmentDetails: data.environment_details || undefined,
        dualUse: data.dual_use || false,
        dualUseDetails: data.dual_use_details || undefined,
        misuse: data.misuse || false,
        misuseDetails: data.misuse_details || undefined,
        otherEthics: data.other_ethics || false,
        otherEthicsDetails: data.other_ethics_details || undefined,
      });
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
    if (updates.topicId !== undefined) dbUpdates.topic_id = updates.topicId;
    if (updates.topicUrl !== undefined) dbUpdates.topic_url = updates.topicUrl;
    if (updates.totalBudget !== undefined) dbUpdates.total_budget = updates.totalBudget;
    if (updates.deadline !== undefined) dbUpdates.deadline = updates.deadline?.toISOString();
    if (updates.workProgramme !== undefined) dbUpdates.work_programme = updates.workProgramme;
    if (updates.destination !== undefined) dbUpdates.destination = updates.destination;
    if (updates.logoUrl !== undefined) dbUpdates.logo_url = updates.logoUrl;
    if (updates.budgetType !== undefined) dbUpdates.budget_type = updates.budgetType;
    if (updates.status !== undefined) dbUpdates.status = updates.status;

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
  const addParticipant = async (participant: Omit<Participant, 'id'>) => {
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
      })
      .select()
      .single();

    if (error) {
      toast.error('Failed to add participant');
      console.error(error);
    } else if (data) {
      await fetchParticipants();
      toast.success('Participant added');
    }
  };

  // Update participant
  const updateParticipant = async (id: string, updates: Partial<Participant>) => {
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

    const { error } = await supabase.from('participants').update(dbUpdates).eq('id', id);

    if (error) {
      toast.error('Failed to update participant');
      console.error(error);
    } else {
      setParticipants((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
      );
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

  // Update ethics
  const updateEthics = async (updates: Partial<EthicsAssessment>) => {
    const dbUpdates: any = {};
    if (updates.humanSubjects !== undefined) dbUpdates.human_subjects = updates.humanSubjects;
    if (updates.humanSubjectsDetails !== undefined) dbUpdates.human_subjects_details = updates.humanSubjectsDetails;
    if (updates.personalData !== undefined) dbUpdates.personal_data = updates.personalData;
    if (updates.personalDataDetails !== undefined) dbUpdates.personal_data_details = updates.personalDataDetails;
    if (updates.animals !== undefined) dbUpdates.animals = updates.animals;
    if (updates.animalsDetails !== undefined) dbUpdates.animals_details = updates.animalsDetails;
    if (updates.humanCells !== undefined) dbUpdates.human_cells = updates.humanCells;
    if (updates.humanCellsDetails !== undefined) dbUpdates.human_cells_details = updates.humanCellsDetails;
    if (updates.thirdCountries !== undefined) dbUpdates.third_countries = updates.thirdCountries;
    if (updates.thirdCountriesDetails !== undefined) dbUpdates.third_countries_details = updates.thirdCountriesDetails;
    if (updates.environment !== undefined) dbUpdates.environment = updates.environment;
    if (updates.environmentDetails !== undefined) dbUpdates.environment_details = updates.environmentDetails;
    if (updates.dualUse !== undefined) dbUpdates.dual_use = updates.dualUse;
    if (updates.dualUseDetails !== undefined) dbUpdates.dual_use_details = updates.dualUseDetails;
    if (updates.misuse !== undefined) dbUpdates.misuse = updates.misuse;
    if (updates.misuseDetails !== undefined) dbUpdates.misuse_details = updates.misuseDetails;
    if (updates.otherEthics !== undefined) dbUpdates.other_ethics = updates.otherEthics;
    if (updates.otherEthicsDetails !== undefined) dbUpdates.other_ethics_details = updates.otherEthicsDetails;

    if (ethics) {
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
  const canEdit = isDraft && (userRole === 'admin' || userRole === 'editor');
  const isAdmin = userRole === 'admin';

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
    addParticipantMember,
    updateParticipantMember,
    deleteParticipantMember,
    updateEthics,
    refreshProposal: fetchProposal,
    refreshParticipants: fetchParticipants,
  };
}
