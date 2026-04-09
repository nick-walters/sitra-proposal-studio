import { useCallback } from 'react';
import jsPDF from 'jspdf';
import { toast } from 'sonner';
import { Proposal, Section, Participant } from '@/types/proposal';
import { supabase } from '@/integrations/supabase/client';
import { resolveStorageUrl } from '@/hooks/useStorageUrl';

/** Convert hex color string to RGB tuple */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)];
}

interface SectionContent {
  id: string;
  sectionId: string;
  content: string;
}

interface B31Deliverable {
  id: string;
  number: string;
  name: string;
  description: string;
  wp_number: number | null;
  lead_participant_id: string | null;
  type: string | null;
  dissemination_level: string | null;
  due_month: number | null;
}

interface B31Milestone {
  id: string;
  number: number;
  name: string;
  wps: string;
  due_month: number | null;
  means_of_verification: string;
}

interface B31Risk {
  id: string;
  number: number;
  description: string;
  wps: string;
  likelihood: string | null;
  severity: string | null;
  mitigation: string;
}

interface ExportData {
  proposal: Proposal;
  sectionContents: SectionContent[];
  sections: Section[];
  participants?: Participant[];
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
    const { proposal, sectionContents, sections, participants = [] } = data;
    const includeWatermark = options?.includeWatermark ?? true; // Default to including watermark

    try {
      toast.info('Generating PDF...');

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      // Load and embed Arial Black font for full proposals
      let arialBlackLoaded = false;
      if (proposal.submissionStage !== 'stage_1') {
        try {
          const fontResponse = await fetch('/fonts/arial_black.ttf');
          if (fontResponse.ok) {
            const fontBuffer = await fontResponse.arrayBuffer();
            const fontBase64 = btoa(
              new Uint8Array(fontBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
            );
            pdf.addFileToVFS('ArialBlack.ttf', fontBase64);
            pdf.addFont('ArialBlack.ttf', 'ArialBlack', 'normal');
            arialBlackLoaded = true;
          }
        } catch (e) {
          console.warn('Could not load Arial Black font, falling back to Helvetica Bold');
        }
      }

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 15; // 1.5cm margins
      const contentWidth = pageWidth - margin * 2;
      let yPosition = margin; // Start content at exactly the margin (1.5cm)
      let isTopOfPage = true; // Track whether we're at the top of a page (no spacing before first element)

      // Track current section for footer - maps page number to section name
      let currentSectionName = '';
      const pageSectionMap: Map<number, string> = new Map();
      
      // Helper to record current section for current page (always updates to latest section)
      const updatePageSection = () => {
        const currentPage = pdf.internal.pages.length - 1;
        // Always update to latest section - if multiple sections on same page, use the later one
        pageSectionMap.set(currentPage, currentSectionName);
      };

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
          yPosition = margin; // Reset to margin (1.5cm from top)
          isTopOfPage = true;
          // Record section for the new page
          updatePageSection();
          return true;
        }
        return false;
      };

      // Helper: Add header to a page
      const addHeader = () => {
        pdf.setFontSize(FONT_SIZE_HEADER_FOOTER);
        pdf.setFont('times', 'normal');
        pdf.setTextColor(...gray);
        // Format: "Topic ID: Topic title (type of action)"
        const topicId = proposal.topicId || '';
        const topicTitle = proposal.topicTitle || proposal.title || '';
        const topicType = proposal.type || '';
        const headerText = `${topicId}${topicId && topicTitle ? ': ' : ''}${topicTitle}${topicType ? ` (${topicType})` : ''}`;
        const truncatedHeader = headerText.length > 120 ? headerText.substring(0, 117) + '...' : headerText;
        pdf.text(truncatedHeader, pageWidth / 2, 8, { align: 'center' }); // Header in top margin area (8mm from top)
      };

      // Helper: Add footer to a page
      const addFooter = (pageNum: number, totalPages: number, sectionName: string) => {
        pdf.setFontSize(FONT_SIZE_HEADER_FOOTER);
        pdf.setTextColor(...gray);
        
        const footerY = pageHeight - margin + 5;
        const centerX = pageWidth / 2;
        
        // Build footer: "ACRONYM (Stage 1 of 2) | Section info | Page X of X"
        // For "List of participants" don't add "Part " prefix
        const acronymText = proposal.acronym;
        const stageText = proposal.submissionStage === 'stage_1' ? ' (Stage 1 of 2) | ' : ' | ';
        const isListOfParticipants = sectionName === 'List of participants';
        const sectionText = sectionName ? (isListOfParticipants ? sectionName : `Part ${sectionName}`) : '';
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

      // Helper: Add title (14pt bold, 12pt paragraph spacing after) - CENTERED
      // For full proposals (not stage_1), use Sitra branding: "Acronym: Title" in Arial Black
      const addTitle = (titleText: string, acronymText: string) => {
        checkPageBreak(15);
        pdf.setTextColor(...black);
        
        const isPreProposal = proposal.submissionStage === 'stage_1';
        
        if (isPreProposal) {
          // Pre-proposal: Times New Roman for both
          const fullText = `${titleText} (${acronymText})`;
          pdf.setFontSize(FONT_SIZE_TITLE);
          pdf.setFont('times', 'bold');
          const lines = pdf.splitTextToSize(fullText, contentWidth);
          for (const line of lines) {
            checkPageBreak(6);
            pdf.text(line, pageWidth / 2, yPosition, { align: 'center' });
            yPosition += 5.5;
          }
        } else {
          // Full proposal: Sitra branding - "Acronym: Title" all in Arial Black
          pdf.setFontSize(FONT_SIZE_TITLE);
          if (arialBlackLoaded) {
            pdf.setFont('ArialBlack', 'normal'); // Use actual Arial Black
          } else {
            pdf.setFont('helvetica', 'bold'); // Fallback to helvetica bold
          }
          
          const fullText = `${acronymText}: ${titleText}`;
          const lines = pdf.splitTextToSize(fullText, contentWidth);
          for (const line of lines) {
            checkPageBreak(6);
            pdf.text(line, pageWidth / 2, yPosition, { align: 'center' });
            yPosition += 5.5;
          }
        }
        
        yPosition += titleParagraphSpacing;
        isTopOfPage = false;
      };

      // Helper: Add H1 heading (13pt bold, 9pt before, 6pt after)
      const addH1 = (text: string) => {
        if (!isTopOfPage) {
          yPosition += paragraphSpacingH1; // 9pt before (skip if at top of page)
        }
        checkPageBreak(12);
        pdf.setFontSize(FONT_SIZE_H1);
        pdf.setFont('times', 'bold');
        pdf.setTextColor(...black);
        
        pdf.text(text, margin, yPosition);
        yPosition += 5 + paragraphSpacingH2; // Line height + 6pt after
        currentSectionName = text;
        isTopOfPage = false;
      };

      // Helper: Add H2 heading (12pt bold, 6pt before, 0pt after)
      const addH2 = (text: string) => {
        if (!isTopOfPage) {
          yPosition += paragraphSpacingH2; // 6pt before
        }
        checkPageBreak(10);
        pdf.setFontSize(FONT_SIZE_H2);
        pdf.setFont('times', 'bold');
        pdf.setTextColor(...black);
        
        pdf.text(text, margin, yPosition);
        yPosition += 4.5; // Line height, 0pt after
        currentSectionName = text;
        isTopOfPage = false;
      };

      // Helper: Add body paragraph with justified text and rich formatting (11pt, 3pt before and after)
      const addParagraph = (text: string, segments?: TextSegment[]) => {
        if (!text.trim() && (!segments || segments.length === 0)) return;
        
        if (!isTopOfPage) {
          yPosition += paragraphSpacing; // 3pt before
        }
        pdf.setFontSize(FONT_SIZE_BODY);
        pdf.setTextColor(...black);
        
        if (segments && segments.length > 0) {
          renderRichTextJustified(segments, margin, contentWidth);
        } else {
          // Plain text fallback - justified
          renderPlainTextJustified(text, margin, contentWidth);
        }
        isTopOfPage = false;
        yPosition += paragraphSpacing; // 3pt after
      };

      // Maximum gap multiplier for justified text - prevents excessive stretching
      const MAX_GAP_MULTIPLIER = 2.5; // Gap can be at most 2.5x normal space width

      // Helper: Render plain text with justified alignment
      const renderPlainTextJustified = (text: string, x: number, maxWidth: number) => {
        pdf.setFont('times', 'normal');
        const words = text.split(/\s+/).filter(w => w.length > 0);
        if (words.length === 0) return;
        
        let currentLineWords: string[] = [];
        let currentLineWidth = 0;
        const spaceWidth = pdf.getTextWidth(' ');
        
        for (const word of words) {
          const wordWidth = pdf.getTextWidth(word);
          const testWidth = currentLineWidth + (currentLineWords.length > 0 ? spaceWidth : 0) + wordWidth;
          
          if (testWidth > maxWidth && currentLineWords.length > 0) {
            // Flush current line - justified (with gap cap)
            checkPageBreak(lineHeightBody);
            drawJustifiedLine(currentLineWords, x, yPosition, maxWidth, 'normal', false, false);
            yPosition += lineHeightBody;
            currentLineWords = [word];
            currentLineWidth = wordWidth;
          } else {
            currentLineWords.push(word);
            currentLineWidth = testWidth;
          }
        }
        
        // Last line - left aligned
        if (currentLineWords.length > 0) {
          checkPageBreak(lineHeightBody);
          pdf.setFont('times', 'normal');
          pdf.text(currentLineWords.join(' '), x, yPosition);
          yPosition += lineHeightBody;
        }
      };

      // Helper: Draw a single justified line of words (with gap capping)
      const drawJustifiedLine = (words: string[], x: number, y: number, maxWidth: number, fontStyle: string, _bold: boolean, _italic: boolean) => {
        if (words.length <= 1) {
          pdf.setFont('times', fontStyle);
          pdf.text(words.join(' '), x, y);
          return;
        }
        
        pdf.setFont('times', fontStyle);
        const spaceWidth = pdf.getTextWidth(' ');
        const totalTextWidth = words.reduce((sum, w) => sum + pdf.getTextWidth(w), 0);
        const totalSpacing = maxWidth - totalTextWidth;
        const spacePerGap = totalSpacing / (words.length - 1);
        
        // If gap would be too wide, fall back to left-aligned
        if (spacePerGap > spaceWidth * MAX_GAP_MULTIPLIER) {
          pdf.text(words.join(' '), x, y);
          return;
        }
        
        let curX = x;
        for (let i = 0; i < words.length; i++) {
          pdf.text(words[i], curX, y);
          curX += pdf.getTextWidth(words[i]) + spacePerGap;
        }
      };

      // Types for rich text segments
      type TextSegment = {
        text: string;
        bold: boolean;
        italic: boolean;
        underline: boolean;
        superscript: boolean;
      };

      // Helper: Render rich text segments with justified alignment
      const renderRichTextJustified = (segments: TextSegment[], x: number, maxWidth: number) => {
        // Split all segments into individual words with their formatting
        type FormattedWord = { word: string; bold: boolean; italic: boolean; underline: boolean; superscript: boolean };
        const allWords: FormattedWord[] = [];
        
        for (const seg of segments) {
          const words = seg.text.split(/\s+/).filter(w => w.length > 0);
          for (const word of words) {
            allWords.push({ word, bold: seg.bold, italic: seg.italic, underline: seg.underline, superscript: seg.superscript });
          }
        }
        
        if (allWords.length === 0) return;
        
        const getWordWidth = (fw: FormattedWord): number => {
          const style = fw.bold && fw.italic ? 'bolditalic' : fw.bold ? 'bold' : fw.italic ? 'italic' : 'normal';
          if (fw.superscript) {
            pdf.setFontSize(FONT_SIZE_BODY * 0.7);
            pdf.setFont('times', style);
            const w = pdf.getTextWidth(fw.word);
            pdf.setFontSize(FONT_SIZE_BODY);
            return w;
          }
          pdf.setFont('times', style);
          return pdf.getTextWidth(fw.word);
        };
        
        const spaceWidth = (() => { pdf.setFont('times', 'normal'); return pdf.getTextWidth(' '); })();
        
        // Break into lines
        type Line = FormattedWord[];
        const lines: Line[] = [];
        let currentLine: FormattedWord[] = [];
        let currentLineWidth = 0;
        
        for (const fw of allWords) {
          const ww = getWordWidth(fw);
          const testWidth = currentLineWidth + (currentLine.length > 0 ? spaceWidth : 0) + ww;
          
          if (testWidth > maxWidth && currentLine.length > 0) {
            lines.push(currentLine);
            currentLine = [fw];
            currentLineWidth = ww;
          } else {
            currentLine.push(fw);
            currentLineWidth = testWidth;
          }
        }
        if (currentLine.length > 0) lines.push(currentLine);
        
        // Render each line
        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
          const line = lines[lineIdx];
          const isLastLine = lineIdx === lines.length - 1;
          
          checkPageBreak(lineHeightBody);
          
          if (isLastLine || line.length <= 1) {
            // Last line or single word: left-aligned
            let curX = x;
            for (let i = 0; i < line.length; i++) {
              const fw = line[i];
              const style = fw.bold && fw.italic ? 'bolditalic' : fw.bold ? 'bold' : fw.italic ? 'italic' : 'normal';
              
              if (fw.superscript) {
                pdf.setFontSize(FONT_SIZE_BODY * 0.7);
                pdf.setFont('times', style);
                pdf.text(fw.word, curX, yPosition - 1.5);
                const ww = pdf.getTextWidth(fw.word);
                pdf.setFontSize(FONT_SIZE_BODY);
                curX += ww;
              } else {
                pdf.setFont('times', style);
                pdf.text(fw.word, curX, yPosition);
                if (fw.underline) {
                  const ww = pdf.getTextWidth(fw.word);
                  pdf.setDrawColor(...black);
                  pdf.setLineWidth(0.1);
                  pdf.line(curX, yPosition + 0.5, curX + ww, yPosition + 0.5);
                }
                curX += pdf.getTextWidth(fw.word);
              }
              if (i < line.length - 1) curX += spaceWidth;
            }
          } else {
            // Justified line (with gap capping)
            const spaceWidthRef = (() => { pdf.setFont('times', 'normal'); pdf.setFontSize(FONT_SIZE_BODY); return pdf.getTextWidth(' '); })();
            const totalWordWidth = line.reduce((sum, fw) => sum + getWordWidth(fw), 0);
            const totalSpacing = maxWidth - totalWordWidth;
            const gapPerSpace = totalSpacing / (line.length - 1);
            
            // If gap would be too wide, fall back to left-aligned
            if (gapPerSpace > spaceWidthRef * MAX_GAP_MULTIPLIER) {
              let cx = x;
              for (let j = 0; j < line.length; j++) {
                const fw = line[j];
                const style2 = fw.bold && fw.italic ? 'bolditalic' : fw.bold ? 'bold' : fw.italic ? 'italic' : 'normal';
                if (fw.superscript) {
                  pdf.setFontSize(FONT_SIZE_BODY * 0.7);
                  pdf.setFont('times', style2);
                  pdf.text(fw.word, cx, yPosition - 1.5);
                  cx += pdf.getTextWidth(fw.word);
                  pdf.setFontSize(FONT_SIZE_BODY);
                } else {
                  pdf.setFont('times', style2);
                  pdf.text(fw.word, cx, yPosition);
                  cx += pdf.getTextWidth(fw.word);
                }
                if (j < line.length - 1) cx += spaceWidth;
              }
            } else {
            
            let curX = x;
            for (let i = 0; i < line.length; i++) {
              const fw = line[i];
              const style = fw.bold && fw.italic ? 'bolditalic' : fw.bold ? 'bold' : fw.italic ? 'italic' : 'normal';
              
              if (fw.superscript) {
                pdf.setFontSize(FONT_SIZE_BODY * 0.7);
                pdf.setFont('times', style);
                pdf.text(fw.word, curX, yPosition - 1.5);
                curX += pdf.getTextWidth(fw.word);
                pdf.setFontSize(FONT_SIZE_BODY);
              } else {
                pdf.setFont('times', style);
                pdf.text(fw.word, curX, yPosition);
                if (fw.underline) {
                  const ww = pdf.getTextWidth(fw.word);
                  pdf.setDrawColor(...black);
                  pdf.setLineWidth(0.1);
                  pdf.line(curX, yPosition + 0.5, curX + ww, yPosition + 0.5);
                }
                curX += pdf.getTextWidth(fw.word);
              }
              if (i < line.length - 1) curX += gapPerSpace;
            }
            }
          }
          yPosition += lineHeightBody;
        }
      };

      // Helper: Add list (bullet or numbered) with justified text and rich formatting
      const addList = (items: { text: string; segments?: TextSegment[] }[], ordered: boolean) => {
        const listIndent = 5; // mm indent for list items
        const bulletWidth = ordered ? 6 : 3; // space for bullet/number
        
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (!item.text.trim()) continue;
          
          if (!isTopOfPage) {
            yPosition += paragraphSpacing;
          }
          
          checkPageBreak(lineHeightBody);
          pdf.setFontSize(FONT_SIZE_BODY);
          pdf.setTextColor(...black);
          pdf.setFont('times', 'normal');
          
          // Draw bullet or number
          const bulletX = margin + listIndent;
          if (ordered) {
            pdf.text(`${i + 1}.`, bulletX - bulletWidth, yPosition);
          } else {
            // Draw a filled circle as bullet
            pdf.circle(bulletX - 1.5, yPosition - 1, 0.6, 'F');
          }
          
          // Draw text after bullet with justified alignment
          const textX = bulletX + 1;
          const textWidth = contentWidth - listIndent - 1;
          
          if (item.segments && item.segments.length > 0) {
            // Temporarily shift margin for rich text rendering
            const savedY = yPosition;
            // Adjust segments to render at the right position
            const adjustedSegments = item.segments;
            
            // Manual justified rendering within the indent
            type FormattedWord = { word: string; bold: boolean; italic: boolean; underline: boolean; superscript: boolean };
            const allWords: FormattedWord[] = [];
            for (const seg of adjustedSegments) {
              const words = seg.text.split(/\s+/).filter(w => w.length > 0);
              for (const word of words) {
                allWords.push({ word, bold: seg.bold, italic: seg.italic, underline: seg.underline, superscript: seg.superscript });
              }
            }
            
            if (allWords.length === 0) continue;
            
            const getWW = (fw: FormattedWord): number => {
              const style = fw.bold && fw.italic ? 'bolditalic' : fw.bold ? 'bold' : fw.italic ? 'italic' : 'normal';
              pdf.setFont('times', style);
              return pdf.getTextWidth(fw.word);
            };
            const sw = (() => { pdf.setFont('times', 'normal'); return pdf.getTextWidth(' '); })();
            
            // Break into lines
            const lines: FormattedWord[][] = [];
            let curLine: FormattedWord[] = [];
            let curW = 0;
            for (const fw of allWords) {
              const ww = getWW(fw);
              const test = curW + (curLine.length > 0 ? sw : 0) + ww;
              if (test > textWidth && curLine.length > 0) {
                lines.push(curLine);
                curLine = [fw];
                curW = ww;
              } else {
                curLine.push(fw);
                curW = test;
              }
            }
            if (curLine.length > 0) lines.push(curLine);
            
            for (let li = 0; li < lines.length; li++) {
              const line = lines[li];
              const isLast = li === lines.length - 1;
              checkPageBreak(lineHeightBody);
              
              if (isLast || line.length <= 1) {
                let cx = textX;
                for (let j = 0; j < line.length; j++) {
                  const fw = line[j];
                  const style = fw.bold && fw.italic ? 'bolditalic' : fw.bold ? 'bold' : fw.italic ? 'italic' : 'normal';
                  pdf.setFont('times', style);
                  pdf.text(fw.word, cx, yPosition);
                  if (fw.underline) {
                    const ww = pdf.getTextWidth(fw.word);
                    pdf.setLineWidth(0.1);
                    pdf.line(cx, yPosition + 0.5, cx + ww, yPosition + 0.5);
                  }
                  cx += pdf.getTextWidth(fw.word) + (j < line.length - 1 ? sw : 0);
                }
              } else {
                const totalWW = line.reduce((s, fw) => s + getWW(fw), 0);
                const gap = (textWidth - totalWW) / (line.length - 1);
                // Cap gap to prevent excessive stretching
                const useJustify = gap <= sw * MAX_GAP_MULTIPLIER;
                let cx = textX;
                for (let j = 0; j < line.length; j++) {
                  const fw = line[j];
                  const style = fw.bold && fw.italic ? 'bolditalic' : fw.bold ? 'bold' : fw.italic ? 'italic' : 'normal';
                  pdf.setFont('times', style);
                  pdf.text(fw.word, cx, yPosition);
                  if (fw.underline) {
                    const ww = pdf.getTextWidth(fw.word);
                    pdf.setLineWidth(0.1);
                    pdf.line(cx, yPosition + 0.5, cx + ww, yPosition + 0.5);
                  }
                  cx += getWW(fw) + (j < line.length - 1 ? (useJustify ? gap : sw) : 0);
                }
              }
              yPosition += lineHeightBody;
            }
          } else {
            // Plain text list item
            const listLines = pdf.splitTextToSize(item.text, textWidth);
            for (const line of listLines) {
              checkPageBreak(lineHeightBody);
              pdf.text(line, textX, yPosition);
              yPosition += lineHeightBody;
            }
          }
          
          isTopOfPage = false;
          yPosition += paragraphSpacing;
        }
      };

      type ContentBlock = 
        | { type: 'paragraph'; text: string; segments?: TextSegment[] }
        | { type: 'h3'; text: string }
        | { type: 'image'; src: string; width?: number; height?: number; widthPercent?: number }
        | { type: 'caption'; text: string; captionType: 'figure' | 'table' }
        | { type: 'table'; rows: string[][]; hasHeader: boolean }
        | { type: 'list'; items: { text: string; segments?: TextSegment[] }[]; ordered: boolean };

      // Helper: Load image as base64
      const loadImageAsBase64 = async (src: string): Promise<{ data: string; width: number; height: number } | null> => {
        try {
          return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
              const canvas = document.createElement('canvas');
              canvas.width = img.naturalWidth;
              canvas.height = img.naturalHeight;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(img, 0, 0);
                const data = canvas.toDataURL('image/jpeg', 0.85);
                resolve({ data, width: img.naturalWidth, height: img.naturalHeight });
              } else {
                resolve(null);
              }
            };
            img.onerror = () => resolve(null);
            img.src = src;
          });
        } catch {
          return null;
        }
      };

      // Helper: Parse table HTML into rows
      const parseTableHtml = (tableHtml: string): { rows: string[][]; hasHeader: boolean } => {
        const rows: string[][] = [];
        let hasHeader = false;
        
        // Check for thead
        if (/<thead/i.test(tableHtml)) {
          hasHeader = true;
        }
        
        // Extract all rows
        const rowMatches = tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
        for (const rowHtml of rowMatches) {
          const cells: string[] = [];
          const cellMatches = rowHtml.match(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi) || [];
          for (const cellHtml of cellMatches) {
            const text = cellHtml
              .replace(/<[^>]+>/g, '')
              .replace(/&nbsp;/g, ' ')
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/\s+/g, ' ')
              .trim();
            cells.push(text);
          }
          if (cells.length > 0) {
            rows.push(cells);
          }
        }
        
        // If first row contains th elements, it's a header
        if (!hasHeader && rowMatches[0] && /<th/i.test(rowMatches[0])) {
          hasHeader = true;
        }
        
        return { rows, hasHeader };
      };

      // Helper: Parse HTML content and extract text, images, and tables
      const parseHtmlContent = (html: string): ContentBlock[] => {
        if (!html) return [];
        
        const result: ContentBlock[] = [];
        
        // Use DOM parser for more reliable extraction
        const parser = new DOMParser();
        const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
        const container = doc.body.firstChild as HTMLElement;
        
        if (!container) return [];
        
        // Helper to check if element has a class
        const hasClass = (el: HTMLElement, className: string): boolean => {
          const classAttr = el.getAttribute('class') || el.className || '';
          return classAttr.includes(className);
        };
        
        // Helper to check if text is a caption (starts with Figure/Table X.X.x pattern)
        const isCaptionText = (text: string): { isCaption: boolean; type: 'figure' | 'table' } => {
          const figureMatch = text.match(/^Figure\s+[\d.]+[a-z]?\./i);
          const tableMatch = text.match(/^Table\s+[\d.]+[a-z]?\./i);
          if (figureMatch) return { isCaption: true, type: 'figure' };
          if (tableMatch) return { isCaption: true, type: 'table' };
          return { isCaption: false, type: 'figure' };
        };

        // Helper: Extract inline formatting segments from an element
        const extractSegments = (el: HTMLElement): TextSegment[] => {
          const segments: TextSegment[] = [];
          
          const walk = (node: Node, bold: boolean, italic: boolean, underline: boolean, superscript: boolean) => {
            if (node.nodeType === Node.TEXT_NODE) {
              const text = node.textContent || '';
              if (text) {
                segments.push({ text, bold, italic, underline, superscript });
              }
              return;
            }
            if (node.nodeType !== Node.ELEMENT_NODE) return;
            
            const elem = node as HTMLElement;
            const tag = elem.tagName.toLowerCase();
            
            let b = bold, it = italic, u = underline, sup = superscript;
            if (tag === 'strong' || tag === 'b') b = true;
            if (tag === 'em' || tag === 'i') it = true;
            if (tag === 'u') u = true;
            if (tag === 'sup') sup = true;
            // Check for inline style font-weight bold
            const style = elem.getAttribute('style') || '';
            if (/font-weight:\s*(bold|[6-9]\d{2})/i.test(style)) b = true;
            if (/font-style:\s*italic/i.test(style)) it = true;
            if (/text-decoration[^:]*:\s*underline/i.test(style)) u = true;
            
            for (const child of Array.from(elem.childNodes)) {
              walk(child, b, it, u, sup);
            }
          };
          
          walk(el, false, false, false, false);
          return segments;
        };
        
        // Process nodes recursively
        const processNode = (node: Node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent?.trim();
            if (text) {
              result.push({ type: 'paragraph', text, segments: [{ text, bold: false, italic: false, underline: false, superscript: false }] });
            }
            return;
          }
          
          if (node.nodeType !== Node.ELEMENT_NODE) return;
          
          const element = node as HTMLElement;
          const tagName = element.tagName.toLowerCase();
          
          // Handle images
          if (tagName === 'img') {
            const src = element.getAttribute('src');
            if (src) {
              const width = element.getAttribute('width');
              const height = element.getAttribute('height');
              
              // Check for percentage width in style attribute
              const style = element.getAttribute('style') || '';
              const percentMatch = style.match(/width:\s*([\d.]+)%/);
              const widthPercent = percentMatch ? parseFloat(percentMatch[1]) : undefined;
              
              // Also check for pixel width in style if no attribute width
              const pxMatch = style.match(/width:\s*([\d.]+)px/);
              const styleWidthPx = pxMatch ? parseFloat(pxMatch[1]) : undefined;
              
              result.push({ 
                type: 'image', 
                src,
                width: width ? parseInt(width) : styleWidthPx,
                height: height ? parseInt(height) : undefined,
                widthPercent
              });
            }
            return;
          }
          
          // Handle tables
          if (tagName === 'table') {
            const { rows, hasHeader } = parseTableHtml(element.outerHTML);
            if (rows.length > 0) {
              result.push({ type: 'table', rows, hasHeader });
            }
            return;
          }
          
          // Handle H3
          if (tagName === 'h3') {
            const text = element.textContent?.trim();
            if (text) {
              result.push({ type: 'h3', text });
            }
            return;
          }

          // Handle lists
          if (tagName === 'ul' || tagName === 'ol') {
            const ordered = tagName === 'ol';
            const items: { text: string; segments?: TextSegment[] }[] = [];
            const liElements = element.querySelectorAll(':scope > li');
            for (const li of Array.from(liElements)) {
              const liEl = li as HTMLElement;
              const text = liEl.textContent?.trim() || '';
              const segs = extractSegments(liEl);
              items.push({ text, segments: segs });
            }
            if (items.length > 0) {
              result.push({ type: 'list', items, ordered });
            }
            return;
          }
          
          // Handle paragraphs - check for captions by class or content
          if (tagName === 'p') {
            const text = element.textContent?.trim();
            if (!text) return;
            
            // Check for caption class first
            if (hasClass(element, 'figure-caption')) {
              result.push({ type: 'caption', text, captionType: 'figure' });
              return;
            }
            if (hasClass(element, 'table-caption')) {
              result.push({ type: 'caption', text, captionType: 'table' });
              return;
            }
            
            // Check for caption by content pattern (Figure X.X.x. or Table X.X.x.)
            const captionCheck = isCaptionText(text);
            if (captionCheck.isCaption) {
              result.push({ type: 'caption', text, captionType: captionCheck.type });
              return;
            }
            
            // Regular paragraph with rich text segments
            const segments = extractSegments(element);
            result.push({ type: 'paragraph', text, segments });
            return;
          }
          
          // Handle divs - check for special children and process
          if (tagName === 'div') {
            const hasSpecialChildren = element.querySelector('img, table, h3, ul, ol');
            if (!hasSpecialChildren) {
              const text = element.textContent?.trim();
              if (text) {
                const captionCheck = isCaptionText(text);
                if (captionCheck.isCaption) {
                  result.push({ type: 'caption', text, captionType: captionCheck.type });
                } else {
                  const segments = extractSegments(element);
                  result.push({ type: 'paragraph', text, segments });
                }
              }
              return;
            }
          }
          
          // Process children for other elements
          for (const child of Array.from(node.childNodes)) {
            processNode(child);
          }
        };
        
        // Process all children of the container
        for (const child of Array.from(container.childNodes)) {
          processNode(child);
        }
        
        return result;
      };

      // Helper: Add image to PDF
      const addImage = async (src: string, specifiedWidth?: number, specifiedHeight?: number, widthPercent?: number) => {
        const imageData = await loadImageAsBase64(src);
        if (!imageData) {
          addParagraph('[Image could not be loaded]');
          return;
        }
        
        // Calculate dimensions to fit within content width (max 180mm width for 18cm)
        const maxWidth = Math.min(contentWidth, 180);
        const maxHeight = 120; // Max height in mm
        
        let imgWidthMm: number;
        let imgHeightMm: number;
        
        // If percentage width is specified, use it relative to content width
        if (widthPercent && widthPercent > 0) {
          imgWidthMm = (widthPercent / 100) * contentWidth;
          // Calculate height based on aspect ratio from natural dimensions
          const aspectRatio = imageData.height / imageData.width;
          imgHeightMm = imgWidthMm * aspectRatio;
        } else {
          // Convert pixels to mm (assuming 96 DPI for screen)
          imgWidthMm = (specifiedWidth || imageData.width) * 0.264583;
          imgHeightMm = (specifiedHeight || imageData.height) * 0.264583;
        }
        
        // Scale to fit within bounds
        if (imgWidthMm > maxWidth) {
          const scale = maxWidth / imgWidthMm;
          imgWidthMm *= scale;
          imgHeightMm *= scale;
        }
        if (imgHeightMm > maxHeight) {
          const scale = maxHeight / imgHeightMm;
          imgWidthMm *= scale;
          imgHeightMm *= scale;
        }
        
        // Check if we need a new page
        checkPageBreak(imgHeightMm + 5);
        
        // Center the image
        const xPos = margin + (contentWidth - imgWidthMm) / 2;
        
        pdf.addImage(imageData.data, 'JPEG', xPos, yPosition, imgWidthMm, imgHeightMm);
        // 12pt spacing after image before caption (12pt ≈ 4.2mm)
        yPosition += imgHeightMm + 4.2;
      };

      // Helper: Add caption (whole caption italic, label bold-italic)
      // Table captions: 6pt before, 1pt after (appear above table)
      // Figure captions: 0pt before, 6pt after (appear below figure)
      const addCaption = (text: string, captionType: 'figure' | 'table') => {
        
        
        // Table captions need spacing before (6pt), figure captions need 0pt before
        if (captionType === 'table') {
          yPosition += paragraphSpacingH2; // 6pt before table caption
        }
        // Figure captions: no spacing before (0pt) - the image already has minimal spacing after it
        checkPageBreak(lineHeightBody);
        
        pdf.setFontSize(FONT_SIZE_BODY);
        pdf.setTextColor(...black);
        
        // Find the label part (e.g., "Figure 1.1.a." or "Table 1.1.a.")
        // Match patterns like "Figure 1.1.a.", "Table 2.3.b", "Figure 1.1.a" (with or without final period)
        const labelMatch = text.match(/^((?:Figure|Table)\s+[\d.]+[a-z]?\.?)\s*/i);
        
        
        if (labelMatch) {
          const label = labelMatch[1].endsWith('.') ? labelMatch[1] : labelMatch[1] + '.';
          const rest = text.substring(labelMatch[0].length).trim();
          
          
          // Draw label in bold-italic (jsPDF supports this for Times)
          pdf.setFont('times', 'bolditalic');
          const labelWithSpace = label + ' ';
          const labelWidth = pdf.getTextWidth(labelWithSpace);
          pdf.text(labelWithSpace, margin, yPosition);
          
          // Draw rest in italic
          if (rest) {
            pdf.setFont('times', 'italic');
            const availableWidth = contentWidth - labelWidth;
            const restLines = pdf.splitTextToSize(rest, availableWidth);
            
            if (restLines.length === 1) {
              pdf.text(rest, margin + labelWidth, yPosition);
              yPosition += lineHeightBody;
            } else {
              // First line continues after the label
              pdf.text(restLines[0], margin + labelWidth, yPosition);
              yPosition += lineHeightBody;
              
              // Subsequent lines start at margin
              for (let i = 1; i < restLines.length; i++) {
                checkPageBreak(lineHeightBody);
                pdf.text(restLines[i], margin, yPosition);
                yPosition += lineHeightBody;
              }
            }
          } else {
            yPosition += lineHeightBody;
          }
        } else {
          // No label found, just italic text
          
          pdf.setFont('times', 'italic');
          const lines = pdf.splitTextToSize(text, contentWidth);
          for (const line of lines) {
            checkPageBreak(lineHeightBody);
            pdf.text(line, margin, yPosition);
            yPosition += lineHeightBody;
          }
        }
        
        yPosition += captionType === 'figure' ? paragraphSpacingH2 : paragraphSpacing;
      };

      // Helper: Add table to PDF (matching editor styling: wrapping text, proper borders)
      const addTable = (rows: string[][], hasHeader: boolean) => {
        if (rows.length === 0) return;
        
        const numCols = Math.max(...rows.map(r => r.length));
        const colWidth = contentWidth / numCols;
        const cellPadding = 1.5;
        const lineHeight = 3.8; // line height within cells
        
        pdf.setFontSize(FONT_SIZE_BODY);
        pdf.setDrawColor(...black);
        
        for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
          const row = rows[rowIdx];
          const isHeaderRow = hasHeader && rowIdx === 0;
          
          // Calculate row height based on wrapped text
          let maxLines = 1;
          const cellLines: string[][] = [];
          for (let colIdx = 0; colIdx < numCols; colIdx++) {
            const cellText = row[colIdx] || '';
            const maxTextWidth = colWidth - cellPadding * 2;
            if (isHeaderRow) pdf.setFont('times', 'bold');
            else pdf.setFont('times', 'normal');
            const lines = pdf.splitTextToSize(cellText, maxTextWidth);
            cellLines.push(lines);
            maxLines = Math.max(maxLines, lines.length);
          }
          
          const rowHeight = Math.max(6, maxLines * lineHeight + 2);
          checkPageBreak(rowHeight);
          
          const rowTop = yPosition - 4;
          
          // Draw row background for header
          if (isHeaderRow) {
            pdf.setFillColor(0, 0, 0);
            pdf.rect(margin, rowTop, contentWidth, rowHeight, 'F');
          }
          
          // Draw cell content
          for (let colIdx = 0; colIdx < numCols; colIdx++) {
            const cellX = margin + colIdx * colWidth;
            const lines = cellLines[colIdx];
            
            if (isHeaderRow) {
              pdf.setFont('times', 'bold');
              pdf.setTextColor(255, 255, 255);
            } else {
              pdf.setFont('times', 'normal');
              pdf.setTextColor(...black);
            }
            
            // Draw text lines (vertically centered)
            const textHeight = lines.length * lineHeight;
            let textY = rowTop + (rowHeight - textHeight) / 2 + lineHeight * 0.75;
            for (const line of lines) {
              pdf.text(line, cellX + cellPadding, textY);
              textY += lineHeight;
            }
          }
          
          // Draw borders: horizontal lines above and below rows, vertical cell separators
          pdf.setLineWidth(isHeaderRow ? 0.5 : 0.15);
          // Top border of header or bottom border of header
          if (isHeaderRow) {
            pdf.line(margin, rowTop, margin + contentWidth, rowTop);
            pdf.line(margin, rowTop + rowHeight, margin + contentWidth, rowTop + rowHeight);
          } else {
            // Light bottom border for data rows
            pdf.setLineWidth(0.15);
            pdf.line(margin, rowTop + rowHeight, margin + contentWidth, rowTop + rowHeight);
          }
          
          // Vertical cell separators
          pdf.setLineWidth(0.15);
          for (let colIdx = 1; colIdx < numCols; colIdx++) {
            const cellX = margin + colIdx * colWidth;
            pdf.line(cellX, rowTop, cellX, rowTop + rowHeight);
          }
          
          yPosition += rowHeight;
        }
        
        pdf.setTextColor(...black);
        yPosition += paragraphSpacing;
      };

// Bubble badge colors for levels and elements
      const bubbleColors: Record<string, [number, number, number]> = {
        'L': [34, 197, 94],   // green for Low
        'M': [245, 158, 11],  // amber for Medium
        'H': [239, 68, 68],   // red for High
      };

      // Helper: Draw a rounded bubble badge (pill shape - maximally rounded)
      const drawBubble = (text: string, x: number, y: number, bgColor: [number, number, number], italic: boolean = false): number => {
        pdf.setFontSize(8);
        pdf.setFont('times', italic ? 'bolditalic' : 'bold');
        const textWidth = pdf.getTextWidth(text);
        const padding = 1.5;
        const bubbleWidth = textWidth + padding * 2;
        const bubbleHeight = 3.5;
        const pillRadius = bubbleHeight / 2; // Maximum rounding for pill shape
        
        // Draw rounded rectangle background (pill shape)
        pdf.setFillColor(...bgColor);
        pdf.roundedRect(x, y - 2.8, bubbleWidth, bubbleHeight, pillRadius, pillRadius, 'F');
        
        // Draw white text
        pdf.setTextColor(255, 255, 255);
        pdf.text(text, x + padding, y - 0.5);
        
        // Reset text color
        pdf.setTextColor(...black);
        pdf.setFont('times', 'normal');
        pdf.setFontSize(FONT_SIZE_BODY);
        
        return bubbleWidth;
      };

      // Helper: Draw WP bubble with custom color
      const drawWPBubble = (wpNum: number, x: number, y: number, color: string): number => {
        const text = `WP${wpNum}`;
        const [r, g, b] = hexToRgb(color);
        return drawBubble(text, x, y, [r, g, b]);
      };

      // Helper: Draw partner short name bubble (black bg, white italic bold text)
      const drawPartnerBubble = (shortName: string, x: number, y: number): number => {
        // Black background for partner bubbles
        return drawBubble(shortName, x, y, [0, 0, 0], true); // black, italic
      };

      // Helper: Add B3.1 table with custom column widths and multi-line text support
      type CellContent = 
        | { text: string; type: 'text' } 
        | { text: string; color: [number, number, number]; type: 'bubble'; italic?: boolean }
        | { wpNumbers: number[]; wpColorMap: Map<number, string>; type: 'wpBubbles' };
      
      const addB31TableAdvanced = (
        headers: string[], 
        rows: CellContent[][], 
        colWidths: number[], 
        tableCaption: string
      ) => {
        if (rows.length === 0) return;
        
        // Add table caption first
        addCaption(tableCaption, 'table');
        
        const baseRowHeight = 7; // Increased to ensure bubbles fit
        const cellPadding = 1;
        const tableWidth = colWidths.reduce((a, b) => a + b, 0);
        const lineHeight = 3.5; // For multi-line text
        const bubbleHeight = 3.5;
        const bubbleRowSpacing = 4.5; // Height per row of bubbles
        
        // Check if table fits on current page (at least header + 2 rows)
        checkPageBreak(baseRowHeight * Math.min(3, rows.length + 1));
        
        pdf.setFontSize(FONT_SIZE_BODY);
        pdf.setDrawColor(...black);
        pdf.setLineWidth(0.25);
        
        // Draw header row
        let xPos = margin;
        pdf.setFillColor(0, 0, 0);
        pdf.rect(margin, yPosition - 4, tableWidth, baseRowHeight, 'F');
        pdf.setFont('times', 'bold');
        pdf.setTextColor(255, 255, 255);
        
        for (let i = 0; i < headers.length; i++) {
          pdf.rect(xPos, yPosition - 4, colWidths[i], baseRowHeight);
          const maxTextWidth = colWidths[i] - cellPadding * 2;
          let displayText = headers[i];
          while (pdf.getTextWidth(displayText) > maxTextWidth && displayText.length > 3) {
            displayText = displayText.substring(0, displayText.length - 4) + '...';
          }
          pdf.text(displayText, xPos + cellPadding, yPosition);
          xPos += colWidths[i];
        }
        yPosition += baseRowHeight;
        
        // Draw data rows with multi-line support
        pdf.setFont('times', 'normal');
        pdf.setTextColor(...black);
        
        // Helper to calculate bubble width
        const getBubbleWidth = (text: string): number => {
          pdf.setFontSize(8);
          pdf.setFont('times', 'bold');
          const textWidth = pdf.getTextWidth(text);
          pdf.setFontSize(FONT_SIZE_BODY);
          pdf.setFont('times', 'normal');
          return textWidth + 3; // padding * 2
        };
        
        for (const row of rows) {
          // Calculate row height based on content
          let maxLines = 1;
          let maxBubbleRows = 1;
          
          for (let i = 0; i < colWidths.length; i++) {
            const cell = row[i];
            const maxCellWidth = colWidths[i] - cellPadding * 2;
            
            if (cell && cell.type === 'text') {
              const lines = pdf.splitTextToSize(cell.text, maxCellWidth);
              maxLines = Math.max(maxLines, lines.length);
            } else if (cell && cell.type === 'wpBubbles') {
              // Calculate how many rows of bubbles we need
              let currentRowWidth = 0;
              let bubbleRows = 1;
              const bubbleGap = 1;
              
              for (const wpNum of cell.wpNumbers) {
                const bubbleWidth = getBubbleWidth(`WP${wpNum}`);
                if (currentRowWidth + bubbleWidth > maxCellWidth && currentRowWidth > 0) {
                  bubbleRows++;
                  currentRowWidth = bubbleWidth + bubbleGap;
                } else {
                  currentRowWidth += bubbleWidth + bubbleGap;
                }
              }
              maxBubbleRows = Math.max(maxBubbleRows, bubbleRows);
            } else if (cell && cell.type === 'bubble') {
              // Single bubble - check if it fits, if not we'll truncate when rendering
              maxBubbleRows = Math.max(maxBubbleRows, 1);
            }
          }
          
          const textRowHeight = Math.max(baseRowHeight, maxLines * lineHeight + 2);
          const bubbleRowHeight = maxBubbleRows * 4.5 + 2; // 4.5mm per bubble row
          const rowHeight = Math.max(textRowHeight, bubbleRowHeight);
          
          checkPageBreak(rowHeight);
          xPos = margin;
          const rowStartY = yPosition;
          const cellTop = rowStartY - 4; // Cell top position
          const cellBottom = cellTop + rowHeight; // Cell bottom position
          
          // Draw cell borders first
          for (let i = 0; i < colWidths.length; i++) {
            pdf.rect(xPos, cellTop, colWidths[i], rowHeight);
            xPos += colWidths[i];
          }
          
          // Draw cell content - vertically centered within cell bounds
          xPos = margin;
          for (let i = 0; i < colWidths.length; i++) {
            const cell = row[i];
            const maxTextWidth = colWidths[i] - cellPadding * 2;
            
            if (cell) {
              if (cell.type === 'bubble') {
                // Calculate vertical center for single bubble within cell bounds
                // Bubble Y is the baseline, bubble draws from y-2.8 to y-2.8+3.5
                const cellCenterY = cellTop + rowHeight / 2;
                const bubbleY = cellCenterY + 1.4; // Center the bubble vertically (3.5/2 = 1.75, adjust for text baseline)
                
                // Truncate bubble text if needed to fit column
                let bubbleText = cell.text;
                let bubbleWidth = getBubbleWidth(bubbleText);
                while (bubbleWidth > maxTextWidth && bubbleText.length > 2) {
                  bubbleText = bubbleText.substring(0, bubbleText.length - 1);
                  bubbleWidth = getBubbleWidth(bubbleText);
                }
                
                drawBubble(bubbleText, xPos + cellPadding, bubbleY, cell.color, cell.italic || false);
              } else if (cell.type === 'wpBubbles') {
                // Calculate how many rows of bubbles and render with wrapping
                const bubbleGap = 1;
                let bubbleX = xPos + cellPadding;
                let bubbleRowCount = 1;
                let currentRowWidth = 0;
                
                // First pass: count rows for vertical centering
                for (const wpNum of cell.wpNumbers) {
                  const bWidth = getBubbleWidth(`WP${wpNum}`);
                  if (currentRowWidth + bWidth > maxTextWidth && currentRowWidth > 0) {
                    bubbleRowCount++;
                    currentRowWidth = bWidth + bubbleGap;
                  } else {
                    currentRowWidth += bWidth + bubbleGap;
                  }
                }
                
                // Calculate vertical starting position for centering within cell bounds
                const totalBubblesHeight = bubbleRowCount * bubbleRowSpacing;
                const cellCenterY = cellTop + rowHeight / 2;
                let bubbleY = cellCenterY - totalBubblesHeight / 2 + bubbleRowSpacing / 2 + 1.4;
                
                // Second pass: render bubbles with wrapping
                bubbleX = xPos + cellPadding;
                currentRowWidth = 0;
                
                for (const wpNum of cell.wpNumbers) {
                  const color = cell.wpColorMap.get(wpNum) || '#6b7280';
                  const bWidth = getBubbleWidth(`WP${wpNum}`);
                  
                  // Check if we need to wrap to next row
                  if (currentRowWidth + bWidth > maxTextWidth && currentRowWidth > 0) {
                    bubbleY += bubbleRowSpacing;
                    bubbleX = xPos + cellPadding;
                    currentRowWidth = 0;
                  }
                  
                  drawWPBubble(wpNum, bubbleX, bubbleY, color);
                  bubbleX += bWidth + bubbleGap;
                  currentRowWidth += bWidth + bubbleGap;
                }
              } else {
                // Draw text (with wrapping) - vertically centered within cell bounds
                const lines = pdf.splitTextToSize(cell.text, maxTextWidth);
                const textHeight = lines.length * lineHeight;
                const cellCenterY = cellTop + rowHeight / 2;
                let textY = cellCenterY - textHeight / 2 + lineHeight * 0.7; // Adjust for text baseline
                for (const line of lines) {
                  pdf.text(line, xPos + cellPadding, textY);
                  textY += lineHeight;
                }
              }
            }
            xPos += colWidths[i];
          }
          yPosition = rowStartY + rowHeight;
        }
        
        pdf.setTextColor(...black);
        yPosition += paragraphSpacing * 2;
      };

// Helper: Fetch and render ALL B3.1 tables (a through h)
      const renderB31Tables = async (proposalId: string) => {
        // Fetch all B3.1 data in parallel
        const [
          { data: wpDrafts },
          { data: deliverables },
          { data: milestones },
          { data: risks },
          { data: parts },
          { data: palette },
          { data: budgetItems },
        ] = await Promise.all([
          supabase.from('wp_drafts').select(`
            id, number, title, short_name, lead_participant_id, color, objectives, methodology,
            manual_person_months, manual_duration, b31_objectives, b31_description_before_tasks,
            tasks:wp_draft_tasks(
              id, number, title, description, lead_participant_id, start_month, end_month,
              effort:wp_draft_task_effort(participant_id, person_months),
              participants:wp_draft_task_participants(participant_id)
            ),
            deliverables:wp_draft_deliverables(
              id, number, title, type, dissemination_level, responsible_participant_id, due_month, description
            ),
            b31_tasks(
              id, number, title, description, lead_participant_id, start_month, end_month, order_index,
              participants:b31_task_participants(participant_id)
            )
          `).eq('proposal_id', proposalId).order('number'),
          supabase.from('b31_deliverables').select('*').eq('proposal_id', proposalId).order('order_index'),
          supabase.from('b31_milestones').select('*').eq('proposal_id', proposalId).order('order_index'),
          supabase.from('b31_risks').select('*').eq('proposal_id', proposalId).order('order_index'),
          supabase.from('participants').select('id, organisation_short_name, organisation_name, participant_number, personnel_cost_rate').eq('proposal_id', proposalId).order('participant_number'),
          supabase.from('wp_color_palette').select('colors').eq('proposal_id', proposalId).single(),
          supabase.from('budget_items').select('id, participant_id, category, description, amount, justification').eq('proposal_id', proposalId).in('category', ['subcontracting', 'equipment']),
        ]);

        const participantList = parts || [];
        const participantMap = new Map(participantList.map(p => [p.id, p.organisation_short_name || `P${p.participant_number}`]));
        const defaultColors = ['#3b82f6','#ef4444','#22c55e','#f59e0b','#8b5cf6','#06b6d4','#ec4899','#f97316','#14b8a6','#6366f1'];
        const colors = (palette?.colors as string[]) || defaultColors;
        const wps = (wpDrafts || []).map((wp: any) => ({
          ...wp,
          color: wp.color || colors[(wp.number - 1) % colors.length] || defaultColors[0],
          tasks: (wp.tasks || []).sort((a: any, b: any) => a.number - b.number),
          deliverables: (wp.deliverables || []).sort((a: any, b: any) => a.number - b.number),
          b31Tasks: (wp.b31_tasks || []).sort((a: any, b: any) => (a.order_index ?? a.number) - (b.order_index ?? b.number)),
        }));
        const wpColorMap = new Map(wps.map((wp: any) => [wp.number, wp.color]));

        const toSentenceCase = (text: string): string => {
          if (!text) return '';
          return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
        };

        // Helper: Draw WP description table matching editor layout
        const renderWPDescriptionTable = (wp: any) => {
          const [r, g, b] = hexToRgb(wp.color);
          const leadName = wp.lead_participant_id ? (participantMap.get(wp.lead_participant_id) || '—') : '—';
          
          // Use b31_tasks if available, otherwise fall back to wp_draft_tasks
          const tasksToRender = wp.b31Tasks.length > 0 ? wp.b31Tasks : wp.tasks;
          const taskStarts = tasksToRender.filter((t: any) => t.start_month).map((t: any) => t.start_month);
          const taskEnds = tasksToRender.filter((t: any) => t.end_month).map((t: any) => t.end_month);
          const start = taskStarts.length > 0 ? Math.min(...taskStarts) : null;
          const end = taskEnds.length > 0 ? Math.max(...taskEnds) : null;
          const monthRange = start && end 
            ? `M${String(start).padStart(2, '0')}–M${String(end).padStart(2, '0')}`
            : '';
          
          yPosition += 2;
          checkPageBreak(20);
          
          // WP header pill (full width colored bar)
          const pillHeight = 5;
          const pillY = yPosition - 3.5;
          pdf.setFillColor(r, g, b);
          pdf.roundedRect(margin, pillY, contentWidth, pillHeight, 2, 2, 'F');
          pdf.setFontSize(FONT_SIZE_BODY);
          pdf.setFont('times', 'bold');
          pdf.setTextColor(255, 255, 255);
          const wpHeaderText = `WP${wp.number}: ${wp.short_name || ''}${wp.short_name && wp.title ? ' – ' : ''}${wp.title || ''}`;
          pdf.text(wpHeaderText, margin + 3, yPosition);
          yPosition += pillHeight + 1;
          
          // Leader + duration row
          pdf.setFont('times', 'normal');
          pdf.setTextColor(...black);
          checkPageBreak(lineHeightBody);
          // Leader bubble
          const leaderBubbleWidth = drawPartnerBubble(leadName, margin + 3, yPosition);
          // Duration on the right
          pdf.setFont('times', 'bold');
          pdf.setTextColor(...black);
          if (monthRange) {
            pdf.text(monthRange, margin + contentWidth - pdf.getTextWidth(monthRange) - 2, yPosition);
          }
          yPosition += lineHeightBody;
          
          // WP color separator line
          pdf.setDrawColor(r, g, b);
          pdf.setLineWidth(0.3);
          pdf.line(margin, yPosition - 2, margin + contentWidth, yPosition - 2);
          pdf.setDrawColor(...black);
          
          // B3.1 Objectives
          const objectives = wp.b31_objectives || wp.objectives || '';
          if (objectives) {
            const objBlocks = parseHtmlContent(objectives);
            for (const block of objBlocks) {
              if (block.type === 'paragraph') addParagraph(block.text, block.segments);
              else if (block.type === 'list') addList(block.items, block.ordered);
            }
          }
          
          // Optional field before tasks
          const beforeTasks = wp.b31_description_before_tasks || '';
          if (beforeTasks && beforeTasks.replace(/<[^>]*>/g, '').trim()) {
            const btBlocks = parseHtmlContent(beforeTasks);
            for (const block of btBlocks) {
              if (block.type === 'paragraph') addParagraph(block.text, block.segments);
              else if (block.type === 'list') addList(block.items, block.ordered);
            }
          }
          
          // Tasks
          for (const task of tasksToRender) {
            // Task color separator
            pdf.setDrawColor(r, g, b);
            pdf.setLineWidth(0.3);
            pdf.line(margin, yPosition - 1, margin + contentWidth, yPosition - 1);
            pdf.setDrawColor(...black);
            yPosition += 1;
            
            checkPageBreak(lineHeightBody * 3);
            
            // Task header: badge + title
            pdf.setFontSize(FONT_SIZE_BODY);
            const taskId = `T${wp.number}.${task.number}`;
            // Draw task badge (outlined)
            pdf.setFontSize(FONT_SIZE_BODY);
            pdf.setFont('times', 'bold');
            const taskIdWidth = pdf.getTextWidth(taskId);
            const badgePadding = 1.5;
            const badgeWidth = taskIdWidth + badgePadding * 2;
            const badgeHeight = 4;
            const badgeY = yPosition - 3;
            pdf.setDrawColor(r, g, b);
            pdf.setLineWidth(0.4);
            pdf.roundedRect(margin, badgeY, badgeWidth, badgeHeight, badgeHeight / 2, badgeHeight / 2, 'S');
            pdf.setTextColor(r, g, b);
            pdf.text(taskId, margin + badgePadding, yPosition - 0.5);
            pdf.setDrawColor(...black);
            
            // Task title after badge
            pdf.setFont('times', 'bold');
            pdf.setTextColor(...black);
            const taskTitle = task.title || '';
            if (taskTitle) {
              pdf.text(taskTitle, margin + badgeWidth + 2, yPosition - 0.5);
            }
            yPosition += lineHeightBody;
            
            // Task metadata: leader + partners + duration
            const tLeadName = task.lead_participant_id ? (participantMap.get(task.lead_participant_id) || '') : '';
            if (tLeadName) {
              drawPartnerBubble(tLeadName, margin + 3, yPosition);
            }
            // Task participants
            const partnerIds = (task.participants || []).map((p: any) => p.participant_id).filter((id: string) => id !== task.lead_participant_id);
            let partnerX = margin + 3 + (tLeadName ? 25 : 0);
            for (const pid of partnerIds) {
              const pName = participantMap.get(pid);
              if (pName) {
                const bw = drawPartnerBubble(pName, partnerX, yPosition);
                partnerX += bw + 1;
              }
            }
            // Duration on right
            const tStart = task.start_month;
            const tEnd = task.end_month;
            if (tStart && tEnd) {
              pdf.setFont('times', 'bold');
              pdf.setTextColor(...black);
              const durText = `M${String(tStart).padStart(2, '0')}–M${String(tEnd).padStart(2, '0')}`;
              pdf.text(durText, margin + contentWidth - pdf.getTextWidth(durText) - 2, yPosition);
            }
            yPosition += lineHeightBody;
            
            // Task description
            const taskDesc = task.description || '';
            if (taskDesc) {
              const descBlocks = parseHtmlContent(taskDesc);
              for (const block of descBlocks) {
                if (block.type === 'paragraph') addParagraph(block.text, block.segments);
                else if (block.type === 'list') addList(block.items, block.ordered);
              }
            }
          }
          
          // Final WP color separator
          pdf.setDrawColor(r, g, b);
          pdf.setLineWidth(0.3);
          pdf.line(margin, yPosition - 1, margin + contentWidth, yPosition - 1);
          pdf.setDrawColor(...black);
          yPosition += paragraphSpacing * 2;
        };

        // ===== Table 3.1.a – List of work packages =====
        if (wps.length > 0) {
          const wpListHeaders = ['WP', 'Title', 'Lead', 'PM', 'Start', 'End'];
          const wpListColWidths = [12, 80, 30, 18, 20, 20];
          const wpListRows: CellContent[][] = wps.map((wp: any) => {
            const leadName = wp.lead_participant_id ? (participantMap.get(wp.lead_participant_id) || '—') : '—';
            // Calculate total PM from task effort
            let totalPM = wp.manual_person_months || 0;
            if (!totalPM) {
              wp.tasks.forEach((t: any) => {
                (t.effort || []).forEach((e: any) => { totalPM += e.person_months || 0; });
              });
            }
            // Calculate start/end from tasks
            const taskStarts = wp.tasks.filter((t: any) => t.start_month).map((t: any) => t.start_month);
            const taskEnds = wp.tasks.filter((t: any) => t.end_month).map((t: any) => t.end_month);
            const start = taskStarts.length > 0 ? Math.min(...taskStarts) : null;
            const end = taskEnds.length > 0 ? Math.max(...taskEnds) : null;

            return [
              { text: `WP${wp.number}`, color: hexToRgb(wp.color), type: 'bubble' as const },
              { text: wp.title || '', type: 'text' as const },
              leadName !== '—' ? { text: leadName, color: [0,0,0] as [number,number,number], type: 'bubble' as const, italic: true } : { text: '—', type: 'text' as const },
              { text: totalPM ? totalPM.toFixed(1) : '—', type: 'text' as const },
              { text: start ? `M${String(start).padStart(2,'0')}` : '—', type: 'text' as const },
              { text: end ? `M${String(end).padStart(2,'0')}` : '—', type: 'text' as const },
            ];
          });
          addB31TableAdvanced(wpListHeaders, wpListRows, wpListColWidths, 'Table 3.1.a. List of work packages');
        }

        // ===== Table 3.1.b – Work package descriptions (one per WP) =====
        // Render using the structured layout matching the editor
        addCaption('Table 3.1.b. Work package descriptions', 'table');
        for (const wp of wps) {
          renderWPDescriptionTable(wp);
        }

        // ===== Table 3.1.c – Deliverables =====
        if (deliverables && deliverables.length > 0) {
          const delHeaders = ['Deliverable', 'WP', 'Lead', 'Type', 'Diss.', 'Due'];
          const delColWidths = [85, 20, 25, 12, 18, 20];
          const delRows: CellContent[][] = (deliverables as B31Deliverable[]).map(d => {
            const title = d.name ? toSentenceCase(d.name) : '';
            const deliverableText = `${d.number}: ${title}`;
            const wpNum = d.wp_number;
            const wpColor = wpNum && wpColorMap.get(wpNum) ? wpColorMap.get(wpNum)! : '#475569';
            const leadName = d.lead_participant_id ? (participantMap.get(d.lead_participant_id) || '') : '—';
            return [
              { text: deliverableText, type: 'text' as const },
              wpNum ? { text: `WP${wpNum}`, color: hexToRgb(wpColor), type: 'bubble' as const } : { text: '—', type: 'text' as const },
              leadName !== '—' ? { text: leadName, color: [0, 0, 0] as [number, number, number], type: 'bubble' as const, italic: true } : { text: '—', type: 'text' as const },
              { text: d.type || '—', type: 'text' as const },
              { text: d.dissemination_level || '—', type: 'text' as const },
              { text: d.due_month ? `M${String(d.due_month).padStart(2, '0')}` : '—', type: 'text' as const }
            ];
          });
          addB31TableAdvanced(delHeaders, delRows, delColWidths, 'Table 3.1.c. List of deliverables');
        }

        // ===== Table 3.1.d – Milestones =====
        if (milestones && milestones.length > 0) {
          const msHeaders = ['Milestone', 'WPs', 'Due', 'Means of verification'];
          const msColWidths = [50, 40, 13, 77];
          const msRows: CellContent[][] = (milestones as B31Milestone[]).map(m => {
            const title = m.name ? toSentenceCase(m.name) : '';
            const milestoneText = `MS${m.number}: ${title}`;
            const wpNumbers = m.wps ? m.wps.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n)) : [];
            return [
              { text: milestoneText, type: 'text' as const },
              wpNumbers.length > 0 ? { wpNumbers, wpColorMap, type: 'wpBubbles' as const } : { text: '—', type: 'text' as const },
              { text: m.due_month ? `M${String(m.due_month).padStart(2, '0')}` : '—', type: 'text' as const },
              { text: m.means_of_verification || '—', type: 'text' as const }
            ];
          });
          addB31TableAdvanced(msHeaders, msRows, msColWidths, 'Table 3.1.d. List of milestones');
        }

        // ===== Table 3.1.e – Risks =====
        if (risks && risks.length > 0) {
          const riskHeaders = ['Risk', 'WPs', '(i)', '(ii)', 'Mitigation & adaptation measures'];
          const riskColWidths = [35, 40, 8, 8, 89];
          const riskRows: CellContent[][] = (risks as B31Risk[]).map(r => {
            const likelihood = r.likelihood || '';
            const severity = r.severity || '';
            const likelihoodColor = bubbleColors[likelihood] || [107, 114, 128];
            const severityColor = bubbleColors[severity] || [107, 114, 128];
            const wpNumbers = r.wps ? r.wps.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n)) : [];
            return [
              { text: r.description || '—', type: 'text' as const },
              wpNumbers.length > 0 ? { wpNumbers, wpColorMap, type: 'wpBubbles' as const } : { text: '—', type: 'text' as const },
              likelihood ? { text: likelihood, color: likelihoodColor, type: 'bubble' as const } : { text: '—', type: 'text' as const },
              severity ? { text: severity, color: severityColor, type: 'bubble' as const } : { text: '—', type: 'text' as const },
              { text: r.mitigation || '—', type: 'text' as const }
            ];
          });
          addB31TableAdvanced(riskHeaders, riskRows, riskColWidths, 'Table 3.1.e. Critical risks for implementation');
        }

        // ===== Table 3.1.f – Summary of staff effort =====
        if (wps.length > 0 && participantList.length > 0) {
          // Build effort matrix: rows = WPs, columns = participants
          const effortHeaders = ['WP', ...participantList.map(p => p.organisation_short_name || `P${p.participant_number}`), 'Total'];
          const effortColWidths: number[] = [];
          const partCount = participantList.length;
          const wpColW = 20;
          const totalColW = 18;
          const partColW = Math.max(12, (contentWidth - wpColW - totalColW) / partCount);
          effortColWidths.push(wpColW);
          for (let i = 0; i < partCount; i++) effortColWidths.push(partColW);
          effortColWidths.push(totalColW);

          const effortRows: CellContent[][] = [];
          const participantTotals = new Array(partCount).fill(0);

          for (const wp of wps) {
            const row: CellContent[] = [
              { text: `WP${wp.number}`, color: hexToRgb(wp.color), type: 'bubble' as const }
            ];
            let wpTotal = 0;
            participantList.forEach((p, pi) => {
              let pm = 0;
              wp.tasks.forEach((t: any) => {
                (t.effort || []).forEach((e: any) => {
                  if (e.participant_id === p.id) pm += e.person_months || 0;
                });
              });
              wpTotal += pm;
              participantTotals[pi] += pm;
              row.push({ text: pm > 0 ? pm.toFixed(1) : '—', type: 'text' as const });
            });
            row.push({ text: wpTotal > 0 ? wpTotal.toFixed(1) : '—', type: 'text' as const });
            effortRows.push(row);
          }

          // Total row
          const totalRow: CellContent[] = [{ text: 'Total', type: 'text' as const }];
          let grandTotal = 0;
          participantTotals.forEach(t => {
            grandTotal += t;
            totalRow.push({ text: t > 0 ? t.toFixed(1) : '—', type: 'text' as const });
          });
          totalRow.push({ text: grandTotal > 0 ? grandTotal.toFixed(1) : '—', type: 'text' as const });
          effortRows.push(totalRow);

          addB31TableAdvanced(effortHeaders, effortRows, effortColWidths, 'Table 3.1.f. Summary of staff effort');
        }

        // ===== Table 3.1.g – Subcontracting =====
        const subItems = (budgetItems || []).filter(b => b.category === 'subcontracting');
        if (subItems.length > 0) {
          const subHeaders = ['Participant', 'Description', 'Amount (€)', 'Justification'];
          const subColWidths = [30, 60, 25, 65];
          const subRows: CellContent[][] = subItems.map(item => {
            const pName = participantMap.get(item.participant_id) || '—';
            return [
              pName !== '—' ? { text: pName, color: [0,0,0] as [number,number,number], type: 'bubble' as const, italic: true } : { text: '—', type: 'text' as const },
              { text: item.description || '—', type: 'text' as const },
              { text: item.amount ? item.amount.toLocaleString('en') : '—', type: 'text' as const },
              { text: item.justification || '—', type: 'text' as const },
            ];
          });
          addB31TableAdvanced(subHeaders, subRows, subColWidths, 'Table 3.1.g. Subcontracting costs');
        }

        // ===== Table 3.1.h – Purchase costs of equipment =====
        const eqItems = (budgetItems || []).filter(b => b.category === 'equipment');
        if (eqItems.length > 0) {
          const eqHeaders = ['Participant', 'Description', 'Amount (€)', 'Justification'];
          const eqColWidths = [30, 60, 25, 65];
          const eqRows: CellContent[][] = eqItems.map(item => {
            const pName = participantMap.get(item.participant_id) || '—';
            return [
              pName !== '—' ? { text: pName, color: [0,0,0] as [number,number,number], type: 'bubble' as const, italic: true } : { text: '—', type: 'text' as const },
              { text: item.description || '—', type: 'text' as const },
              { text: item.amount ? item.amount.toLocaleString('en') : '—', type: 'text' as const },
              { text: item.justification || '—', type: 'text' as const },
            ];
          });
          addB31TableAdvanced(eqHeaders, eqRows, eqColWidths, 'Table 3.1.h. Purchase costs of equipment');
        }
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

      // Helper: Check if section is a Part B content section (has format like B1.1, B2.1, etc.)
      const isContentSection = (section: Section): boolean => {
        // Content sections have numbers like B1.1, B2.1, B3.2
        return !section.isPartA && !!section.number && /^B?\d+\.\d+/.test(section.number);
      };

      // Helper: Check if section is an H1 container (B1, B2, B3)
      const isH1Container = (section: Section): boolean => {
        // H1 containers have numbers like B1, B2, B3 (single digit after B)
        return !section.isPartA && !!section.number && /^B?\d+$/.test(section.number.replace(/^B/, ''));
      };

      // Helper: Get all Part B sections in order (flattened for rendering)
      const getPartBSections = (allSections: Section[]): Section[] => {
        const result: Section[] = [];
        
        const traverse = (section: Section) => {
          // Skip Part A sections and special sections
          if (section.isPartA) return;
          if (section.id === 'figures' || section.id === 'assignments' || section.id === 'progress') return;
          
          // Add this section if it's H1 container or content section
          if (isH1Container(section) || isContentSection(section)) {
            result.push(section);
          }
          
          // Traverse subsections
          if (section.subsections) {
            for (const sub of section.subsections) {
              traverse(sub);
            }
          }
        };
        
        for (const section of allSections) {
          traverse(section);
        }
        
        return result;
      };

// Helper: Add participant table with logos, full width, text wrapping, and roles
      const addParticipantTable = async () => {
        if (participants.length === 0) return;
        
        // Fetch WP leadership data
        const { data: wpLeadershipData } = await supabase
          .from('wp_drafts')
          .select('id, number, short_name, lead_participant_id, color')
          .eq('proposal_id', proposal.id)
          .order('number');
        
        // Fetch Case leadership data
        const { data: caseLeadershipData } = await supabase
          .from('case_drafts')
          .select('id, number, short_name, lead_participant_id, color, case_type, custom_type_name')
          .eq('proposal_id', proposal.id)
          .order('number');
        
        // Build WP leadership map: participantId -> array of WP info
        const wpLeadership = new Map<string, { wpNumber: number; color: string }[]>();
        for (const wp of wpLeadershipData || []) {
          if (wp.lead_participant_id) {
            if (!wpLeadership.has(wp.lead_participant_id)) {
              wpLeadership.set(wp.lead_participant_id, []);
            }
            wpLeadership.get(wp.lead_participant_id)!.push({
              wpNumber: wp.number,
              color: wp.color,
            });
          }
        }
        
        // Helper to get case prefix
        const getCasePrefix = (caseType: string, customTypeName: string | null): string => {
          if (caseType === 'other') {
            return customTypeName ? customTypeName.toUpperCase() : '';
          }
          switch (caseType) {
            case 'case_study': return 'CS';
            case 'use_case': return 'UC';
            case 'living_lab': return 'LL';
            case 'pilot': return 'P';
            case 'demonstration': return 'D';
            default: return '';
          }
        };
        
        // Build Case leadership map: participantId -> array of case info
        const caseLeadership = new Map<string, { caseNumber: number; color: string; prefix: string; shortName: string | null }[]>();
        for (const c of caseLeadershipData || []) {
          if (c.lead_participant_id) {
            if (!caseLeadership.has(c.lead_participant_id)) {
              caseLeadership.set(c.lead_participant_id, []);
            }
            caseLeadership.get(c.lead_participant_id)!.push({
              caseNumber: c.number,
              color: c.color,
              prefix: getCasePrefix(c.case_type, c.custom_type_name),
              shortName: c.short_name,
            });
          }
        }
        
        yPosition += paragraphSpacingH2;
        checkPageBreak(20);
        
        // Table header
        pdf.setFontSize(FONT_SIZE_H2);
        pdf.setFont('times', 'bold');
        pdf.setTextColor(...black);
        pdf.text('List of Participants', margin, yPosition);
        yPosition += 6;
        
        // Table configuration - columns: No., Short Name, Legal Name, Logo, Role, Country
        const colWidths = [7, 22, 78, 15, 35, 23]; // Total = 180mm = contentWidth
        const baseRowHeight = 6;
        const cellPadding = 1;
        const tableWidth = contentWidth;
        const logoHeight = 8;
        
        // Draw table header row
        checkPageBreak(baseRowHeight * 2);
        let xPos = margin;
        
        // Header background
        pdf.setFillColor(0, 0, 0);
        pdf.rect(xPos, yPosition - 4, tableWidth, baseRowHeight, 'F');
        
        // Header text
        pdf.setFontSize(FONT_SIZE_BODY);
        pdf.setTextColor(255, 255, 255);
        pdf.setDrawColor(...black);
        pdf.setLineWidth(0.25);
        
        // Column 0: No.
        pdf.setFont('times', 'bold');
        pdf.rect(xPos, yPosition - 4, colWidths[0], baseRowHeight);
        pdf.text('No.', xPos + cellPadding, yPosition);
        xPos += colWidths[0];
        
        // Column 1: Short name
        pdf.rect(xPos, yPosition - 4, colWidths[1], baseRowHeight);
        pdf.text('Short name', xPos + cellPadding, yPosition);
        xPos += colWidths[1];
        
        // Column 2: Participant legal name | English name, if different (no right border)
        pdf.line(xPos, yPosition - 4, xPos + colWidths[2], yPosition - 4);
        pdf.line(xPos, yPosition - 4, xPos, yPosition - 4 + baseRowHeight);
        pdf.line(xPos, yPosition - 4 + baseRowHeight, xPos + colWidths[2], yPosition - 4 + baseRowHeight);
        const headerPart1 = 'Participant legal name | ';
        pdf.text(headerPart1, xPos + cellPadding, yPosition);
        const part1Width = pdf.getTextWidth(headerPart1);
        pdf.setFont('times', 'bolditalic');
        pdf.text('English name, if different', xPos + cellPadding + part1Width, yPosition);
        pdf.setFont('times', 'bold');
        xPos += colWidths[2];
        
        // Column 3: Logo (no left border)
        pdf.line(xPos, yPosition - 4, xPos + colWidths[3], yPosition - 4);
        pdf.line(xPos + colWidths[3], yPosition - 4, xPos + colWidths[3], yPosition - 4 + baseRowHeight);
        pdf.line(xPos, yPosition - 4 + baseRowHeight, xPos + colWidths[3], yPosition - 4 + baseRowHeight);
        pdf.text('Logo', xPos + cellPadding, yPosition);
        xPos += colWidths[3];
        
        // Column 4: Role
        pdf.rect(xPos, yPosition - 4, colWidths[4], baseRowHeight);
        pdf.text('Role', xPos + cellPadding, yPosition);
        xPos += colWidths[4];
        
        // Column 5: Country
        pdf.rect(xPos, yPosition - 4, colWidths[5], baseRowHeight);
        pdf.text('Country', xPos + cellPadding, yPosition);
        
        yPosition += baseRowHeight;
        
        // Draw data rows
        pdf.setFont('times', 'normal');
        pdf.setTextColor(...black);
        
        for (const participant of participants) {
          const orgColWidth = colWidths[2] - cellPadding * 2;
          
          // Build organisation text
          const englishName = participant.englishName || '';
          const legalName = participant.organisationName || '';
          const legalLines = legalName ? pdf.splitTextToSize(legalName, orgColWidth) : [];
          const englishLines = (englishName && englishName !== legalName) 
            ? pdf.splitTextToSize(englishName, orgColWidth) 
            : [];
          const totalOrgLines = legalLines.length + englishLines.length;
          
          // Calculate roles for this participant
          const isCoordinator = participant.participantNumber === 1;
          const wpRoles = wpLeadership.get(participant.id) || [];
          const caseRoles = caseLeadership.get(participant.id) || [];
          const totalRoleBubbles = (isCoordinator ? 1 : 0) + wpRoles.length + caseRoles.length;
          
          // Calculate how many bubbles can fit per row in the role column
          const roleColWidth = colWidths[4] - cellPadding * 2;
          const avgBubbleWidth = 12; // Average bubble width ~12mm
          const bubblesPerRow = Math.max(1, Math.floor(roleColWidth / (avgBubbleWidth + 1.5)));
          const roleRows = Math.max(1, Math.ceil(totalRoleBubbles / bubblesPerRow));
          const rolesHeight = roleRows * 5;
          
          // Calculate row height
          const textHeight = Math.max(totalOrgLines * lineHeightBody, baseRowHeight);
          const rowHeight = Math.max(textHeight, logoHeight, rolesHeight);
          
          checkPageBreak(rowHeight + 2);
          
          const rowStartY = yPosition;
          xPos = margin;
          const cellTop = rowStartY - 4;
          
          // Draw cell borders
          pdf.setDrawColor(...black);
          pdf.setLineWidth(0.25);
          
          // Column 0: No.
          pdf.rect(xPos, cellTop, colWidths[0], rowHeight);
          xPos += colWidths[0];
          
          // Column 1: Short Name
          pdf.rect(xPos, cellTop, colWidths[1], rowHeight);
          xPos += colWidths[1];
          
          // Column 2: Legal/English Name (no right border)
          pdf.line(xPos, cellTop, xPos + colWidths[2], cellTop);
          pdf.line(xPos, cellTop, xPos, cellTop + rowHeight);
          pdf.line(xPos, cellTop + rowHeight, xPos + colWidths[2], cellTop + rowHeight);
          xPos += colWidths[2];
          
          // Column 3: Logo (no left border)
          pdf.line(xPos, cellTop, xPos + colWidths[3], cellTop);
          pdf.line(xPos + colWidths[3], cellTop, xPos + colWidths[3], cellTop + rowHeight);
          pdf.line(xPos, cellTop + rowHeight, xPos + colWidths[3], cellTop + rowHeight);
          xPos += colWidths[3];
          
          // Column 4: Role
          pdf.rect(xPos, cellTop, colWidths[4], rowHeight);
          xPos += colWidths[4];
          
          // Column 5: Country
          pdf.rect(xPos, cellTop, colWidths[5], rowHeight);
          
          // Draw cell content
          xPos = margin;
          
          const getVerticalCenter = (numLines: number) => {
            const textBlockHeight = numLines * lineHeightBody;
            return cellTop + (rowHeight - textBlockHeight) / 2 + lineHeightBody * 0.7;
          };
          
          // Column 0: Participant number
          pdf.setFont('times', 'normal');
          const numY = getVerticalCenter(1);
          pdf.text(String(participant.participantNumber || ''), xPos + cellPadding, numY);
          xPos += colWidths[0];
          
          // Column 1: Short name as bubble
          const shortName = participant.organisationShortName || '';
          if (shortName) {
            const bubbleY = cellTop + rowHeight / 2 + 1;
            drawPartnerBubble(shortName, xPos + cellPadding, bubbleY);
          }
          xPos += colWidths[1];
          
          // Column 2: Organisation name
          let textY = getVerticalCenter(totalOrgLines);
          pdf.setFont('times', 'normal');
          for (const line of legalLines) {
            pdf.text(line, xPos + cellPadding, textY);
            textY += lineHeightBody;
          }
          if (englishLines.length > 0) {
            pdf.setFont('times', 'italic');
            for (const line of englishLines) {
              pdf.text(line, xPos + cellPadding, textY);
              textY += lineHeightBody;
            }
            pdf.setFont('times', 'normal');
          }
          xPos += colWidths[2];
          
          // Column 3: Logo
          if (participant.logoUrl) {
            try {
              const resolvedLogo = await resolveStorageUrl(participant.logoUrl);
              const logoData = resolvedLogo ? await loadImageAsBase64(resolvedLogo) : null;
              if (logoData) {
                const maxLogoWidth = colWidths[3] - 2;
                const maxLogoHeight = rowHeight - 2;
                let logoW = logoData.width * 0.264583;
                let logoH = logoData.height * 0.264583;
                
                if (logoW > maxLogoWidth) {
                  const scale = maxLogoWidth / logoW;
                  logoW *= scale;
                  logoH *= scale;
                }
                if (logoH > maxLogoHeight) {
                  const scale = maxLogoHeight / logoH;
                  logoW *= scale;
                  logoH *= scale;
                }
                
                const logoX = xPos + (colWidths[3] - logoW) / 2;
                const logoY = cellTop + (rowHeight - logoH) / 2;
                pdf.addImage(logoData.data, 'JPEG', logoX, logoY, logoW, logoH);
              }
            } catch (e) {
              // Logo failed to load
            }
          }
          xPos += colWidths[3];
          
          // Column 4: Roles - draw bubbles with wrapping
          let roleX = xPos + cellPadding;
          let roleY = cellTop + 5;
          const roleColWidthActual = colWidths[4] - cellPadding * 2;
          
          // Coordinator badge (red/burgundy)
          if (isCoordinator) {
            const bubbleWidth = drawBubble('Coord.', roleX, roleY, [185, 28, 28]); // Red
            roleX += bubbleWidth + 1.5;
            if (roleX + avgBubbleWidth > xPos + roleColWidthActual) {
              roleX = xPos + cellPadding;
              roleY += 5;
            }
          }
          
          // WP badges
          for (const wp of wpRoles) {
            const bubbleWidth = drawBubble(`WP${wp.wpNumber}`, roleX, roleY, hexToRgb(wp.color));
            roleX += bubbleWidth + 1.5;
            if (roleX + avgBubbleWidth > xPos + roleColWidthActual) {
              roleX = xPos + cellPadding;
              roleY += 5;
            }
          }
          
          // Case badges
          for (const c of caseRoles) {
             const bubbleLabel = c.prefix ? `${c.prefix}${c.caseNumber}` : (c.shortName || `${c.caseNumber}`);
             const bubbleWidth = drawBubble(bubbleLabel, roleX, roleY, hexToRgb(c.color));
            roleX += bubbleWidth + 1.5;
            if (roleX + avgBubbleWidth > xPos + roleColWidthActual) {
              roleX = xPos + cellPadding;
              roleY += 5;
            }
          }
          xPos += colWidths[4];
          
          // Column 5: Country
          pdf.setFont('times', 'normal');
          const countryY = getVerticalCenter(1);
          pdf.text(participant.country || '', xPos + cellPadding, countryY);
          
          yPosition = rowStartY + rowHeight;
        }
        
        yPosition += paragraphSpacing;
      };

      // ========== DOCUMENT CONTENT ==========

      // Set initial section for first page (List of participants)
      currentSectionName = 'List of participants';
      updatePageSection();

      // Add header to first page
      addHeader();

      // Title: Proposal title followed by acronym
      addTitle(proposal.title, proposal.acronym);

      // List of participants
      await addParticipantTable();

      // Get all Part B sections in order
      const partBSections = getPartBSections(sections);

      // Fetch WP data for Table 3.1.b page index
      const { data: wpDataForPageIndex } = await supabase
        .from('wp_drafts')
        .select('number, color')
        .eq('proposal_id', proposal.id)
        .order('number');
      const wpPageIndexData = wpDataForPageIndex || [];

      // Render all Part B sections
      for (const section of partBSections) {
        if (isH1Container(section)) {
          // Format section number: remove 'B' prefix and add period for heading
          const formattedNumber = section.number.replace(/^B/, '');
          addH1(`${formattedNumber}. ${section.title}`);
        } else if (isContentSection(section)) {
          // Format section number for H2
          const formattedNumber = section.number.replace(/^B/, '');
          // Update current section name for footer tracking
          currentSectionName = `B${formattedNumber}. ${section.title}`;
          updatePageSection();
          addH2(`${formattedNumber}. ${section.title}`);
          
          const isSection31 = formattedNumber === '3.1';
          let table31bReservedPage: number | null = null;
          let table31bReservedY: number | null = null;
          const wpStartPages = new Map<number, number>();
          
          // Get and render content
          const content = getSectionContent(section.id);
          console.log(`[PDF Export] Section ${section.id} (${section.number}): content length=${content.length}`);
          const blocks = parseHtmlContent(content);
          console.log(`[PDF Export] Section ${section.id}: ${blocks.length} blocks parsed`, blocks.map(b => b.type));
          
          for (const block of blocks) {
            switch (block.type) {
              case 'h3':
                addH3(block.text);
                break;
              case 'paragraph':
                addParagraph(block.text, block.segments);
                break;
              case 'image': {
                // Resolve storage paths to signed URLs before loading
                let imgSrc = block.src;
                try {
                  const resolved = await resolveStorageUrl(imgSrc);
                  if (resolved) imgSrc = resolved;
                } catch (e) {
                  // fallback to original src
                }
                await addImage(imgSrc, block.width, block.height, block.widthPercent);
                break;
              }
              case 'caption':
                addCaption(block.text, block.captionType);
                // After rendering Table 3.1.b caption, reserve space for WP page listing
                if (isSection31 && block.text.match(/Table\s+3\.1\.?b/i) && wpPageIndexData.length > 0) {
                  table31bReservedPage = pdf.internal.pages.length - 1;
                  table31bReservedY = yPosition;
                  // Reserve space: estimate lines needed for WP listing
                  const estimatedLines = Math.max(1, Math.ceil(wpPageIndexData.length / 5));
                  yPosition += lineHeightBody * Math.min(estimatedLines, 3);
                }
                break;
              case 'list':
                addList(block.items, block.ordered);
                break;
              case 'table':
                // Track WP description table starts in section 3.1
                if (isSection31 && block.rows.length > 0 && block.hasHeader) {
                  const headerText = block.rows[0]?.[0] || '';
                  const wpMatch = headerText.match(/Work\s*Package\s+(\d+)/i);
                  if (wpMatch) {
                    wpStartPages.set(parseInt(wpMatch[1]), pdf.internal.pages.length - 1);
                  }
                }
                addTable(block.rows, block.hasHeader);
                break;
            }
          }
          
          // Draw WP page listing in reserved space for Table 3.1.b
          if (isSection31 && table31bReservedPage !== null && table31bReservedY !== null && wpStartPages.size > 0) {
            const savedCurrentPage = pdf.internal.pages.length - 1;
            pdf.setPage(table31bReservedPage);
            
            pdf.setFontSize(FONT_SIZE_BODY);
            pdf.setFont('times', 'italic');
            pdf.setTextColor(...black);
            
            let drawX = margin;
            let drawY = table31bReservedY;
            const introText = '. WP descriptions start on the following pages: ';
            pdf.text(introText, drawX, drawY);
            drawX += pdf.getTextWidth(introText);
            
            const sortedWPs = Array.from(wpStartPages.entries()).sort((a, b) => a[0] - b[0]);
            
            for (let i = 0; i < sortedWPs.length; i++) {
              const [wpNum, pageNum] = sortedWPs[i];
              const wpColor = wpPageIndexData.find(w => w.number === wpNum)?.color || '#475569';
              const isLast = i === sortedWPs.length - 1;
              const pageText = isLast ? ` p.\u00A0${pageNum}` : ` p.\u00A0${pageNum}; `;
              
              // Check if bubble + page text fits on current line
              pdf.setFontSize(8);
              pdf.setFont('times', 'bold');
              const bubbleTextWidth = pdf.getTextWidth(`WP${wpNum}`) + 3; // padding
              pdf.setFontSize(FONT_SIZE_BODY);
              pdf.setFont('times', 'italic');
              const pageTextWidth = pdf.getTextWidth(pageText);
              
              if (drawX + bubbleTextWidth + pageTextWidth > margin + contentWidth && drawX > margin + 10) {
                drawX = margin;
                drawY += lineHeightBody;
              }
              
              // Draw WP bubble
              const bWidth = drawWPBubble(wpNum, drawX, drawY, wpColor);
              drawX += bWidth + 0.5;
              
              // Draw page text
              pdf.setFont('times', 'italic');
              pdf.setFontSize(FONT_SIZE_BODY);
              pdf.setTextColor(...black);
              pdf.text(pageText, drawX, drawY);
              drawX += pageTextWidth;
            }
            
            // Restore to current page
            pdf.setPage(savedCurrentPage);
          }
          
          if (!content) {
            addParagraph('[Section content to be completed]');
          }
          
          // After section 3.1 content, render B3.1 tables (Deliverables, Milestones, Risks)
          if (isSection31) {
            await renderB31Tables(proposal.id);
          }
        }
      }

      // Add headers and footers to all pages using the page-section map
      const totalPages = pdf.internal.pages.length - 1;
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        addHeader();
        // Get the section name for this page from the map
        const pageSectionName = pageSectionMap.get(i) || pageSectionMap.get(i - 1) || 'List of participants';
        addFooter(i, totalPages, pageSectionName);
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
