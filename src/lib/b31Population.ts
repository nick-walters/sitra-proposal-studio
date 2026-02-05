import { supabase } from '@/integrations/supabase/client';
import type { ParticipantSummary } from '@/types/proposal';

interface WPDraftFull {
  id: string;
  number: number;
  short_name: string | null;
  title: string | null;
  lead_participant_id: string | null;
  methodology: string | null;
  objectives: string | null;
  color: string;
  tasks: {
    id: string;
    number: number;
    title: string | null;
    description: string | null;
    lead_participant_id: string | null;
    start_month: number | null;
    end_month: number | null;
    participants: { participant_id: string }[];
  }[];
  deliverables: {
    id: string;
    number: number;
    title: string | null;
    type: string | null;
    dissemination_level: string | null;
    responsible_participant_id: string | null;
    due_month: number | null;
    description: string | null;
  }[];
  risks: {
    id: string;
    number: number;
    title: string | null;
    likelihood: string | null;
    severity: string | null;
    mitigation: string | null;
  }[];
}

/**
 * Generate HTML content for a single WP to populate in Part B3.1
 */
function generateWPContent(
  wp: WPDraftFull,
  participants: Map<string, ParticipantSummary>
): string {
  const getParticipantName = (id: string | null): string => {
    if (!id) return '—';
    const p = participants.get(id);
    return p?.organisation_short_name || p?.organisation_name || '—';
  };

  const getParticipantNames = (ids: string[]): string => {
    return ids.map((id) => getParticipantName(id)).join(', ') || '—';
  };

  let html = '';

  // WP Header
  html += `<h3 style="margin-top: 1.5em; margin-bottom: 0.5em; font-weight: bold;">
    WP${wp.number}: ${wp.title || wp.short_name || 'Untitled Work Package'}
  </h3>`;

  // Lead Partner
  html += `<p><strong>Lead beneficiary:</strong> ${getParticipantName(wp.lead_participant_id)}</p>`;

  // Objectives
  if (wp.objectives) {
    html += `<p><strong>Objectives:</strong></p>`;
    html += wp.objectives;
  }

  // Tasks Table
  if (wp.tasks.length > 0) {
    html += `<p style="margin-top: 1em;"><strong>Tasks:</strong></p>`;
    html += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 1em;">
      <thead>
        <tr style="background-color: #f3f4f6;">
          <th style="border: 1px solid #d1d5db; padding: 0.5em; text-align: left;">Task</th>
          <th style="border: 1px solid #d1d5db; padding: 0.5em; text-align: left;">Title</th>
          <th style="border: 1px solid #d1d5db; padding: 0.5em; text-align: left;">Lead</th>
          <th style="border: 1px solid #d1d5db; padding: 0.5em; text-align: left;">Participants</th>
          <th style="border: 1px solid #d1d5db; padding: 0.5em; text-align: left;">Duration</th>
        </tr>
      </thead>
      <tbody>`;

    for (const task of wp.tasks) {
      const duration =
        task.start_month && task.end_month
          ? `M${task.start_month}–M${task.end_month}`
          : '—';
      const participantIds = task.participants?.map((p) => p.participant_id) || [];

      html += `<tr>
        <td style="border: 1px solid #d1d5db; padding: 0.5em;">T${wp.number}.${task.number}</td>
        <td style="border: 1px solid #d1d5db; padding: 0.5em;">${task.title || '—'}</td>
        <td style="border: 1px solid #d1d5db; padding: 0.5em;">${getParticipantName(task.lead_participant_id)}</td>
        <td style="border: 1px solid #d1d5db; padding: 0.5em;">${getParticipantNames(participantIds)}</td>
        <td style="border: 1px solid #d1d5db; padding: 0.5em;">${duration}</td>
      </tr>`;
    }

    html += `</tbody></table>`;

    // Task Descriptions
    html += `<div style="margin-bottom: 1em;">`;
    for (const task of wp.tasks) {
      if (task.title || task.description) {
        html += `<p><strong>T${wp.number}.${task.number} ${task.title || ''}</strong></p>`;
        if (task.description) {
          html += `<p>${task.description}</p>`;
        }
      }
    }
    html += `</div>`;
  }

  // Methodology
  if (wp.methodology) {
    html += `<p style="margin-top: 1em;"><strong>Methodology:</strong></p>`;
    html += wp.methodology;
  }

  return html;
}

/**
 * Generate consolidated deliverables table from all WPs
 */
function generateDeliverablesTable(
  wps: WPDraftFull[],
  participants: Map<string, ParticipantSummary>
): string {
  const getParticipantName = (id: string | null): string => {
    if (!id) return '—';
    const p = participants.get(id);
    return p?.organisation_short_name || p?.organisation_name || '—';
  };

  const allDeliverables = wps.flatMap((wp) =>
    wp.deliverables.map((d) => ({
      ...d,
      wpNumber: wp.number,
      fullNumber: `D${wp.number}.${d.number}`,
    }))
  );

  if (allDeliverables.length === 0) return '';

  // Sort by WP number, then deliverable number
  allDeliverables.sort((a, b) => {
    if (a.wpNumber !== b.wpNumber) return a.wpNumber - b.wpNumber;
    return a.number - b.number;
  });

  let html = `<h3 style="margin-top: 2em; margin-bottom: 0.5em; font-weight: bold;">Deliverables</h3>`;
  html += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 1em;">
    <thead>
      <tr style="background-color: #f3f4f6;">
        <th style="border: 1px solid #d1d5db; padding: 0.5em; text-align: left;">No.</th>
        <th style="border: 1px solid #d1d5db; padding: 0.5em; text-align: left;">Title</th>
        <th style="border: 1px solid #d1d5db; padding: 0.5em; text-align: left;">Type</th>
        <th style="border: 1px solid #d1d5db; padding: 0.5em; text-align: left;">Diss.</th>
        <th style="border: 1px solid #d1d5db; padding: 0.5em; text-align: left;">Lead</th>
        <th style="border: 1px solid #d1d5db; padding: 0.5em; text-align: left;">Due</th>
      </tr>
    </thead>
    <tbody>`;

  for (const d of allDeliverables) {
    html += `<tr>
      <td style="border: 1px solid #d1d5db; padding: 0.5em;">${d.fullNumber}</td>
      <td style="border: 1px solid #d1d5db; padding: 0.5em;">${d.title || '—'}</td>
      <td style="border: 1px solid #d1d5db; padding: 0.5em;">${d.type || '—'}</td>
      <td style="border: 1px solid #d1d5db; padding: 0.5em;">${d.dissemination_level || '—'}</td>
      <td style="border: 1px solid #d1d5db; padding: 0.5em;">${getParticipantName(d.responsible_participant_id)}</td>
      <td style="border: 1px solid #d1d5db; padding: 0.5em;">${d.due_month ? `M${d.due_month}` : '—'}</td>
    </tr>`;
  }

  html += `</tbody></table>`;

  return html;
}

/**
 * Generate consolidated risks table from all WPs
 */
function generateRisksTable(wps: WPDraftFull[]): string {
  const allRisks = wps.flatMap((wp) =>
    wp.risks.map((r) => ({
      ...r,
      wpNumber: wp.number,
      fullNumber: `R${wp.number}.${r.number}`,
    }))
  );

  if (allRisks.length === 0) return '';

  // Sort by WP number, then risk number
  allRisks.sort((a, b) => {
    if (a.wpNumber !== b.wpNumber) return a.wpNumber - b.wpNumber;
    return a.number - b.number;
  });

  const getLikelihoodColor = (l: string | null): string => {
    if (l === 'H') return '#fee2e2';
    if (l === 'M') return '#fef3c7';
    return '#d1fae5';
  };

  const getSeverityColor = (s: string | null): string => {
    if (s === 'H') return '#fee2e2';
    if (s === 'M') return '#fef3c7';
    return '#d1fae5';
  };

  let html = `<h3 style="margin-top: 2em; margin-bottom: 0.5em; font-weight: bold;">Risks & Mitigation</h3>`;
  html += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 1em;">
    <thead>
      <tr style="background-color: #f3f4f6;">
        <th style="border: 1px solid #d1d5db; padding: 0.5em; text-align: left;">Risk</th>
        <th style="border: 1px solid #d1d5db; padding: 0.5em; text-align: left;">Description</th>
        <th style="border: 1px solid #d1d5db; padding: 0.5em; text-align: center;">L</th>
        <th style="border: 1px solid #d1d5db; padding: 0.5em; text-align: center;">S</th>
        <th style="border: 1px solid #d1d5db; padding: 0.5em; text-align: left;">Mitigation</th>
      </tr>
    </thead>
    <tbody>`;

  for (const r of allRisks) {
    html += `<tr>
      <td style="border: 1px solid #d1d5db; padding: 0.5em;">${r.fullNumber}</td>
      <td style="border: 1px solid #d1d5db; padding: 0.5em;">${r.title || '—'}</td>
      <td style="border: 1px solid #d1d5db; padding: 0.5em; text-align: center; background-color: ${getLikelihoodColor(r.likelihood)};">${r.likelihood || '—'}</td>
      <td style="border: 1px solid #d1d5db; padding: 0.5em; text-align: center; background-color: ${getSeverityColor(r.severity)};">${r.severity || '—'}</td>
      <td style="border: 1px solid #d1d5db; padding: 0.5em;">${r.mitigation || '—'}</td>
    </tr>`;
  }

  html += `</tbody></table>`;

  return html;
}

/**
 * Populate Part B3.1 with WP draft content
 */
export async function populateB31(
  proposalId: string,
  wpIds: string[],
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Fetch WP drafts with full data
    const { data: wpDrafts, error: wpError } = await supabase
      .from('wp_drafts')
      .select(`
        *,
        tasks:wp_draft_tasks(
          *,
          participants:wp_draft_task_participants(participant_id)
        ),
        deliverables:wp_draft_deliverables(*),
        risks:wp_draft_risks(*)
      `)
      .eq('proposal_id', proposalId)
      .in('id', wpIds)
      .order('order_index');

    if (wpError) throw wpError;

    if (!wpDrafts || wpDrafts.length === 0) {
      return { success: false, error: 'No work packages found' };
    }

    // Fetch participants
    const { data: participantsData, error: partError } = await supabase
      .from('participants')
      .select('id, organisation_short_name, organisation_name, participant_number')
      .eq('proposal_id', proposalId);

    if (partError) throw partError;

    const participantsMap = new Map<string, ParticipantSummary>();
    for (const p of participantsData || []) {
      participantsMap.set(p.id, p);
    }

    // Sort tasks, deliverables, risks within each WP
    const sortedWPs: WPDraftFull[] = (wpDrafts || []).map((wp) => ({
      ...wp,
      tasks: (wp.tasks || []).sort((a: any, b: any) => a.number - b.number),
      deliverables: (wp.deliverables || []).sort((a: any, b: any) => a.number - b.number),
      risks: (wp.risks || []).sort((a: any, b: any) => a.number - b.number),
    }));

    // Generate HTML content
    let fullContent = '';

    // Individual WP content
    for (const wp of sortedWPs) {
      fullContent += generateWPContent(wp, participantsMap);
    }

    // Consolidated deliverables table
    fullContent += generateDeliverablesTable(sortedWPs, participantsMap);

    // Consolidated risks table
    fullContent += generateRisksTable(sortedWPs);

    // Find the B3.1 section ID
    const { data: proposalTemplate, error: templateError } = await supabase
      .from('proposal_templates')
      .select('id')
      .eq('proposal_id', proposalId)
      .single();

    if (templateError) throw templateError;

    const { data: section, error: sectionError } = await supabase
      .from('proposal_template_sections')
      .select('id')
      .eq('proposal_template_id', proposalTemplate.id)
      .eq('section_number', 'B3.1')
      .single();

    if (sectionError) {
      // Try without B prefix
      const { data: sectionAlt, error: sectionAltError } = await supabase
        .from('proposal_template_sections')
        .select('id')
        .eq('proposal_template_id', proposalTemplate.id)
        .eq('section_number', '3.1')
        .single();

      if (sectionAltError) {
        return { success: false, error: 'Could not find Part B3.1 section' };
      }

      // Use alternative section
      return await saveToSection(proposalId, sectionAlt.id, fullContent, userId);
    }

    return await saveToSection(proposalId, section.id, fullContent, userId);
  } catch (error) {
    console.error('Error populating B3.1:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Save content to a section
 */
async function saveToSection(
  proposalId: string,
  sectionId: string,
  content: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if section content exists
    const { data: existing, error: checkError } = await supabase
      .from('section_content')
      .select('id')
      .eq('proposal_id', proposalId)
      .eq('section_id', sectionId)
      .maybeSingle();

    if (checkError && checkError.code !== 'PGRST116') throw checkError;

    if (existing) {
      // Update existing content
      const { error: updateError } = await supabase
        .from('section_content')
        .update({
          content,
          last_edited_by: userId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (updateError) throw updateError;
    } else {
      // Insert new content
      const { error: insertError } = await supabase
        .from('section_content')
        .insert({
          proposal_id: proposalId,
          section_id: sectionId,
          content,
          last_edited_by: userId,
        });

      if (insertError) throw insertError;
    }

    return { success: true };
  } catch (error) {
    console.error('Error saving to section:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save content',
    };
  }
}
