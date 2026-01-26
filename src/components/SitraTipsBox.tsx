import { Lightbulb, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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
              <span className="text-amber-600 mt-0.5">•</span>
              <span className="text-sm text-muted-foreground">{bulletContent}</span>
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
    <div className={cn("rounded-lg border border-amber-200 bg-amber-50/50", className)}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center gap-2 p-3 hover:bg-amber-100/50 transition-colors">
            <Lightbulb className="h-4 w-4 text-amber-600 flex-shrink-0" />
            <span className="font-medium text-sm text-amber-800">Sitra's Tips</span>
            <span className="text-xs text-amber-600 ml-1">({tips.length})</span>
            <div className="ml-auto">
              {isOpen ? (
                <ChevronDown className="h-4 w-4 text-amber-600" />
              ) : (
                <ChevronRight className="h-4 w-4 text-amber-600" />
              )}
            </div>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 pb-3 space-y-4">
            {tips.map((tip) => (
              <div key={tip.id} className="space-y-1">
                {tip.title && (
                  <h4 className="font-medium text-sm text-amber-900">{tip.title}</h4>
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
