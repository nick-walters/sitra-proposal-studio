import { Lightbulb, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

/**
 * SitraTipsBox - Displays MULTIPLE Sitra tips in a collapsible container
 * 
 * Use for: Grouping multiple Sitra tips together with expand/collapse functionality.
 * Parses bullet points and handles multi-line content formatting.
 * 
 * For displaying a single guideline with styled box formatting, use GuidelineBox instead.
 */

interface SitraTip {
  id: string;
  title: string;
  content: string;
}

interface SitraTipsBoxProps {
  tips: SitraTip[];
  className?: string;
}

function parseContent(content: string): React.ReactNode {
  const lines = content.split('\n');
  
  return (
    <div className="space-y-1.5">
      {lines.map((line, index) => {
        const cleanLine = line.trim();
        
        // Handle bullet points
        if (cleanLine.startsWith('•') || cleanLine.startsWith('-') || cleanLine.startsWith('–')) {
          const bulletContent = cleanLine.replace(/^[•\-–]\s*/, '');
          return (
            <div key={index} className="flex items-start gap-1.5 ml-2">
              <span className="text-gray-600 mt-0.5">•</span>
              <span className="text-sm text-muted-foreground">{cleanLine.startsWith('•') || cleanLine.startsWith('-') || cleanLine.startsWith('–') ? bulletContent : cleanLine}</span>
            </div>
          );
        }
        
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

export function SitraTipsBox({ tips, className }: SitraTipsBoxProps) {
  const [isOpen, setIsOpen] = useState(true);

  if (!tips || tips.length === 0) return null;

  return (
    <div className={cn("rounded-lg border-2 border-gray-800 bg-gray-50/50", className)}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center gap-2 p-3 hover:bg-gray-100/50 transition-colors">
            <Lightbulb className="h-4 w-4 text-gray-800 flex-shrink-0" />
            <span className="font-bold text-sm text-gray-900">Sitra's tips</span>
            <span className="text-xs text-gray-600 ml-1">({tips.length})</span>
            <div className="ml-auto">
              {isOpen ? (
                <ChevronDown className="h-4 w-4 text-gray-600" />
              ) : (
                <ChevronRight className="h-4 w-4 text-gray-600" />
              )}
            </div>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 pb-3 space-y-4">
            {tips.map((tip) => (
              <div key={tip.id} className="space-y-1">
                {tip.title && (
                  <h4 className="font-medium text-sm text-gray-900">{tip.title}</h4>
                )}
                {parseContent(tip.content)}
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
