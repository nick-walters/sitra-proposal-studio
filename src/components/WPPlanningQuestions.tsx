import { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
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
  const [localValue, setLocalValue] = useState(value || '');
  const [debounceTimeout, setDebounceTimeout] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setLocalValue(value || '');
  }, [value]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);

    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
    }

    const timeout = setTimeout(() => {
      onChange(newValue);
    }, 1000);

    setDebounceTimeout(timeout);
  }, [onChange, debounceTimeout]);

  useEffect(() => {
    return () => {
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }
    };
  }, [debounceTimeout]);

  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
      <p className="text-xs text-muted-foreground">{question}</p>
      <Textarea
        id={id}
        value={localValue}
        onChange={handleChange}
        placeholder={placeholder}
        className="min-h-[80px] resize-y"
        disabled={readOnly}
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
