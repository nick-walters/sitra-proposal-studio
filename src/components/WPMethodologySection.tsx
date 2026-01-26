import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SitraTipsBox } from '@/components/SitraTipsBox';
import { WPSimpleEditor } from '@/components/WPSimpleEditor';
import { BookOpen } from 'lucide-react';

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

export function WPMethodologySection({ methodology, onChange, readOnly = false }: WPMethodologySectionProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BookOpen className="h-4 w-4" />
          Methodology
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Official question */}
        <div className="rounded-md border border-border bg-muted/30 p-4">
          <p className="text-sm text-muted-foreground italic">
            {METHODOLOGY_QUESTION}
          </p>
        </div>

        {/* Sitra's tips */}
        <SitraTipsBox tips={METHODOLOGY_TIPS} />

        {/* Editor */}
        <WPSimpleEditor
          value={methodology || ''}
          onChange={onChange}
          placeholder="Describe your methodology..."
          disabled={readOnly}
          minHeight="200px"
        />
      </CardContent>
    </Card>
  );
}
