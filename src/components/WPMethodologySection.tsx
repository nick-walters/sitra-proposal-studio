import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { WPSimpleEditor } from '@/components/WPSimpleEditor';
import { BookOpen, Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WPMethodologySectionProps {
  methodology: string | null;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

const METHODOLOGY_TIPS = [
  {
    id: 'tip-1',
    title: 'Be specific about your choices',
    content: 'Explain WHY you chose these particular methods over alternatives. Evaluators want to see that you\'ve considered options and made informed decisions.',
  },
  {
    id: 'tip-2',
    title: 'Reference state-of-the-art',
    content: 'Show awareness of current best practices and explain how your approach builds on or improves existing methodologies.',
  },
  {
    id: 'tip-3',
    title: 'Acknowledge limitations',
    content: 'Being honest about methodological limitations and explaining your mitigation strategies demonstrates maturity and credibility.',
  },
  {
    id: 'tip-4',
    title: 'Link to objectives',
    content: 'Explicitly connect your methods to the objectives they support. Show evaluators that every methodological choice serves a purpose.',
  },
];

const METHODOLOGY_QUESTION = `Describe and explain the methodologies used in this WP, including the concepts, models and assumptions that underpin your work. Explain how they will enable you to deliver your project's objectives. Refer to any important challenges you may have identified in the chosen methodologies and how you intend to overcome them.`;

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

export function WPMethodologySection({ methodology, onChange, readOnly = false }: WPMethodologySectionProps) {
  const [guidelinesOpen, setGuidelinesOpen] = useState(false);

  return (
    <Card>
      <CardHeader className="py-2 px-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-4 w-4" />
            Methodology
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setGuidelinesOpen(true)}
            className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
          >
            <BookOpen className="h-4 w-4" />
            Guidelines
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 px-3 pb-3 pt-0">
        {/* Official question */}
        <div className="rounded-md border border-border bg-muted/30 p-2">
          <p className="text-sm text-muted-foreground italic">
            {METHODOLOGY_QUESTION}
          </p>
        </div>

        {/* Editor */}
        <WPSimpleEditor
          value={methodology || ''}
          onChange={onChange}
          placeholder="Describe your methodology..."
          disabled={readOnly}
          minHeight="150px"
        />
      </CardContent>

      {/* Guidelines Dialog */}
      <Dialog open={guidelinesOpen} onOpenChange={setGuidelinesOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] w-[90vw]">
          <DialogHeader>
            <DialogTitle>Guidelines for Methodology</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[75vh] pr-4">
            <div className="space-y-4">
              {/* Official Guidelines */}
              <div className="space-y-3">
                <h4 className="font-medium text-sm text-foreground">Official guidelines</h4>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">{METHODOLOGY_QUESTION}</p>
                </div>
              </div>

              {/* Sitra's Tips Box */}
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
                  {METHODOLOGY_TIPS.map((tip, index) => (
                    <div key={tip.id}>
                      {tip.title && (
                        <h4 className="font-semibold mb-2 text-gray-900">
                          {tip.title}
                        </h4>
                      )}
                      {parseGuidelineContent(tip.content)}
                      {index < METHODOLOGY_TIPS.length - 1 && (
                        <div className="mt-4 border-t border-current/10" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
