import { useCallback } from 'react';
import jsPDF from 'jspdf';
import { toast } from 'sonner';
import { Proposal, Section } from '@/types/proposal';

interface SectionContent {
  id: string;
  sectionId: string;
  content: string;
}

interface ExportData {
  proposal: Proposal;
  sectionContents: SectionContent[];
  sections: Section[];
}

// Convert mm to pt for jsPDF (1mm = 2.835pt)
const mmToPt = (mm: number) => mm * 2.835;

export function usePdfExport() {
  // Helper: Add watermark to all pages
  const addWatermarkToAllPages = (pdf: jsPDF) => {
    const totalPages = pdf.internal.pages.length - 1;
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    
    for (let i = 1; i <= totalPages; i++) {
      pdf.setPage(i);
      
      // Save current graphics state
      pdf.saveGraphicsState();
      
      // Set watermark style - semi-transparent red
      pdf.setTextColor(220, 38, 38); // Red color
      pdf.setFontSize(60);
      pdf.setFont('times', 'bold');
      
      // Calculate center position
      const centerX = pageWidth / 2;
      const centerY = pageHeight / 2;
      
      // Create GState for transparency (0.15 = 15% opacity)
      const gState = pdf.GState({ opacity: 0.15 });
      pdf.setGState(gState);
      
      // Draw rotated text (45 degrees diagonal)
      const text = 'Confidential draft';
      
      // Translate to center, rotate, then draw
      pdf.text(text, centerX, centerY, {
        align: 'center',
        angle: 45,
      });
      
      // Restore graphics state
      pdf.restoreGraphicsState();
    }
  };

  const exportProposalToPdf = useCallback(async (data: ExportData, options?: { includeWatermark?: boolean }) => {
    const { proposal, sectionContents, sections } = data;
    const includeWatermark = options?.includeWatermark ?? true; // Default to including watermark

    try {
      toast.info('Generating PDF...');

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 15; // 1.5cm margins
      const contentWidth = pageWidth - margin * 2;
      let yPosition = margin + 10; // Leave space for header

      // Track current section for footer
      let currentSectionName = '';

      // Colors
      const black: [number, number, number] = [0, 0, 0];
      const gray: [number, number, number] = [128, 128, 128];

      // Font sizes in pt (jsPDF uses pt for setFontSize)
      const FONT_SIZE_TITLE = 14;
      const FONT_SIZE_H1 = 13;
      const FONT_SIZE_H2 = 12;
      const FONT_SIZE_BODY = 11;
      const FONT_SIZE_HEADER_FOOTER = 8;

      // Line heights in mm (approximation based on font size)
      const lineHeightBody = 4.5; // For 11pt with line spacing 1
      const paragraphSpacing = 1.1; // 3pt ≈ 1.1mm
      const paragraphSpacingH1 = 3.2; // 9pt ≈ 3.2mm before H1
      const paragraphSpacingH2 = 2.1; // 6pt ≈ 2.1mm before H2
      const titleParagraphSpacing = 4.2; // 12pt ≈ 4.2mm

      // Helper: Check if we need a new page
      const checkPageBreak = (requiredSpace: number): boolean => {
        const footerSpace = 15;
        if (yPosition + requiredSpace > pageHeight - margin - footerSpace) {
          pdf.addPage();
          yPosition = margin + 10; // Reset with header space
          return true;
        }
        return false;
      };

      // Helper: Add header to a page
      const addHeader = () => {
        pdf.setFontSize(FONT_SIZE_HEADER_FOOTER);
        pdf.setFont('times', 'normal');
        pdf.setTextColor(...gray);
        const headerText = `${proposal.topicId || ''} ${proposal.topicTitle || proposal.title}`;
        const truncatedHeader = headerText.length > 100 ? headerText.substring(0, 97) + '...' : headerText;
        pdf.text(truncatedHeader, pageWidth / 2, margin, { align: 'center' });
      };

      // Helper: Add footer to a page
      const addFooter = (pageNum: number, totalPages: number, sectionName: string) => {
        pdf.setFontSize(FONT_SIZE_HEADER_FOOTER);
        pdf.setTextColor(...gray);
        
        const footerY = pageHeight - margin + 5;
        const centerX = pageWidth / 2;
        
        // Build footer: "ACRONYM (Stage 1 of 2) | Part BX.X. Subsection title | Page X of X"
        const acronymText = proposal.acronym;
        const stageText = ' (Stage 1 of 2) | ';
        const sectionText = sectionName ? `Part ${sectionName}` : '';
        const pageText = ` | Page ${pageNum} of ${totalPages}`;
        
        // Calculate total width to center properly
        pdf.setFont('times', 'bold');
        const acronymWidth = pdf.getTextWidth(acronymText);
        pdf.setFont('times', 'normal');
        const stageWidth = pdf.getTextWidth(stageText);
        const sectionWidth = pdf.getTextWidth(sectionText);
        const pageWidth2 = pdf.getTextWidth(pageText);
        const totalWidth = acronymWidth + stageWidth + sectionWidth + pageWidth2;
        
        // Start position for centered text
        let xPos = centerX - totalWidth / 2;
        
        // Draw acronym in bold
        pdf.setFont('times', 'bold');
        pdf.text(acronymText, xPos, footerY);
        xPos += acronymWidth;
        
        // Draw rest in normal
        pdf.setFont('times', 'normal');
        pdf.text(stageText, xPos, footerY);
        xPos += stageWidth;
        pdf.text(sectionText, xPos, footerY);
        xPos += sectionWidth;
        pdf.text(pageText, xPos, footerY);
      };

      // Helper: Add title (14pt bold, 12pt paragraph spacing after)
      const addTitle = (text: string) => {
        checkPageBreak(15);
        pdf.setFontSize(FONT_SIZE_TITLE);
        pdf.setFont('times', 'bold');
        pdf.setTextColor(...black);
        
        const lines = pdf.splitTextToSize(text, contentWidth);
        for (const line of lines) {
          checkPageBreak(6);
          pdf.text(line, margin, yPosition);
          yPosition += 5.5;
        }
        yPosition += titleParagraphSpacing;
      };

      // Helper: Add H1 heading (13pt bold, 9pt before, 6pt after)
      const addH1 = (text: string) => {
        yPosition += paragraphSpacingH1; // 9pt before
        checkPageBreak(12);
        pdf.setFontSize(FONT_SIZE_H1);
        pdf.setFont('times', 'bold');
        pdf.setTextColor(...black);
        
        pdf.text(text, margin, yPosition);
        yPosition += 5 + paragraphSpacingH2; // Line height + 6pt after
        currentSectionName = text;
      };

      // Helper: Add H2 heading (12pt bold, 6pt before, 6pt after)
      const addH2 = (text: string) => {
        yPosition += paragraphSpacingH2; // 6pt before
        checkPageBreak(10);
        pdf.setFontSize(FONT_SIZE_H2);
        pdf.setFont('times', 'bold');
        pdf.setTextColor(...black);
        
        pdf.text(text, margin, yPosition);
        yPosition += 4.5 + paragraphSpacingH2; // Line height + 6pt after
        currentSectionName = text;
      };

      // Helper: Add body paragraph (11pt, 3pt before and after)
      const addParagraph = (text: string) => {
        if (!text.trim()) return;
        
        yPosition += paragraphSpacing; // 3pt before
        pdf.setFontSize(FONT_SIZE_BODY);
        pdf.setFont('times', 'normal');
        pdf.setTextColor(...black);
        
        const lines = pdf.splitTextToSize(text, contentWidth);
        for (const line of lines) {
          checkPageBreak(lineHeightBody);
          pdf.text(line, margin, yPosition);
          yPosition += lineHeightBody;
        }
        yPosition += paragraphSpacing; // 3pt after
      };

      // Helper: Parse HTML content and extract text with formatting
      const parseHtmlContent = (html: string): { type: 'paragraph' | 'h3'; text: string }[] => {
        if (!html) return [];
        
        const result: { type: 'paragraph' | 'h3'; text: string }[] = [];
        
        // Split by block elements
        const blocks = html
          .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n[[H3]]$1[[/H3]]\n')
          .replace(/<p[^>]*>/gi, '\n')
          .replace(/<\/p>/gi, '\n')
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<div[^>]*>/gi, '\n')
          .replace(/<\/div>/gi, '\n')
          .split('\n');
        
        for (const block of blocks) {
          // Check for H3
          const h3Match = block.match(/\[\[H3\]\](.*?)\[\[\/H3\]\]/);
          if (h3Match) {
            const text = h3Match[1]
              .replace(/<[^>]+>/g, '')
              .replace(/&nbsp;/g, ' ')
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/\s+/g, ' ')
              .trim();
            if (text) {
              result.push({ type: 'h3', text });
            }
            continue;
          }
          
          // Regular paragraph
          const plainText = block
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/\s+/g, ' ')
            .trim();
          
          if (plainText) {
            result.push({ type: 'paragraph', text: plainText });
          }
        }
        
        return result;
      };

      // Helper: Add H3 (inline, bold and underlined, 11pt)
      const addH3 = (text: string) => {
        yPosition += paragraphSpacing;
        checkPageBreak(lineHeightBody);
        
        pdf.setFontSize(FONT_SIZE_BODY);
        pdf.setFont('times', 'bold');
        pdf.setTextColor(...black);
        
        // Draw text with underline
        const textWidth = pdf.getTextWidth(text);
        pdf.text(text, margin, yPosition);
        
        // Add underline
        const underlineY = yPosition + 0.5;
        pdf.setDrawColor(...black);
        pdf.setLineWidth(0.1);
        pdf.line(margin, underlineY, margin + textWidth, underlineY);
        
        yPosition += lineHeightBody + paragraphSpacing;
      };

      // Helper: Get section content
      const getSectionContent = (sectionId: string): string => {
        const content = sectionContents.find(sc => sc.sectionId === sectionId);
        return content?.content || '';
      };

      // Find the relevant sections
      const findSection = (idPattern: string): Section | undefined => {
        // First check top-level
        for (const section of sections) {
          if (section.id === idPattern || section.number === idPattern) {
            return section;
          }
          // Check subsections
          if (section.subsections) {
            for (const sub of section.subsections) {
              if (sub.id === idPattern || sub.number === idPattern) {
                return sub;
              }
            }
          }
        }
        return undefined;
      };

      // ========== DOCUMENT CONTENT ==========

      // Add header to first page
      addHeader();

      // Title: Proposal title followed by acronym in parentheses
      addTitle(`${proposal.title} (${proposal.acronym})`);

      // Part B1 heading as H1
      const b1Section = findSection('b1') || findSection('B1');
      addH1(`${b1Section?.number || 'B1'} ${b1Section?.title || 'Excellence'}`);

      // B1.1 with heading as H2 followed by content
      const b1_1Section = findSection('b1-1') || findSection('b1.1') || findSection('B1.1');
      if (b1_1Section) {
        addH2(`${b1_1Section.number} ${b1_1Section.title}`);
        const b1_1Content = getSectionContent(b1_1Section.id);
        const b1_1Blocks = parseHtmlContent(b1_1Content);
        for (const block of b1_1Blocks) {
          if (block.type === 'h3') {
            addH3(block.text);
          } else {
            addParagraph(block.text);
          }
        }
        if (!b1_1Content) {
          addParagraph('[Section content to be completed]');
        }
      }

      // B1.2 with heading as H2 followed by content
      const b1_2Section = findSection('b1-2') || findSection('b1.2') || findSection('B1.2');
      if (b1_2Section) {
        addH2(`${b1_2Section.number} ${b1_2Section.title}`);
        const b1_2Content = getSectionContent(b1_2Section.id);
        const b1_2Blocks = parseHtmlContent(b1_2Content);
        for (const block of b1_2Blocks) {
          if (block.type === 'h3') {
            addH3(block.text);
          } else {
            addParagraph(block.text);
          }
        }
        if (!b1_2Content) {
          addParagraph('[Section content to be completed]');
        }
      }

      // Part B2 heading as H1
      const b2Section = findSection('b2') || findSection('B2');
      addH1(`${b2Section?.number || 'B2'} ${b2Section?.title || 'Impact'}`);

      // B2.1 with heading as H2 followed by content
      const b2_1Section = findSection('b2-1') || findSection('b2.1') || findSection('B2.1');
      if (b2_1Section) {
        addH2(`${b2_1Section.number} ${b2_1Section.title}`);
        const b2_1Content = getSectionContent(b2_1Section.id);
        const b2_1Blocks = parseHtmlContent(b2_1Content);
        for (const block of b2_1Blocks) {
          if (block.type === 'h3') {
            addH3(block.text);
          } else {
            addParagraph(block.text);
          }
        }
        if (!b2_1Content) {
          addParagraph('[Section content to be completed]');
        }
      }

      // Add headers and footers to all pages
      const totalPages = pdf.internal.pages.length - 1;
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        addHeader();
        addFooter(i, totalPages, currentSectionName);
      }

      // Add watermark to all pages if enabled
      if (includeWatermark) {
        addWatermarkToAllPages(pdf);
      }

      // Save with appropriate filename
      const watermarkSuffix = includeWatermark ? '' : '_final';
      const filename = `${proposal.acronym}_Part_B_${new Date().toISOString().split('T')[0]}${watermarkSuffix}.pdf`;
      pdf.save(filename);

      toast.success('PDF exported successfully!');
    } catch (error) {
      console.error('PDF export error:', error);
      toast.error('Failed to export PDF. Please try again.');
    }
  }, []);

  // Legacy simple export for backward compatibility
  const exportToPdf = useCallback(
    async (options: { title: string; acronym: string; sections: Array<{ number: string; title: string; content: string }> }) => {
      const { title, acronym, sections } = options;

      try {
        toast.info('Generating PDF...');

        const pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4',
        });

        const pageWidth = pdf.internal.pageSize.getWidth();
        const margin = 15;
        const contentWidth = pageWidth - margin * 2;
        let yPosition = margin;

        // Title
        pdf.setFontSize(14);
        pdf.setFont('times', 'bold');
        pdf.text(`${title} (${acronym})`, margin, yPosition);
        yPosition += 10;

        // Sections
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
    []
  );

  return { exportToPdf, exportProposalToPdf };
}
