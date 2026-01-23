import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Info, Lightbulb, ClipboardCheck, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMemo } from "react";

export type GuidelineType = 'official' | 'sitra_tip' | 'evaluation';

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
  guidelines: Guideline[];
}

// Parse content to handle special markers (e.g., yellow exclamation marks become blue info icons)
function parseGuidelineContent(content: string): React.ReactNode {
  // Split by newlines to handle bullet points
  const lines = content.split('\n');
  
  return (
    <div className="space-y-2">
      {lines.map((line, index) => {
        // Check for warning markers (⚠️, ⚠, !, [!], etc.) at the start of line
        const hasWarning = /^[⚠️⚠!]/.test(line.trim());
        // Clean the line of warning markers at the start
        const cleanLine = line.replace(/^[⚠️⚠!]\s*/, '').trim();
        
        // Handle bullet points
        if (cleanLine.startsWith('•') || cleanLine.startsWith('-') || cleanLine.startsWith('–')) {
          const bulletContent = cleanLine.replace(/^[•\-–]\s*/, '');
          return (
            <div key={index} className="flex items-start gap-2 pl-2">
              <span className="text-muted-foreground mt-1">•</span>
              <span className="text-sm text-muted-foreground">{bulletContent}</span>
            </div>
          );
        }
        
        // Line starting with warning marker - show with blue info icon
        if (hasWarning && cleanLine) {
          return (
            <div key={index} className="flex items-start gap-2 mt-3 p-2 bg-blue-50 rounded border border-blue-200">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-blue-500" />
              <span className="text-sm text-blue-700">{cleanLine}</span>
            </div>
          );
        }
        
        // Regular line
        if (cleanLine) {
          return (
            <p key={index} className="text-sm text-muted-foreground">{cleanLine}</p>
          );
        }
        
        return null;
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
      label: "Official guidelines from European Commission",
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
      <div className="flex items-start gap-3">
        <div className={cn("mt-0.5 flex-shrink-0", iconColor)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="mb-3">
            <span className={cn("text-xs font-medium uppercase tracking-wide", titleColor)}>
              {label}
            </span>
          </div>
          
          {/* Render all guidelines of this type */}
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
      </div>
    </div>
  );
}

export function GuidelinesDialog({ isOpen, onClose, sectionTitle, guidelines }: GuidelinesDialogProps) {
  // Group guidelines by type and maintain order: evaluation, official, sitra_tip
  const groupedGuidelines = useMemo(() => {
    const groups: Record<GuidelineType, Guideline[]> = {
      evaluation: [],
      official: [],
      sitra_tip: [],
    };
    
    guidelines.forEach((g) => {
      if (groups[g.type]) {
        groups[g.type].push(g);
      }
    });
    
    return groups;
  }, [guidelines]);

  // Order of display
  const typeOrder: GuidelineType[] = ['evaluation', 'official', 'sitra_tip'];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] w-[90vw]">
        <DialogHeader>
          <DialogTitle>Guidelines for {sectionTitle}</DialogTitle>
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
