import { useCallback } from 'react';
import jsPDF from 'jspdf';
import { toast } from 'sonner';
import { Proposal, Participant, ParticipantMember, Section, PROPOSAL_TYPE_LABELS, PARTICIPANT_TYPE_LABELS } from '@/types/proposal';

interface SectionContent {
  id: string;
  sectionId: string;
  content: string;
}

interface BudgetItem {
  category: string;
  subcategory?: string;
  description?: string;
  amount: number;
  participantId: string;
}

interface WorkPackage {
  number: number;
  title: string;
  description?: string;
  leadParticipantId?: string;
  startMonth: number;
  endMonth: number;
}

interface ExportData {
  proposal: Proposal;
  participants: Participant[];
  participantMembers: ParticipantMember[];
  sectionContents: SectionContent[];
  budgetItems: BudgetItem[];
  workPackages?: WorkPackage[];
  sections: Section[];
}

export function usePdfExport() {
  const exportProposalToPdf = useCallback(async (data: ExportData) => {
    const { proposal, participants, participantMembers, sectionContents, budgetItems, workPackages, sections } = data;

    try {
      toast.info('Generating PDF...');

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 20;
      const contentWidth = pageWidth - margin * 2;
      let yPosition = margin;

      // Colors
      const euBlue = [0, 51, 153] as [number, number, number];
      const black = [0, 0, 0] as [number, number, number];
      const gray = [100, 100, 100] as [number, number, number];
      const lightGray = [200, 200, 200] as [number, number, number];

      // Helper functions
      const checkPageBreak = (requiredSpace: number): boolean => {
        if (yPosition + requiredSpace > pageHeight - margin - 15) {
          pdf.addPage();
          yPosition = margin;
          return true;
        }
        return false;
      };

      const addFooter = (pageNum: number, totalPages: number) => {
        pdf.setFontSize(9);
        pdf.setTextColor(...gray);
        pdf.text(proposal.acronym, margin, pageHeight - 10);
        pdf.text(`Page ${pageNum} of ${totalPages}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
        pdf.setDrawColor(...lightGray);
        pdf.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);
      };

      const addSectionHeader = (number: string, title: string, sectionTag?: string) => {
        checkPageBreak(20);
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(...euBlue);
        
        const headerText = `${number} ${title}`;
        pdf.text(headerText, margin, yPosition);
        
        // Render section tag on same line, right-aligned, 10pt mid-grey
        if (sectionTag) {
          pdf.setFontSize(10);
          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(128, 128, 128); // mid-grey
          pdf.text(sectionTag, pageWidth - margin, yPosition, { align: 'right' });
        }
        
        yPosition += 8;
        pdf.setDrawColor(...euBlue);
        pdf.setLineWidth(0.5);
        pdf.line(margin, yPosition, margin + 40, yPosition);
        yPosition += 8;
        pdf.setTextColor(...black);
        pdf.setFont('helvetica', 'normal');
      };

      const addParagraph = (text: string, fontSize = 10) => {
        pdf.setFontSize(fontSize);
        const lines = pdf.splitTextToSize(text, contentWidth);
        for (const line of lines) {
          checkPageBreak(6);
          pdf.text(line, margin, yPosition);
          yPosition += 5;
        }
        yPosition += 3;
      };

      const addTableRow = (cells: string[], isHeader = false, colWidths: number[]) => {
        checkPageBreak(8);
        const rowHeight = 7;
        let xPos = margin;

        if (isHeader) {
          pdf.setFillColor(240, 240, 240);
          pdf.rect(margin, yPosition - 5, contentWidth, rowHeight, 'F');
          pdf.setFont('helvetica', 'bold');
        } else {
          pdf.setFont('helvetica', 'normal');
        }

        pdf.setFontSize(8);
        cells.forEach((cell, i) => {
          const truncated = cell.length > 40 ? cell.substring(0, 37) + '...' : cell;
          pdf.text(truncated, xPos + 1, yPosition);
          xPos += colWidths[i];
        });

        yPosition += rowHeight;
      };

      // ========== COVER PAGE ==========
      // EU Flag placeholder
      pdf.setFillColor(...euBlue);
      pdf.rect(pageWidth / 2 - 20, 30, 40, 25, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(20);
      pdf.text('EU', pageWidth / 2, 47, { align: 'center' });

      // Title
      pdf.setTextColor(...euBlue);
      pdf.setFontSize(28);
      pdf.setFont('helvetica', 'bold');
      pdf.text(proposal.acronym, pageWidth / 2, 80, { align: 'center' });

      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(...black);
      const titleLines = pdf.splitTextToSize(proposal.title, contentWidth - 20);
      pdf.text(titleLines, pageWidth / 2, 95, { align: 'center' });

      // Proposal info box
      pdf.setDrawColor(...euBlue);
      pdf.setLineWidth(0.5);
      pdf.rect(margin + 20, 120, contentWidth - 40, 50);

      pdf.setFontSize(10);
      pdf.setTextColor(...gray);
      const infoY = 130;
      pdf.text(`Proposal Type: ${PROPOSAL_TYPE_LABELS[proposal.type]}`, pageWidth / 2, infoY, { align: 'center' });
      pdf.text(`Topic ID: ${proposal.topicId || 'Not specified'}`, pageWidth / 2, infoY + 10, { align: 'center' });
      pdf.text(`Total Budget: €${(proposal.totalBudget || 0).toLocaleString()}`, pageWidth / 2, infoY + 20, { align: 'center' });
      pdf.text(`Consortium: ${participants.length} organisations`, pageWidth / 2, infoY + 30, { align: 'center' });

      // Footer info
      pdf.setTextColor(...gray);
      pdf.setFontSize(10);
      pdf.text('Horizon Europe Framework Programme', pageWidth / 2, 200, { align: 'center' });
      pdf.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth / 2, 208, { align: 'center' });

      // ========== PART A - ADMINISTRATIVE INFORMATION ==========
      pdf.addPage();
      yPosition = margin;

      // Part A Header
      pdf.setFontSize(18);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...euBlue);
      pdf.text('PART A – ADMINISTRATIVE INFORMATION', margin, yPosition);
      yPosition += 15;

      // A.1 Consortium
      addSectionHeader('A.1', 'Consortium');
      addParagraph(`The consortium consists of ${participants.length} participating organisations from various countries.`);

      // Participants table
      const partColWidths = [10, 60, 40, 30, 30];
      addTableRow(['#', 'Organisation', 'Type', 'Country', 'Role'], true, partColWidths);
      participants.forEach((p, i) => {
        addTableRow(
          [
            String(i + 1),
            p.organisationName,
            PARTICIPANT_TYPE_LABELS[p.organisationType].substring(0, 15),
            p.country || '-',
            i === 0 ? 'Coordinator' : 'Partner',
          ],
          false,
          partColWidths
        );
      });
      yPosition += 5;

      // A.2 Budget Summary
      addSectionHeader('A.2', 'Budget Summary');
      const totalBudget = budgetItems.reduce((sum, item) => sum + item.amount, 0);
      addParagraph(`Total requested EU contribution: €${totalBudget.toLocaleString()}`);

      // Budget by participant
      const budgetColWidths = [10, 80, 40, 40];
      addTableRow(['#', 'Organisation', 'Budget (€)', '% Share'], true, budgetColWidths);
      participants.forEach((p, i) => {
        const partBudget = budgetItems
          .filter((b) => b.participantId === p.id)
          .reduce((sum, b) => sum + b.amount, 0);
        const percentage = totalBudget > 0 ? ((partBudget / totalBudget) * 100).toFixed(1) : '0';
        addTableRow(
          [String(i + 1), p.organisationShortName || p.organisationName, partBudget.toLocaleString(), `${percentage}%`],
          false,
          budgetColWidths
        );
      });
      yPosition += 5;

      // A.3 Work Packages (if available)
      if (workPackages && workPackages.length > 0) {
        addSectionHeader('A.3', 'Work Packages');
        const wpColWidths = [20, 70, 40, 40];
        addTableRow(['WP', 'Title', 'Lead', 'Duration'], true, wpColWidths);
        workPackages.forEach((wp) => {
          const lead = participants.find((p) => p.id === wp.leadParticipantId);
          addTableRow(
            [
              `WP${wp.number}`,
              wp.title,
              lead?.organisationShortName || lead?.organisationName || '-',
              `M${wp.startMonth}-M${wp.endMonth}`,
            ],
            false,
            wpColWidths
          );
        });
        yPosition += 5;
      }

      // ========== PART B - TECHNICAL PROPOSAL ==========
      pdf.addPage();
      yPosition = margin;

      pdf.setFontSize(18);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...euBlue);
      pdf.text('PART B – TECHNICAL PROPOSAL', margin, yPosition);
      yPosition += 15;

      // Process Part B sections
      const flattenSections = (sections: Section[]): Section[] => {
        const flat: Section[] = [];
        sections.forEach((s) => {
          if (!s.isPartA) {
            flat.push(s);
            if (s.subsections) {
              s.subsections.forEach((sub) => {
                if (!sub.isPartA) flat.push(sub);
              });
            }
          }
        });
        return flat;
      };

      const partBSections = flattenSections(sections);

      for (const section of partBSections) {
        const content = sectionContents.find((sc) => sc.sectionId === section.id);
        const plainText = content?.content
          ? content.content
              .replace(/<[^>]+>/g, ' ')
              .replace(/&nbsp;/g, ' ')
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/\s+/g, ' ')
              .trim()
          : '';

        if (plainText || section.subsections) {
          addSectionHeader(section.number, section.title);
          if (plainText) {
            addParagraph(plainText);
          } else {
            addParagraph('[Section content to be completed]', 10);
          }
        }
      }

      // ========== APPENDIX - TEAM MEMBERS ==========
      pdf.addPage();
      yPosition = margin;

      pdf.setFontSize(18);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...euBlue);
      pdf.text('APPENDIX – TEAM COMPOSITION', margin, yPosition);
      yPosition += 15;

      participants.forEach((p, i) => {
        checkPageBreak(30);
        addSectionHeader(`${i + 1}`, p.organisationName);

        const members = participantMembers.filter((m) => m.participantId === p.id);
        if (members.length > 0) {
          const memberColWidths = [60, 50, 30, 30];
          addTableRow(['Name', 'Role', 'PM', 'Contact'], true, memberColWidths);
          members.forEach((m) => {
            addTableRow(
              [m.fullName, m.roleInProject || '-', String(m.personMonths || '-'), m.isPrimaryContact ? 'Primary' : '-'],
              false,
              memberColWidths
            );
          });
        } else {
          addParagraph('No team members specified.');
        }
        yPosition += 5;
      });

      // Add footers to all pages
      const totalPages = pdf.internal.pages.length - 1;
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        addFooter(i, totalPages);
      }

      // Save
      const filename = `${proposal.acronym}_proposal_${new Date().toISOString().split('T')[0]}.pdf`;
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
        const pageHeight = pdf.internal.pageSize.getHeight();
        const margin = 25;
        const contentWidth = pageWidth - margin * 2;
        let yPosition = margin;

        const checkPageBreak = (requiredSpace: number) => {
          if (yPosition + requiredSpace > pageHeight - margin) {
            pdf.addPage();
            yPosition = margin;
          }
        };

        // Title page
        pdf.setFontSize(24);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(0, 51, 153);
        pdf.text(acronym, pageWidth / 2, 80, { align: 'center' });

        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(0, 0, 0);
        const titleLines = pdf.splitTextToSize(title, contentWidth);
        pdf.text(titleLines, pageWidth / 2, 100, { align: 'center' });

        // Content pages
        for (const section of sections) {
          pdf.addPage();
          yPosition = margin;

          pdf.setFontSize(14);
          pdf.setFont('helvetica', 'bold');
          pdf.text(`${section.number} ${section.title}`, margin, yPosition);
          yPosition += 10;

          pdf.setFontSize(11);
          pdf.setFont('helvetica', 'normal');

          const plainText = section.content.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();

          if (plainText) {
            const lines = pdf.splitTextToSize(plainText, contentWidth);
            for (const line of lines) {
              checkPageBreak(7);
              pdf.text(line, margin, yPosition);
              yPosition += 6;
            }
          }
        }

        const filename = `${acronym}_proposal_${new Date().toISOString().split('T')[0]}.pdf`;
        pdf.save(filename);

        toast.success('PDF exported successfully!');
      } catch (error) {
        console.error('PDF export error:', error);
        toast.error('Failed to export PDF.');
      }
    },
    []
  );

  return { exportToPdf, exportProposalToPdf };
}
