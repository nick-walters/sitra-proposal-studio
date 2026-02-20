import { useCallback } from 'react';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Header,
  Footer,
  PageNumber,
  convertMillimetersToTwip,
  InsertedTextRun,
  DeletedTextRun,
} from 'docx';
import { saveAs } from 'file-saver';
import { toast } from 'sonner';
import { Proposal, Section, Participant } from '@/types/proposal';

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
 * Very simple HTML → Paragraph[] converter.
 */
function htmlToParagraphs(html: string, sectionTrackedChanges?: TrackedChange[]): Paragraph[] {
  if (!html) return [];

  const div = document.createElement('div');
  div.innerHTML = html;
  const paragraphs: Paragraph[] = [];

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (text) {
        paragraphs.push(
          new Paragraph({
            children: [new TextRun({ text, font: 'Times New Roman', size: 22 })],
            spacing: { before: 120, after: 120 },
          })
        );
      }
      return;
    }

    const el = node as HTMLElement;
    const tag = el.tagName?.toLowerCase();

    if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
      const level = tag === 'h1' ? HeadingLevel.HEADING_1 : tag === 'h2' ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3;
      const fontSize = tag === 'h1' ? 26 : tag === 'h2' ? 24 : 22;
      paragraphs.push(
        new Paragraph({
          heading: level,
          children: [
            new TextRun({
              text: el.textContent || '',
              bold: true,
              font: 'Times New Roman',
              size: fontSize,
            }),
          ],
          spacing: { before: 180, after: 120 },
        })
      );
      return;
    }

    if (tag === 'p' || tag === 'div') {
      const runs: (TextRun | InsertedTextRun | DeletedTextRun)[] = [];
      el.childNodes.forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          const t = child.textContent || '';
          if (t.trim()) runs.push(new TextRun({ text: t, font: 'Times New Roman', size: 22 }));
        } else {
          const childEl = child as HTMLElement;
          const childTag = childEl.tagName?.toLowerCase();
          const text = childEl.textContent || '';
          if (!text.trim()) return;

          // Check for track change marks
          const isInsertion = childEl.classList?.contains('track-insertion') || childEl.getAttribute('data-track-type') === 'insertion';
          const isDeletion = childEl.classList?.contains('track-deletion') || childEl.getAttribute('data-track-type') === 'deletion';
          const author = childEl.getAttribute('data-author') || 'Unknown';
          const dateStr = childEl.getAttribute('data-date');
          const date = dateStr ? new Date(dateStr) : new Date();

          if (isInsertion) {
            runs.push(new InsertedTextRun({
              text,
              font: 'Times New Roman',
              size: 22,
              bold: childTag === 'strong' || childTag === 'b',
              italics: childTag === 'em' || childTag === 'i',
              id: Math.floor(Math.random() * 1000000),
              author,
              date: date.toISOString(),
            }));
          } else if (isDeletion) {
            runs.push(new DeletedTextRun({
              text,
              font: 'Times New Roman',
              size: 22,
              bold: childTag === 'strong' || childTag === 'b',
              italics: childTag === 'em' || childTag === 'i',
              id: Math.floor(Math.random() * 1000000),
              author,
              date: date.toISOString(),
            }));
          } else {
            runs.push(
              new TextRun({
                text,
                font: 'Times New Roman',
                size: 22,
                bold: childTag === 'strong' || childTag === 'b',
                italics: childTag === 'em' || childTag === 'i',
                underline: childTag === 'u' ? {} : undefined,
                superScript: childTag === 'sup',
                subScript: childTag === 'sub',
              })
            );
          }
        }
      });
      if (runs.length > 0) {
        paragraphs.push(new Paragraph({ children: runs, spacing: { before: 120, after: 120 } }));
      }
      return;
    }

    if (tag === 'ul' || tag === 'ol') {
      el.querySelectorAll(':scope > li').forEach((li, i) => {
        const bullet = tag === 'ul' ? '• ' : `${i + 1}. `;
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({ text: bullet + (li.textContent || ''), font: 'Times New Roman', size: 22 }),
            ],
            spacing: { before: 60, after: 60 },
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
            text: change.content,
            font: 'Times New Roman',
            size: 22,
            id: Math.floor(Math.random() * 1000000),
            author: change.authorName,
            date: change.date.toISOString(),
          })],
          spacing: { before: 120, after: 120 },
        }));
      } else if (change.type === 'deletion') {
        paragraphs.push(new Paragraph({
          children: [new DeletedTextRun({
            text: change.content,
            font: 'Times New Roman',
            size: 22,
            id: Math.floor(Math.random() * 1000000),
            author: change.authorName,
            date: change.date.toISOString(),
          })],
          spacing: { before: 120, after: 120 },
        }));
      }
    }
  }

  return paragraphs.length > 0 ? paragraphs : [new Paragraph({ children: [] })];
}

function createWatermarkHeader(): Header {
  return new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: 'CONFIDENTIAL DRAFT',
            font: 'Times New Roman',
            size: 36,
            bold: true,
            color: 'CCCCCC',
          }),
        ],
      }),
    ],
  });
}

export function useDocxExport() {
  const exportProposalToDocx = useCallback(
    async (data: ExportData, options?: { includeWatermark?: boolean }) => {
      const { proposal, sectionContents, sections, trackedChanges } = data;
      const includeWatermark = options?.includeWatermark ?? true;

      try {
        toast.info('Generating DOCX...');

        const bodyChildren: Paragraph[] = [];

        // Title page
        bodyChildren.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 600, after: 200 },
            children: [
              new TextRun({
                text: `${proposal.acronym || ''}${proposal.acronym && proposal.title ? ': ' : ''}${proposal.title || ''}`,
                bold: true,
                font: 'Arial',
                size: 28,
              }),
            ],
          })
        );

        if (proposal.topicId) {
          bodyChildren.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 400 },
              children: [
                new TextRun({
                  text: proposal.topicId,
                  font: 'Times New Roman',
                  size: 22,
                  color: '666666',
                }),
              ],
            })
          );
        }

        // Sections
        for (const section of sections) {
          const sectionLevel = (section.number || '').split('.').filter(Boolean).length;
          const headingLevel = sectionLevel <= 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2;
          const fontSize = sectionLevel <= 1 ? 26 : 24;

          bodyChildren.push(
            new Paragraph({
              heading: headingLevel,
              spacing: { before: 240, after: 120 },
              children: [
                new TextRun({
                  text: `${section.number || ''} ${section.title || ''}`.trim(),
                  bold: true,
                  font: 'Times New Roman',
                  size: fontSize,
                }),
              ],
            })
          );

          const sc = sectionContents.find((c) => c.sectionId === section.id);
          if (sc?.content) {
            const sectionChanges = trackedChanges?.[section.id];
            const paras = htmlToParagraphs(sc.content, sectionChanges);
            bodyChildren.push(...paras);
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
              headers: includeWatermark
                ? { default: createWatermarkHeader() }
                : undefined,
              footers: {
                default: new Footer({
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: [
                        new TextRun({
                          text: `${proposal.acronym || 'Proposal'} — `,
                          font: 'Times New Roman',
                          size: 18,
                          color: '808080',
                        }),
                        new TextRun({
                          children: ['Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES],
                          font: 'Times New Roman',
                          size: 18,
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
        const filename = `${proposal.acronym || 'proposal'}_Part_B${includeWatermark ? '_draft' : ''}.docx`;
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
