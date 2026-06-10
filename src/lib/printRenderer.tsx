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
import { extractFilePathFromUrl, getProposalFileSignedUrl } from '@/lib/proposalStorage';
import { SITRA_LOGO_BASE64 } from '@/lib/sitraLogo';

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
  const imgRegex = /<img([^>]*?)src=(["'])([^"']+)\2([^>]*?)>/gi;
  const matches = [...html.matchAll(imgRegex)];
  let result = html;
  for (const m of matches) {
    const src = m[3];
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

/**
 * Refreshes all signed storage URLs in the rendered DOM container.
 * Handles images that already have signed URLs (starting with https://)
 * which may have expired since the editor loaded.
 * The existing resolveImagesInHtml handles raw storage paths;
 * this function handles the complementary case of stale signed URLs.
 */
async function refreshSignedUrls(container: HTMLElement): Promise<void> {
  const images = container.querySelectorAll('img');

  await Promise.all(
    Array.from(images).map(async (img) => {
      const src = img.getAttribute('src');
      if (!src) return;

      // Only process URLs that point to our storage bucket
      const storagePath = extractFilePathFromUrl(src);
      if (!storagePath) return;

      try {
        const { url, error } = await getProposalFileSignedUrl(storagePath);
        if (url && !error) {
          img.setAttribute('src', url);
        } else {
          console.warn('Failed to refresh signed URL for:', storagePath, error);
        }
      } catch (err) {
        console.warn('Error refreshing signed URL for:', storagePath, err);
        // Leave original src unchanged — don't break the export for one bad image
      }
    })
  );
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
  // Width is 100% — the @page margin handles the 1.5cm on each side
  container.style.width = '100%';
  container.style.maxWidth = '100%';
  container.style.overflow = 'hidden';
  container.style.fontFamily = "'Times New Roman', Times, serif";
  container.style.fontSize = '11pt';
  container.style.lineHeight = '1.0';
  container.style.color = '#000';
  container.style.background = '#fff';

  const sectionMap = new Map(sectionContents.map(sc => [sc.sectionId, sc.content]));
  const partBSections = flattenSections(sections);

  // ── Proposal banner (replaces document title) ──
  const escapeHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // Auto-computed fallbacks (mirrors ProposalBanner.tsx logic)
  const computedTopicLine = proposal.topicId || proposal.topicTitle || proposal.type
    ? `${proposal.topicId || ''}${proposal.topicId && proposal.topicTitle ? ': ' : ''}${proposal.topicTitle || ''}${proposal.type ? ` (${proposal.type})` : ''}`
    : '';

  // Fetch user's banner overrides — these contain the exact edited text
  // (with manual line breaks preserved as \n) shown in the online editor.
  let bannerTopicLine = computedTopicLine;
  let bannerTitle = proposal.title || '';
  try {
    const { data: bannerData } = await supabase
      .from('proposals')
      .select('banner_topic_line_override, banner_title_override')
      .eq('id', proposal.id)
      .maybeSingle();
    if (bannerData) {
      if (bannerData.banner_topic_line_override != null) {
        bannerTopicLine = bannerData.banner_topic_line_override;
      }
      if (bannerData.banner_title_override != null) {
        bannerTitle = bannerData.banner_title_override;
      }
    }
  } catch { /* fall back to computed values */ }

  const banner = document.createElement('div');
  banner.setAttribute('data-proposal-banner', 'true');
  banner.style.cssText =
    "background:#000;color:#fff;padding:1.5cm 1.5cm 12pt 1.5cm;" +
    "box-sizing:border-box;margin-bottom:12pt;overflow:hidden;";
  banner.innerHTML = `
    <div style="float:right;text-align:center;margin-left:0.5cm;margin-bottom:0.25cm;">
      <img src="${SITRA_LOGO_BASE64}" alt="Sitra" style="height:0.8cm !important;width:auto !important;max-width:none !important;max-height:0.8cm !important;display:block;margin:0;" />
      <div style="font-family:'Arial Black',Arial,sans-serif;font-size:10pt;line-height:1;color:#fff;text-align:center;margin-top:2pt;white-space:nowrap;">and partners</div>
    </div>
    ${bannerTopicLine ? `<div style="font-family:'Times New Roman',Times,serif;font-size:8pt;line-height:1.15;color:#fff;text-align:left;margin-top:0pt;margin-bottom:6pt;white-space:pre-line;">${escapeHtml(bannerTopicLine)}</div>` : ''}
    <div style="font-family:'Arial Black',Arial,sans-serif;font-weight:900;font-size:18pt;line-height:1.2;color:#fff;text-align:left;white-space:pre-line;">${escapeHtml(proposal.acronym || '')}</div>
    <div style="font-family:'Arial Black',Arial,sans-serif;font-weight:900;font-size:13pt;line-height:1.2;color:#fff;text-align:left;white-space:pre-line;">${escapeHtml(bannerTitle)}</div>
    <div style="clear:both;"></div>
  `;
  container.appendChild(banner);

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
        b31Marker.setAttribute('data-proposal-acronym', proposal.acronym);
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
  proposalAcronym: string,
): Promise<void> {
  const mount = container.querySelector('#print-b31-mount');
  if (!mount) return;

  const [{ B31IntroText }, { B31SectionContent }] = await Promise.all([
    import('@/components/B31IntroText'),
    import('@/components/B31SectionContent'),
  ]);

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  const root = createRoot(mount);

  root.render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        'div',
        { className: 'print-b31-content' },
        createElement(B31IntroText, { proposalId, proposalAcronym }),
        createElement(B31SectionContent, { proposalId }),
      ),
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
    '.drag-handle',
    '[data-radix-popper-content-wrapper]',
    '.popover-content',
    '.resize-handle',
    '.column-resizer',
    '.tooltip-content',
  ];
  for (const sel of interactiveSelectors) {
    mount.querySelectorAll(sel).forEach(el => {
      el.remove();
    });
  }
}

// ── Post-process: replace interactive elements with static text ──────────────

function freezeInteractiveElements(container: HTMLElement): void {
  // 1. Replace <input> elements with their displayed value as static <span>
  container.querySelectorAll('input').forEach(input => {
    const span = document.createElement('span');
    // Copy computed styles for color, font, alignment
    const cs = window.getComputedStyle(input);
    span.style.color = cs.color;
    span.style.fontFamily = cs.fontFamily;
    span.style.fontSize = cs.fontSize;
    span.style.fontWeight = cs.fontWeight;
    span.style.textAlign = cs.textAlign;
    span.style.display = 'inline-block';
    span.style.width = '100%';
    span.textContent = input.value || input.placeholder || '';
    input.replaceWith(span);
  });

  // 2. Replace <select> elements with their selected option text
  container.querySelectorAll('select').forEach(select => {
    const span = document.createElement('span');
    const selected = select.options[select.selectedIndex];
    span.textContent = selected ? selected.textContent || '' : '';
    select.replaceWith(span);
  });

  // 3. Replace Radix Select triggers: find elements with role="combobox" or SelectTrigger
  //    These render the current value but are wrapped in a <button>
  //    The print CSS hides <button>, so extract their visible content first
  container.querySelectorAll('button[role="combobox"], [data-radix-select-trigger]').forEach(trigger => {
    const span = document.createElement('span');
    span.innerHTML = trigger.innerHTML;
    // Remove any chevron/icon SVGs from the cloned content
    span.querySelectorAll('svg.lucide-chevron-down, svg.lucide-chevrons-up-down, svg.lucide-chevron-up, svg.lucide-x, [data-radix-select-icon]').forEach(svg => svg.remove());
    // Copy inline styles
    const cs = window.getComputedStyle(trigger);
    span.style.display = 'inline-flex';
    span.style.alignItems = 'center';
    span.style.color = cs.color;
    span.style.fontFamily = cs.fontFamily;
    span.style.fontSize = cs.fontSize;
    span.style.fontWeight = cs.fontWeight;
    span.style.lineHeight = cs.lineHeight;
    trigger.replaceWith(span);
  });

  // 4. Replace all remaining buttons that contain visible text/bubbles
  //    but NOT structural buttons (drag handles etc. which should just be removed)
  container.querySelectorAll('button').forEach(btn => {
    const textContent = btn.textContent?.replace(/\s+/g, ' ').trim() || '';
    // Check if this button contains meaningful bubble content (not just icons)
    const hasBubble = btn.querySelector('[style*="background"]') || 
                      btn.querySelector('.print-bubble') ||
                      btn.querySelector('[class*="rounded-full"]');
    if (hasBubble || textContent.length > 0) {
      const span = document.createElement('span');
      span.innerHTML = btn.innerHTML;
      span.querySelectorAll('svg.lucide-chevron-down, svg.lucide-chevrons-up-down, svg.lucide-chevron-up, svg.lucide-x, [data-radix-select-icon]').forEach(svg => svg.remove());
      span.style.display = 'inline-flex';
      span.style.alignItems = 'center';
      span.style.flexWrap = 'wrap';
      span.style.gap = '2px';
      span.style.verticalAlign = 'middle';
      btn.replaceWith(span);
    }
    // Others will be hidden by CSS display:none
  });

  // 5. Replace textarea elements
  container.querySelectorAll('textarea').forEach(ta => {
    const div = document.createElement('div');
    div.textContent = ta.value;
    ta.replaceWith(div);
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

  // Attach to DOM — must be visible for layout capture
  // Use fixed pixel width (680px ≈ 18cm at 96dpi) for React rendering
  container.style.position = 'absolute';
  container.style.left = '0';
  container.style.top = '0';
  container.style.width = '680px';
  container.style.zIndex = '99999';
  container.style.pointerEvents = 'none';
  container.style.background = '#fff';
  container.style.overflow = 'visible';
  document.body.appendChild(container);

  // Mount B3.1 React components (tables, charts)
  await mountB31Components(container, options.proposal.id, options.proposal.acronym);

  // Refresh any expired signed URLs before waiting for images to load
  await refreshSignedUrls(container);

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

  // Freeze interactive elements (inputs, selects, buttons) into static text
  // Must happen AFTER React mount but BEFORE detaching from DOM
  freezeInteractiveElements(container);

  // Reset to 100% width so it fills the print page properly
  container.style.width = '100%';
  container.style.maxWidth = '100%';
  container.style.position = 'static';
  container.style.left = 'auto';
  container.style.top = 'auto';
  container.style.zIndex = 'auto';
  container.style.pointerEvents = 'auto';

  // Allow a small delay for reflows
  await new Promise(r => setTimeout(r, 500));

  const cleanup = () => {
    if (container.parentNode) {
      document.body.removeChild(container);
    }
  };

  return { container, cleanup };
}
