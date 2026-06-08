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

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const docTitle = `${timestamp} ${proposal.acronym || 'proposal'} Part B`;

  // Escape a string for safe inclusion inside a CSS content: "..." value
  const escapeForCSS = (s: string) =>
    s
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\r?\n/g, ' ');

  const topicId = proposal.topicId || '';
  const topicTitle = proposal.topicTitle || '';
  const acronym = proposal.acronym || '';
  const headerText = escapeForCSS(`${topicId ? topicId + ': ' : ''}${topicTitle}`);
  const footerAcronym = escapeForCSS(acronym);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(docTitle)}</title>
  ${styleSheets.join('\n  ')}
  <style>
    @page {
      size: A4 portrait;
      margin: 2cm 1.5cm 2cm 1.5cm;

      @top-center {
        content: "${headerText}";
        font-family: 'Times New Roman', Times, serif;
        font-size: 9pt;
        font-style: italic;
        color: #666;
      }

      @bottom-center {
        content: "${footerAcronym} | Part B";
        font-family: 'Times New Roman', Times, serif;
        font-size: 9pt;
        color: #666;
      }

      @bottom-right {
        content: "Page " counter(page) " of " counter(pages);
        font-family: 'Times New Roman', Times, serif;
        font-size: 9pt;
        color: #666;
      }
    }

    @page :first {
      margin-top: 0;
      @top-center { content: none; }
    }

    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
    }

    body {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
      font-family: 'Times New Roman', Times, serif;
      font-size: 11pt;
      line-height: 1.0;
    }

    .print-body-content {
      width: 100%;
      padding: 0;
      box-sizing: border-box;
      background: #fff;
    }

    /* Proposal banner — bleed to page edges on page 1, matching online editor */
    [data-proposal-banner] {
      margin: 0 -1.5cm;
      width: calc(100% + 3cm);
      break-after: avoid;
      page-break-after: avoid;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    /* H1 / H2 use Arial Black, matching the online editor */
    .print-export-container h1,
    .print-export-container h2,
    .print-export-container h1.print-h1,
    .print-export-container h2.print-h2,
    .document-h1,
    .print-export-container h1:first-of-type {
      font-family: 'Arial Black', Arial, sans-serif !important;
    }

    /* Container sizing */
    .print-export-container {
      width: 100% !important;
      max-width: 100% !important;
      margin: 0 auto !important;
      position: relative !important;
      left: auto !important;
      top: auto !important;
      z-index: auto !important;
      pointer-events: auto !important;
    }

    .print-export-container img {
      max-width: 100% !important;
      height: auto !important;
    }

    .print-export-container span[style] {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    /* === Page-break controls === */
    .print-export-container h1,
    .print-export-container h2,
    .print-export-container h3 {
      break-after: avoid;
      page-break-after: avoid;
    }
    .print-export-container h1 + p,
    .print-export-container h2 + p,
    .print-export-container h3 + p,
    .print-export-container h1 + ul,
    .print-export-container h2 + ul,
    .print-export-container h3 + ul,
    .print-export-container h1 + ol,
    .print-export-container h2 + ol,
    .print-export-container h3 + ol,
    .print-export-container h1 + table,
    .print-export-container h2 + table,
    .print-export-container h3 + table {
      break-before: avoid;
      page-break-before: avoid;
    }
    .print-export-container table {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .print-export-container tr {
      page-break-inside: avoid;
    }
    .print-export-container figure,
    .print-export-container img {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .print-export-container .caption-label,
    .print-export-container .figure-caption,
    .print-export-container .table-caption,
    .print-export-container figcaption {
      break-before: avoid;
      page-break-before: avoid;
      break-after: avoid;
      page-break-after: avoid;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .print-export-container .table-caption + table,
    .print-export-container .caption-label + table {
      break-before: avoid;
      page-break-before: avoid;
    }
    .print-export-container p {
      orphans: 3;
      widows: 3;
    }
    .print-export-container [data-wp-banner],
    .print-export-container .wp-banner {
      break-after: avoid;
      page-break-after: avoid;
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

async function waitForPrintAssets(printDocument: Document): Promise<void> {
  // Wait for fonts
  if (printDocument.fonts && printDocument.fonts.ready) {
    try {
      await printDocument.fonts.ready;
    } catch {
      // Font loading API not available; fall through
    }
  }

  await new Promise<void>((resolve) => {
    const checkReady = () => {
      const images = printDocument.querySelectorAll('img');
      const allLoaded = Array.from(images).every(img => img.complete);
      if (allLoaded) {
        resolve();
      } else {
        setTimeout(checkReady, 200);
      }
    };

    setTimeout(checkReady, 1000);
  });

  await new Promise(resolve => setTimeout(resolve, 500));
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

        // Compute desired filename title for print dialog
        const _now = new Date();
        const _pad = (n: number) => String(n).padStart(2, '0');
        const _timestamp = `${_now.getFullYear()}-${_pad(_now.getMonth() + 1)}-${_pad(_now.getDate())} ${_pad(_now.getHours())}:${_pad(_now.getMinutes())}:${_pad(_now.getSeconds())}`;
        const _docTitle = `${_timestamp} ${proposal.acronym || 'proposal'} Part B`;

        // Clean up the container from the main page
        cleanup();

        const printWindow = window.open('', '_blank');
        if (printWindow?.document) {
          printWindow.document.open();
          printWindow.document.write(htmlDoc);
          printWindow.document.close();

          await waitForPrintAssets(printWindow.document);

          toast.info('Opening print dialog…');
          printWindow.focus();
          try { printWindow.document.title = _docTitle; } catch {}
          printWindow.print();


          setTimeout(() => {
            printWindow.close();
          }, 5000);

          toast.success('Print dialog opened. Save as PDF to export.');
          return;
        }

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
        await waitForPrintAssets(iframeDoc);

        toast.info('Opening print dialog…');

        // Print the iframe
        iframe.contentWindow?.focus();
        try { if (iframeDoc) iframeDoc.title = _docTitle; } catch {}
        try { document.title = _docTitle; } catch {}
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
