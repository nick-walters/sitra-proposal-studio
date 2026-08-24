import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Info, Lightbulb, ClipboardCheck, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMemo } from "react";
import DOMPurify from "dompurify";
import { FOOTNOTE_CONFIG } from "@/lib/sanitizePresets";

export type GuidelineType = 'official' | 'sitra_tip' | 'evaluation' | 'criteria';

interface Guideline {
  id: string;
  type: GuidelineType;
  title: string;
  content: string;
}

interface GuidelinesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  sectionTitle: string;
  /** Overrides the default "Guidelines for …" heading. */
  dialogTitle?: string;
  guidelines: Guideline[];
}

/**
 * Guideline content is stored as HTML: the Commission wording carries `<br>`
 * breaks, `&amp;` entities and anchors that must stay clickable. It is split
 * into paragraphs on blank lines / double breaks, and any paragraph opening
 * with a warning marker becomes a highlighted note.
 */
const HTML_CONFIG = {
  ALLOWED_TAGS: [...FOOTNOTE_CONFIG.ALLOWED_TAGS, 'ul', 'ol', 'li', 'p'],
  ALLOWED_ATTR: FOOTNOTE_CONFIG.ALLOWED_ATTR,
};

const LINK_CLASSES =
  "[&_a]:text-inherit [&_a]:underline [&_a]:break-words [&_a]:font-medium";

function sanitize(html: string): string {
  return DOMPurify.sanitize(html, HTML_CONFIG);
}

function splitParagraphs(content: string): string[] {
  return content
    // double <br> = paragraph break; single newlines behave the same way for
    // the older plain-text rows that have not been re-seeded as HTML.
    .split(/(?:\s*<br\s*\/?>\s*){2,}|\n{2,}|\n/i)
    .map((p) => p.trim())
    .filter(Boolean);
}

function parseGuidelineContent(content: string): React.ReactNode {
  const paragraphs = splitParagraphs(content);

  return (
    <div className="space-y-2">
      {paragraphs.map((para, index) => {
        const isWarning = /^[⚠️⚠!]/.test(para);
        const clean = para.replace(/^[⚠️⚠!]\s*/, '').trim();
        if (!clean) return null;

        if (isWarning) {
          return (
            <div
              key={index}
              className={cn(
                "flex items-start gap-2 mt-3 p-2 bg-blue-50 rounded border border-blue-200 text-blue-700",
                LINK_CLASSES,
              )}
            >
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-blue-500" />
              <span
                className="text-sm"
                dangerouslySetInnerHTML={{ __html: sanitize(clean) }}
              />
            </div>
          );
        }

        // Bullet lines kept from the older plain-text rows.
        if (/^[•\-–]\s/.test(clean)) {
          return (
            <div key={index} className="flex items-start gap-1.5">
              <span className="text-muted-foreground mt-0.5">•</span>
              <span
                className={cn("text-sm text-muted-foreground", LINK_CLASSES)}
                dangerouslySetInnerHTML={{
                  __html: sanitize(clean.replace(/^[•\-–]\s*/, '')),
                }}
              />
            </div>
          );
        }

        return (
          <p
            key={index}
            className={cn("text-sm text-muted-foreground", LINK_CLASSES)}
            dangerouslySetInnerHTML={{ __html: sanitize(clean) }}
          />
        );
      })}
    </div>
  );
}

// Consolidated guideline box for a single type with multiple items
function ConsolidatedGuidelineBox({ 
  type, 
  guidelines 
}: { 
  type: GuidelineType; 
  guidelines: Guideline[];
}) {
  const config = {
    criteria: {
      icon: ClipboardCheck,
      label: "Evaluation criteria for this section",
      borderColor: "border-destructive",
      titleColor: "text-destructive",
      bgColor: "bg-destructive/5",
      iconColor: "text-destructive",
    },
    evaluation: {
      icon: ClipboardCheck,
      label: "Evaluation criterion",
      borderColor: "border-amber-500",
      titleColor: "text-amber-700",
      bgColor: "bg-amber-50/50",
      iconColor: "text-amber-600",
    },
    official: {
      icon: Info,
      label: "Official guidelines from the European Commission",
      borderColor: "border-blue-500",
      titleColor: "text-blue-600",
      bgColor: "bg-blue-50/50",
      iconColor: "text-blue-500",
    },
    sitra_tip: {
      icon: Lightbulb,
      label: "Sitra's tips",
      borderColor: "border-gray-800",
      titleColor: "text-gray-900",
      bgColor: "bg-gray-50/50",
      iconColor: "text-gray-800",
    },
  };

  const { icon: Icon, label, borderColor, titleColor, bgColor, iconColor } = config[type];

  return (
    <div
      className={cn(
        "rounded-lg border-2 p-4",
        borderColor,
        bgColor
      )}
    >
      {/* Header row with icon and label */}
      <div className="flex items-center gap-2 mb-3">
        <div className={cn("flex-shrink-0", iconColor)}>
          <Icon className="h-5 w-5" />
        </div>
        <span className={cn("text-sm font-bold", titleColor)}>
          {label}
        </span>
      </div>
      
      {/* Content - no indent, aligned with icon */}
      <div className="space-y-4">
        {guidelines.map((guideline, index) => (
          <div key={guideline.id}>
            {guideline.title && (
              <h4 className={cn("font-semibold mb-2", titleColor)}>
                {guideline.title}
              </h4>
            )}
            {parseGuidelineContent(guideline.content)}
            {/* Add separator between multiple items, but not after last */}
            {index < guidelines.length - 1 && (
              <div className="mt-4 border-t border-current/10" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function GuidelinesDialog({
  isOpen,
  onClose,
  sectionTitle,
  dialogTitle,
  guidelines,
}: GuidelinesDialogProps) {
  // Group guidelines by type and maintain order: criteria, evaluation, official, sitra_tip
  const groupedGuidelines = useMemo(() => {
    const groups: Record<GuidelineType, Guideline[]> = {
      criteria: [],
      evaluation: [],
      official: [],
      sitra_tip: [],
    };
    
    guidelines.forEach((g) => {
      if (groups[g.type]) {
        groups[g.type].push(g);
      }
    });
    
    // Sort each group by order_index if available
    Object.keys(groups).forEach((key) => {
      groups[key as GuidelineType].sort((a, b) => {
        // If guidelines have an order property, sort by it
        const aOrder = (a as any).order_index ?? 0;
        const bOrder = (b as any).order_index ?? 0;
        return aOrder - bOrder;
      });
    });
    
    return groups;
  }, [guidelines]);

  // Order of display
  const typeOrder: GuidelineType[] = ['criteria', 'evaluation', 'official', 'sitra_tip'];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] w-[90vw]">
        <DialogHeader>
          <DialogTitle>{dialogTitle ?? `Guidelines for Part ${sectionTitle}`}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[75vh] pr-4">
          <div className="space-y-4">
            {typeOrder.map((type) => {
              const typeGuidelines = groupedGuidelines[type];
              if (typeGuidelines.length === 0) return null;
              
              return (
                <ConsolidatedGuidelineBox 
                  key={type} 
                  type={type} 
                  guidelines={typeGuidelines} 
                />
              );
            })}
            
            {guidelines.length === 0 && (
              <p className="text-muted-foreground text-center py-8">
                No guidelines available for this section.
              </p>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
