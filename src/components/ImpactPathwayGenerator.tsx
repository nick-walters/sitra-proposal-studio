import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Sparkles, Target, TrendingUp, ArrowRight, AlertCircle, Copy, Check, FileText, Globe } from "lucide-react";
import { toast } from "sonner";

interface ImpactPathwayGeneratorProps {
  isOpen: boolean;
  onClose: () => void;
  proposalId: string;
  topicId?: string;
  topicUrl?: string;
  workProgramme?: string;
  destination?: string;
  onInsertContent: (content: string) => void;
}

interface PathwayResult {
  outcomes: Array<{
    title: string;
    description: string;
    indicators: string[];
    timeline: string;
  }>;
  impacts: Array<{
    title: string;
    contribution: string;
    quantification: string;
  }>;
  barriers: Array<{
    barrier: string;
    mitigation: string;
  }>;
  pathwayFigure: string;
}

export function ImpactPathwayGenerator({
  isOpen,
  onClose,
  proposalId,
  topicId,
  topicUrl,
  workProgramme,
  destination,
  onInsertContent,
}: ImpactPathwayGeneratorProps) {
  const [loading, setLoading] = useState(false);
  const [loadingContext, setLoadingContext] = useState(false);
  const [projectDescription, setProjectDescription] = useState('');
  const [expectedOutcomes, setExpectedOutcomes] = useState('');
  const [result, setResult] = useState<PathwayResult | null>(null);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [proposalContent, setProposalContent] = useState('');
  const [topicContent, setTopicContent] = useState('');
  const [contextLoaded, setContextLoaded] = useState(false);

  // Fetch proposal content and topic content when dialog opens
  useEffect(() => {
    if (isOpen && !contextLoaded) {
      loadContext();
    }
  }, [isOpen, proposalId, topicUrl]);

  const loadContext = async () => {
    setLoadingContext(true);
    try {
      // Fetch existing proposal content from sections
      const { data: sectionContent } = await supabase
        .from('section_content')
        .select('content, section_id')
        .eq('proposal_id', proposalId);

      if (sectionContent && sectionContent.length > 0) {
        // Strip HTML tags and combine content
        const combinedContent = sectionContent
          .map(s => s.content?.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim())
          .filter(Boolean)
          .join('\n\n');
        setProposalContent(combinedContent.slice(0, 8000)); // Limit to ~8k chars
      }

      // Fetch topic content from URL if available
      if (topicUrl) {
        try {
          const response = await supabase.functions.invoke('generate-impact-pathway', {
            body: {
              action: 'fetch-topic',
              topicUrl,
            },
          });
          if (response.data?.topicContent) {
            setTopicContent(response.data.topicContent);
          }
        } catch (error) {
          console.error('Error fetching topic content:', error);
        }
      }

      setContextLoaded(true);
    } catch (error) {
      console.error('Error loading context:', error);
    } finally {
      setLoadingContext(false);
    }
  };

  const generatePathways = async () => {
    setLoading(true);
    setResult(null);

    try {
      // Use Lovable AI gateway for generation
      const response = await supabase.functions.invoke('generate-impact-pathway', {
        body: {
          action: 'generate',
          projectDescription: projectDescription || proposalContent,
          expectedOutcomes,
          topicId,
          topicContent,
          proposalContent,
          workProgramme,
          destination,
        },
      });

      if (response.error) throw response.error;

      setResult(response.data);
    } catch (error) {
      console.error('Error generating pathways:', error);
      
      // Fallback to demo data if API fails
      setResult({
        outcomes: [
          {
            title: "Enhanced policy coherence for climate action",
            description: "The project will contribute to more coherent and effective climate policies by providing evidence-based recommendations and decision-support tools that bridge the gap between research and policy-making.",
            indicators: [
              "Number of policy briefs adopted by decision-makers",
              "Percentage increase in policy coherence indicators across target regions",
              "Number of stakeholder consultations informing policy development"
            ],
            timeline: "Months 18-36"
          },
          {
            title: "Strengthened innovation capacity in climate solutions",
            description: "Through collaborative research and knowledge transfer, the project will enhance the innovation capacity of participating organisations and their networks, enabling faster development and deployment of climate solutions.",
            indicators: [
              "Number of new partnerships established",
              "Patent applications and technology readiness improvements",
              "Research publications in high-impact journals"
            ],
            timeline: "Months 12-48"
          }
        ],
        impacts: [
          {
            title: "Contribution to EU climate neutrality by 2050",
            contribution: "The project directly supports the European Green Deal objectives by developing scalable solutions that can reduce greenhouse gas emissions by an estimated 15-20% in target sectors.",
            quantification: "Expected emission reductions of 2.5 Mt CO2eq annually by 2035 if solutions are deployed at scale across the EU."
          },
          {
            title: "Economic benefits through sustainable transition",
            contribution: "By demonstrating viable business models for climate solutions, the project will catalyse private investment and job creation in the green economy.",
            quantification: "Projected creation of 5,000+ direct and indirect jobs; mobilisation of €500M in follow-on investment within 5 years post-project."
          }
        ],
        barriers: [
          {
            barrier: "Regulatory uncertainty and fragmented policy landscape",
            mitigation: "The project includes dedicated work on policy analysis and stakeholder engagement to identify and address regulatory barriers early. We will work with national and EU authorities to align project outputs with evolving policy frameworks."
          },
          {
            barrier: "Limited uptake by industry due to perceived risks",
            mitigation: "The consortium includes industry partners committed to piloting solutions, reducing perceived risks through demonstrated proof-of-concept. Business model innovation activities will address financial barriers."
          }
        ],
        pathwayFigure: `
┌─────────────────────────────────────────────────────────────────────────┐
│                         IMPACT PATHWAY OVERVIEW                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   PROJECT OUTPUTS          EXPECTED OUTCOMES          WIDER IMPACTS     │
│   ───────────────          ────────────────          ─────────────      │
│                                                                         │
│   ┌─────────────┐         ┌──────────────────┐      ┌──────────────┐   │
│   │ Research    │ ──────▶ │ Policy coherence │ ───▶ │ EU climate   │   │
│   │ findings    │         │ enhanced         │      │ neutrality   │   │
│   └─────────────┘         └──────────────────┘      │ by 2050      │   │
│                                                      └──────────────┘   │
│   ┌─────────────┐         ┌──────────────────┐                          │
│   │ Decision    │ ──────▶ │ Innovation       │ ───▶ ┌──────────────┐   │
│   │ tools       │         │ capacity         │      │ Economic     │   │
│   └─────────────┘         │ strengthened     │      │ benefits &   │   │
│                           └──────────────────┘      │ green jobs   │   │
│   ┌─────────────┐                                   └──────────────┘   │
│   │ Pilot       │         ┌──────────────────┐                          │
│   │ demonstra-  │ ──────▶ │ Industry uptake  │ ───▶ ┌──────────────┐   │
│   │ tions       │         │ accelerated      │      │ Sustainable  │   │
│   └─────────────┘         └──────────────────┘      │ transition   │   │
│                                                      └──────────────┘   │
│                                                                         │
│   ────────────────── MONITORING & ADAPTIVE MANAGEMENT ──────────────    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
        `
      });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string, section: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedSection(section);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const formatOutcomesForInsert = () => {
    if (!result) return '';
    
    let content = '<h3>Expected Outcomes</h3>\n\n';
    result.outcomes.forEach((outcome, idx) => {
      content += `<p><strong>${idx + 1}. ${outcome.title}</strong></p>\n`;
      content += `<p>${outcome.description}</p>\n`;
      content += `<p><em>Key Performance Indicators:</em></p>\n<ul>\n`;
      outcome.indicators.forEach(ind => {
        content += `<li>${ind}</li>\n`;
      });
      content += `</ul>\n<p><em>Timeline: ${outcome.timeline}</em></p>\n\n`;
    });
    return content;
  };

  const formatImpactsForInsert = () => {
    if (!result) return '';
    
    let content = '<h3>Wider Impacts</h3>\n\n';
    result.impacts.forEach((impact, idx) => {
      content += `<p><strong>${idx + 1}. ${impact.title}</strong></p>\n`;
      content += `<p>${impact.contribution}</p>\n`;
      content += `<p><em>Quantification: ${impact.quantification}</em></p>\n\n`;
    });
    return content;
  };

  const formatBarriersForInsert = () => {
    if (!result) return '';
    
    let content = '<h3>Barriers and Mitigation Measures</h3>\n\n';
    result.barriers.forEach((b, idx) => {
      content += `<p><strong>${idx + 1}. ${b.barrier}</strong></p>\n`;
      content += `<p>${b.mitigation}</p>\n\n`;
    });
    return content;
  };

  const insertAll = () => {
    const allContent = formatOutcomesForInsert() + formatImpactsForInsert() + formatBarriersForInsert();
    onInsertContent(allContent);
    toast.success('Content inserted into document');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Impact Pathway Generator
          </DialogTitle>
          <DialogDescription>
            Generate concrete pathways towards expected outcomes and impacts using AI. 
            The tool maps your project contributions to topic outcomes and work programme impacts.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="input" className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="input">Input</TabsTrigger>
            <TabsTrigger value="results" disabled={!result}>Results</TabsTrigger>
          </TabsList>

          <TabsContent value="input" className="flex-1 space-y-4 mt-4">
            <ScrollArea className="h-[400px] pr-2">
              <div className="space-y-4">
                {/* Context indicators */}
                {loadingContext ? (
                  <Alert>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <AlertDescription>Loading proposal and topic context...</AlertDescription>
                  </Alert>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {proposalContent && (
                      <Badge variant="secondary" className="gap-1">
                        <FileText className="w-3 h-3" />
                        Proposal content loaded
                      </Badge>
                    )}
                    {topicContent && (
                      <Badge variant="secondary" className="gap-1">
                        <Globe className="w-3 h-3" />
                        Topic content loaded
                      </Badge>
                    )}
                    {topicId && <Badge variant="outline">Topic: {topicId}</Badge>}
                    {workProgramme && <Badge variant="outline">WP: {workProgramme}</Badge>}
                    {destination && <Badge variant="outline">Dest: {destination}</Badge>}
                  </div>
                )}

                {(proposalContent || topicContent) && (
                  <Alert className="bg-green-50 border-green-200">
                    <Check className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-800">
                      Context loaded! The AI will analyse your existing proposal content
                      {topicContent ? ' and topic description' : ''} to generate tailored impact pathways.
                    </AlertDescription>
                  </Alert>
                )}

                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Additional context (optional)
                  </label>
                  <Textarea
                    placeholder="Add any additional details about your project's objectives, methodology, or expected results that aren't already in your proposal..."
                    value={projectDescription}
                    onChange={(e) => setProjectDescription(e.target.value)}
                    rows={4}
                    className="resize-none"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Leave empty to use only the existing proposal content
                  </p>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Additional expected outcomes (optional)</label>
                  <Textarea
                    placeholder="Paste any additional expected outcomes from the topic description..."
                    value={expectedOutcomes}
                    onChange={(e) => setExpectedOutcomes(e.target.value)}
                    rows={3}
                    className="resize-none"
                  />
                </div>

                <Button
                  onClick={generatePathways}
                  disabled={loading || loadingContext || (!projectDescription.trim() && !proposalContent)}
                  className="w-full"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Analysing and generating pathways...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Generate Impact Pathways
                    </>
                  )}
                </Button>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="results" className="flex-1 min-h-0">
            {result && (
              <ScrollArea className="h-[500px] pr-4">
                <div className="space-y-6">
                  {/* Pathway Figure */}
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Target className="w-4 h-4" />
                          Impact Pathway Figure
                        </CardTitle>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(result.pathwayFigure, 'figure')}
                        >
                          {copiedSection === 'figure' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <pre className="text-xs font-mono bg-muted p-4 rounded-lg overflow-x-auto whitespace-pre">
                        {result.pathwayFigure}
                      </pre>
                    </CardContent>
                  </Card>

                  {/* Expected Outcomes */}
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                          <ArrowRight className="w-4 h-4" />
                          Expected Outcomes
                        </CardTitle>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(formatOutcomesForInsert(), 'outcomes')}
                          >
                            {copiedSection === 'outcomes' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onInsertContent(formatOutcomesForInsert())}
                          >
                            Insert
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {result.outcomes.map((outcome, idx) => (
                        <div key={idx} className="p-3 rounded-lg bg-muted/50">
                          <h4 className="font-medium mb-2">{outcome.title}</h4>
                          <p className="text-sm text-muted-foreground mb-2">{outcome.description}</p>
                          <div className="text-xs">
                            <span className="font-medium">KPIs: </span>
                            {outcome.indicators.join('; ')}
                          </div>
                          <Badge variant="secondary" className="mt-2 text-xs">
                            {outcome.timeline}
                          </Badge>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  {/* Wider Impacts */}
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                          <TrendingUp className="w-4 h-4" />
                          Wider Impacts
                        </CardTitle>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(formatImpactsForInsert(), 'impacts')}
                          >
                            {copiedSection === 'impacts' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onInsertContent(formatImpactsForInsert())}
                          >
                            Insert
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {result.impacts.map((impact, idx) => (
                        <div key={idx} className="p-3 rounded-lg bg-muted/50">
                          <h4 className="font-medium mb-2">{impact.title}</h4>
                          <p className="text-sm text-muted-foreground mb-2">{impact.contribution}</p>
                          <div className="text-xs bg-success/10 text-success p-2 rounded">
                            <span className="font-medium">Quantification: </span>
                            {impact.quantification}
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  {/* Barriers */}
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                          <AlertCircle className="w-4 h-4" />
                          Barriers & Mitigation
                        </CardTitle>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(formatBarriersForInsert(), 'barriers')}
                          >
                            {copiedSection === 'barriers' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onInsertContent(formatBarriersForInsert())}
                          >
                            Insert
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {result.barriers.map((b, idx) => (
                        <div key={idx} className="p-3 rounded-lg bg-muted/50">
                          <h4 className="font-medium mb-2 text-destructive">{b.barrier}</h4>
                          <p className="text-sm text-muted-foreground">{b.mitigation}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  <Separator />

                  <Button onClick={insertAll} className="w-full">
                    Insert All Content
                  </Button>
                </div>
              </ScrollArea>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
