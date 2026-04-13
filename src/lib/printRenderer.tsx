/**
 * Print Renderer – creates a hidden container with editor-styled content
 * for capture by jsPDF.html(). All content renders via the browser's layout
 * engine so the PDF output matches the editor exactly.
 */
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Participant, Section } from '@/types/proposal';
import { supabase } from '@/integrations/supabase/client';
import { resolveStorageUrl } from '@/hooks/useStorageUrl';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SectionContent {
  id: string;
  sectionId: string;
  content: string;
}

export interface ExportData {
  proposal: import('@/types/proposal').Proposal;
  sectionContents: SectionContent[];
  sections: import('@/types/proposal').Section[];
  participants?: import('@/types/proposal').Participant[];
}

export interface PrintRenderOptions {
  proposal: {
    id: string;
    title: string;
    acronym: string;
    submissionStage?: string | null;
    topicId?: string | null;
    topicTitle?: string | null;
    type?: string | null;
  };
  sections: Section[];
  sectionContents: SectionContent[];
  participants: Participant[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isH1Container(section: Section): boolean {
  return !section.isPartA && !!section.number && /^B?\d+$/.test(section.number.replace(/^B/, ''));
}

function isContentSection(section: Section): boolean {
  return !section.isPartA && !!section.number && /^B?\d+\.\d+/.test(section.number);
}

function flattenSections(sections: Section[]): Section[] {
  const result: Section[] = [];
  const traverse = (section: Section) => {
    if (section.isPartA) return;
    if (section.id === 'figures' || section.id === 'assignments' || section.id === 'progress') return;
    if (isH1Container(section) || isContentSection(section)) {
      result.push(section);
    }
    if (section.subsections) {
      for (const sub of section.subsections) traverse(sub);
    }
  };
  for (const s of sections) traverse(s);
  return result;
}

// ── Resolve storage images in HTML ───────────────────────────────────────────

async function resolveImagesInHtml(html: string): Promise<string> {
  if (!html) return html;
  // Find all img src that are storage paths (not starting with http/data)
  const imgRegex = /<img([^>]*?)src="([^"]+)"([^>]*?)>/gi;
  const matches = [...html.matchAll(imgRegex)];
  let result = html;
  for (const m of matches) {
    const src = m[2];
    if (src.startsWith('http') || src.startsWith('data:')) continue;
    try {
      const resolved = await resolveStorageUrl(src);
      if (resolved) {
        result = result.replace(src, resolved);
      }
    } catch { /* keep original */ }
  }
  return result;
}

// ── Build participant list HTML ──────────────────────────────────────────────

async function buildParticipantListHtml(
  proposalId: string,
  participants: Participant[],
): Promise<string> {
  const sorted = [...participants].sort(
    (a, b) => (a.participantNumber || 999) - (b.participantNumber || 999),
  );

  // Fetch WP & Case leadership
  const [{ data: wpData }, { data: caseData }] = await Promise.all([
    supabase.from('wp_drafts').select('number, short_name, lead_participant_id, color').eq('proposal_id', proposalId).order('number'),
    supabase.from('case_drafts').select('number, short_name, lead_participant_id, color, case_type, custom_type_name').eq('proposal_id', proposalId).order('number'),
  ]);

  const wpLeadership = new Map<string, { num: number; color: string }[]>();
  for (const wp of wpData || []) {
    if (!wp.lead_participant_id) continue;
    if (!wpLeadership.has(wp.lead_participant_id)) wpLeadership.set(wp.lead_participant_id, []);
    wpLeadership.get(wp.lead_participant_id)!.push({ num: wp.number, color: wp.color });
  }

  const getCasePrefix = (t: string, c: string | null) => {
    if (t === 'other') return c ? c.toUpperCase() : '';
    return { case_study: 'CS', use_case: 'UC', living_lab: 'LL', pilot: 'P', demonstration: 'D' }[t] || '';
  };

  const caseLeadership = new Map<string, { label: string; color: string }[]>();
  for (const c of caseData || []) {
    if (!c.lead_participant_id) continue;
    if (!caseLeadership.has(c.lead_participant_id)) caseLeadership.set(c.lead_participant_id, []);
    const prefix = getCasePrefix(c.case_type, c.custom_type_name);
    caseLeadership.get(c.lead_participant_id)!.push({
      label: prefix ? `${prefix}${c.number}` : (c.short_name || `${c.number}`),
      color: c.color,
    });
  }

  // Build HTML rows
  let rows = '';
  for (const p of sorted) {
    const shortName = p.organisationShortName || '';
    const legalName = p.organisationName || '';
    const englishName = p.englishName && p.englishName.trim().toLowerCase() !== legalName.trim().toLowerCase() ? p.englishName : '';

    // Resolve logo
    let logoHtml = '<td class="print-td" style="text-align:center;vertical-align:middle;">—</td>';
    if (p.logoUrl) {
      try {
        const resolved = await resolveStorageUrl(p.logoUrl);
        if (resolved) {
          logoHtml = `<td class="print-td" style="text-align:center;vertical-align:middle;"><img src="${resolved}" crossorigin="anonymous" style="max-width:30px;max-height:30px;object-fit:contain;display:inline-block;" /></td>`;
        }
      } catch { /* skip */ }
    }

    // Roles
    let roleHtml = '';
    const isCoord = p.participantNumber === 1;
    if (isCoord) {
      roleHtml += `<span class="print-bubble" style="background:hsl(221.2,83.2%,53.3%);color:#fff;border-radius:4px;padding:0 5px;font-weight:bold;font-size:11pt;font-style:normal;font-family:'Times New Roman',Times,serif;line-height:1;white-space:nowrap;">Coord</span> `;
    }
    for (const wp of wpLeadership.get(p.id) || []) {
      roleHtml += `<span class="print-bubble" style="background:${wp.color};color:#fff;border-radius:9999px;padding:0 5px;font-weight:bold;font-size:11pt;font-style:normal;font-family:'Times New Roman',Times,serif;line-height:1;white-space:nowrap;">WP${wp.num}</span> `;
    }
    for (const c of caseLeadership.get(p.id) || []) {
      roleHtml += `<span class="print-bubble" style="background:#fff;color:#000;border:1.5px solid #000;border-radius:9999px;padding:0 5px;font-weight:bold;font-size:11pt;font-style:normal;font-family:'Times New Roman',Times,serif;line-height:1;white-space:nowrap;">${c.label}</span> `;
    }
    if (!isCoord && !wpLeadership.has(p.id) && !caseLeadership.has(p.id)) {
      roleHtml = '—';
    }

    // Short name bubble with participant number inside
    const shortBubble = shortName
      ? `<span class="print-bubble" style="background:#000;color:#fff;border-radius:9999px;padding:0 5px;font-weight:bold;font-size:11pt;font-style:normal;font-family:'Times New Roman',Times,serif;line-height:1;white-space:nowrap;">${p.participantNumber}. ${shortName}</span>`
      : '—';

    rows += `<tr>
      <td class="print-td" style="vertical-align:middle;">${shortBubble}</td>
      <td class="print-td" style="vertical-align:middle;">
        ${legalName}${englishName ? `<br/><span style="font-style:italic;color:#666;">${englishName}</span>` : ''}
      </td>
      ${logoHtml}
      <td class="print-td" style="vertical-align:middle;">${roleHtml}</td>
      <td class="print-td" style="vertical-align:middle;">${p.country || '—'}</td>
    </tr>`;
  }

  return `
    <table class="print-table" style="width:100%;border-collapse:collapse;">
      <thead>
        <tr>
          <th class="print-th" style="width:15%;">Short name</th>
          <th class="print-th" style="width:40%;">Participant legal name | <em>English name, if different</em></th>
          <th class="print-th" style="width:8%;">Logo</th>
          <th class="print-th" style="width:20%;">Lead roles</th>
          <th class="print-th" style="width:17%;">Country</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ── Build the full print container HTML ──────────────────────────────────────

export async function buildPrintContainer(
  options: PrintRenderOptions,
): Promise<HTMLDivElement> {
  const { proposal, sections, sectionContents, participants } = options;

  const container = document.createElement('div');
  container.className = 'print-export-container';
  // Use fixed pixel width: 680px ≈ 180mm at 96dpi.
  // This avoids DPI-dependent mm→px conversion that breaks html2canvas scaling.
  container.style.width = '680px';
  container.style.maxWidth = '680px';
  container.style.overflow = 'hidden';
  container.style.fontFamily = "'Times New Roman', Times, serif";
  container.style.fontSize = '11pt';
  container.style.lineHeight = '1.0';
  container.style.color = '#000';
  container.style.background = '#fff';

  const sectionMap = new Map(sectionContents.map(sc => [sc.sectionId, sc.content]));
  const partBSections = flattenSections(sections);

  // ── Title ──
  const isPreProposal = proposal.submissionStage === 'stage_1';
  const titleEl = document.createElement('h1');
  titleEl.className = 'print-title';
  if (isPreProposal) {
    titleEl.textContent = `${proposal.title} (${proposal.acronym})`;
    titleEl.style.fontFamily = "'Times New Roman', Times, serif";
  } else {
    titleEl.textContent = `${proposal.acronym}: ${proposal.title}`;
    titleEl.style.fontFamily = "'Arial Black', 'Helvetica Neue', sans-serif";
  }
  titleEl.style.fontSize = '14pt';
  titleEl.style.fontWeight = 'bold';
  titleEl.style.textAlign = 'center';
  titleEl.style.marginBottom = '12pt';
  titleEl.style.marginTop = '0';
  container.appendChild(titleEl);

  // ── Participant list ──
  const partListHeading = document.createElement('h2');
  partListHeading.className = 'print-h2';
  partListHeading.textContent = 'List of Participants';
  partListHeading.style.fontSize = '12pt';
  partListHeading.style.fontWeight = 'bold';
  partListHeading.style.marginTop = '6pt';
  partListHeading.style.marginBottom = '0';
  container.appendChild(partListHeading);

  const partListHtml = await buildParticipantListHtml(proposal.id, participants);
  const partListDiv = document.createElement('div');
  partListDiv.innerHTML = partListHtml;
  container.appendChild(partListDiv);

  // ── Sections ──
  for (const section of partBSections) {
    const num = section.number.replace(/^B/, '');

    if (isH1Container(section)) {
      const h1 = document.createElement('h1');
      h1.className = 'print-h1';
      h1.textContent = `${num}. ${section.title}`;
      h1.style.fontSize = '13pt';
      h1.style.fontWeight = 'bold';
      h1.style.marginTop = '9pt';
      h1.style.marginBottom = '6pt';
      h1.setAttribute('data-section-name', `${num}. ${section.title}`);
      container.appendChild(h1);
    } else if (isContentSection(section)) {
      const h2 = document.createElement('h2');
      h2.className = 'print-h2';
      h2.textContent = `${num}. ${section.title}`;
      h2.style.fontSize = '12pt';
      h2.style.fontWeight = 'bold';
      h2.style.marginTop = '6pt';
      h2.style.marginBottom = '0';
      h2.setAttribute('data-section-name', `B${num}. ${section.title}`);
      container.appendChild(h2);

      const content = sectionMap.get(section.id) || '';
      if (content) {
        const resolved = await resolveImagesInHtml(content);
        const sectionDiv = document.createElement('div');
        sectionDiv.className = 'print-section-content ProseMirror';
        sectionDiv.innerHTML = resolved;
        container.appendChild(sectionDiv);
      } else {
        const placeholder = document.createElement('p');
        placeholder.style.fontStyle = 'italic';
        placeholder.style.color = '#999';
        placeholder.textContent = '[Section content to be completed]';
        container.appendChild(placeholder);
      }

      // B3.1 – render tables using an offscreen React mount
      if (num === '3.1') {
        const b31Marker = document.createElement('div');
        b31Marker.id = 'print-b31-mount';
        b31Marker.setAttribute('data-proposal-id', proposal.id);
        container.appendChild(b31Marker);
      }
    }
  }

  return container;
}

// ── Mount B3.1 React components into the print container ─────────────────────

export async function mountB31Components(
  container: HTMLElement,
  proposalId: string,
): Promise<void> {
  const mount = container.querySelector('#print-b31-mount');
  if (!mount) return;

  const { B31SectionContent } = await import('@/components/B31SectionContent');

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  const root = createRoot(mount);

  root.render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(B31SectionContent, { proposalId }),
    ),
  );

  await new Promise<void>((resolve) => {
    let elapsed = 0;
    const interval = setInterval(() => {
      elapsed += 200;
      const hasTables = mount.querySelector('table') !== null;
      const isFetching = queryClient.isFetching() > 0;
      if ((hasTables && !isFetching) || elapsed > 15000) {
        clearInterval(interval);
        setTimeout(resolve, 1000);
      }
    }, 200);
  });

  const interactiveSelectors = [
    'button', '[role="button"]', '.drag-handle', '[data-radix-popper-content-wrapper]',
    '.popover-content', '[data-state]', 'input', 'select', 'textarea',
    '.resize-handle', '.column-resizer', '[class*="hover"]',
  ];
  for (const sel of interactiveSelectors) {
    mount.querySelectorAll(sel).forEach(el => {
      if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' ||
          el.classList.contains('drag-handle') || el.classList.contains('resize-handle') ||
          el.classList.contains('column-resizer') || el.tagName === 'INPUT' ||
          el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') {
        el.remove();
      }
    });
  }
}

// ── Post-process bubble elements for html2canvas compatibility ───────────────

/**
 * html2canvas cannot resolve CSS custom properties (var(--wp-color)) or
 * clip-path. This function walks all inline-ref elements and bakes the
 * computed color into explicit inline styles so they render in the PDF.
 */
function postProcessBubbles(container: HTMLElement): void {
  // Resolve --wp-color on task refs → border-color and color
  container.querySelectorAll('.inline-ref-task').forEach((el) => {
    const span = el as HTMLElement;
    const wpColor = span.style.getPropertyValue('--wp-color') ||
                    span.getAttribute('style')?.match(/--wp-color:\s*([^;]+)/)?.[1]?.trim() ||
                    span.getAttribute('data-wp-color') || '#2563EB';
    // Find the color from the data attribute on the element or its parent mark
    const actualColor = span.closest('[data-wp-color]')?.getAttribute('data-wp-color') || wpColor;
    span.style.borderColor = actualColor;
    span.style.color = actualColor;
    span.style.background = '#ffffff';
    span.style.clipPath = 'none';
    span.style.borderRadius = '9999px';
    span.style.border = `1.5px solid ${actualColor}`;
  });

  // Resolve --wp-color on deliverable refs
  container.querySelectorAll('.inline-ref-deliverable').forEach((el) => {
    const span = el as HTMLElement;
    const wpColor = span.style.getPropertyValue('--wp-color') ||
                    span.getAttribute('style')?.match(/--wp-color:\s*([^;]+)/)?.[1]?.trim() ||
                    span.closest('[data-wp-color]')?.getAttribute('data-wp-color') || '#2563EB';
    span.style.borderColor = wpColor;
    span.style.color = wpColor;
    span.style.background = '#ffffff';
    span.style.clipPath = 'none';
    span.style.borderRadius = '4px 12px 12px 4px';
    span.style.border = `1.5px solid ${wpColor}`;
    span.style.padding = '0 5px';
  });

  // Milestone refs – ensure no clip-path
  container.querySelectorAll('.inline-ref-milestone').forEach((el) => {
    const span = el as HTMLElement;
    span.style.clipPath = 'none';
    span.style.borderRadius = '3px';
    span.style.width = 'auto';
    span.style.minWidth = '17px';
    span.style.padding = '0 3px';
    span.style.letterSpacing = 'normal';
  });
}

// ── Shared export container preparation ──────────────────────────────────────

/**
 * Build the print container, attach it to the DOM for layout,
 * mount B3.1 React components, and wait for images to load.
 * Returns the container and a cleanup function.
 */
export async function prepareExportContainer(
  options: PrintRenderOptions,
  statusMessage?: string,
): Promise<{ container: HTMLDivElement; cleanup: () => void }> {
  const container = await buildPrintContainer(options);

  // Attach to DOM — must be visible for html2canvas / layout capture
  container.style.position = 'absolute';
  container.style.left = '0';
  container.style.top = '0';
  container.style.zIndex = '99999';
  container.style.pointerEvents = 'none';
  container.style.background = '#fff';
  container.style.overflow = 'visible';
  document.body.appendChild(container);

  // Mount B3.1 React components (tables, charts)
  await mountB31Components(container, options.proposal.id);

  // Wait for all images to load
  const images = container.querySelectorAll('img');
  await Promise.all(
    Array.from(images).map(
      img =>
        new Promise<void>(resolve => {
          if (img.complete) return resolve();
          img.onload = () => resolve();
          img.onerror = () => resolve();
        }),
    ),
  );

  // Post-process bubbles: resolve CSS variables and remove unsupported
  // CSS features (clip-path, ::before) so html2canvas can render them
  postProcessBubbles(container);

  // Allow a small delay for reflows
  await new Promise(r => setTimeout(r, 500));

  const cleanup = () => {
    if (container.parentNode) {
      document.body.removeChild(container);
    }
  };

  return { container, cleanup };
}
