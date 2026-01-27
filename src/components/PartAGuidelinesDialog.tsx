import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { BookOpen, Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Guideline {
  id: string;
  title: string;
  content: string;
  type?: string;
}

interface PartAGuidelinesDialogProps {
  sectionTitle: string;
  officialGuidelines?: Guideline[];
  sitraTips?: Guideline[];
  className?: string;
}

// Parse content to handle bullet points
function parseGuidelineContent(content: string): React.ReactNode {
  const lines = content.split('\n');
  
  return (
    <div className="space-y-1.5">
      {lines.map((line, index) => {
        const cleanLine = line.trim();
        
        if (cleanLine.startsWith('•') || cleanLine.startsWith('-') || cleanLine.startsWith('–')) {
          const bulletContent = cleanLine.replace(/^[•\-–]\s*/, '');
          return (
            <div key={index} className="flex items-start gap-1.5">
              <span className="text-muted-foreground mt-0.5">•</span>
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

export function PartAGuidelinesDialog({
  sectionTitle,
  officialGuidelines = [],
  sitraTips = [],
  className,
}: PartAGuidelinesDialogProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const hasContent = officialGuidelines.length > 0 || sitraTips.length > 0;

  if (!hasContent) return null;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setDialogOpen(true)}
        className={cn("h-7 px-2 text-xs gap-1 text-destructive border-destructive/50 hover:bg-destructive/10 hover:text-destructive", className)}
      >
        <BookOpen className="h-3.5 w-3.5" />
        Guidelines
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] w-[90vw]">
          <DialogHeader>
            <DialogTitle>Guidelines for {sectionTitle}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[75vh] pr-4">
            <div className="space-y-4">
              {/* Official Guidelines - Blue styled box */}
              {officialGuidelines.length > 0 && (
                <div
                  className={cn(
                    "rounded-lg border-2 p-4",
                    "border-blue-500",
                    "bg-blue-50/50"
                  )}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex-shrink-0 text-blue-500">
                      <BookOpen className="h-5 w-5" />
                    </div>
                    <span className="text-sm font-bold text-blue-600">
                      Official guidelines from European Commission
                    </span>
                  </div>
                  
                  <div className="space-y-4">
                    {officialGuidelines.map((guideline, index) => (
                      <div key={guideline.id}>
                        {guideline.title && (
                          <h4 className="font-semibold mb-2 text-blue-600">
                            {guideline.title}
                          </h4>
                        )}
                        {parseGuidelineContent(guideline.content)}
                        {index < officialGuidelines.length - 1 && (
                          <div className="mt-4 border-t border-current/10" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sitra's Tips Box */}
              {sitraTips.length > 0 && (
                <div
                  className={cn(
                    "rounded-lg border-2 p-4",
                    "border-gray-800",
                    "bg-gray-50/50"
                  )}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex-shrink-0 text-gray-800">
                      <Lightbulb className="h-5 w-5" />
                    </div>
                    <span className="text-sm font-bold text-gray-900">
                      Sitra's tips
                    </span>
                  </div>
                  
                  <div className="space-y-4">
                    {sitraTips.map((tip, index) => (
                      <div key={tip.id}>
                        {tip.title && (
                          <h4 className="font-semibold mb-2 text-gray-900">
                            {tip.title}
                          </h4>
                        )}
                        {parseGuidelineContent(tip.content)}
                        {index < sitraTips.length - 1 && (
                          <div className="mt-4 border-t border-current/10" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
