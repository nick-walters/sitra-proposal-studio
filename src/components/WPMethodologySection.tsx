import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { WPSimpleEditor } from '@/components/WPSimpleEditor';
import { BookOpen } from 'lucide-react';

interface WPMethodologySectionProps {
  methodology: string | null;
  onChange: (value: string) => void;
  readOnly?: boolean;
  hideToolbar?: boolean;
}

const METHODOLOGY_QUESTION = `Describe and explain the methodologies used in this WP, including the concepts, models and assumptions that underpin your work. Explain how they will enable you to deliver your project's objectives. Refer to any important challenges you may have identified in the chosen methodologies and how you intend to overcome them.`;

export function WPMethodologySection({ 
  methodology, 
  onChange, 
  readOnly = false,
  hideToolbar = false,
}: WPMethodologySectionProps) {
  return (
    <Card>
      <CardHeader className="py-2 px-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BookOpen className="h-4 w-4" />
          Methodology
        </CardTitle>
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
          hideToolbar={hideToolbar}
        />
      </CardContent>
    </Card>
  );
}
