import { useCallback } from 'react';
import jsPDF from 'jspdf';
import { toast } from 'sonner';
import { Proposal, Section, Participant } from '@/types/proposal';
import { supabase } from '@/integrations/supabase/client';

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
        const stageText = proposal.submissionStage === 'stage_1' ? ' (Stage 1 of 2) | ' : ' | ';
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

      // Helper: Add title (14pt bold, 12pt paragraph spacing after) - CENTERED
      const addTitle = (text: string) => {
        checkPageBreak(15);
        pdf.setFontSize(FONT_SIZE_TITLE);
        pdf.setFont('times', 'bold');
        pdf.setTextColor(...black);
        
        const lines = pdf.splitTextToSize(text, contentWidth);
        for (const line of lines) {
          checkPageBreak(6);
          pdf.text(line, pageWidth / 2, yPosition, { align: 'center' });
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

      // Type for parsed content blocks
      type ContentBlock = 
        | { type: 'paragraph'; text: string }
        | { type: 'h3'; text: string }
        | { type: 'image'; src: string; width?: number; height?: number; widthPercent?: number }
        | { type: 'caption'; text: string; captionType: 'figure' | 'table' }
        | { type: 'table'; rows: string[][]; hasHeader: boolean };

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
        
        // Process nodes recursively
        const processNode = (node: Node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent?.trim();
            if (text) {
              result.push({ type: 'paragraph', text });
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
            
            // Regular paragraph
            result.push({ type: 'paragraph', text });
            return;
          }
          
          // Handle divs - check for special children and process
          if (tagName === 'div') {
            const hasSpecialChildren = element.querySelector('img, table, h3');
            if (!hasSpecialChildren) {
              const text = element.textContent?.trim();
              if (text) {
                const captionCheck = isCaptionText(text);
                if (captionCheck.isCaption) {
                  result.push({ type: 'caption', text, captionType: captionCheck.type });
                } else {
                  result.push({ type: 'paragraph', text });
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
        console.log('PDF Export - Caption text:', text, 'Type:', captionType);
        
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
        console.log('PDF Export - Label match:', labelMatch);
        
        if (labelMatch) {
          const label = labelMatch[1].endsWith('.') ? labelMatch[1] : labelMatch[1] + '.';
          const rest = text.substring(labelMatch[0].length).trim();
          console.log('PDF Export - Label:', label, 'Rest:', rest);
          
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
          console.log('PDF Export - No label match, using plain italic');
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

      // Helper: Add table to PDF
      const addTable = (rows: string[][], hasHeader: boolean) => {
        if (rows.length === 0) return;
        
        const numCols = Math.max(...rows.map(r => r.length));
        const colWidth = contentWidth / numCols;
        const rowHeight = 6;
        const cellPadding = 1;
        
        // Check if table fits on current page (at least header + 2 rows)
        checkPageBreak(rowHeight * Math.min(3, rows.length));
        
        pdf.setFontSize(FONT_SIZE_BODY);
        pdf.setDrawColor(...black);
        pdf.setLineWidth(0.25);
        
        for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
          const row = rows[rowIdx];
          const isHeaderRow = hasHeader && rowIdx === 0;
          
          checkPageBreak(rowHeight);
          
          // Draw row background for header
          if (isHeaderRow) {
            pdf.setFillColor(0, 0, 0);
            pdf.rect(margin, yPosition - 4, contentWidth, rowHeight, 'F');
          }
          
          // Draw cells
          for (let colIdx = 0; colIdx < numCols; colIdx++) {
            const cellX = margin + colIdx * colWidth;
            const cellText = row[colIdx] || '';
            
            // Draw cell border
            pdf.rect(cellX, yPosition - 4, colWidth, rowHeight);
            
            // Draw text
            if (isHeaderRow) {
              pdf.setFont('times', 'bold');
              pdf.setTextColor(255, 255, 255);
            } else {
              pdf.setFont('times', 'normal');
              pdf.setTextColor(...black);
            }
            
            // Truncate text to fit cell
            const maxTextWidth = colWidth - cellPadding * 2;
            let displayText = cellText;
            while (pdf.getTextWidth(displayText) > maxTextWidth && displayText.length > 3) {
              displayText = displayText.substring(0, displayText.length - 4) + '...';
            }
            
            pdf.text(displayText, cellX + cellPadding, yPosition);
          }
          
          yPosition += rowHeight;
        }
        
        pdf.setTextColor(...black);
        yPosition += paragraphSpacing;
      };

      // Helper: Add B3.1 table with custom column widths
      const addB31Table = (headers: string[], rows: string[][], colWidths: number[], tableCaption: string) => {
        if (rows.length === 0) return;
        
        // Add table caption first
        addCaption(tableCaption, 'table');
        
        const rowHeight = 6;
        const cellPadding = 1;
        const tableWidth = colWidths.reduce((a, b) => a + b, 0);
        
        // Check if table fits on current page (at least header + 2 rows)
        checkPageBreak(rowHeight * Math.min(3, rows.length + 1));
        
        pdf.setFontSize(FONT_SIZE_BODY);
        pdf.setDrawColor(...black);
        pdf.setLineWidth(0.25);
        
        // Draw header row
        let xPos = margin;
        pdf.setFillColor(0, 0, 0);
        pdf.rect(margin, yPosition - 4, tableWidth, rowHeight, 'F');
        pdf.setFont('times', 'bold');
        pdf.setTextColor(255, 255, 255);
        
        for (let i = 0; i < headers.length; i++) {
          pdf.rect(xPos, yPosition - 4, colWidths[i], rowHeight);
          const maxTextWidth = colWidths[i] - cellPadding * 2;
          let displayText = headers[i];
          while (pdf.getTextWidth(displayText) > maxTextWidth && displayText.length > 3) {
            displayText = displayText.substring(0, displayText.length - 4) + '...';
          }
          pdf.text(displayText, xPos + cellPadding, yPosition);
          xPos += colWidths[i];
        }
        yPosition += rowHeight;
        
        // Draw data rows
        pdf.setFont('times', 'normal');
        pdf.setTextColor(...black);
        
        for (const row of rows) {
          checkPageBreak(rowHeight);
          xPos = margin;
          
          for (let i = 0; i < colWidths.length; i++) {
            pdf.rect(xPos, yPosition - 4, colWidths[i], rowHeight);
            const cellText = row[i] || '';
            const maxTextWidth = colWidths[i] - cellPadding * 2;
            let displayText = cellText;
            while (pdf.getTextWidth(displayText) > maxTextWidth && displayText.length > 3) {
              displayText = displayText.substring(0, displayText.length - 4) + '...';
            }
            pdf.text(displayText, xPos + cellPadding, yPosition);
            xPos += colWidths[i];
          }
          yPosition += rowHeight;
        }
        
        pdf.setTextColor(...black);
        yPosition += paragraphSpacing * 2;
      };

      // Helper: Fetch and render B3.1 tables
      const renderB31Tables = async (proposalId: string) => {
        // Fetch deliverables
        const { data: deliverables } = await supabase
          .from('b31_deliverables')
          .select('*')
          .eq('proposal_id', proposalId)
          .order('order_index');
        
        // Fetch milestones
        const { data: milestones } = await supabase
          .from('b31_milestones')
          .select('*')
          .eq('proposal_id', proposalId)
          .order('order_index');
        
        // Fetch risks
        const { data: risks } = await supabase
          .from('b31_risks')
          .select('*')
          .eq('proposal_id', proposalId)
          .order('order_index');

        // Fetch participants for lead participant lookup
        const { data: parts } = await supabase
          .from('participants')
          .select('id, organisation_short_name, participant_number')
          .eq('proposal_id', proposalId);
        
        const participantMap = new Map(parts?.map(p => [p.id, p.organisation_short_name || `P${p.participant_number}`]) || []);

        // Table 3.1c - Deliverables
        if (deliverables && deliverables.length > 0) {
          const delHeaders = ['No.', 'Name', 'WP', 'Lead', 'Type', 'Diss.', 'Due'];
          const delColWidths = [15, 70, 15, 20, 20, 20, 20];
          const delRows = (deliverables as B31Deliverable[]).map(d => [
            d.number || '',
            d.name || '',
            d.wp_number ? `WP${d.wp_number}` : '',
            d.lead_participant_id ? (participantMap.get(d.lead_participant_id) || '') : '',
            d.type || '',
            d.dissemination_level || '',
            d.due_month ? `M${String(d.due_month).padStart(2, '0')}` : ''
          ]);
          addB31Table(delHeaders, delRows, delColWidths, 'Table 3.1c. List of deliverables');
        }

        // Table 3.1d - Milestones
        if (milestones && milestones.length > 0) {
          const msHeaders = ['No.', 'Name', 'Related WPs', 'Due', 'Means of verification'];
          const msColWidths = [15, 50, 30, 20, 65];
          const msRows = (milestones as B31Milestone[]).map(m => [
            `MS${m.number}`,
            m.name || '',
            m.wps || '',
            m.due_month ? `M${String(m.due_month).padStart(2, '0')}` : '',
            m.means_of_verification || ''
          ]);
          addB31Table(msHeaders, msRows, msColWidths, 'Table 3.1d. List of milestones');
        }

        // Table 3.1e - Risks
        if (risks && risks.length > 0) {
          const riskHeaders = ['No.', 'Description', 'WPs', '(i)', '(ii)', 'Mitigation'];
          const riskColWidths = [12, 55, 25, 12, 12, 64];
          const riskRows = (risks as B31Risk[]).map(r => [
            `R${r.number}`,
            r.description || '',
            r.wps || '',
            r.likelihood || '',
            r.severity || '',
            r.mitigation || ''
          ]);
          addB31Table(riskHeaders, riskRows, riskColWidths, 'Table 3.1e. Critical risks and mitigation measures');
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

      // Helper: Add participant table with logos, full width, and text wrapping
      const addParticipantTable = async () => {
        if (participants.length === 0) return;
        
        yPosition += paragraphSpacingH2;
        checkPageBreak(20);
        
        // Table header
        pdf.setFontSize(FONT_SIZE_H2);
        pdf.setFont('times', 'bold');
        pdf.setTextColor(...black);
        pdf.text('List of Participants', margin, yPosition);
        yPosition += 6;
        
        // Table configuration - full content width (180mm)
        // No., Short Name, Legal Name + English, Logo (no left border), Country
        const colWidths = [10, 25, 110, 15, 20]; // Total = 180mm = contentWidth
        const baseRowHeight = 6;
        const cellPadding = 1;
        const tableWidth = contentWidth;
        const logoHeight = 8; // Height for logo cell
        
        // Draw table header row
        checkPageBreak(baseRowHeight * 2);
        let xPos = margin;
        
        // Header background
        pdf.setFillColor(0, 0, 0);
        pdf.rect(xPos, yPosition - 4, tableWidth, baseRowHeight, 'F');
        
        // Header text - custom rendering for italic part
        pdf.setFontSize(FONT_SIZE_BODY);
        pdf.setTextColor(255, 255, 255);
        
        // Draw header borders and text
        pdf.setDrawColor(...black);
        pdf.setLineWidth(0.25);
        
        // Column 0: №
        pdf.setFont('times', 'bold');
        pdf.rect(xPos, yPosition - 4, colWidths[0], baseRowHeight);
        pdf.text('№', xPos + cellPadding, yPosition);
        xPos += colWidths[0];
        
        // Column 1: Short Name
        pdf.rect(xPos, yPosition - 4, colWidths[1], baseRowHeight);
        pdf.text('Short Name', xPos + cellPadding, yPosition);
        xPos += colWidths[1];
        
        // Column 2: Participant legal name | English name, if different (with italic part)
        pdf.rect(xPos, yPosition - 4, colWidths[2], baseRowHeight);
        const headerPart1 = 'Participant legal name | ';
        pdf.text(headerPart1, xPos + cellPadding, yPosition);
        const part1Width = pdf.getTextWidth(headerPart1);
        pdf.setFont('times', 'bolditalic');
        pdf.text('English name, if different', xPos + cellPadding + part1Width, yPosition);
        pdf.setFont('times', 'bold');
        xPos += colWidths[2];
        
        // Column 3: Logo (no left border - draw only top, right, bottom)
        // Draw top border
        pdf.line(xPos, yPosition - 4, xPos + colWidths[3], yPosition - 4);
        // Draw right border
        pdf.line(xPos + colWidths[3], yPosition - 4, xPos + colWidths[3], yPosition - 4 + baseRowHeight);
        // Draw bottom border
        pdf.line(xPos, yPosition - 4 + baseRowHeight, xPos + colWidths[3], yPosition - 4 + baseRowHeight);
        pdf.text('Logo', xPos + cellPadding, yPosition);
        xPos += colWidths[3];
        
        // Column 4: Country
        pdf.rect(xPos, yPosition - 4, colWidths[4], baseRowHeight);
        pdf.text('Country', xPos + cellPadding, yPosition);
        
        yPosition += baseRowHeight;
        
        // Draw data rows
        pdf.setFont('times', 'normal');
        pdf.setTextColor(...black);
        
        for (const participant of participants) {
          // Calculate row height based on content
          const orgColWidth = colWidths[2] - cellPadding * 2;
          
          // Build organisation text: legal name first, then English name in italics if different
          const englishName = participant.englishName || '';
          const legalName = participant.organisationName || '';
          
          // Calculate lines for legal name
          const legalLines = legalName ? pdf.splitTextToSize(legalName, orgColWidth) : [];
          // Calculate lines for English name (if different)
          const englishLines = (englishName && englishName !== legalName) 
            ? pdf.splitTextToSize(englishName, orgColWidth) 
            : [];
          
          const totalOrgLines = legalLines.length + englishLines.length;
          
          // Calculate row height: max of logo height, text lines, or base height
          const textHeight = Math.max(totalOrgLines * lineHeightBody, baseRowHeight);
          const rowHeight = Math.max(textHeight, logoHeight);
          
          checkPageBreak(rowHeight + 2);
          
          const rowStartY = yPosition;
          xPos = margin;
          
          // Draw cell borders for the entire row (except logo column left border)
          pdf.setDrawColor(...black);
          pdf.setLineWidth(0.25);
          
          // Column 0: No. - full border
          pdf.rect(xPos, rowStartY - 4, colWidths[0], rowHeight);
          xPos += colWidths[0];
          
          // Column 1: Short Name - full border
          pdf.rect(xPos, rowStartY - 4, colWidths[1], rowHeight);
          xPos += colWidths[1];
          
          // Column 2: Legal/English Name - full border
          pdf.rect(xPos, rowStartY - 4, colWidths[2], rowHeight);
          xPos += colWidths[2];
          
          // Column 3: Logo - no left border (draw top, right, bottom only)
          pdf.line(xPos, rowStartY - 4, xPos + colWidths[3], rowStartY - 4); // top
          pdf.line(xPos + colWidths[3], rowStartY - 4, xPos + colWidths[3], rowStartY - 4 + rowHeight); // right
          pdf.line(xPos, rowStartY - 4 + rowHeight, xPos + colWidths[3], rowStartY - 4 + rowHeight); // bottom
          xPos += colWidths[3];
          
          // Column 4: Country - full border
          pdf.rect(xPos, rowStartY - 4, colWidths[4], rowHeight);
          
          // Draw cell content
          xPos = margin;
          
          // Cell top is at rowStartY - 4, cell height is rowHeight
          // For vertical centering, calculate the starting Y for text block
          const cellTop = rowStartY - 4;
          
          // Helper to calculate vertically centered Y position for text
          const getVerticalCenter = (numLines: number) => {
            const textBlockHeight = numLines * lineHeightBody;
            return cellTop + (rowHeight - textBlockHeight) / 2 + lineHeightBody * 0.7; // 0.7 accounts for baseline
          };
          
          // Participant number (single line, vertically centered)
          pdf.setFont('times', 'normal');
          const numY = getVerticalCenter(1);
          pdf.text(String(participant.participantNumber || ''), xPos + cellPadding, numY);
          xPos += colWidths[0];
          
          // Short name (vertically centered)
          const shortName = participant.organisationShortName || '';
          const shortNameLines = pdf.splitTextToSize(shortName, colWidths[1] - cellPadding * 2);
          let textY = getVerticalCenter(shortNameLines.length);
          for (const line of shortNameLines) {
            pdf.text(line, xPos + cellPadding, textY);
            textY += lineHeightBody;
          }
          xPos += colWidths[1];
          
          // Organisation name: Legal name (normal), then English name (italic) if different
          // Vertically center the combined text block
          textY = getVerticalCenter(totalOrgLines);
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
          
          // Logo column (already vertically centered)
          if (participant.logoUrl) {
            try {
              const logoData = await loadImageAsBase64(participant.logoUrl);
              if (logoData) {
                // Scale logo to fit in cell
                const maxLogoWidth = colWidths[3] - 2;
                const maxLogoHeight = rowHeight - 2;
                let logoW = logoData.width * 0.264583; // px to mm
                let logoH = logoData.height * 0.264583;
                
                // Scale to fit
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
                
                // Center logo in cell
                const logoX = xPos + (colWidths[3] - logoW) / 2;
                const logoY = cellTop + (rowHeight - logoH) / 2;
                pdf.addImage(logoData.data, 'JPEG', logoX, logoY, logoW, logoH);
              }
            } catch (e) {
              // Logo failed to load, leave cell empty
            }
          }
          xPos += colWidths[3];
          
          // Country (single line, vertically centered)
          pdf.setFont('times', 'normal');
          const countryY = getVerticalCenter(1);
          pdf.text(participant.country || '', xPos + cellPadding, countryY);
          
          yPosition = rowStartY + rowHeight;
        }
        
        yPosition += paragraphSpacing;
      };

      // ========== DOCUMENT CONTENT ==========

      // Add header to first page
      addHeader();

      // Title: Proposal title followed by acronym in parentheses
      addTitle(`${proposal.title} (${proposal.acronym})`);

      // List of participants
      await addParticipantTable();

      // Get all Part B sections in order
      const partBSections = getPartBSections(sections);

      // Render all Part B sections
      for (const section of partBSections) {
        if (isH1Container(section)) {
          // Format section number: remove 'B' prefix and add period for heading
          const formattedNumber = section.number.replace(/^B/, '');
          addH1(`${formattedNumber}. ${section.title}`);
        } else if (isContentSection(section)) {
          // Format section number for H2
          const formattedNumber = section.number.replace(/^B/, '');
          addH2(`${formattedNumber}. ${section.title}`);
          
          // Get and render content
          const content = getSectionContent(section.id);
          const blocks = parseHtmlContent(content);
          
          for (const block of blocks) {
            switch (block.type) {
              case 'h3':
                addH3(block.text);
                break;
              case 'paragraph':
                addParagraph(block.text);
                break;
              case 'image':
                await addImage(block.src, block.width, block.height, block.widthPercent);
                break;
              case 'caption':
                addCaption(block.text, block.captionType);
                break;
              case 'table':
                addTable(block.rows, block.hasHeader);
                break;
            }
          }
          
          if (!content) {
            addParagraph('[Section content to be completed]');
          }
          
          // After section 3.1 content, render B3.1 tables (Deliverables, Milestones, Risks)
          const sectionNum = section.number.replace(/^B/, '');
          if (sectionNum === '3.1') {
            await renderB31Tables(proposal.id);
          }
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
