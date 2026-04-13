import { useCallback } from 'react';
import jsPDF from 'jspdf';
import { toast } from 'sonner';
import { Proposal, Section, Participant } from '@/types/proposal';
import { prepareExportContainer, ExportData } from '@/lib/printRenderer';

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

        const { container, cleanup } = await prepareExportContainer({
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

        // Create jsPDF and render
        toast.info('Generating PDF – creating pages…');
        const pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4',
        });

        await new Promise<void>((resolve, reject) => {
          // Fixed pixel width must match the container (680px = 180mm at 96dpi)
          const CONTAINER_WIDTH_PX = 680;

          pdf.html(container, {
            callback: () => resolve(),
            x: 15,
            y: 15,
            width: 180, // target width in mm on the PDF
            windowWidth: CONTAINER_WIDTH_PX,
            margin: [15, 15, 15, 15],
            autoPaging: 'text',
            html2canvas: {
              scale: 0.264583, // mm per px (1mm = 3.7795px, so 1px = 0.2646mm) — maps px → mm
              useCORS: true,
              allowTaint: true,
              backgroundColor: '#ffffff',
              logging: false,
              scrollX: 0,
              scrollY: 0,
              windowWidth: CONTAINER_WIDTH_PX,
              windowHeight: container.scrollHeight || 900,
            },
          });
        });

        cleanup();

        // Add headers and footers
        addHeadersFooters(pdf, proposal);

        // Add watermark
        if (includeWatermark) {
          addWatermarkToAllPages(pdf);
        }

        // Save
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

  return { exportProposalToPdf };
}
