import { useCallback } from 'react';
import jsPDF from 'jspdf';
import { toast } from 'sonner';
import { Proposal, Section, Participant } from '@/types/proposal';
import { buildPrintContainer, mountB31Components } from '@/lib/printRenderer';

interface SectionContent {
  id: string;
  sectionId: string;
  content: string;
}

interface ExportData {
  proposal: Proposal;
  sectionContents: SectionContent[];
  sections: Section[];
  participants?: Participant[];
}

/**
 * Add "Confidential draft" watermark to all pages of a jsPDF document.
 */
function addWatermarkToAllPages(pdf: jsPDF) {
  const totalPages = pdf.internal.pages.length - 1;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    pdf.saveGraphicsState();
    pdf.setTextColor(220, 38, 38);
    pdf.setFontSize(60);
    pdf.setFont('times', 'bold');
    const gState = pdf.GState({ opacity: 0.15 });
    pdf.setGState(gState);
    pdf.text('Confidential draft', pageWidth / 2, pageHeight / 2, {
      align: 'center',
      angle: 45,
    });
    pdf.restoreGraphicsState();
  }
}

/**
 * Add header and footer overlays to all pages.
 */
function addHeadersFooters(
  pdf: jsPDF,
  proposal: { acronym: string; title: string; topicId?: string | null; topicTitle?: string | null; type?: string | null; submissionStage?: string | null },
) {
  const totalPages = pdf.internal.pages.length - 1;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 15;
  const gray: [number, number, number] = [128, 128, 128];
  const fontSize = 8;

  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);

    // ── Header ──
    pdf.setFontSize(fontSize);
    pdf.setFont('times', 'normal');
    pdf.setTextColor(...gray);
    const topicId = proposal.topicId || '';
    const topicTitle = proposal.topicTitle || proposal.title || '';
    const topicType = proposal.type || '';
    let headerText = `${topicId}${topicId && topicTitle ? ': ' : ''}${topicTitle}${topicType ? ` (${topicType})` : ''}`;
    if (headerText.length > 120) headerText = headerText.substring(0, 117) + '...';
    pdf.text(headerText, pageWidth / 2, margin / 2, { align: 'center' });

    // ── Footer ──
    const footerY = pageHeight - margin / 2;
    const centerX = pageWidth / 2;
    const acronymText = proposal.acronym;
    const stageText = proposal.submissionStage === 'stage_1' ? ' (Stage 1 of 2) | ' : ' | ';
    const pageText = ` | Page ${i} of ${totalPages}`;

    pdf.setFont('times', 'bold');
    const acronymWidth = pdf.getTextWidth(acronymText);
    pdf.setFont('times', 'normal');
    const stageWidth = pdf.getTextWidth(stageText);
    const pageTextWidth = pdf.getTextWidth(pageText);
    const totalWidth = acronymWidth + stageWidth + pageTextWidth;

    let xPos = centerX - totalWidth / 2;
    pdf.setFont('times', 'bold');
    pdf.text(acronymText, xPos, footerY);
    xPos += acronymWidth;
    pdf.setFont('times', 'normal');
    pdf.text(stageText, xPos, footerY);
    xPos += stageWidth;
    pdf.text(pageText, xPos, footerY);
  }
}

export function usePdfExport() {
  const exportProposalToPdf = useCallback(
    async (data: ExportData, options?: { includeWatermark?: boolean }) => {
      const { proposal, sectionContents, sections, participants = [] } = data;
      const includeWatermark = options?.includeWatermark ?? true;

      try {
        toast.info('Generating PDF – rendering content…');

        // 1. Build the hidden print container with all content
        const container = await buildPrintContainer({
          proposal: {
            id: proposal.id,
            title: proposal.title,
            acronym: proposal.acronym,
            submissionStage: proposal.submissionStage,
            topicId: proposal.topicId,
            topicTitle: proposal.topicTitle,
            type: proposal.type,
          },
          sections,
          sectionContents,
          participants,
        });

        // 2. Attach container to DOM (off-screen) so browser can layout
        container.style.position = 'fixed';
        container.style.left = '-10000px';
        container.style.top = '0';
        container.style.zIndex = '-1';
        container.style.pointerEvents = 'none';
        container.style.background = '#fff';
        document.body.appendChild(container);

        // 3. Mount B3.1 React components (tables, charts)
        toast.info('Generating PDF – rendering tables & charts…');
        await mountB31Components(container, proposal.id);

        // 4. Wait for all images to load
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

        // Allow a small delay for any reflows
        await new Promise(r => setTimeout(r, 500));

        // 5. Create jsPDF and render
        toast.info('Generating PDF – creating pages…');
        const pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4',
        });

        // Use jsPDF.html() to render the container as paginated vector content
        await new Promise<void>((resolve, reject) => {
          pdf.html(container, {
            callback: () => resolve(),
            x: 15, // left margin
            y: 15, // top margin
            width: 180, // content width (A4 - 2×15mm)
            windowWidth: container.scrollWidth || 680,
            margin: [15, 15, 15, 15], // top, right, bottom, left in mm
            autoPaging: 'text',
            html2canvas: {
              scale: 2,
              useCORS: true,
              allowTaint: true,
              backgroundColor: '#ffffff',
              logging: false,
            },
          });
        });

        // 6. Remove the off-screen container
        document.body.removeChild(container);

        // 7. Remove the blank first page if jsPDF added one
        // jsPDF starts with page 1 which may be blank if html() created new pages
        // Check if first page is mostly empty
        const totalPages = pdf.internal.pages.length - 1;
        if (totalPages > 1) {
          // The first page created by new jsPDF() is page 1; html() adds content starting there.
          // No action needed - jsPDF.html() renders into page 1 directly.
        }

        // 8. Add headers and footers
        addHeadersFooters(pdf, proposal);

        // 9. Add watermark
        if (includeWatermark) {
          addWatermarkToAllPages(pdf);
        }

        // 10. Save
        const watermarkSuffix = includeWatermark ? '' : '_final';
        const filename = `${proposal.acronym}_Part_B_${new Date().toISOString().split('T')[0]}${watermarkSuffix}.pdf`;
        pdf.save(filename);

        toast.success('PDF exported successfully!');
      } catch (error) {
        console.error('PDF export error:', error);
        toast.error('Failed to export PDF. Please try again.');
      }
    },
    [],
  );

  // Legacy simple export for backward compatibility
  const exportToPdf = useCallback(
    async (options: {
      title: string;
      acronym: string;
      sections: Array<{ number: string; title: string; content: string }>;
    }) => {
      const { title, acronym, sections } = options;

      try {
        toast.info('Generating PDF...');
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pageWidth = pdf.internal.pageSize.getWidth();
        const margin = 15;
        const contentWidth = pageWidth - margin * 2;
        let yPosition = margin;

        pdf.setFontSize(14);
        pdf.setFont('times', 'bold');
        pdf.text(`${title} (${acronym})`, margin, yPosition);
        yPosition += 10;

        for (const section of sections) {
          pdf.setFontSize(12);
          pdf.setFont('times', 'bold');
          pdf.text(`${section.number} ${section.title}`, margin, yPosition);
          yPosition += 6;

          pdf.setFontSize(11);
          pdf.setFont('times', 'normal');
          const lines = pdf.splitTextToSize(section.content || '', contentWidth);
          for (const line of lines) {
            if (yPosition > 270) {
              pdf.addPage();
              yPosition = margin;
            }
            pdf.text(line, margin, yPosition);
            yPosition += 4.5;
          }
          yPosition += 4;
        }

        const filename = `${acronym}_export_${new Date().toISOString().split('T')[0]}.pdf`;
        pdf.save(filename);
        toast.success('PDF exported successfully!');
      } catch (error) {
        console.error('PDF export error:', error);
        toast.error('Failed to export PDF');
      }
    },
    [],
  );

  return { exportToPdf, exportProposalToPdf };
}
