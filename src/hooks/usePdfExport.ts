import { useCallback } from 'react';
import { toast } from 'sonner';
import { Proposal, Section, Participant } from '@/types/proposal';
import { prepareExportContainer, ExportData } from '@/lib/printRenderer';

/**
 * Build a self-contained HTML document string for printing via an iframe.
 * Copies all stylesheets from the host page so the print container
 * renders identically to the editor.
 */
function buildPrintDocument(
  container: HTMLDivElement,
  proposal: {
    acronym: string;
    title: string;
    topicId?: string | null;
    topicTitle?: string | null;
    type?: string | null;
    submissionStage?: string | null;
  },
): string {
  // Collect all stylesheets from the host page
  const styleSheets: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      if (sheet.href) {
        styleSheets.push(`<link rel="stylesheet" href="${sheet.href}" />`);
      } else if (sheet.ownerNode && sheet.ownerNode instanceof HTMLStyleElement) {
        styleSheets.push(`<style>${sheet.ownerNode.innerHTML}</style>`);
      }
    } catch {
      // Skip cross-origin sheets
    }
  }

  // No custom header/footer — user should disable browser headers/footers in the print dialog

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${proposal.acronym} – Part B</title>
  ${styleSheets.join('\n  ')}
  <style>
    @page {
      size: A4 portrait;
      margin: 0;
    }

    body {
      margin: 0;
      padding: 15mm;
      background: #fff;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }

    /* Page break helpers */
    .print-export-container h1.print-h1 {
      page-break-before: auto;
      page-break-after: avoid;
    }
    .print-export-container h2.print-h2 {
      page-break-after: avoid;
    }
    .print-export-container h3 {
      page-break-after: avoid;
    }
    .print-export-container tr {
      page-break-inside: avoid;
    }
    .print-export-container img {
      page-break-inside: avoid;
    }
    .print-export-container figure {
      page-break-inside: avoid;
    }

    /* Ensure the container fills available width */
    .print-export-container {
      width: 100% !important;
      max-width: 100% !important;
      position: relative !important;
      left: auto !important;
      top: auto !important;
      z-index: auto !important;
      pointer-events: auto !important;
    }

    @media print {
      body > *:not(.print-body-content) {
        display: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="print-body-content">
    ${container.outerHTML}
  </div>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function usePdfExport() {
  const exportProposalToPdf = useCallback(
    async (data: ExportData) => {
      const { proposal, sectionContents, sections, participants = [] } = data;

      try {
        toast.info('Preparing PDF – rendering content…');

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

        // Build the self-contained HTML document
        const htmlDoc = buildPrintDocument(container, proposal);

        // Clean up the container from the main page
        cleanup();

        // Create a hidden iframe for printing
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.top = '-10000px';
        iframe.style.left = '-10000px';
        iframe.style.width = '210mm';
        iframe.style.height = '297mm';
        iframe.style.border = 'none';
        document.body.appendChild(iframe);

        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!iframeDoc) {
          toast.error('Failed to create print frame.');
          document.body.removeChild(iframe);
          return;
        }

        iframeDoc.open();
        iframeDoc.write(htmlDoc);
        iframeDoc.close();

        // Wait for stylesheets and images to load inside the iframe
        await new Promise<void>((resolve) => {
          const checkReady = () => {
            const images = iframeDoc.querySelectorAll('img');
            const allLoaded = Array.from(images).every(img => img.complete);
            if (allLoaded) {
              resolve();
            } else {
              setTimeout(checkReady, 200);
            }
          };
          // Give stylesheets a moment to apply, then check images
          setTimeout(checkReady, 1000);
        });

        toast.info('Opening print dialog…');

        // Print the iframe
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();

        // Clean up iframe after a delay (user may still be in print dialog)
        setTimeout(() => {
          if (iframe.parentNode) {
            document.body.removeChild(iframe);
          }
        }, 5000);

        toast.success('Print dialog opened. Save as PDF to export.');
      } catch (error) {
        console.error('PDF export error:', error);
        toast.error('Failed to export PDF. Please try again.');
      }
    },
    [],
  );

  return { exportProposalToPdf };
}
