import { useCallback } from 'react';
import { saveAs } from 'file-saver';
import { toast } from 'sonner';
import { Proposal, Section, Participant } from '@/types/proposal';
import { buildPrintContainer, mountB31Components } from '@/lib/printRenderer';

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

/**
 * Wrap HTML content in a Word-compatible HTML document.
 * Word opens HTML files with proper namespace declarations natively,
 * preserving CSS styling including tables, colors, borders, and bubbles.
 */
function wrapInWordHtml(bodyHtml: string, title: string): string {
  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>${title}</title>
<!--[if gte mso 9]>
<xml>
<w:WordDocument>
<w:View>Print</w:View>
<w:Zoom>100</w:Zoom>
<w:DoNotOptimizeForBrowser/>
</w:WordDocument>
</xml>
<![endif]-->
<style>
  @page {
    size: A4;
    margin: 1.5cm 1.5cm 1.5cm 1.5cm;
  }
  body {
    font-family: 'Times New Roman', Times, serif;
    font-size: 11pt;
    line-height: 1.0;
    color: #000;
    background: #fff;
    margin: 0;
    padding: 0;
  }
  h1 {
    font-size: 13pt;
    font-weight: bold;
    margin-top: 9pt;
    margin-bottom: 6pt;
    page-break-after: avoid;
  }
  h1.print-title {
    font-size: 14pt;
    text-align: center;
    margin-bottom: 12pt;
    margin-top: 0;
  }
  h2 {
    font-size: 12pt;
    font-weight: bold;
    margin-top: 6pt;
    margin-bottom: 0;
    page-break-after: avoid;
  }
  h3 {
    font-size: 11pt;
    font-weight: bold;
    text-decoration: underline;
    margin-top: 3pt;
    margin-bottom: 3pt;
    page-break-after: avoid;
  }
  p {
    font-family: 'Times New Roman', Times, serif;
    font-size: 11pt;
    margin-top: 3pt;
    margin-bottom: 3pt;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    font-family: 'Times New Roman', Times, serif;
    font-size: 11pt;
    margin-top: 4pt;
    margin-bottom: 4pt;
  }
  th, td {
    border: 1px solid #000;
    padding: 3pt 5pt;
    vertical-align: middle;
    font-family: 'Times New Roman', Times, serif;
    font-size: 11pt;
  }
  th {
    background-color: #000;
    color: #fff;
    font-weight: bold;
    text-align: left;
  }
  img {
    max-width: 100%;
    height: auto;
  }
  /* Bubbles render as colored rectangles in Word (no border-radius support) */
  .print-bubble {
    display: inline-block;
    padding: 0 5px;
    font-weight: bold;
    font-size: 11pt;
    font-family: 'Times New Roman', Times, serif;
    white-space: nowrap;
    mso-border-alt: none;
  }
  /* Track changes styling */
  .track-insertion, [data-track-type="insertion"] {
    color: #22c55e;
    text-decoration: underline;
  }
  .track-deletion, [data-track-type="deletion"] {
    color: #ef4444;
    text-decoration: line-through;
  }
  /* Lists */
  ul, ol {
    margin-top: 3pt;
    margin-bottom: 3pt;
    padding-left: 20pt;
  }
  li {
    font-family: 'Times New Roman', Times, serif;
    font-size: 11pt;
    margin-bottom: 2pt;
  }
  /* ProseMirror content styling */
  .ProseMirror table {
    border-collapse: collapse;
    width: 100%;
  }
  .ProseMirror th {
    background-color: #000;
    color: #fff;
    font-weight: bold;
  }
  .ProseMirror td {
    border: 1px solid #000;
    padding: 3pt 5pt;
  }
  /* Figure captions */
  figcaption, .caption-label {
    font-style: italic;
    text-align: center;
    margin-top: 4pt;
    margin-bottom: 8pt;
  }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

export function useDocxExport() {
  const exportProposalToDocx = useCallback(
    async (data: ExportData, options?: { includeWatermark?: boolean }) => {
      const { proposal, sectionContents, sections, participants = [] } = data;

      try {
        toast.info('Generating Word document – rendering content…');

        // 1. Build the same print container used by PDF export
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

        // 2. Attach to DOM for layout and React component rendering
        container.style.position = 'absolute';
        container.style.left = '0';
        container.style.top = '0';
        container.style.zIndex = '99999';
        container.style.pointerEvents = 'none';
        container.style.background = '#fff';
        container.style.overflow = 'visible';
        document.body.appendChild(container);

        // 3. Mount B3.1 React components (tables, charts)
        toast.info('Generating Word document – rendering tables…');
        await mountB31Components(container, proposal.id);

        // 4. Wait for images to load
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
        await new Promise(r => setTimeout(r, 500));

        // 5. Convert images to base64 data URIs for embedding in the document
        toast.info('Generating Word document – embedding images…');
        for (const img of Array.from(container.querySelectorAll('img'))) {
          try {
            if (img.src.startsWith('data:')) continue;
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || img.width || 100;
            canvas.height = img.naturalHeight || img.height || 100;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0);
              const dataUrl = canvas.toDataURL('image/png');
              img.src = dataUrl;
            }
          } catch {
            // Cross-origin images can't be converted; leave as-is
          }
        }

        // 6. Get the rendered HTML
        const bodyHtml = container.innerHTML;

        // 7. Remove the container from DOM
        document.body.removeChild(container);

        // 8. Wrap in Word-compatible HTML
        const docTitle = `${proposal.acronym}: ${proposal.title}`;
        const wordHtml = wrapInWordHtml(bodyHtml, docTitle);

        // 9. Create blob and save
        const blob = new Blob(['\ufeff' + wordHtml], {
          type: 'application/msword',
        });
        const filename = `${proposal.acronym || 'proposal'}_Part_B.doc`;
        saveAs(blob, filename);

        toast.success('Word document exported successfully!');
      } catch (error) {
        console.error('DOCX export error:', error);
        toast.error('Failed to export Word document. Please try again.');
      }
    },
    [],
  );

  return { exportProposalToDocx };
}
