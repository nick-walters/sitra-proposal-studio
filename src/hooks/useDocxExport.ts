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

// Font sizes in half-points (Word uses half-points: 22 = 11pt)
const FONT_SIZE_BODY = 22;        // 11pt
const FONT_SIZE_TITLE = 28;       // 14pt
const FONT_SIZE_H1 = 26;          // 13pt
const FONT_SIZE_H2 = 24;          // 12pt
const FONT_SIZE_H3 = 22;          // 11pt
const FONT_SIZE_FOOTER = 16;      // 8pt
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

/**
 * Check if a section is a Part B H1 container (B1, B2, B3)
 */
function isH1Container(section: Section): boolean {
  return !section.isPartA && !!section.number && /^B?\d+$/.test(section.number.replace(/^B/, ''));
}

/**
 * Check if a section is a Part B content section (B1.1, B2.1, etc.)
 */
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

        // Check for track change marks
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
          // Recurse into spans (track change wrappers, styled spans, etc.)
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

function createWatermarkHeader(): Header {
  return new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: 'CONFIDENTIAL DRAFT',
            font: FONT_FAMILY,
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
            // H1: 13pt bold
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
            // H2: 12pt bold
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
          }
        }

        const doc = new Document({
          sections: [
            {
              properties: {
                page: {
                  margin: {
                    top: convertMillimetersToTwip(15),    // 1.5cm
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
