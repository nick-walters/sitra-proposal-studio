import { useCallback } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { toast } from 'sonner';

interface ExportOptions {
  title: string;
  acronym: string;
  sections: Array<{
    number: string;
    title: string;
    content: string;
  }>;
  footnotes?: Array<{
    number: number;
    citation: string;
  }>;
}

export function usePdfExport() {
  const exportToPdf = useCallback(async (options: ExportOptions) => {
    const { title, acronym, sections, footnotes } = options;

    try {
      toast.info("Generating PDF...");

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 25;
      const contentWidth = pageWidth - (margin * 2);
      let yPosition = margin;

      // Helper to add page break if needed
      const checkPageBreak = (requiredSpace: number) => {
        if (yPosition + requiredSpace > pageHeight - margin) {
          pdf.addPage();
          yPosition = margin;
          return true;
        }
        return false;
      };

      // Helper to add footer to each page
      const addFooter = (pageNum: number, totalPages: number) => {
        pdf.setFontSize(9);
        pdf.setTextColor(128, 128, 128);
        pdf.text(acronym, margin, pageHeight - 10);
        pdf.text(`Page ${pageNum} of ${totalPages}`, pageWidth - margin - 20, pageHeight - 10);
      };

      // Title page
      pdf.setFontSize(24);
      pdf.setFont('times', 'bold');
      pdf.setTextColor(0, 51, 153); // EU Blue
      pdf.text(acronym, pageWidth / 2, 80, { align: 'center' });

      pdf.setFontSize(14);
      pdf.setFont('times', 'normal');
      pdf.setTextColor(0, 0, 0);
      const titleLines = pdf.splitTextToSize(title, contentWidth);
      pdf.text(titleLines, pageWidth / 2, 100, { align: 'center' });

      pdf.setFontSize(11);
      pdf.setTextColor(128, 128, 128);
      pdf.text('Horizon Europe Proposal', pageWidth / 2, 130, { align: 'center' });
      pdf.text(new Date().toLocaleDateString(), pageWidth / 2, 138, { align: 'center' });

      // Content pages
      for (const section of sections) {
        pdf.addPage();
        yPosition = margin;

        // Section header
        pdf.setFontSize(14);
        pdf.setFont('times', 'bold');
        pdf.setTextColor(0, 0, 0);
        pdf.text(`${section.number} ${section.title}`, margin, yPosition);
        yPosition += 10;

        // Section content
        pdf.setFontSize(11);
        pdf.setFont('times', 'normal');
        
        // Strip HTML and convert to plain text
        const plainText = section.content
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .trim();

        if (plainText) {
          const contentLines = pdf.splitTextToSize(plainText, contentWidth);
          
          for (const line of contentLines) {
            checkPageBreak(7);
            pdf.text(line, margin, yPosition);
            yPosition += 6;
          }
        }
      }

      // Add footnotes on last page if present
      if (footnotes && footnotes.length > 0) {
        checkPageBreak(20);
        yPosition += 10;

        pdf.setDrawColor(200, 200, 200);
        pdf.line(margin, yPosition, margin + 50, yPosition);
        yPosition += 5;

        pdf.setFontSize(8);
        for (const footnote of footnotes) {
          checkPageBreak(10);
          const footnoteText = `${footnote.number}. ${footnote.citation}`;
          const footnoteLines = pdf.splitTextToSize(footnoteText, contentWidth);
          
          for (let i = 0; i < footnoteLines.length; i++) {
            pdf.text(footnoteLines[i], margin, yPosition);
            yPosition += 4;
          }
        }
      }

      // Add footers to all pages
      const totalPages = pdf.internal.pages.length - 1;
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        addFooter(i, totalPages);
      }

      // Save the PDF
      const filename = `${acronym}_proposal_${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(filename);

      toast.success("PDF exported successfully!");
    } catch (error) {
      console.error('PDF export error:', error);
      toast.error("Failed to export PDF. Please try again.");
    }
  }, []);

  const exportElementToPdf = useCallback(async (element: HTMLElement, filename: string) => {
    try {
      toast.info("Generating PDF...");

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(filename);
      toast.success("PDF exported successfully!");
    } catch (error) {
      console.error('PDF export error:', error);
      toast.error("Failed to export PDF. Please try again.");
    }
  }, []);

  return { exportToPdf, exportElementToPdf };
}
