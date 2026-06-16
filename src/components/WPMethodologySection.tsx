import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { WPSimpleEditor } from '@/components/WPSimpleEditor';
import { BookOpen, Target, Plus, Trash2, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DebouncedInput } from '@/components/ui/debounced-input';

interface MethodologyItem {
  name: string;
  description: string;
}

interface WPMethodologySectionProps {
  backgroundKnowledge: string | null;
  onBackgroundKnowledgeChange: (value: string) => void;
  approachSummary: string | null;
  onApproachSummaryChange: (value: string) => void;
  methodologiesList: MethodologyItem[] | null;
  onMethodologiesListChange: (value: MethodologyItem[]) => void;
  foreseenChallenges: string | null;
  onForeseenChallengesChange: (value: string) => void;
  readOnly?: boolean;
  hideToolbar?: boolean;
}

export function WPMethodologySection({
  backgroundKnowledge,
  onBackgroundKnowledgeChange,
  approachSummary,
  onApproachSummaryChange,
  methodologiesList,
  onMethodologiesListChange,
  foreseenChallenges,
  onForeseenChallengesChange,
  readOnly = false,
  hideToolbar = false,
}: WPMethodologySectionProps) {
  const items = methodologiesList || [];

  const addMethodology = () => {
    onMethodologiesListChange([...items, { name: '', description: '' }]);
  };

  const updateMethodology = (index: number, field: 'name' | 'description', value: string) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    onMethodologiesListChange(updated);
  };

  const removeMethodology = (index: number) => {
    onMethodologiesListChange(items.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      {/* Objectives & Ambition Card */}
      <Card>
        <CardHeader className="py-2 px-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="h-4 w-4" />
            Objectives &amp; ambition
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 px-3 pb-3 pt-0">
          <p className="font-bold" style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '11pt' }}>
            What is the need for this WP?
          </p>
          <p className="text-muted-foreground italic" style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '11pt' }}>
            Describe the background knowledge in relation to this WP, i.e. provide a short literature review of the issues specific to this WP, including the concepts, models and assumptions that underpin your work, and citations.
          </p>
          <WPSimpleEditor
            value={backgroundKnowledge || ''}
            onChange={onBackgroundKnowledgeChange}
            placeholder="Describe the background knowledge."
            disabled={readOnly}
            minHeight="120px"
            hideToolbar={hideToolbar}
          />
        </CardContent>
      </Card>

      {/* Methodologies Card */}
      <Card>
        <CardHeader className="py-2 px-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-4 w-4" />
            Methodologies
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 px-3 pb-3 pt-0">
          {/* Subsection 1: Approach summary */}
          <div className="space-y-2">
            <p className="font-bold" style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '11pt' }}>
              Briefly, what is the approach of this WP as a whole?
            </p>
            <p className="text-muted-foreground italic" style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '11pt' }}>
              Briefly summarise the approaches of this WP, why they will be done, and how they will contribute to achieving the project's objectives. Do not go into details of the methodologies.
            </p>
            <WPSimpleEditor
              value={approachSummary || ''}
              onChange={onApproachSummaryChange}
              placeholder="Describe the overall approach."
              disabled={readOnly}
              minHeight="120px"
              hideToolbar={hideToolbar}
            />
          </div>

          {/* Subsection 2: Methodologies (dynamic list) */}
          <div className="space-y-2">
            <p className="font-bold" style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '11pt' }}>
              How will you do this?
            </p>
            <p className="text-muted-foreground italic" style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '11pt' }}>
              Describe in detail the methodologies that will be used to implement this WP. Think about this section as being equivalent to the methodologies section in a scientific article, rather than being about how the work is organised into tasks. Cite relevant methodologies and refer to any relevant preliminary data from the consortium's existing work.
            </p>
            <p className="text-muted-foreground italic" style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '11pt' }}>
              After describing an activity, mention the relevant task number in square brackets, e.g. "X will be done [T1.1]", but do not start each paragraph "T1.1 will do X" – the whole section should read as a narrative, i.e. an engaging story, and not as a list of tasks.
            </p>
            <p className="text-muted-foreground italic" style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '11pt' }}>
              Describe important interactions and flows of data, knowledge, expertise or outputs between tasks, or between this and other WPs. Do not list who will do what and when – that belongs in Part B3.1 in the WP description table (who does what) and Gantt chart (when).
            </p>

            {/* Dynamic methodology items */}
            <div className="space-y-3">
              {items.map((item, index) => (
                <div key={index} className="space-y-1 border border-border rounded-md p-2">
                  <div className="flex items-center gap-2">
                    <DebouncedInput
                      value={item.name}
                      onDebouncedChange={(val) => updateMethodology(index, 'name', val)}
                      placeholder="Methodology name"
                      className="flex-1 font-bold underline bg-background border-none shadow-none h-7 px-1"
                      style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '11pt' }}
                      disabled={readOnly}
                    />
                    {!readOnly && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() = aria-label="Delete" title="Delete"> removeMethodology(index)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <WPSimpleEditor
                    value={item.description}
                    onChange={(val) => updateMethodology(index, 'description', val)}
                    placeholder="Describe the methodology according to the instructions above."
                    disabled={readOnly}
                    minHeight="100px"
                    hideToolbar={hideToolbar}
                  />
                </div>
              ))}
            </div>

            {!readOnly && (
              <Button
                variant="outline"
                size="sm"
                className=""
                style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '11pt' }}
                onClick={addMethodology}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add methodology
              </Button>
            )}
          </div>

          {/* Subsection 3: Foreseen challenges */}
          <div className="space-y-2">
            <p className="font-bold" style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '11pt' }}>
              What issues could get in your way when implementing this WP?
            </p>
            <p className="text-muted-foreground italic" style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '11pt' }}>
              Describe any foreseen challenges related to the implementation of this WP and how they will be overcome. This means challenges relating to the approaches/methodologies and is not the same as critical risks for implementation. For example, a "critical risk" (described in the implementation section in Table 3.1.e) may be that there is difficulty engaging stakeholders in a project's multi-actor approach, e.g. lack of attendance at workshops to provide feedback. By contrast, the "foreseen challenge" related to the multi-actor approach to be described here in the methodology narrative (in Part B1.2) would be an acknowledgement in the design of the project's methodologies that this may be a challenge, and proposing ways of overcoming this challenge, e.g. by involving associations, NGOs, CSOs or other types of organisations to support in engaging stakeholders and local communities in the project.
            </p>
            <WPSimpleEditor
              value={foreseenChallenges || ''}
              onChange={onForeseenChallengesChange}
              placeholder="Describe foreseen challenges relating to these methodologies."
              disabled={readOnly}
              minHeight="120px"
              hideToolbar={hideToolbar}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
