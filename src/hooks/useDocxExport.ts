import { useCallback } from 'react';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  Header,
  Footer,
  PageNumber,
  convertMillimetersToTwip,
  InsertedTextRun,
  DeletedTextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
  VerticalAlign,
} from 'docx';
import { saveAs } from 'file-saver';
import { toast } from 'sonner';
import { Proposal, Section, Participant } from '@/types/proposal';
import { supabase } from '@/integrations/supabase/client';

interface SectionContent {
  id: string;
  sectionId: string;
  content: string;
}

interface TrackedChange {
  type: 'insertion' | 'deletion';
  content: string;
  authorName: string;
  date: Date;
}

interface ExportData {
  proposal: Proposal;
  sectionContents: SectionContent[];
  sections: Section[];
  participants?: Participant[];
  trackedChanges?: Record<string, TrackedChange[]>;
}

// Font sizes in half-points (Word uses half-points: 22 = 11pt)
const FONT_SIZE_BODY = 22;        // 11pt
const FONT_SIZE_TITLE = 28;       // 14pt
const FONT_SIZE_H1 = 26;          // 13pt
const FONT_SIZE_H2 = 24;          // 12pt
const FONT_SIZE_H3 = 22;          // 11pt
const FONT_SIZE_FOOTER = 16;      // 8pt
const FONT_SIZE_HEADER = 16;      // 8pt
const FONT_FAMILY = 'Times New Roman';

// Spacing in twips (1pt = 20 twips)
const SPACING_PARA_BEFORE = 60;   // 3pt
const SPACING_PARA_AFTER = 60;    // 3pt
const SPACING_H1_BEFORE = 180;    // 9pt
const SPACING_H1_AFTER = 120;     // 6pt
const SPACING_H2_BEFORE = 120;    // 6pt
const SPACING_H2_AFTER = 0;       // 0pt
const SPACING_TITLE_AFTER = 240;  // 12pt
const LINE_SPACING = 240;         // 1.0 line spacing (240 twips = single)

/**
 * Flatten a section tree into an ordered list for export.
 */
function flattenSections(sections: Section[]): Section[] {
  const result: Section[] = [];
  const traverse = (section: Section) => {
    result.push(section);
    if (section.subsections) {
      for (const sub of section.subsections) {
        traverse(sub);
      }
    }
  };
  for (const s of sections) {
    traverse(s);
  }
  return result;
}

function isH1Container(section: Section): boolean {
  return !section.isPartA && !!section.number && /^B?\d+$/.test(section.number.replace(/^B/, ''));
}

function isContentSection(section: Section): boolean {
  return !section.isPartA && !!section.number && /^B?\d+\.\d+/.test(section.number);
}

/**
 * Convert HTML to docx Paragraphs with proper Times New Roman 11pt formatting.
 */
function htmlToParagraphs(html: string, sectionTrackedChanges?: TrackedChange[]): Paragraph[] {
  if (!html) return [];

  const div = document.createElement('div');
  div.innerHTML = html;
  const paragraphs: Paragraph[] = [];

  const processInlineChildren = (el: HTMLElement): (TextRun | InsertedTextRun | DeletedTextRun)[] => {
    const runs: (TextRun | InsertedTextRun | DeletedTextRun)[] = [];
    
    el.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        const t = child.textContent || '';
        if (t) runs.push(new TextRun({ text: t, font: FONT_FAMILY, size: FONT_SIZE_BODY }));
      } else {
        const childEl = child as HTMLElement;
        const childTag = childEl.tagName?.toLowerCase();
        const text = childEl.textContent || '';
        if (!text) return;

        const isInsertion = childEl.classList?.contains('track-insertion') || childEl.getAttribute('data-track-type') === 'insertion';
        const isDeletion = childEl.classList?.contains('track-deletion') || childEl.getAttribute('data-track-type') === 'deletion';
        const author = childEl.getAttribute('data-author') || childEl.getAttribute('data-author-name') || 'Unknown';
        const dateStr = childEl.getAttribute('data-date');
        const date = dateStr ? new Date(dateStr) : new Date();

        const isBold = childTag === 'strong' || childTag === 'b';
        const isItalic = childTag === 'em' || childTag === 'i';
        const isUnderline = childTag === 'u';
        const isSup = childTag === 'sup';
        const isSub = childTag === 'sub';

        if (isInsertion) {
          runs.push(new InsertedTextRun({
            text, font: FONT_FAMILY, size: FONT_SIZE_BODY,
            bold: isBold, italics: isItalic,
            id: Math.floor(Math.random() * 1000000),
            author, date: date.toISOString(),
          }));
        } else if (isDeletion) {
          runs.push(new DeletedTextRun({
            text, font: FONT_FAMILY, size: FONT_SIZE_BODY,
            bold: isBold, italics: isItalic,
            id: Math.floor(Math.random() * 1000000),
            author, date: date.toISOString(),
          }));
        } else if (childTag === 'span') {
          runs.push(...processInlineChildren(childEl));
        } else {
          runs.push(new TextRun({
            text, font: FONT_FAMILY, size: FONT_SIZE_BODY,
            bold: isBold, italics: isItalic,
            underline: isUnderline ? {} : undefined,
            superScript: isSup, subScript: isSub,
          }));
        }
      }
    });
    return runs;
  };

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (text) {
        paragraphs.push(
          new Paragraph({
            children: [new TextRun({ text, font: FONT_FAMILY, size: FONT_SIZE_BODY })],
            spacing: { before: SPACING_PARA_BEFORE, after: SPACING_PARA_AFTER, line: LINE_SPACING },
          })
        );
      }
      return;
    }

    const el = node as HTMLElement;
    const tag = el.tagName?.toLowerCase();

    if (tag === 'h1') {
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: el.textContent || '', bold: true, font: FONT_FAMILY, size: FONT_SIZE_H1 })],
        spacing: { before: SPACING_H1_BEFORE, after: SPACING_H1_AFTER, line: LINE_SPACING },
      }));
      return;
    }

    if (tag === 'h2') {
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: el.textContent || '', bold: true, font: FONT_FAMILY, size: FONT_SIZE_H2 })],
        spacing: { before: SPACING_H2_BEFORE, after: SPACING_H2_AFTER, line: LINE_SPACING },
      }));
      return;
    }

    if (tag === 'h3') {
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: el.textContent || '', bold: true, underline: {}, font: FONT_FAMILY, size: FONT_SIZE_H3 })],
        spacing: { before: SPACING_PARA_BEFORE, after: SPACING_PARA_AFTER, line: LINE_SPACING },
      }));
      return;
    }

    if (tag === 'p' || tag === 'div') {
      const runs = processInlineChildren(el);
      if (runs.length > 0) {
        paragraphs.push(new Paragraph({
          children: runs,
          spacing: { before: SPACING_PARA_BEFORE, after: SPACING_PARA_AFTER, line: LINE_SPACING },
        }));
      }
      return;
    }

    if (tag === 'ul' || tag === 'ol') {
      el.querySelectorAll(':scope > li').forEach((li, i) => {
        const bullet = tag === 'ul' ? '• ' : `${i + 1}. `;
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({ text: bullet + (li.textContent || ''), font: FONT_FAMILY, size: FONT_SIZE_BODY }),
            ],
            spacing: { before: 40, after: 40, line: LINE_SPACING },
            indent: { left: convertMillimetersToTwip(10) },
          })
        );
      });
      return;
    }

    // Fallback: recurse children
    el.childNodes.forEach(walk);
  };

  div.childNodes.forEach(walk);

  // Append tracked changes as revision marks if provided
  if (sectionTrackedChanges && sectionTrackedChanges.length > 0) {
    for (const change of sectionTrackedChanges) {
      if (change.type === 'insertion') {
        paragraphs.push(new Paragraph({
          children: [new InsertedTextRun({
            text: change.content, font: FONT_FAMILY, size: FONT_SIZE_BODY,
            id: Math.floor(Math.random() * 1000000),
            author: change.authorName, date: change.date.toISOString(),
          })],
          spacing: { before: SPACING_PARA_BEFORE, after: SPACING_PARA_AFTER, line: LINE_SPACING },
        }));
      } else if (change.type === 'deletion') {
        paragraphs.push(new Paragraph({
          children: [new DeletedTextRun({
            text: change.content, font: FONT_FAMILY, size: FONT_SIZE_BODY,
            id: Math.floor(Math.random() * 1000000),
            author: change.authorName, date: change.date.toISOString(),
          })],
          spacing: { before: SPACING_PARA_BEFORE, after: SPACING_PARA_AFTER, line: LINE_SPACING },
        }));
      }
    }
  }

  return paragraphs.length > 0 ? paragraphs : [new Paragraph({ children: [] })];
}

/**
 * Create the proper header matching PDF format: "Topic ID: Topic Title (Type)"
 */
function createProperHeader(proposal: Proposal): Header {
  const topicId = proposal.topicId || '';
  const topicTitle = proposal.topicTitle || proposal.title || '';
  const topicType = proposal.type || '';
  const headerText = `${topicId}${topicId && topicTitle ? ': ' : ''}${topicTitle}${topicType ? ` (${topicType})` : ''}`;
  const truncatedHeader = headerText.length > 120 ? headerText.substring(0, 117) + '...' : headerText;

  return new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: truncatedHeader,
            font: FONT_FAMILY,
            size: FONT_SIZE_HEADER,
            color: '808080',
          }),
        ],
      }),
    ],
  });
}

/**
 * Helper to create a simple docx table with black header row and Times New Roman formatting.
 */
function createDocxTable(headers: string[], rows: string[][], colWidthPercents?: number[]): Table {
  const numCols = headers.length;
  const defaultWidths = Array(numCols).fill(Math.floor(100 / numCols));

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      // Header row
      new TableRow({
        tableHeader: true,
        children: headers.map((h, i) => new TableCell({
          width: { size: (colWidthPercents || defaultWidths)[i], type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.SOLID, fill: '000000', color: '000000' },
          verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({
            children: [new TextRun({ text: h, bold: true, color: 'FFFFFF', font: FONT_FAMILY, size: FONT_SIZE_BODY })],
            spacing: { before: 20, after: 20 },
          })],
        })),
      }),
      // Data rows
      ...rows.map(row => new TableRow({
        children: row.map((cell, i) => new TableCell({
          width: { size: (colWidthPercents || defaultWidths)[i], type: WidthType.PERCENTAGE },
          verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({
            children: [new TextRun({ text: cell || '', font: FONT_FAMILY, size: FONT_SIZE_BODY })],
            spacing: { before: 20, after: 20 },
          })],
        })),
      })),
    ],
  });
}

/**
 * Create a caption paragraph (bold-italic label, italic title)
 */
function createCaptionParagraph(label: string, title: string): Paragraph {
  return new Paragraph({
    spacing: { before: SPACING_H2_BEFORE, after: SPACING_PARA_AFTER, line: LINE_SPACING },
    children: [
      new TextRun({ text: label + ' ', bold: true, italics: true, font: FONT_FAMILY, size: FONT_SIZE_BODY }),
      new TextRun({ text: title, italics: true, font: FONT_FAMILY, size: FONT_SIZE_BODY }),
    ],
  });
}

/**
 * Fetch B3.1 data and generate docx paragraphs/tables for all B3.1 structured content
 */
async function generateB31Content(proposalId: string): Promise<(Paragraph | Table)[]> {
  const result: (Paragraph | Table)[] = [];

  const [
    { data: wpDrafts },
    { data: parts },
    { data: deliverables },
    { data: milestones },
    { data: risks },
    { data: palette },
    { data: budgetItems },
  ] = await Promise.all([
    supabase.from('wp_drafts').select(`
      id, number, title, short_name, lead_participant_id, objectives, methodology,
      manual_person_months, manual_duration,
      tasks:wp_draft_tasks(
        id, number, title, description, lead_participant_id, start_month, end_month,
        effort:wp_draft_task_effort(participant_id, person_months),
        participants:wp_draft_task_participants(participant_id)
      ),
      deliverables:wp_draft_deliverables(
        id, number, title, type, dissemination_level, responsible_participant_id, due_month, description
      )
    `).eq('proposal_id', proposalId).order('number'),
    supabase.from('participants').select('id, organisation_short_name, organisation_name, participant_number, personnel_cost_rate').eq('proposal_id', proposalId).order('participant_number'),
    supabase.from('b31_deliverables').select('*').eq('proposal_id', proposalId).order('order_index'),
    supabase.from('b31_milestones').select('*').eq('proposal_id', proposalId).order('order_index'),
    supabase.from('b31_risks').select('*').eq('proposal_id', proposalId).order('order_index'),
    supabase.from('wp_color_palette').select('colors').eq('proposal_id', proposalId).single(),
    supabase.from('budget_items').select('id, participant_id, category, description, amount, justification').eq('proposal_id', proposalId).in('category', ['subcontracting', 'equipment']),
  ]);

  const participantList = parts || [];
  const participantMap = new Map(participantList.map(p => [p.id, p.organisation_short_name || `P${p.participant_number}`]));
  const defaultColors = ['#3b82f6','#ef4444','#22c55e','#f59e0b','#8b5cf6','#06b6d4','#ec4899','#f97316','#14b8a6','#6366f1'];
  const colors = (palette?.colors as string[]) || defaultColors;
  const wps = (wpDrafts || []).map((wp: any) => ({
    ...wp,
    color: colors[(wp.number - 1) % colors.length] || defaultColors[0],
    tasks: (wp.tasks || []).sort((a: any, b: any) => a.number - b.number),
    deliverables: (wp.deliverables || []).sort((a: any, b: any) => a.number - b.number),
  }));

  // === Table 3.1.a – List of work packages ===
  if (wps.length > 0) {
    result.push(createCaptionParagraph('Table 3.1.a.', 'List of work packages'));
    const wpRows = wps.map((wp: any) => {
      const leadName = wp.lead_participant_id ? (participantMap.get(wp.lead_participant_id) || '—') : '—';
      let totalPM = wp.manual_person_months || 0;
      if (!totalPM) {
        wp.tasks.forEach((t: any) => { (t.effort || []).forEach((e: any) => { totalPM += e.person_months || 0; }); });
      }
      const taskStarts = wp.tasks.filter((t: any) => t.start_month).map((t: any) => t.start_month);
      const taskEnds = wp.tasks.filter((t: any) => t.end_month).map((t: any) => t.end_month);
      const start = taskStarts.length > 0 ? Math.min(...taskStarts) : null;
      const end = taskEnds.length > 0 ? Math.max(...taskEnds) : null;
      return [
        `WP${wp.number}`,
        wp.title || '',
        leadName,
        totalPM ? totalPM.toFixed(1) : '—',
        start ? `M${String(start).padStart(2, '0')}` : '—',
        end ? `M${String(end).padStart(2, '0')}` : '—',
      ];
    });
    result.push(createDocxTable(['WP', 'Title', 'Lead', 'PM', 'Start', 'End'], wpRows, [7, 44, 17, 10, 11, 11]));
  }

  // === Table 3.1.b – Work package descriptions ===
  for (const wp of wps) {
    result.push(createCaptionParagraph(`Table 3.1.b.`, `Work Package ${wp.number}: ${wp.title || ''}`));

    const leadName = wp.lead_participant_id ? (participantMap.get(wp.lead_participant_id) || '—') : '—';
    const taskStarts = wp.tasks.filter((t: any) => t.start_month).map((t: any) => t.start_month);
    const taskEnds = wp.tasks.filter((t: any) => t.end_month).map((t: any) => t.end_month);
    const start = taskStarts.length > 0 ? Math.min(...taskStarts) : null;
    const end = taskEnds.length > 0 ? Math.max(...taskEnds) : null;

    // WP info paragraphs
    result.push(new Paragraph({
      children: [new TextRun({ text: `WP${wp.number}: ${wp.title || ''}`, bold: true, font: FONT_FAMILY, size: FONT_SIZE_BODY })],
      spacing: { before: SPACING_PARA_BEFORE, after: SPACING_PARA_AFTER, line: LINE_SPACING },
    }));
    result.push(new Paragraph({
      children: [new TextRun({ text: `Lead: ${leadName}  |  Duration: ${start ? `M${String(start).padStart(2, '0')}` : '?'} – ${end ? `M${String(end).padStart(2, '0')}` : '?'}`, font: FONT_FAMILY, size: FONT_SIZE_BODY })],
      spacing: { before: SPACING_PARA_BEFORE, after: SPACING_PARA_AFTER, line: LINE_SPACING },
    }));

    if (wp.objectives) {
      result.push(new Paragraph({
        children: [new TextRun({ text: 'Objectives', bold: true, underline: {}, font: FONT_FAMILY, size: FONT_SIZE_BODY })],
        spacing: { before: SPACING_PARA_BEFORE, after: SPACING_PARA_AFTER, line: LINE_SPACING },
      }));
      result.push(...htmlToParagraphs(wp.objectives));
    }
    if (wp.methodology) {
      result.push(new Paragraph({
        children: [new TextRun({ text: 'Description of work and role of partners', bold: true, underline: {}, font: FONT_FAMILY, size: FONT_SIZE_BODY })],
        spacing: { before: SPACING_PARA_BEFORE, after: SPACING_PARA_AFTER, line: LINE_SPACING },
      }));
      result.push(...htmlToParagraphs(wp.methodology));
    }

    // Tasks table
    if (wp.tasks.length > 0) {
      const taskRows = wp.tasks.map((t: any) => {
        const tLead = t.lead_participant_id ? (participantMap.get(t.lead_participant_id) || '—') : '—';
        return [
          `T${wp.number}.${t.number}`,
          t.title || '',
          tLead,
          t.start_month ? `M${String(t.start_month).padStart(2, '0')}` : '—',
          t.end_month ? `M${String(t.end_month).padStart(2, '0')}` : '—',
        ];
      });
      result.push(createDocxTable(['Task', 'Title', 'Lead', 'Start', 'End'], taskRows, [10, 50, 17, 11, 12]));
    }

    // WP Deliverables table
    if (wp.deliverables.length > 0) {
      const delRows = wp.deliverables.map((d: any) => [
        `D${wp.number}.${d.number}: ${d.title || ''}`,
        d.type || '—',
        d.dissemination_level || '—',
        d.due_month ? `M${String(d.due_month).padStart(2, '0')}` : '—',
      ]);
      result.push(createDocxTable(['Deliverable', 'Type', 'Diss.', 'Due'], delRows, [55, 15, 15, 15]));
    }

    result.push(new Paragraph({ children: [], spacing: { after: 200 } }));
  }

  // === Table 3.1.c – Deliverables ===
  if (deliverables && deliverables.length > 0) {
    result.push(createCaptionParagraph('Table 3.1.c.', 'List of deliverables'));
    const delRows = (deliverables as any[]).map(d => {
      const leadName = d.lead_participant_id ? (participantMap.get(d.lead_participant_id) || '—') : '—';
      return [
        `${d.number}: ${d.name || ''}`,
        d.wp_number ? `WP${d.wp_number}` : '—',
        leadName,
        d.type || '—',
        d.dissemination_level || '—',
        d.due_month ? `M${String(d.due_month).padStart(2, '0')}` : '—',
      ];
    });
    result.push(createDocxTable(['Deliverable', 'WP', 'Lead', 'Type', 'Diss.', 'Due'], delRows, [40, 10, 15, 10, 12, 13]));
  }

  // === Table 3.1.d – Milestones ===
  if (milestones && milestones.length > 0) {
    result.push(createCaptionParagraph('Table 3.1.d.', 'List of milestones'));
    const msRows = (milestones as any[]).map(m => [
      `MS${m.number}: ${m.name || ''}`,
      m.wps || '—',
      m.due_month ? `M${String(m.due_month).padStart(2, '0')}` : '—',
      m.means_of_verification || '—',
    ]);
    result.push(createDocxTable(['Milestone', 'WPs', 'Due', 'Means of verification'], msRows, [28, 22, 8, 42]));
  }

  // === Table 3.1.e – Risks ===
  if (risks && risks.length > 0) {
    result.push(createCaptionParagraph('Table 3.1.e.', 'Critical risks for implementation'));
    const riskRows = (risks as any[]).map(r => [
      r.description || '—',
      r.wps || '—',
      r.likelihood || '—',
      r.severity || '—',
      r.mitigation || '—',
    ]);
    result.push(createDocxTable(['Risk', 'WPs', 'Likelihood', 'Severity', 'Mitigation'], riskRows, [20, 20, 8, 8, 44]));
  }

  // === Table 3.1.f – Effort matrix ===
  if (wps.length > 0 && participantList.length > 0) {
    result.push(createCaptionParagraph('Table 3.1.f.', 'Summary of staff effort'));
    const effortHeaders = ['WP', ...participantList.map(p => p.organisation_short_name || `P${p.participant_number}`), 'Total'];
    const effortRows: string[][] = [];
    const partTotals = new Array(participantList.length).fill(0);

    for (const wp of wps) {
      const row = [`WP${wp.number}`];
      let wpTotal = 0;
      participantList.forEach((p, pi) => {
        let pm = 0;
        wp.tasks.forEach((t: any) => {
          (t.effort || []).forEach((e: any) => {
            if (e.participant_id === p.id) pm += e.person_months || 0;
          });
        });
        wpTotal += pm;
        partTotals[pi] += pm;
        row.push(pm > 0 ? pm.toFixed(1) : '—');
      });
      row.push(wpTotal > 0 ? wpTotal.toFixed(1) : '—');
      effortRows.push(row);
    }

    // Total row
    let grandTotal = 0;
    const totalRow = ['Total'];
    partTotals.forEach(t => { grandTotal += t; totalRow.push(t > 0 ? t.toFixed(1) : '—'); });
    totalRow.push(grandTotal > 0 ? grandTotal.toFixed(1) : '—');
    effortRows.push(totalRow);

    const numCols = effortHeaders.length;
    const colWidths = Array(numCols).fill(Math.floor(100 / numCols));
    result.push(createDocxTable(effortHeaders, effortRows, colWidths));
  }

  // === Table 3.1.g – Subcontracting ===
  const subItems = (budgetItems || []).filter(b => b.category === 'subcontracting');
  if (subItems.length > 0) {
    result.push(createCaptionParagraph('Table 3.1.g.', 'Subcontracting costs'));
    const subRows = subItems.map(item => [
      participantMap.get(item.participant_id) || '—',
      item.description || '—',
      item.amount ? `€${item.amount.toLocaleString('en')}` : '—',
      item.justification || '—',
    ]);
    result.push(createDocxTable(['Participant', 'Description', 'Amount', 'Justification'], subRows, [17, 33, 14, 36]));
  }

  // === Table 3.1.h – Equipment ===
  const eqItems = (budgetItems || []).filter(b => b.category === 'equipment');
  if (eqItems.length > 0) {
    result.push(createCaptionParagraph('Table 3.1.h.', 'Purchase costs of equipment'));
    const eqRows = eqItems.map(item => [
      participantMap.get(item.participant_id) || '—',
      item.description || '—',
      item.amount ? `€${item.amount.toLocaleString('en')}` : '—',
      item.justification || '—',
    ]);
    result.push(createDocxTable(['Participant', 'Description', 'Amount', 'Justification'], eqRows, [17, 33, 14, 36]));
  }

  return result;
}

export function useDocxExport() {
  const exportProposalToDocx = useCallback(
    async (data: ExportData, options?: { includeWatermark?: boolean }) => {
      const { proposal, sectionContents, sections, trackedChanges } = data;

      try {
        toast.info('Generating DOCX...');

        const bodyChildren: (Paragraph | Table)[] = [];

        // Title - centered, 14pt bold Times New Roman
        bodyChildren.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 600, after: SPACING_TITLE_AFTER, line: LINE_SPACING },
            children: [
              new TextRun({
                text: `${proposal.acronym || ''}${proposal.acronym && proposal.title ? ': ' : ''}${proposal.title || ''}`,
                bold: true,
                font: FONT_FAMILY,
                size: FONT_SIZE_TITLE,
              }),
            ],
          })
        );

        if (proposal.topicId) {
          bodyChildren.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 400, line: LINE_SPACING },
              children: [
                new TextRun({
                  text: proposal.topicId,
                  font: FONT_FAMILY,
                  size: FONT_SIZE_BODY,
                  color: '666666',
                }),
              ],
            })
          );
        }

        // Flatten sections tree and filter to Part B
        const allFlat = flattenSections(sections);
        const partBSections = allFlat.filter(s => isH1Container(s) || isContentSection(s));

        // Helper to get section content
        const getSectionContent = (sectionId: string): string => {
          const content = sectionContents.find(sc => sc.sectionId === sectionId);
          return content?.content || '';
        };

        // Render Part B sections
        for (const section of partBSections) {
          const formattedNumber = section.number.replace(/^B/, '');

          if (isH1Container(section)) {
            bodyChildren.push(
              new Paragraph({
                spacing: { before: SPACING_H1_BEFORE, after: SPACING_H1_AFTER, line: LINE_SPACING },
                children: [
                  new TextRun({
                    text: `${formattedNumber}. ${section.title || ''}`.trim(),
                    bold: true,
                    font: FONT_FAMILY,
                    size: FONT_SIZE_H1,
                  }),
                ],
              })
            );
          } else if (isContentSection(section)) {
            bodyChildren.push(
              new Paragraph({
                spacing: { before: SPACING_H2_BEFORE, after: SPACING_H2_AFTER, line: LINE_SPACING },
                children: [
                  new TextRun({
                    text: `${formattedNumber}. ${section.title || ''}`.trim(),
                    bold: true,
                    font: FONT_FAMILY,
                    size: FONT_SIZE_H2,
                  }),
                ],
              })
            );

            const content = getSectionContent(section.id);
            if (content) {
              const sectionChanges = trackedChanges?.[section.id];
              const paras = htmlToParagraphs(content, sectionChanges);
              bodyChildren.push(...paras);
            } else {
              bodyChildren.push(new Paragraph({
                children: [new TextRun({ text: '[Section content to be completed]', font: FONT_FAMILY, size: FONT_SIZE_BODY, italics: true, color: '999999' })],
                spacing: { before: SPACING_PARA_BEFORE, after: SPACING_PARA_AFTER, line: LINE_SPACING },
              }));
            }

            // After B3.1 content, add all B3.1 structured tables
            if (formattedNumber === '3.1') {
              const b31Content = await generateB31Content(proposal.id);
              bodyChildren.push(...b31Content);
            }
          }
        }

        const doc = new Document({
          sections: [
            {
              properties: {
                page: {
                  margin: {
                    top: convertMillimetersToTwip(15),
                    bottom: convertMillimetersToTwip(15),
                    left: convertMillimetersToTwip(15),
                    right: convertMillimetersToTwip(15),
                  },
                },
              },
              headers: {
                default: createProperHeader(proposal),
              },
              footers: {
                default: new Footer({
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: [
                        new TextRun({
                          text: `${proposal.acronym || 'Proposal'} — `,
                          font: FONT_FAMILY,
                          size: FONT_SIZE_FOOTER,
                          color: '808080',
                        }),
                        new TextRun({
                          children: ['Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES],
                          font: FONT_FAMILY,
                          size: FONT_SIZE_FOOTER,
                          color: '808080',
                        }),
                      ],
                    }),
                  ],
                }),
              },
              children: bodyChildren,
            },
          ],
        });

        const blob = await Packer.toBlob(doc);
        const filename = `${proposal.acronym || 'proposal'}_Part_B.docx`;
        saveAs(blob, filename);

        toast.success('DOCX exported successfully');
      } catch (error) {
        console.error('DOCX export error:', error);
        toast.error('Failed to export DOCX');
      }
    },
    []
  );

  return { exportProposalToDocx };
}
