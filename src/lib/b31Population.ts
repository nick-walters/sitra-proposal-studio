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
  theme_id: string | null;
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

interface WPTheme {
  id: string;
  color: string;
}

/**
 * Generate HTML content for a single WP to populate in Part B3.1
 * Uses Horizon Europe table formatting with WP color in header
 */
function generateWPContent(
  wp: WPDraftFull,
  participants: Map<string, ParticipantSummary>,
  themes: Map<string, WPTheme>,
  useWpThemes: boolean
): string {
  const getParticipantName = (id: string | null): string => {
    if (!id) return '—';
    const p = participants.get(id);
    return p?.organisation_short_name || p?.organisation_name || '—';
  };

  const getParticipantNames = (ids: string[]): string => {
    return ids.map((id) => getParticipantName(id)).join(', ') || '—';
  };

  // Determine effective color (theme color if themes enabled, otherwise WP color)
  const effectiveColor = useWpThemes && wp.theme_id && themes.get(wp.theme_id)
    ? themes.get(wp.theme_id)!.color
    : wp.color;

  // Calculate WP duration from tasks
  let wpStartMonth: number | null = null;
  let wpEndMonth: number | null = null;
  for (const task of wp.tasks) {
    if (task.start_month !== null) {
      wpStartMonth = wpStartMonth === null ? task.start_month : Math.min(wpStartMonth, task.start_month);
    }
    if (task.end_month !== null) {
      wpEndMonth = wpEndMonth === null ? task.end_month : Math.max(wpEndMonth, task.end_month);
    }
  }
  const wpDuration = wpStartMonth !== null && wpEndMonth !== null 
    ? `M${String(wpStartMonth).padStart(2, '0')}–M${String(wpEndMonth).padStart(2, '0')}`
    : '—';

  let html = '';

  // WP Table with colored header
  html += `<table class="he-table" style="width: 100%; border-collapse: collapse; margin: 1rem 0; font-family: 'Times New Roman', Times, serif; font-size: 11pt;">
    <thead>
      <tr>
        <th colspan="4" style="background-color: ${effectiveColor}; color: white; font-weight: bold; border: 0.25pt solid black; padding: 4px 6px;">
          WP${wp.number}: ${wp.title || wp.short_name || 'Untitled Work Package'} — ${getParticipantName(wp.lead_participant_id)} — ${wpDuration}
        </th>
      </tr>
    </thead>
    <tbody>`;

  // Objectives row
  html += `<tr>
    <td style="border: 0.25pt solid black; padding: 4px 6px; font-weight: bold; width: 20%; vertical-align: top;">Objectives</td>
    <td colspan="3" style="border: 0.25pt solid black; padding: 4px 6px; vertical-align: top;">${wp.objectives || '—'}</td>
  </tr>`;

  html += `</tbody></table>`;

  // Tasks Table
  if (wp.tasks.length > 0) {
    html += `<table class="he-table" style="width: 100%; border-collapse: collapse; margin: 0.5rem 0 1rem 0; font-family: 'Times New Roman', Times, serif; font-size: 11pt;">
      <thead>
        <tr style="background-color: black; color: white;">
          <th style="border: 0.25pt solid black; padding: 4px 6px; font-weight: bold; width: 10%;">Task</th>
          <th style="border: 0.25pt solid black; padding: 4px 6px; font-weight: bold; width: 30%;">Title</th>
          <th style="border: 0.25pt solid black; padding: 4px 6px; font-weight: bold; width: 15%;">Lead</th>
          <th style="border: 0.25pt solid black; padding: 4px 6px; font-weight: bold; width: 30%;">Participants</th>
          <th style="border: 0.25pt solid black; padding: 4px 6px; font-weight: bold; width: 15%;">Duration</th>
        </tr>
      </thead>
      <tbody>`;

    for (const task of wp.tasks) {
      const duration =
        task.start_month && task.end_month
          ? `M${String(task.start_month).padStart(2, '0')}–M${String(task.end_month).padStart(2, '0')}`
          : '—';
      const participantIds = task.participants?.map((p) => p.participant_id) || [];

      html += `<tr>
        <td style="border: 0.25pt solid black; padding: 4px 6px;">T${wp.number}.${task.number}</td>
        <td style="border: 0.25pt solid black; padding: 4px 6px;">${task.title || '—'}</td>
        <td style="border: 0.25pt solid black; padding: 4px 6px;">${getParticipantName(task.lead_participant_id)}</td>
        <td style="border: 0.25pt solid black; padding: 4px 6px;">${getParticipantNames(participantIds)}</td>
        <td style="border: 0.25pt solid black; padding: 4px 6px;">${duration}</td>
      </tr>`;
    }

    html += `</tbody></table>`;

    // Task Descriptions
    for (const task of wp.tasks) {
      if (task.title || task.description) {
        html += `<p style="margin: 6pt 0;"><strong>T${wp.number}.${task.number} ${task.title || ''}</strong></p>`;
        if (task.description) {
          html += task.description;
        }
      }
    }
  }

  // Methodology
  if (wp.methodology) {
    html += `<p style="margin: 6pt 0;"><strong>Methodology:</strong></p>`;
    html += wp.methodology;
  }

  return html;
}

/**
 * Generate consolidated deliverables table from all WPs
 * Uses Horizon Europe table formatting
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

  let html = `<p class="table-caption" style="font-style: italic; font-family: 'Times New Roman', Times, serif; font-size: 11pt; margin-top: 12pt; margin-bottom: 1pt;"><span class="caption-label" style="font-weight: bold; font-style: italic;">Table 3.1.a:</span> Deliverables</p>`;
  html += `<table class="he-table" style="width: 100%; border-collapse: collapse; margin: 0; font-family: 'Times New Roman', Times, serif; font-size: 11pt;">
    <thead>
      <tr style="background-color: black; color: white;">
        <th style="border: 0.25pt solid black; padding: 4px 6px; font-weight: bold;">No.</th>
        <th style="border: 0.25pt solid black; padding: 4px 6px; font-weight: bold;">Title</th>
        <th style="border: 0.25pt solid black; padding: 4px 6px; font-weight: bold;">Type</th>
        <th style="border: 0.25pt solid black; padding: 4px 6px; font-weight: bold;">Diss.</th>
        <th style="border: 0.25pt solid black; padding: 4px 6px; font-weight: bold;">Lead</th>
        <th style="border: 0.25pt solid black; padding: 4px 6px; font-weight: bold;">Due</th>
      </tr>
    </thead>
    <tbody>`;

  for (const d of allDeliverables) {
    html += `<tr>
      <td style="border: 0.25pt solid black; padding: 4px 6px;">${d.fullNumber}</td>
      <td style="border: 0.25pt solid black; padding: 4px 6px;">${d.title || '—'}</td>
      <td style="border: 0.25pt solid black; padding: 4px 6px;">${d.type || '—'}</td>
      <td style="border: 0.25pt solid black; padding: 4px 6px;">${d.dissemination_level || '—'}</td>
      <td style="border: 0.25pt solid black; padding: 4px 6px;">${getParticipantName(d.responsible_participant_id)}</td>
      <td style="border: 0.25pt solid black; padding: 4px 6px;">${d.due_month ? `M${String(d.due_month).padStart(2, '0')}` : '—'}</td>
    </tr>`;
  }

  html += `</tbody></table>`;

  return html;
}

/**
 * Generate consolidated risks table from all WPs
 * Uses Horizon Europe table formatting
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

  let html = `<p class="table-caption" style="font-style: italic; font-family: 'Times New Roman', Times, serif; font-size: 11pt; margin-top: 12pt; margin-bottom: 1pt;"><span class="caption-label" style="font-weight: bold; font-style: italic;">Table 3.1.b:</span> Risks & Mitigation</p>`;
  html += `<table class="he-table" style="width: 100%; border-collapse: collapse; margin: 0; font-family: 'Times New Roman', Times, serif; font-size: 11pt;">
    <thead>
      <tr style="background-color: black; color: white;">
        <th style="border: 0.25pt solid black; padding: 4px 6px; font-weight: bold;">Risk</th>
        <th style="border: 0.25pt solid black; padding: 4px 6px; font-weight: bold;">Description</th>
        <th style="border: 0.25pt solid black; padding: 4px 6px; font-weight: bold; text-align: center;">L</th>
        <th style="border: 0.25pt solid black; padding: 4px 6px; font-weight: bold; text-align: center;">S</th>
        <th style="border: 0.25pt solid black; padding: 4px 6px; font-weight: bold;">Mitigation</th>
      </tr>
    </thead>
    <tbody>`;

  for (const r of allRisks) {
    html += `<tr>
      <td style="border: 0.25pt solid black; padding: 4px 6px;">${r.fullNumber}</td>
      <td style="border: 0.25pt solid black; padding: 4px 6px;">${r.title || '—'}</td>
      <td style="border: 0.25pt solid black; padding: 4px 6px; text-align: center;">${r.likelihood || '—'}</td>
      <td style="border: 0.25pt solid black; padding: 4px 6px; text-align: center;">${r.severity || '—'}</td>
      <td style="border: 0.25pt solid black; padding: 4px 6px;">${r.mitigation || '—'}</td>
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
    // Fetch proposal to check use_wp_themes setting
    const { data: proposal, error: proposalError } = await supabase
      .from('proposals')
      .select('use_wp_themes')
      .eq('id', proposalId)
      .single();

    if (proposalError) throw proposalError;
    const useWpThemes = proposal?.use_wp_themes ?? false;

    // Fetch themes if themes are enabled
    let themesMap = new Map<string, WPTheme>();
    if (useWpThemes) {
      const { data: themesData, error: themesError } = await supabase
        .from('wp_themes')
        .select('id, color')
        .eq('proposal_id', proposalId);
      
      if (!themesError && themesData) {
        for (const theme of themesData) {
          themesMap.set(theme.id, theme);
        }
      }
    }

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
      fullContent += generateWPContent(wp, participantsMap, themesMap, useWpThemes);
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
