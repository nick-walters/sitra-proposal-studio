import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { SaveIndicator } from './SaveIndicator';
import { PartAGuidelinesDialog } from './PartAGuidelinesDialog';
import { Info, AlertTriangle, Plus, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface OtherQuestionsFormProps {
  proposalId: string;
  isTwoStageSecondStage?: boolean;
  canEdit: boolean;
}

interface ClinicalTrial {
  id: string;
  title: string;
  acronym: string;
}

interface FormData {
  // Substantial differences (only for two-stage second stage)
  hasSubstantialDifferences: 'yes' | 'no' | '';
  substantialDifferencesText: string;
  // Clinical trials
  involvesClinicalTrials: 'yes' | 'no' | '';
  clinicalTrials: ClinicalTrial[];
}

const officialGuidelines = [
  {
    id: 'two-stage-changes',
    title: 'Two-stage submission changes',
    content: 'For proposals submitted to two-stage calls, indicate if there are substantial changes compared to the first stage proposal. Substantial changes must be justified.',
  },
  {
    id: 'clinical-trials',
    title: 'Clinical trials',
    content: 'If clinical studies / trials / investigations are included in the work plan, provide a short title, an acronym or a unique identifier to each one, to be used as a reference / identifier in the other parts of the proposal.',
  },
];

const sitraTips = [
  {
    id: 'stage1-tips',
    title: 'Changes from Stage 1',
    content: 'If your proposal was invited to Stage 2 after a successful Stage 1 evaluation, reviewers will compare both versions. Be transparent about significant changes and explain why they were made.',
  },
];

export function OtherQuestionsForm({ proposalId, isTwoStageSecondStage, canEdit }: OtherQuestionsFormProps) {
  const [formData, setFormData] = useState<FormData>({
    hasSubstantialDifferences: '',
    substantialDifferencesText: '',
    involvesClinicalTrials: '',
    clinicalTrials: [],
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
              hasSubstantialDifferences: parsed.hasSubstantialDifferences || '',
              substantialDifferencesText: parsed.substantialDifferencesText || '',
              involvesClinicalTrials: parsed.involvesClinicalTrials || '',
              clinicalTrials: parsed.clinicalTrials || [],
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

  const addClinicalTrial = () => {
    const newTrial: ClinicalTrial = {
      id: crypto.randomUUID(),
      title: '',
      acronym: '',
    };
    updateFormData({ clinicalTrials: [...formData.clinicalTrials, newTrial] });
  };

  const removeClinicalTrial = (id: string) => {
    updateFormData({ 
      clinicalTrials: formData.clinicalTrials.filter(t => t.id !== id) 
    });
  };

  const updateClinicalTrial = (id: string, field: keyof Omit<ClinicalTrial, 'id'>, value: string) => {
    updateFormData({
      clinicalTrials: formData.clinicalTrials.map(t => 
        t.id === id ? { ...t, [field]: value } : t
      )
    });
  };

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

        {/* Two-stage submission question - only for second stage proposals */}
        {isTwoStageSecondStage && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Info className="w-5 h-5" />
                Two-stage submission
              </CardTitle>
              <CardDescription>
                For proposals submitted as the second stage in a two-stage call
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <Label className="text-sm font-medium">
                  Are there substantial differences compared to the stage one proposal?
                </Label>
                <RadioGroup
                  value={formData.hasSubstantialDifferences}
                  onValueChange={(v) => updateFormData({ hasSubstantialDifferences: v as 'yes' | 'no' | '' })}
                  disabled={!canEdit}
                  className="flex gap-6"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="yes" id="differences-yes" />
                    <Label htmlFor="differences-yes" className="font-normal cursor-pointer">Yes</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="no" id="differences-no" />
                    <Label htmlFor="differences-no" className="font-normal cursor-pointer">No</Label>
                  </div>
                </RadioGroup>
              </div>

              {formData.hasSubstantialDifferences === 'yes' && (
                <div className="space-y-2 pt-4 border-t">
                  <Label className="text-sm font-medium">
                    Please list the substantial differences, and indicate the reasons
                  </Label>
                  <Textarea
                    value={formData.substantialDifferencesText}
                    onChange={(e) => updateFormData({ substantialDifferencesText: e.target.value })}
                    placeholder="List the substantial differences and indicate the reasons"
                    className="min-h-[120px]"
                    disabled={!canEdit}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Clinical trials */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Clinical studies / trials / investigations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <Label className="text-sm font-medium">
                Are clinical studies / trials / investigations included in the work plan of this project?
              </Label>
              <RadioGroup
                value={formData.involvesClinicalTrials}
                onValueChange={(v) => updateFormData({ involvesClinicalTrials: v as 'yes' | 'no' | '' })}
                disabled={!canEdit}
                className="flex gap-6"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="yes" id="clinical-yes" />
                  <Label htmlFor="clinical-yes" className="font-normal cursor-pointer">Yes</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="no" id="clinical-no" />
                  <Label htmlFor="clinical-no" className="font-normal cursor-pointer">No</Label>
                </div>
              </RadioGroup>
            </div>

            {formData.involvesClinicalTrials === 'yes' && (
              <div className="space-y-4 pt-4 border-t">
                <Label className="text-sm text-muted-foreground">
                  Please give a short title, an acronym or a unique identifier to each clinical study / trial / investigation, to be used as a reference / identifier in the other parts of the proposal
                </Label>

                {/* List of clinical trials */}
                <div className="space-y-3">
                  {formData.clinicalTrials.map((trial, index) => (
                    <div key={trial.id} className="flex items-start gap-3 p-3 border rounded-lg bg-muted/30">
                      <span className="text-sm font-medium text-muted-foreground mt-2">
                        {index + 1}.
                      </span>
                      <div className="flex-1 grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Short title</Label>
                          <Input
                            value={trial.title}
                            onChange={(e) => updateClinicalTrial(trial.id, 'title', e.target.value)}
                            placeholder="Enter short title"
                            className="h-8 text-sm"
                            disabled={!canEdit}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Acronym / Identifier</Label>
                          <Input
                            value={trial.acronym}
                            onChange={(e) => updateClinicalTrial(trial.id, 'acronym', e.target.value)}
                            placeholder="Enter acronym or identifier"
                            className="h-8 text-sm"
                            disabled={!canEdit}
                          />
                        </div>
                      </div>
                      {canEdit && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => removeClinicalTrial(trial.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Add trial button */}
                {canEdit && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addClinicalTrial}
                    className="gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Add clinical study / trial / investigation
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
