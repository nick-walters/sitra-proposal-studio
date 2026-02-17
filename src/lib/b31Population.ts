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

interface TaskEffort {
  task_id: string;
  participant_id: string;
  person_months: number;
}

interface BudgetItem {
  id: string;
  participant_id: string;
  category: string;
  subcategory: string | null;
  amount: number;
  justification: string | null;
  description: string | null;
}

interface PopulateOptions {
  includeCostJustifications?: boolean;
}

/**
 * Replace " and " with " & " in titles for compact display
 */
function compactAnd(text: string | null | undefined): string {
  if (!text) return '';
  return text.replace(/ and /gi, ' & ');
}

// Common table styles for Horizon Europe compliance
// 0.03pt cell padding = ~0.04px, using 1px for visibility in editor
const tableStyle = `width: 100%; border-collapse: collapse; margin: 0; font-family: 'Times New Roman', Times, serif; font-size: 11pt;`;
const cellStyle = `border: 0.25pt solid black; padding: 0.03pt;`;
const headerCellStyle = `${cellStyle} font-weight: bold;`;
const captionStyle = `font-style: italic; font-family: 'Times New Roman', Times, serif; font-size: 11pt; margin-top: 12pt; margin-bottom: 1pt;`;
const captionLabelStyle = `font-weight: bold; font-style: italic;`;

/**
 * Get participant display name (short name preferred)
 */
function getParticipantName(
  id: string | null,
  participants: Map<string, ParticipantSummary>
): string {
  if (!id) return '—';
  const p = participants.get(id);
  return p?.organisation_short_name || p?.organisation_name || '—';
}

/**
 * Get participant number
 */
function getParticipantNumber(
  id: string | null,
  participants: Map<string, ParticipantSummary>
): string {
  if (!id) return '—';
  const p = participants.get(id);
  return p?.participant_number?.toString() || '—';
}

/**
 * Format month as M01, M02, etc.
 */
function formatMonth(month: number | null): string {
  if (month === null) return '—';
  return `M${String(month).padStart(2, '0')}`;
}

/**
 * Get risk level badge HTML with color
 */
function getRiskLevelBadge(level: string | null, category: 'likelihood' | 'severity'): string {
  if (!level) return '—';
  
  const colors: Record<string, string> = {
    'L': '#22c55e', // green
    'M': '#f59e0b', // amber
    'H': '#ef4444', // red
  };
  
  const color = colors[level] || '#6b7280';
  
  return `<span style="display: inline-block; padding: 1px 4px; border-radius: 3px; background-color: ${color}; color: white; font-size: 9pt; font-weight: bold;">${level}</span>`;
}

/**
 * Generate Table 3.1a. Overview of work packages
 */
function generateWorkPackageOverviewTable(
  wps: WPDraftFull[],
  participants: Map<string, ParticipantSummary>,
  taskEffort: Map<string, TaskEffort[]>
): string {
  let html = `<p class="table-caption" style="${captionStyle}"><span class="caption-label" style="${captionLabelStyle}">Table 3.1a.</span> Overview of work packages</p>`;
  html += `<table class="he-table" style="${tableStyle}">
    <thead>
      <tr style="background-color: black; color: white;">
        <th style="${headerCellStyle}">№</th>
        <th style="${headerCellStyle}">Work package title</th>
        <th style="${headerCellStyle}">Lead</th>
        <th style="${headerCellStyle}">Start</th>
        <th style="${headerCellStyle}">End</th>
        <th style="${headerCellStyle}">PM</th>
      </tr>
    </thead>
    <tbody>`;

  if (wps.length === 0) {
    html += `<tr><td colspan="6" style="${cellStyle} text-align: center; font-style: italic;">No work packages defined</td></tr>`;
  } else {
    for (const wp of wps) {
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

      // Calculate total person-months for this WP
      let totalPM = 0;
      for (const task of wp.tasks) {
        const efforts = taskEffort.get(task.id) || [];
        for (const e of efforts) {
          totalPM += e.person_months;
        }
      }

      html += `<tr>
        <td style="${cellStyle}">WP${wp.number}</td>
        <td style="${cellStyle}">${compactAnd(wp.title) || compactAnd(wp.short_name) || 'Untitled'}</td>
        <td style="${cellStyle}">${getParticipantName(wp.lead_participant_id, participants)}</td>
        <td style="${cellStyle}">${wpStartMonth !== null ? wpStartMonth : '—'}</td>
        <td style="${cellStyle}">${wpEndMonth !== null ? wpEndMonth : '—'}</td>
        <td style="${cellStyle}">${totalPM > 0 ? totalPM.toFixed(1) : '—'}</td>
      </tr>`;
    }
  }

  html += `</tbody></table>`;
  return html;
}

/**
 * Generate Table 3.1b. Work package description
 * Single caption followed by multiple WP tables (one per WP)
 */
function generateWPDescriptionTables(
  wps: WPDraftFull[],
  participants: Map<string, ParticipantSummary>,
  themes: Map<string, WPTheme>,
  useWpThemes: boolean,
  taskEffort: Map<string, TaskEffort[]>
): string {
  if (wps.length === 0) return '';

  // Single caption for all WP description tables
  let html = `<p class="table-caption" style="${captionStyle}"><span class="caption-label" style="${captionLabelStyle}">Table 3.1b.</span> Work package description</p>`;

  for (const wp of wps) {
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

    // Calculate total person-months for this WP
    let totalPM = 0;
    for (const task of wp.tasks) {
      const efforts = taskEffort.get(task.id) || [];
      for (const e of efforts) {
        totalPM += e.person_months;
      }
    }

    // Get all participant numbers involved in this WP
    const participantIds = new Set<string>();
    if (wp.lead_participant_id) participantIds.add(wp.lead_participant_id);
    for (const task of wp.tasks) {
      if (task.lead_participant_id) participantIds.add(task.lead_participant_id);
      for (const p of task.participants || []) {
        participantIds.add(p.participant_id);
      }
    }
    const participantNumbers = Array.from(participantIds)
      .map(id => getParticipantNumber(id, participants))
      .filter(n => n !== '—')
      .sort((a, b) => parseInt(a) - parseInt(b))
      .join(', ') || '—';

    // Build task descriptions
    let taskDescriptions = '';
    for (const task of wp.tasks) {
      const taskParticipants = (task.participants || [])
        .map(p => getParticipantName(p.participant_id, participants))
        .join(', ') || '—';
      
      taskDescriptions += `<p style="margin: 6pt 0;"><strong>Task ${wp.number}.${task.number}: ${compactAnd(task.title) || 'Untitled'}</strong> [${getParticipantName(task.lead_participant_id, participants)}; ${taskParticipants}]</p>`;
      if (task.description) {
        taskDescriptions += task.description;
      }
    }

    // Generate the WP table with colored header
    html += `<table class="he-table" style="${tableStyle} margin-top: 12pt;">
      <thead>
        <tr>
          <th colspan="2" style="${headerCellStyle} background-color: ${effectiveColor}; color: white;">
            Work Package ${wp.number}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="${cellStyle} width: 30%; font-weight: bold;">Work package number</td>
          <td style="${cellStyle}">WP${wp.number}</td>
        </tr>
        <tr>
          <td style="${cellStyle} font-weight: bold;">Work package title</td>
          <td style="${cellStyle}">${compactAnd(wp.title) || compactAnd(wp.short_name) || 'Untitled'}</td>
        </tr>
        <tr>
          <td style="${cellStyle} font-weight: bold;">Participant number</td>
          <td style="${cellStyle}">${participantNumbers}</td>
        </tr>
        <tr>
          <td style="${cellStyle} font-weight: bold;">Person-months</td>
          <td style="${cellStyle}">${totalPM.toFixed(1)}</td>
        </tr>
        <tr>
          <td style="${cellStyle} font-weight: bold;">Start month</td>
          <td style="${cellStyle}">${wpStartMonth !== null ? wpStartMonth : '—'}</td>
        </tr>
        <tr>
          <td style="${cellStyle} font-weight: bold;">End month</td>
          <td style="${cellStyle}">${wpEndMonth !== null ? wpEndMonth : '—'}</td>
        </tr>
        <tr>
          <td style="${cellStyle} font-weight: bold; vertical-align: top;">Objectives</td>
          <td style="${cellStyle}">${wp.objectives || '—'}</td>
        </tr>
        <tr>
          <td style="${cellStyle} font-weight: bold; vertical-align: top;">Description of work</td>
          <td style="${cellStyle}">${taskDescriptions || '—'}</td>
        </tr>
      </tbody>
    </table>`;
  }

  return html;
}

/**
 * Generate Table 3.1c. List of deliverables
 */
function generateDeliverablesTable(
  wps: WPDraftFull[],
  participants: Map<string, ParticipantSummary>
): string {
  const allDeliverables = wps.flatMap((wp) =>
    wp.deliverables.map((d) => ({
      ...d,
      wpNumber: wp.number,
      fullNumber: `D${wp.number}.${d.number}`,
    }))
  );

  // Sort by WP number, then deliverable number
  allDeliverables.sort((a, b) => {
    if (a.wpNumber !== b.wpNumber) return a.wpNumber - b.wpNumber;
    return a.number - b.number;
  });

  let html = `<p class="table-caption" style="${captionStyle}"><span class="caption-label" style="${captionLabelStyle}">Table 3.1c.</span> List of deliverables</p>`;
  html += `<table class="he-table" style="${tableStyle}">
    <thead>
      <tr style="background-color: black; color: white;">
        <th style="${headerCellStyle}">Deliverable</th>
        <th style="${headerCellStyle}">№</th>
        <th style="${headerCellStyle}">Lead</th>
        <th style="${headerCellStyle}">Type</th>
        <th style="${headerCellStyle}">Level</th>
        <th style="${headerCellStyle}">Due</th>
      </tr>
    </thead>
    <tbody>`;

  if (allDeliverables.length === 0) {
    html += `<tr><td colspan="6" style="${cellStyle} text-align: center; font-style: italic;">No deliverables defined</td></tr>`;
  } else {
    for (const d of allDeliverables) {
      // Merged column: "DX.X: Descriptive deliverable title"
      const deliverableTitle = `${d.fullNumber}: ${compactAnd(d.title) || 'Untitled'}`;
      
      html += `<tr>
        <td style="${cellStyle}">${deliverableTitle}</td>
        <td style="${cellStyle}">${d.wpNumber}</td>
        <td style="${cellStyle}">${getParticipantName(d.responsible_participant_id, participants)}</td>
        <td style="${cellStyle}">${d.type || '—'}</td>
        <td style="${cellStyle}">${d.dissemination_level || '—'}</td>
        <td style="${cellStyle}">${formatMonth(d.due_month)}</td>
      </tr>`;
    }
  }

  html += `</tbody></table>`;
  return html;
}

/**
 * Generate Table 3.1d. List of milestones (empty template for manual entry)
 */
function generateMilestonesTable(): string {
  let html = `<p class="table-caption" style="${captionStyle}"><span class="caption-label" style="${captionLabelStyle}">Table 3.1d.</span> List of milestones</p>`;
  html += `<table class="he-table" style="${tableStyle}">
    <thead>
      <tr style="background-color: black; color: white;">
        <th style="${headerCellStyle}">Milestone</th>
        <th style="${headerCellStyle}">WPs</th>
        <th style="${headerCellStyle}">Due</th>
        <th style="${headerCellStyle}">Means of verification</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="${cellStyle}">MS1: </td>
        <td style="${cellStyle}"></td>
        <td style="${cellStyle}"></td>
        <td style="${cellStyle}"></td>
      </tr>
      <tr>
        <td style="${cellStyle}">MS2: </td>
        <td style="${cellStyle}"></td>
        <td style="${cellStyle}"></td>
        <td style="${cellStyle}"></td>
      </tr>
      <tr>
        <td style="${cellStyle}">MS3: </td>
        <td style="${cellStyle}"></td>
        <td style="${cellStyle}"></td>
        <td style="${cellStyle}"></td>
      </tr>
    </tbody>
  </table>`;
  return html;
}

/**
 * Generate Table 3.1e. Critical risks for implementation
 */
function generateRisksTable(wps: WPDraftFull[]): string {
  const allRisks = wps.flatMap((wp) =>
    wp.risks.map((r) => ({
      ...r,
      wpNumber: wp.number,
    }))
  );

  // Sort by WP number, then risk number
  allRisks.sort((a, b) => {
    if (a.wpNumber !== b.wpNumber) return a.wpNumber - b.wpNumber;
    return a.number - b.number;
  });

  let html = `<p class="table-caption" style="${captionStyle}"><span class="caption-label" style="${captionLabelStyle}">Table 3.1e.</span> Critical risks for implementation (i. likelihood; ii. severity; L = low, M = medium, H = high)</p>`;
  html += `<table class="he-table" style="${tableStyle}">
    <thead>
      <tr style="background-color: black; color: white;">
        <th style="${headerCellStyle}">Risk</th>
        <th style="${headerCellStyle}">WPs</th>
        <th style="${headerCellStyle}">Mitigation &amp; adaptation measures</th>
      </tr>
    </thead>
    <tbody>`;

  if (allRisks.length === 0) {
    html += `<tr><td colspan="3" style="${cellStyle} text-align: center; font-style: italic;">No risks defined</td></tr>`;
  } else {
    for (const r of allRisks) {
      // Include likelihood and severity badges in the risk column
      const likelihoodBadge = getRiskLevelBadge(r.likelihood, 'likelihood');
      const severityBadge = getRiskLevelBadge(r.severity, 'severity');
      const riskWithBadges = `${r.title || '—'} ${likelihoodBadge} ${severityBadge}`;
      
      html += `<tr>
        <td style="${cellStyle}">${riskWithBadges}</td>
        <td style="${cellStyle}">WP${r.wpNumber}</td>
        <td style="${cellStyle}">${r.mitigation || '—'}</td>
      </tr>`;
    }
  }

  html += `</tbody></table>`;
  return html;
}

/**
 * Generate Table 3.1f. Summary of staff effort
 */
function generateStaffEffortTable(
  wps: WPDraftFull[],
  participants: Map<string, ParticipantSummary>,
  taskEffort: Map<string, TaskEffort[]>
): string {
  // Build effort matrix: participant -> WP -> person-months
  const effortMatrix = new Map<string, Map<number, number>>();
  const wpNumbers = wps.map(wp => wp.number).sort((a, b) => a - b);

  // Initialize matrix for all participants involved
  const involvedParticipants = new Set<string>();
  for (const wp of wps) {
    for (const task of wp.tasks) {
      const efforts = taskEffort.get(task.id) || [];
      for (const e of efforts) {
        involvedParticipants.add(e.participant_id);
        if (!effortMatrix.has(e.participant_id)) {
          effortMatrix.set(e.participant_id, new Map());
        }
        const wpMap = effortMatrix.get(e.participant_id)!;
        const current = wpMap.get(wp.number) || 0;
        wpMap.set(wp.number, current + e.person_months);
      }
    }
  }

  // Sort participants by number
  const sortedParticipants = Array.from(involvedParticipants)
    .map(id => ({ id, number: participants.get(id)?.participant_number || 999 }))
    .sort((a, b) => a.number - b.number)
    .map(p => p.id);

  let html = `<p class="table-caption" style="${captionStyle}"><span class="caption-label" style="${captionLabelStyle}">Table 3.1f.</span> Summary of staff effort</p>`;
  html += `<table class="he-table" style="${tableStyle}">
    <thead>
      <tr style="background-color: black; color: white;">
        <th style="${headerCellStyle}">Participant No/Short Name</th>`;

  for (const wpNum of wpNumbers) {
    html += `<th style="${headerCellStyle} text-align: center;">WP${wpNum}</th>`;
  }
  html += `<th style="${headerCellStyle} text-align: center;">Total</th>
      </tr>
    </thead>
    <tbody>`;

  // Track WP totals for footer row
  const wpTotals = new Map<number, number>();
  let grandTotal = 0;

  if (sortedParticipants.length === 0) {
    html += `<tr><td colspan="${wpNumbers.length + 2}" style="${cellStyle} text-align: center; font-style: italic;">No effort data available</td></tr>`;
  } else {
    for (const pId of sortedParticipants) {
      const p = participants.get(pId);
      const wpEffort = effortMatrix.get(pId) || new Map();
      let rowTotal = 0;

      html += `<tr>
        <td style="${cellStyle}">${p?.participant_number || '—'} ${p?.organisation_short_name || ''}</td>`;

      for (const wpNum of wpNumbers) {
        const pm = wpEffort.get(wpNum) || 0;
        rowTotal += pm;
        const currentWpTotal = wpTotals.get(wpNum) || 0;
        wpTotals.set(wpNum, currentWpTotal + pm);
        html += `<td style="${cellStyle} text-align: center;">${pm > 0 ? pm.toFixed(1) : '—'}</td>`;
      }

      grandTotal += rowTotal;
      html += `<td style="${cellStyle} text-align: center; font-weight: bold;">${rowTotal.toFixed(1)}</td>
        </tr>`;
    }

    // Total row
    html += `<tr style="background-color: #f0f0f0;">
      <td style="${cellStyle} font-weight: bold;">Total Person-Months</td>`;
    for (const wpNum of wpNumbers) {
      const wpTotal = wpTotals.get(wpNum) || 0;
      html += `<td style="${cellStyle} text-align: center; font-weight: bold;">${wpTotal.toFixed(1)}</td>`;
    }
    html += `<td style="${cellStyle} text-align: center; font-weight: bold;">${grandTotal.toFixed(1)}</td>
      </tr>`;
  }

  html += `</tbody></table>`;
  return html;
}

/**
 * Generate Table 3.1g. Subcontracting costs
 */
function generateSubcontractingTable(
  budgetItems: BudgetItem[],
  participants: Map<string, ParticipantSummary>
): string {
  const subcontracting = budgetItems.filter(item => item.category === 'subcontracting');

  let html = `<p class="table-caption" style="${captionStyle}"><span class="caption-label" style="${captionLabelStyle}">Table 3.1g.</span> 'Subcontracting costs' items</p>`;
  html += `<table class="he-table" style="${tableStyle}">
    <thead>
      <tr style="background-color: black; color: white;">
        <th style="${headerCellStyle}">Participant No/Short Name</th>
        <th style="${headerCellStyle} text-align: right;">Cost (€)</th>
        <th style="${headerCellStyle}">Description of tasks and justification</th>
      </tr>
    </thead>
    <tbody>`;

  if (subcontracting.length === 0) {
    html += `<tr><td colspan="3" style="${cellStyle} text-align: center; font-style: italic;">No subcontracting costs</td></tr>`;
  } else {
    for (const item of subcontracting) {
      const p = participants.get(item.participant_id);
      html += `<tr>
        <td style="${cellStyle}">${p?.participant_number || '—'} ${p?.organisation_short_name || ''}</td>
        <td style="${cellStyle} text-align: right;">${item.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
        <td style="${cellStyle}">${item.description || ''} ${item.justification || ''}</td>
      </tr>`;
    }
  }

  html += `</tbody></table>`;
  return html;
}

/**
 * Generate Table 3.1h. Purchase costs (major equipment)
 */
function generatePurchaseCostsTable(
  budgetItems: BudgetItem[],
  participants: Map<string, ParticipantSummary>
): string {
  // Filter for purchase/equipment items
  const equipment = budgetItems.filter(
    item => item.category === 'purchase' || 
           (item.category === 'other_direct' && item.subcategory === 'Equipment')
  );

  let html = `<p class="table-caption" style="${captionStyle}"><span class="caption-label" style="${captionLabelStyle}">Table 3.1h.</span> 'Purchase costs' items (major equipment, infrastructure)</p>`;
  html += `<table class="he-table" style="${tableStyle}">
    <thead>
      <tr style="background-color: black; color: white;">
        <th style="${headerCellStyle}">Participant No/Short Name</th>
        <th style="${headerCellStyle} text-align: right;">Cost (€)</th>
        <th style="${headerCellStyle}">Justification</th>
      </tr>
    </thead>
    <tbody>`;

  if (equipment.length === 0) {
    html += `<tr><td colspan="3" style="${cellStyle} text-align: center; font-style: italic;">No major equipment costs</td></tr>`;
  } else {
    for (const item of equipment) {
      const p = participants.get(item.participant_id);
      html += `<tr>
        <td style="${cellStyle}">${p?.participant_number || '—'} ${p?.organisation_short_name || ''}</td>
        <td style="${cellStyle} text-align: right;">${item.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
        <td style="${cellStyle}">${item.justification || item.description || '—'}</td>
      </tr>`;
    }
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
  userId: string,
  options: PopulateOptions = {}
): Promise<{ success: boolean; error?: string }> {
  const { includeCostJustifications = false } = options;

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

    // Fetch task effort data
    const taskIds = wpDrafts.flatMap(wp => (wp.tasks || []).map((t: any) => t.id));
    const taskEffortMap = new Map<string, TaskEffort[]>();
    
    if (taskIds.length > 0) {
      const { data: effortData, error: effortError } = await supabase
        .from('wp_draft_task_effort')
        .select('task_id, participant_id, person_months')
        .in('task_id', taskIds);

      if (!effortError && effortData) {
        for (const e of effortData) {
          if (!taskEffortMap.has(e.task_id)) {
            taskEffortMap.set(e.task_id, []);
          }
          taskEffortMap.get(e.task_id)!.push(e);
        }
      }
    }

    // Fetch budget items if cost justifications requested
    let budgetItems: BudgetItem[] = [];
    if (includeCostJustifications) {
      const { data: budgetData, error: budgetError } = await supabase
        .from('budget_items')
        .select('id, participant_id, category, subcategory, amount, justification, description')
        .eq('proposal_id', proposalId);

      if (!budgetError && budgetData) {
        budgetItems = budgetData;
      }
    }

    // Sort tasks, deliverables, risks within each WP
    const sortedWPs: WPDraftFull[] = (wpDrafts || []).map((wp) => ({
      ...wp,
      tasks: (wp.tasks || []).sort((a: any, b: any) => a.number - b.number),
      deliverables: (wp.deliverables || []).sort((a: any, b: any) => a.number - b.number),
      risks: (wp.risks || []).sort((a: any, b: any) => a.number - b.number),
    }));

    // Generate HTML content for all tables
    let fullContent = '';

    // Table 3.1a: Overview of work packages (NEW)
    fullContent += generateWorkPackageOverviewTable(sortedWPs, participantsMap, taskEffortMap);

    // Table 3.1b: Work package descriptions (single caption, multiple tables)
    fullContent += generateWPDescriptionTables(sortedWPs, participantsMap, themesMap, useWpThemes, taskEffortMap);

    // Table 3.1c: List of deliverables
    fullContent += generateDeliverablesTable(sortedWPs, participantsMap);

    // Table 3.1d: List of milestones (empty template)
    fullContent += generateMilestonesTable();

    // Table 3.1e: Critical risks
    fullContent += generateRisksTable(sortedWPs);

    // Table 3.1f: Summary of staff effort
    fullContent += generateStaffEffortTable(sortedWPs, participantsMap, taskEffortMap);

    // Optional cost justification tables
    if (includeCostJustifications) {
      // Table 3.1g: Subcontracting costs
      fullContent += generateSubcontractingTable(budgetItems, participantsMap);

      // Table 3.1h: Purchase costs
      fullContent += generatePurchaseCostsTable(budgetItems, participantsMap);
    }

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
      // Try alternative section numbers
      const alternativeNumbers = ['3.1', 'b3.1'];
      for (const altNum of alternativeNumbers) {
        const { data: sectionAlt, error: sectionAltError } = await supabase
          .from('proposal_template_sections')
          .select('id')
          .eq('proposal_template_id', proposalTemplate.id)
          .eq('section_number', altNum)
          .single();

        if (!sectionAltError && sectionAlt) {
          return await saveToSection(proposalId, sectionAlt.id, fullContent, userId);
        }
      }
      return { success: false, error: 'Could not find Part B3.1 section' };
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
 * Append cost justification tables (3.1g & 3.1h) to existing B3.1 content
 */
export async function appendCostJustificationsToB31(
  proposalId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Fetch budget items
    const { data: budgetData, error: budgetError } = await supabase
      .from('budget_items')
      .select('id, participant_id, category, subcategory, amount, justification, description')
      .eq('proposal_id', proposalId);

    if (budgetError) throw budgetError;

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

    // Generate cost justification tables
    let costContent = generateSubcontractingTable(budgetData || [], participantsMap);
    costContent += generatePurchaseCostsTable(budgetData || [], participantsMap);

    // Find B3.1 section
    const { data: proposalTemplate, error: templateError } = await supabase
      .from('proposal_templates')
      .select('id')
      .eq('proposal_id', proposalId)
      .single();

    if (templateError) throw templateError;

    const sectionNumbers = ['B3.1', '3.1', 'b3.1'];
    let sectionId: string | null = null;

    for (const num of sectionNumbers) {
      const { data, error } = await supabase
        .from('proposal_template_sections')
        .select('id')
        .eq('proposal_template_id', proposalTemplate.id)
        .eq('section_number', num)
        .maybeSingle();

      if (!error && data) {
        sectionId = data.id;
        break;
      }
    }

    if (!sectionId) {
      return { success: false, error: 'Could not find Part B3.1 section' };
    }

    // Get existing content
    const { data: existing, error: existingError } = await supabase
      .from('section_content')
      .select('id, content')
      .eq('proposal_id', proposalId)
      .eq('section_id', sectionId)
      .maybeSingle();

    if (existingError && existingError.code !== 'PGRST116') throw existingError;

    let finalContent = '';
    if (existing?.content) {
      // Remove any existing 3.1g/3.1h tables, then append new ones
      let cleaned = existing.content as string;
      // Remove from Table 3.1g caption onwards (if present)
      const gIndex = cleaned.indexOf('Table 3.1g.');
      if (gIndex > -1) {
        // Find the caption paragraph start
        const captionStart = cleaned.lastIndexOf('<p', gIndex);
        if (captionStart > -1) {
          cleaned = cleaned.substring(0, captionStart);
        }
      }
      finalContent = cleaned + costContent;
    } else {
      finalContent = costContent;
    }

    return await saveToSection(proposalId, sectionId, finalContent, userId);
  } catch (error) {
    console.error('Error appending cost justifications:', error);
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

/**
 * Generate default B3.1 placeholder tables (empty templates)
 * These are shown when B3.1 has no content yet
 */
export function generateDefaultB31Tables(): string {
  let content = '';
  
  // Table 3.1a: Overview of work packages (empty)
  content += `<p class="table-caption" style="${captionStyle}"><span class="caption-label" style="${captionLabelStyle}">Table 3.1a.</span> Overview of work packages</p>`;
  content += `<table class="he-table" style="${tableStyle}">
    <thead>
      <tr style="background-color: black; color: white;">
        <th style="${headerCellStyle}">№</th>
        <th style="${headerCellStyle}">Work package title</th>
        <th style="${headerCellStyle}">Lead</th>
        <th style="${headerCellStyle}">Start</th>
        <th style="${headerCellStyle}">End</th>
        <th style="${headerCellStyle}">PM</th>
      </tr>
    </thead>
    <tbody>
      <tr><td colspan="6" style="${cellStyle} text-align: center; font-style: italic;">Use "Populate Part B3.1" from Work Packages to fill this table</td></tr>
    </tbody>
  </table>`;

  // Table 3.1b: Work package description placeholder
  content += `<p class="table-caption" style="${captionStyle} margin-top: 18pt;"><span class="caption-label" style="${captionLabelStyle}">Table 3.1b.</span> Work package description</p>`;
  content += `<table class="he-table" style="${tableStyle}">
    <tbody>
      <tr><td style="${cellStyle} text-align: center; font-style: italic;">Work package description tables will be generated when you populate from Work Packages</td></tr>
    </tbody>
  </table>`;

  // Table 3.1c: List of deliverables (empty)
  content += `<p class="table-caption" style="${captionStyle} margin-top: 18pt;"><span class="caption-label" style="${captionLabelStyle}">Table 3.1c.</span> List of deliverables</p>`;
  content += `<table class="he-table" style="${tableStyle}">
    <thead>
      <tr style="background-color: black; color: white;">
        <th style="${headerCellStyle}">Deliverable</th>
        <th style="${headerCellStyle}">№</th>
        <th style="${headerCellStyle}">Lead</th>
        <th style="${headerCellStyle}">Type</th>
        <th style="${headerCellStyle}">Level</th>
        <th style="${headerCellStyle}">Due</th>
      </tr>
    </thead>
    <tbody>
      <tr><td colspan="6" style="${cellStyle} text-align: center; font-style: italic;">No deliverables defined</td></tr>
    </tbody>
  </table>`;

  // Table 3.1d: List of milestones
  content += generateMilestonesTable().replace('margin-top: 12pt;', 'margin-top: 18pt;');

  // Table 3.1e: Critical risks (empty)
  content += `<p class="table-caption" style="${captionStyle} margin-top: 18pt;"><span class="caption-label" style="${captionLabelStyle}">Table 3.1e.</span> Critical risks for implementation (i. likelihood; ii. severity; L = low, M = medium, H = high)</p>`;
  content += `<table class="he-table" style="${tableStyle}">
    <thead>
      <tr style="background-color: black; color: white;">
        <th style="${headerCellStyle}">Risk</th>
        <th style="${headerCellStyle}">WPs</th>
        <th style="${headerCellStyle}">Mitigation &amp; adaptation measures</th>
      </tr>
    </thead>
    <tbody>
      <tr><td colspan="3" style="${cellStyle} text-align: center; font-style: italic;">No risks defined</td></tr>
    </tbody>
  </table>`;

  // Table 3.1f: Summary of staff effort (empty)
  content += `<p class="table-caption" style="${captionStyle} margin-top: 18pt;"><span class="caption-label" style="${captionLabelStyle}">Table 3.1f.</span> Summary of staff effort</p>`;
  content += `<table class="he-table" style="${tableStyle}">
    <thead>
      <tr style="background-color: black; color: white;">
        <th style="${headerCellStyle}">Participant No/Short Name</th>
        <th style="${headerCellStyle} text-align: center;">WP1</th>
        <th style="${headerCellStyle} text-align: center;">WP2</th>
        <th style="${headerCellStyle} text-align: center;">...</th>
        <th style="${headerCellStyle} text-align: center;">Total</th>
      </tr>
    </thead>
    <tbody>
      <tr><td colspan="5" style="${cellStyle} text-align: center; font-style: italic;">No effort data available</td></tr>
    </tbody>
  </table>`;

  return content;
}
