import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { WPSimpleEditor } from '@/components/WPSimpleEditor';
import { HelpCircle } from 'lucide-react';

interface WPPlanningQuestionsProps {
  inputs: string | null;
  outputs: string | null;
  bottlenecks: string | null;
  onInputsChange: (value: string) => void;
  onOutputsChange: (value: string) => void;
  onBottlenecksChange: (value: string) => void;
  readOnly?: boolean;
}

interface QuestionFieldProps {
  id: string;
  label: string;
  question: string;
  value: string | null;
  onChange: (value: string) => void;
  placeholder: string;
  readOnly: boolean;
}

function QuestionField({ id, label, question, value, onChange, placeholder, readOnly }: QuestionFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-xs font-medium">{label}</Label>
      <p className="text-xs text-muted-foreground">{question}</p>
      <WPSimpleEditor
        value={value || ''}
        onChange={onChange}
        placeholder={placeholder}
        disabled={readOnly}
        minHeight="80px"
        hideToolbar={true}
      />
    </div>
  );
}

export function WPPlanningQuestions({
  inputs,
  outputs,
  bottlenecks,
  onInputsChange,
  onOutputsChange,
  onBottlenecksChange,
  readOnly = false,
}: WPPlanningQuestionsProps) {
  return (
    <Card>
      <CardHeader className="py-2 px-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <HelpCircle className="h-4 w-4" />
          Task interactions & bottlenecks
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-3 pb-3 pt-0">
        <QuestionField
          id="wp-inputs"
          label="Inputs"
          question="What are the main inputs this WP needs from other WPs or external sources?"
          value={inputs}
          onChange={onInputsChange}
          placeholder="e.g. Requirements from WP1, Data from external stakeholders..."
          readOnly={readOnly}
        />

        <QuestionField
          id="wp-outputs"
          label="Outputs"
          question="What are the main outputs this WP will produce that feed other WPs?"
          value={outputs}
          onChange={onOutputsChange}
          placeholder="e.g. Design specifications for WP3, Validated models for WP4..."
          readOnly={readOnly}
        />

        <QuestionField
          id="wp-bottlenecks"
          label="Bottlenecks"
          question="What major bottlenecks could slow progress of the project's implementation if not completed on time?"
          value={bottlenecks}
          onChange={onBottlenecksChange}
          placeholder="e.g. Ethical approval for data collection, Hardware procurement lead times..."
          readOnly={readOnly}
        />
      </CardContent>
    </Card>
  );
}
