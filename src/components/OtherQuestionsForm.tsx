import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SaveIndicator } from './SaveIndicator';
import { PartAGuidelinesDialog } from './PartAGuidelinesDialog';
import { Info, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface OtherQuestionsFormProps {
  proposalId: string;
  submissionStage?: string;
  canEdit: boolean;
}

interface FormData {
  isRevisedFromStage1: 'yes' | 'no' | '';
  substantialChanges: {
    partnership: boolean;
    budget: boolean;
    approach: boolean;
  };
  partnershipChanges: string;
  budgetChanges: string;
  approachChanges: string;
  involvesClinicalTrials: boolean;
  clinicalTrialsAcknowledged: boolean;
}

const officialGuidelines = [
  {
    id: 'two-stage-changes',
    title: 'Two-stage submission changes',
    content: 'For proposals submitted to two-stage calls, indicate if there are substantial changes compared to the first stage proposal. Substantial changes must be justified.',
  },
];

const sitraTips = [
  {
    id: 'stage1-tips',
    title: 'Changes from Stage 1',
    content: 'If your proposal was invited to Stage 2 after a successful Stage 1 evaluation, reviewers will compare both versions. Be transparent about significant changes and explain why they were made. Minor refinements don\'t need to be declared, but major shifts in partnership, budget allocation, or technical approach should be clearly documented.',
  },
];

export function OtherQuestionsForm({ proposalId, submissionStage, canEdit }: OtherQuestionsFormProps) {
  const [formData, setFormData] = useState<FormData>({
    isRevisedFromStage1: '',
    substantialChanges: {
      partnership: false,
      budget: false,
      approach: false,
    },
    partnershipChanges: '',
    budgetChanges: '',
    approachChanges: '',
    involvesClinicalTrials: false,
    clinicalTrialsAcknowledged: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // Load form content
  useEffect(() => {
    const loadContent = async () => {
      if (!proposalId) return;
      
      try {
        const { data, error } = await supabase
          .from('section_content')
          .select('content')
          .eq('proposal_id', proposalId)
          .eq('section_id', 'a5')
          .maybeSingle();

        if (error) throw error;

        if (data?.content) {
          try {
            const parsed = JSON.parse(data.content);
            setFormData({
              isRevisedFromStage1: parsed.isRevisedFromStage1 || '',
              substantialChanges: parsed.substantialChanges || {
                partnership: false,
                budget: false,
                approach: false,
              },
              partnershipChanges: parsed.partnershipChanges || '',
              budgetChanges: parsed.budgetChanges || '',
              approachChanges: parsed.approachChanges || '',
              involvesClinicalTrials: parsed.involvesClinicalTrials || false,
              clinicalTrialsAcknowledged: parsed.clinicalTrialsAcknowledged || false,
            });
          } catch {
            // Invalid JSON, use defaults
          }
        }
      } catch (error) {
        console.error('Error loading A5 content:', error);
      }
      setLoading(false);
    };

    loadContent();
  }, [proposalId]);

  // Auto-save content
  const saveContent = useCallback(async (data: FormData) => {
    if (!canEdit) return;
    
    setSaving(true);
    try {
      const content = JSON.stringify(data);
      
      const { error } = await supabase
        .from('section_content')
        .upsert({
          proposal_id: proposalId,
          section_id: 'a5',
          content,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'proposal_id,section_id',
        });

      if (error) throw error;
      setLastSaved(new Date());
    } catch (error) {
      console.error('Error saving A5 content:', error);
      toast.error('Failed to save changes');
    }
    setSaving(false);
  }, [proposalId, canEdit]);

  useEffect(() => {
    if (loading) return;
    
    const timeout = setTimeout(() => {
      saveContent(formData);
    }, 1000);

    return () => clearTimeout(timeout);
  }, [formData, loading, saveContent]);

  const updateFormData = (updates: Partial<FormData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
  };

  const isFullProposal = submissionStage === 'full' || submissionStage === 'stage_2';
  const showSubstantialChanges = formData.isRevisedFromStage1 === 'yes';

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted/30">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-4 bg-muted/30">
      <div className="max-w-4xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <PartAGuidelinesDialog
            sectionTitle="Part A5: Other questions"
            officialGuidelines={officialGuidelines}
            sitraTips={sitraTips}
          />
          {canEdit && <SaveIndicator saving={saving} lastSaved={lastSaved} />}
        </div>

        {/* Two-stage call question */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Info className="w-5 h-5" />
              Two-stage submission
            </CardTitle>
            <CardDescription>
              For proposals submitted to two-stage calls only
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <Label className="text-sm font-medium">
                If this proposal is a revised version of a first stage proposal, are there substantial 
                changes compared to the first stage version?
              </Label>
              <RadioGroup
                value={formData.isRevisedFromStage1}
                onValueChange={(v) => updateFormData({ isRevisedFromStage1: v as 'yes' | 'no' | '' })}
                disabled={!canEdit}
                className="flex gap-6"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="yes" id="revised-yes" />
                  <Label htmlFor="revised-yes" className="font-normal cursor-pointer">Yes</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="no" id="revised-no" />
                  <Label htmlFor="revised-no" className="font-normal cursor-pointer">No</Label>
                </div>
              </RadioGroup>
            </div>

            {showSubstantialChanges && (
              <div className="space-y-4 pt-4 border-t">
                <p className="text-sm text-muted-foreground">
                  Please indicate the type of changes and provide explanations:
                </p>

                {/* Partnership changes */}
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="change-partnership"
                      checked={formData.substantialChanges.partnership}
                      onCheckedChange={(checked) => updateFormData({
                        substantialChanges: { ...formData.substantialChanges, partnership: !!checked }
                      })}
                      disabled={!canEdit}
                    />
                    <Label htmlFor="change-partnership" className="font-medium cursor-pointer">
                      Partnership
                    </Label>
                  </div>
                  {formData.substantialChanges.partnership && (
                    <Textarea
                      value={formData.partnershipChanges}
                      onChange={(e) => updateFormData({ partnershipChanges: e.target.value })}
                      placeholder="Describe the changes to the consortium partnership..."
                      className="min-h-[80px] ml-6"
                      disabled={!canEdit}
                    />
                  )}
                </div>

                {/* Budget changes */}
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="change-budget"
                      checked={formData.substantialChanges.budget}
                      onCheckedChange={(checked) => updateFormData({
                        substantialChanges: { ...formData.substantialChanges, budget: !!checked }
                      })}
                      disabled={!canEdit}
                    />
                    <Label htmlFor="change-budget" className="font-medium cursor-pointer">
                      Budget
                    </Label>
                  </div>
                  {formData.substantialChanges.budget && (
                    <Textarea
                      value={formData.budgetChanges}
                      onChange={(e) => updateFormData({ budgetChanges: e.target.value })}
                      placeholder="Describe the changes to the budget allocation..."
                      className="min-h-[80px] ml-6"
                      disabled={!canEdit}
                    />
                  )}
                </div>

                {/* Approach changes */}
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="change-approach"
                      checked={formData.substantialChanges.approach}
                      onCheckedChange={(checked) => updateFormData({
                        substantialChanges: { ...formData.substantialChanges, approach: !!checked }
                      })}
                      disabled={!canEdit}
                    />
                    <Label htmlFor="change-approach" className="font-medium cursor-pointer">
                      Approach
                    </Label>
                  </div>
                  {formData.substantialChanges.approach && (
                    <Textarea
                      value={formData.approachChanges}
                      onChange={(e) => updateFormData({ approachChanges: e.target.value })}
                      placeholder="Describe the changes to the technical or methodological approach..."
                      className="min-h-[80px] ml-6"
                      disabled={!canEdit}
                    />
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Clinical trials */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Clinical trials
            </CardTitle>
            <CardDescription>
              For proposals involving clinical studies
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start space-x-2">
              <Checkbox
                id="clinical-trials"
                checked={formData.involvesClinicalTrials}
                onCheckedChange={(checked) => updateFormData({ involvesClinicalTrials: !!checked })}
                disabled={!canEdit}
                className="mt-1"
              />
              <div>
                <Label htmlFor="clinical-trials" className="font-medium cursor-pointer">
                  This proposal involves clinical trials
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  If your proposal involves clinical trials as defined by the Clinical Trial Regulation 
                  (EU 536/2014), a dedicated annex with additional information may be required.
                </p>
              </div>
            </div>

            {formData.involvesClinicalTrials && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-2">
                    <p>
                      For proposals involving clinical trials, you may need to provide additional 
                      documentation as a separate annex when submitting through the Funding & Tenders Portal.
                    </p>
                    <div className="flex items-center space-x-2 pt-2">
                      <Checkbox
                        id="clinical-acknowledged"
                        checked={formData.clinicalTrialsAcknowledged}
                        onCheckedChange={(checked) => updateFormData({ clinicalTrialsAcknowledged: !!checked })}
                        disabled={!canEdit}
                      />
                      <Label htmlFor="clinical-acknowledged" className="font-normal cursor-pointer">
                        I acknowledge that a clinical trials annex may be required
                      </Label>
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
