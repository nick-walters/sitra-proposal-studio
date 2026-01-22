import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GuidelineBox } from "./GuidelineBox";
import { Section } from "@/types/proposal";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SaveIndicator } from "./SaveIndicator";
import { Loader2 } from "lucide-react";

interface GeneralInfoFormProps {
  proposalId: string;
  proposal: {
    acronym: string;
    title: string;
    topicId?: string;
    description?: string;
  } | null;
  section: Section;
  canEdit: boolean;
  onUpdateProposal: (updates: Record<string, any>) => Promise<void>;
}

interface FormData {
  abstract: string;
  keywords: string[];
}

export function GeneralInfoForm({
  proposalId,
  proposal,
  section,
  canEdit,
  onUpdateProposal,
}: GeneralInfoFormProps) {
  const [formData, setFormData] = useState<FormData>({
    abstract: '',
    keywords: [],
  });
  const [keywordInput, setKeywordInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // Load existing abstract from section_content
  useEffect(() => {
    const loadContent = async () => {
      if (!proposalId) return;
      
      try {
        const { data, error } = await supabase
          .from('section_content')
          .select('content')
          .eq('proposal_id', proposalId)
          .eq('section_id', 'a1')
          .maybeSingle();

        if (error) throw error;

        if (data?.content) {
          try {
            const parsed = JSON.parse(data.content);
            setFormData({
              abstract: parsed.abstract || '',
              keywords: parsed.keywords || [],
            });
          } catch {
            // If content is plain text, treat as abstract
            setFormData({
              abstract: data.content,
              keywords: [],
            });
          }
        }
      } catch (error) {
        console.error('Error loading general info:', error);
      }
      setLoading(false);
    };

    loadContent();
  }, [proposalId]);

  // Auto-save with debounce
  const saveContent = useCallback(async (data: FormData) => {
    if (!canEdit) return;
    
    setSaving(true);
    try {
      const content = JSON.stringify(data);
      
      const { error } = await supabase
        .from('section_content')
        .upsert({
          proposal_id: proposalId,
          section_id: 'a1',
          content,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'proposal_id,section_id',
        });

      if (error) throw error;
      setLastSaved(new Date());
    } catch (error) {
      console.error('Error saving general info:', error);
      toast.error('Failed to save changes');
    }
    setSaving(false);
  }, [proposalId, canEdit]);

  // Debounced save
  useEffect(() => {
    if (loading) return;
    
    const timeout = setTimeout(() => {
      saveContent(formData);
    }, 1000);

    return () => clearTimeout(timeout);
  }, [formData, loading, saveContent]);

  const handleAbstractChange = (value: string) => {
    setFormData(prev => ({ ...prev, abstract: value }));
  };

  const handleAddKeyword = () => {
    const keyword = keywordInput.trim();
    if (keyword && formData.keywords.length < 5 && !formData.keywords.includes(keyword)) {
      setFormData(prev => ({
        ...prev,
        keywords: [...prev.keywords, keyword],
      }));
      setKeywordInput('');
    }
  };

  const handleRemoveKeyword = (keyword: string) => {
    setFormData(prev => ({
      ...prev,
      keywords: prev.keywords.filter(k => k !== keyword),
    }));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddKeyword();
    }
  };

  // Word count for abstract (limit 2000 characters as per HE standard)
  const abstractCharCount = formData.abstract.length;
  const abstractWordCount = formData.abstract.trim() ? formData.abstract.trim().split(/\s+/).length : 0;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted/30">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6 bg-muted/30">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-primary border-primary">
              Section A1
            </Badge>
            <h1 className="text-xl font-semibold">General information</h1>
          </div>
          {canEdit && <SaveIndicator saving={saving} lastSaved={lastSaved} />}
        </div>

        {/* Guidelines */}
        {section.guidelinesArray && section.guidelinesArray.length > 0 ? (
          <div className="space-y-4">
            {section.guidelinesArray.map((guideline) => (
              <GuidelineBox
                key={guideline.id}
                type={guideline.type}
                title={guideline.title}
              >
                {guideline.content}
              </GuidelineBox>
            ))}
          </div>
        ) : (
          <GuidelineBox type="official" title="Official guidance">
            Complete the general information for your proposal. The abstract should summarize the proposal in a maximum of 2000 characters. Keywords help evaluators and reviewers understand the scope of your project.
          </GuidelineBox>
        )}

        {/* Proposal Summary Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Proposal summary</CardTitle>
            <CardDescription>
              Basic information about your proposal (editable in Proposal overview)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground text-sm">Acronym</Label>
                <p className="font-medium">{proposal?.acronym || '-'}</p>
              </div>
              <div>
                <Label className="text-muted-foreground text-sm">Topic ID</Label>
                <p className="font-medium">{proposal?.topicId || '-'}</p>
              </div>
            </div>
            <div>
              <Label className="text-muted-foreground text-sm">Title</Label>
              <p className="font-medium">{proposal?.title || '-'}</p>
            </div>
          </CardContent>
        </Card>

        {/* Abstract */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Abstract</CardTitle>
            <CardDescription>
              Provide a brief summary of your proposal (max 2000 characters)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={formData.abstract}
              onChange={(e) => handleAbstractChange(e.target.value)}
              placeholder="Enter your proposal abstract..."
              className="min-h-[200px] resize-none"
              maxLength={2000}
              disabled={!canEdit}
            />
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{abstractWordCount} words</span>
              <span className={abstractCharCount > 1800 ? 'text-warning' : ''}>
                {abstractCharCount} / 2000 characters
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Keywords */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Keywords</CardTitle>
            <CardDescription>
              Add up to 5 keywords that describe your proposal (max 5)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {canEdit && formData.keywords.length < 5 && (
              <div className="flex gap-2">
                <Input
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter a keyword..."
                  className="flex-1"
                />
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={handleAddKeyword}
                  disabled={!keywordInput.trim()}
                >
                  Add
                </Button>
              </div>
            )}
            
            <div className="flex flex-wrap gap-2">
              {formData.keywords.map((keyword, index) => (
                <Badge 
                  key={index} 
                  variant="secondary" 
                  className="px-3 py-1.5 text-sm"
                >
                  {keyword}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => handleRemoveKeyword(keyword)}
                      className="ml-2 hover:text-destructive"
                    >
                      ×
                    </button>
                  )}
                </Badge>
              ))}
              {formData.keywords.length === 0 && (
                <p className="text-sm text-muted-foreground italic">No keywords added yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
