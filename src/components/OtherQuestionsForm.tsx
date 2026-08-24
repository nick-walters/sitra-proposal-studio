import { useState, useEffect, useCallback, useRef } from 'react';
import { PartACard } from '@/components/PartACard';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { LazyRichField } from '@/components/participant/LazyRichField';
import { WP_DRAFT_FIELD_EXTENSIONS } from '@/components/wp/wpDraftFieldExtensions';
import { ensureRichHtml } from '@/lib/richTextUpgrade';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { SaveIndicator } from './SaveIndicator';
import { PartAPageLayout } from './PartAPageLayout';


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


export function OtherQuestionsForm({ proposalId, isTwoStageSecondStage, canEdit }: OtherQuestionsFormProps) {
  const [formData, setFormData] = useState<FormData>({
    hasSubstantialDifferences: '',
    substantialDifferencesText: '',
    involvesClinicalTrials: '',
    clinicalTrials: [],
  });
  const [loading, setLoading] = useState(true);
  // Last value known to be in the database — the autosave effect skips the
  // write while the form still matches it, so opening A5 never upserts.
  const savedSnapshotRef = useRef<string | null>(null);
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
            const loaded: FormData = {
              hasSubstantialDifferences: parsed.hasSubstantialDifferences || '',
              substantialDifferencesText: parsed.substantialDifferencesText || '',
              involvesClinicalTrials: parsed.involvesClinicalTrials || '',
              clinicalTrials: parsed.clinicalTrials || [],
            };
            savedSnapshotRef.current = JSON.stringify(loaded);
            setFormData(loaded);
          } catch {
            // Invalid JSON, use defaults
          }
        }
      } catch (error) {
        console.error('Error loading A5 content:', error);
      }
      setFormData(prev => {
        if (savedSnapshotRef.current === null) savedSnapshotRef.current = JSON.stringify(prev);
        return prev;
      });
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
      savedSnapshotRef.current = JSON.stringify(data);
      setLastSaved(new Date());
    } catch (error) {
      console.error('Error saving A5 content:', error);
      toast.error('Failed to save changes');
    }
    setSaving(false);
  }, [proposalId, canEdit]);

  useEffect(() => {
    if (loading) return;
    // Touched-field guard — no write until the user changes something.
    if (savedSnapshotRef.current === JSON.stringify(formData)) return;

    const timeout = setTimeout(() => {
      saveContent(formData);
    }, 800);

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
    <PartAPageLayout
      title="Part A5: Other questions"
      proposalId={proposalId}
      saveIndicator={canEdit ? <SaveIndicator saving={saving} lastSaved={lastSaved} onSaveNow={() => saveContent(formData)} /> : undefined}
    >


        {/* Two-stage submission question - only for second stage proposals */}
        {isTwoStageSecondStage && (
          <PartACard
            collapseKey="a5.two-stage-submission"
            title="Two-stage submission"
            icon={<Info className="w-5 h-5" />}
            titleClassName="font-semibold text-base"
            description={
                <CardDescription>
                  For proposals submitted as the second stage in a two-stage call
                </CardDescription>
            }
            contentClassName="space-y-4"
          >
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
                {/* Rich text: legacy plain-string answers are upgraded to
                    HTML on read and only rewritten when edited. */}
                <LazyRichField
                  proposalId={proposalId}
                  value={ensureRichHtml(formData.substantialDifferencesText)}
                  onChange={(html) => updateFormData({ substantialDifferencesText: html })}
                  placeholder="List the substantial differences and indicate the reasons"
                  minHeight="120px"
                  disabled={!canEdit}
                  staticExtensions={WP_DRAFT_FIELD_EXTENSIONS}
                />
              </div>
            )}
          </PartACard>
        )}

        {/* Clinical trials */}
        <PartACard
          collapseKey="a5.clinical-studies-trials-investigations"
          title="Clinical studies / trials / investigations"
          icon={<AlertTriangle className="w-5 h-5" />}
          titleClassName="font-semibold text-base"
          contentClassName="space-y-4"
        >
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
                        className="h-8 w-8 text-destructive hover:text-destructive"
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
        </PartACard>
    </PartAPageLayout>
  );

}
