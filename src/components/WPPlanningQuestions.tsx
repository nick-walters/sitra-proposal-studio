import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { LazyRichField } from '@/components/participant/LazyRichField';
import { WP_DRAFT_FIELD_EXTENSIONS } from '@/components/wp/wpDraftFieldExtensions';
import { HelpCircle } from 'lucide-react';

interface WPPlanningQuestionsProps {
  inputs: string | null;
  outputs: string | null;
  bottlenecks: string | null;
  onInputsChange: (value: string) => void;
  onOutputsChange: (value: string) => void;
  onBottlenecksChange: (value: string) => void;
  readOnly?: boolean;
  /** Proposal the WP belongs to — required by the shared rich field. */
  proposalId?: string | null;
  /** Keep the mounted editor alive while a picker dialog is open. */
  shouldStayMounted?: () => boolean;
}

interface QuestionFieldProps {
  id: string;
  label: string;
  question: string;
  value: string | null;
  onChange: (value: string) => void;
  readOnly: boolean;
  proposalId?: string | null;
  shouldStayMounted?: () => boolean;
}

function QuestionField({
  id,
  label,
  question,
  value,
  onChange,
  readOnly,
  proposalId,
  shouldStayMounted,
}: QuestionFieldProps) {
  return (
    <div className="space-y-2" id={id}>
      <Label className="text-draft font-medium">{label}</Label>
      <p className="text-draft text-muted-foreground">{question}</p>
      <LazyRichField
        value={value || ''}
        onChange={onChange}
        disabled={readOnly}
        minHeight="80px"
        proposalId={proposalId ?? ''}
        staticExtensions={WP_DRAFT_FIELD_EXTENSIONS}
        shouldStayMounted={shouldStayMounted}
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
  proposalId,
  shouldStayMounted,
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
          readOnly={readOnly}
          proposalId={proposalId}
          shouldStayMounted={shouldStayMounted}
        />

        <QuestionField
          id="wp-outputs"
          label="Outputs"
          question="What are the main outputs this WP will produce that feed other WPs?"
          value={outputs}
          onChange={onOutputsChange}
          readOnly={readOnly}
          proposalId={proposalId}
          shouldStayMounted={shouldStayMounted}
        />

        <QuestionField
          id="wp-bottlenecks"
          label="Bottlenecks"
          question="What major bottlenecks could slow progress of the project's implementation if not completed on time?"
          value={bottlenecks}
          onChange={onBottlenecksChange}
          readOnly={readOnly}
          proposalId={proposalId}
          shouldStayMounted={shouldStayMounted}
        />
      </CardContent>
    </Card>
  );
}
