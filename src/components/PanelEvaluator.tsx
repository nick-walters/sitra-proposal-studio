import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles, Plus, AlertTriangle, CheckCircle2, XCircle, Info } from "lucide-react";
import { toast } from "sonner";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
  ReferenceLine,
  Dot,
} from "recharts";

interface Props {
  proposalId: string;
}

interface Persona {
  id: string;
  persona_number?: number;
  name: string;
  brief: string;
  thematic_area: string | null;
}

interface InstrumentType {
  id: string;
  name: string;
  code: string;
  has_stage1: boolean;
  has_lump_sum: boolean;
  impact_weighting: number;
}

interface EligibilityFlag {
  check: string;
  status: "pass" | "warning" | "fail";
  note: string;
}

interface ProposedEvaluator {
  id: number;
  name: string;
  brief: string;
}

interface AnalysisRow {
  id: string;
  created_at: string;
  overall_score: number | null;
  total_score_unweighted: number | null;
  total_score_weighted: number | null;
  excellence_score: number | null;
  impact_score_raw: number | null;
  impact_score_weighted: number | null;
  implementation_score: number | null;
  proposal_stage: string | null;
  budget_type_used: string | null;
  instrument_id: string | null;
  model_used: string | null;
  evaluators_selected: any;
  cost_eur: number | null;
  analysis_data: any;
}

const THEMATIC_AREAS = [
  "Democracy and Trust",
  "Data and AI",
  "Health and Wellbeing",
  "Circular Economy",
  "Cross-cutting",
];

const FALLBACK_COSTS: Record<string, number> = {
  "ria-full-traditional": 2.5,
  "ria-full-lump_sum": 2.7,
  "ia-full-traditional": 2.5,
  "ia-full-lump_sum": 2.7,
  "csa-full-traditional": 2.0,
  "csa-full-lump_sum": 2.15,
  "any-stage1": 1.3,
};

function StatusIcon({ status }: { status: string }) {
  if (status === "pass") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (status === "warning") return <AlertTriangle className="h-4 w-4 text-amber-600" />;
  return <XCircle className="h-4 w-4 text-destructive" />;
}

export function PanelEvaluator({ proposalId }: Props) {
  const [proposal, setProposal] = useState<any>(null);
  const [instruments, setInstruments] = useState<InstrumentType[]>([]);
  const [instrumentCode, setInstrumentCode] = useState<string>("");
  const [proposalStage, setProposalStage] = useState<"full" | "stage1">("full");
  const [budgetType, setBudgetType] = useState<"traditional" | "lump_sum">("traditional");

  const [history, setHistory] = useState<AnalysisRow[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);

  const [stage, setStage] = useState<"idle" | "stageA" | "panelReview" | "stageB" | "complete">("idle");
  const [stageAStatus, setStageAStatus] = useState<string>("");
  const [stageBStatus, setStageBStatus] = useState<string>("");

  const [eligibilityFlags, setEligibilityFlags] = useState<EligibilityFlag[]>([]);
  const [proposedPanel, setProposedPanel] = useState<ProposedEvaluator[]>([]);
  const [allPersonas, setAllPersonas] = useState<Persona[]>([]);
  const [selectedPersonaIds, setSelectedPersonaIds] = useState<Set<string>>(new Set());
  const [areaFilter, setAreaFilter] = useState<string>("all");

  const [createPersonaOpen, setCreatePersonaOpen] = useState(false);
  const [personaDescription, setPersonaDescription] = useState("");
  const [generatingPersona, setGeneratingPersona] = useState(false);
  const [generatedPersona, setGeneratedPersona] = useState<{ name: string; brief: string; thematic_area: string } | null>(null);

  const [costAvg, setCostAvg] = useState<{ eur: number; samples: number; isFallback: boolean }>({
    eur: 2.5,
    samples: 0,
    isFallback: true,
  });

  // Load proposal + instruments + history on mount
  useEffect(() => {
    if (!proposalId) return;
    void (async () => {
      const [{ data: prop }, { data: insts }, { data: hist }] = await Promise.all([
        supabase
          .from("proposals")
          .select("id, type, budget_type, submission_stage, is_two_stage_second_stage, acronym, title")
          .eq("id", proposalId)
          .single(),
        supabase.from("instrument_types").select("*").eq("active", true).order("name"),
        supabase
          .from("proposal_analyses")
          .select(
            "id, created_at, overall_score, total_score_unweighted, total_score_weighted, excellence_score, impact_score_raw, impact_score_weighted, implementation_score, proposal_stage, budget_type_used, instrument_id, model_used, evaluators_selected, cost_eur, analysis_data",
          )
          .eq("proposal_id", proposalId)
          .order("created_at", { ascending: true }),
      ]);
      setProposal(prop);
      setInstruments((insts || []) as InstrumentType[]);
      setHistory((hist || []) as AnalysisRow[]);
      if (hist && hist.length > 0) setSelectedHistoryId(hist[hist.length - 1].id);

      // Map proposal type to instrument code
      if (prop?.type) {
        const mapped = String(prop.type).toLowerCase();
        if (insts?.some((i: any) => i.code === mapped)) setInstrumentCode(mapped);
        else if (insts && insts.length > 0) setInstrumentCode(insts[0].code);
      }
      if (prop?.budget_type) {
        setBudgetType(prop.budget_type === "lump_sum" ? "lump_sum" : "traditional");
      }
      if (prop?.submission_stage === "stage_1" && !prop?.is_two_stage_second_stage) {
        setProposalStage("stage1");
      }
    })();
  }, [proposalId]);

  // Load rolling cost average
  useEffect(() => {
    if (!instrumentCode || !proposalStage) return;
    void (async () => {
      const stageKey = proposalStage;
      const fallbackKey =
        stageKey === "stage1"
          ? "any-stage1"
          : `${instrumentCode}-${stageKey}-${budgetType}`;
      const fallback = FALLBACK_COSTS[fallbackKey] ?? 2.5;

      let q = supabase
        .from("evaluation_cost_log")
        .select("cost_eur")
        .eq("instrument_code", instrumentCode)
        .eq("proposal_stage", stageKey)
        .order("created_at", { ascending: false })
        .limit(10);
      if (stageKey !== "stage1") q = q.eq("budget_type", budgetType);

      const { data } = await q;
      if (data && data.length >= 3) {
        const avg =
          data.reduce((s: number, r: any) => s + Number(r.cost_eur || 0), 0) / data.length;
        setCostAvg({ eur: avg, samples: data.length, isFallback: false });
      } else {
        setCostAvg({ eur: fallback, samples: data?.length || 0, isFallback: true });
      }
    })();
  }, [instrumentCode, proposalStage, budgetType]);

  const selectedInstrument = useMemo(
    () => instruments.find((i) => i.code === instrumentCode),
    [instruments, instrumentCode],
  );

  const showStage = selectedInstrument?.has_stage1;

  // Aggregate selected count
  const selectedCount = selectedPersonaIds.size;
  const validPanelSize = selectedCount >= 3 && selectedCount <= 10;

  // Recommended IDs for badges
  const recommendedIds = new Set(proposedPanel.map((p) => p.id));

  async function startEvaluation() {
    setStage("stageA");
    setStageAStatus("Reading proposal content...");
    try {
      setStageAStatus("Running compliance check and assembling panel...");
      const { data, error } = await supabase.functions.invoke("propose-evaluation-panel", {
        body: {
          proposalId,
          instrumentCode,
          proposalStage,
          budgetType: proposalStage === "stage1" ? null : budgetType,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setEligibilityFlags(data.eligibility_flags || []);
      setProposedPanel(data.proposed_panel || []);
      setAllPersonas(data.all_personas || []);

      // Pre-check proposed personas
      const recommendedNumbers = new Set((data.proposed_panel || []).map((p: any) => p.id));
      const preselected = new Set<string>();
      (data.all_personas || []).forEach((p: Persona) => {
        if (p.persona_number !== undefined && recommendedNumbers.has(p.persona_number)) {
          preselected.add(p.id);
        }
      });
      setSelectedPersonaIds(preselected);
      setStage("panelReview");
    } catch (e: any) {
      toast.error(`Stage A failed: ${e.message || e}`);
      setStage("idle");
    }
  }

  async function runEvaluation() {
    if (!validPanelSize) return;
    const selectedEvaluators = allPersonas
      .filter((p) => selectedPersonaIds.has(p.id))
      .map((p) => ({ name: p.name, brief: p.brief }));

    setStage("stageB");
    setStageBStatus("Sending proposal to evaluators...");
    try {
      // We can't track per-evaluator progress without streaming; show generic phases
      const phases = [
        { msg: `Panel reviewing... (${selectedEvaluators.length} evaluators in parallel)`, delay: 2000 },
        { msg: "Synthesising panel report...", delay: 90000 },
      ];
      let cancelled = false;
      const tick = async () => {
        for (const ph of phases) {
          if (cancelled) return;
          await new Promise((r) => setTimeout(r, ph.delay));
          if (!cancelled) setStageBStatus(ph.msg);
        }
      };
      void tick();

      const { data, error } = await supabase.functions.invoke("run-panel-evaluation", {
        body: {
          proposalId,
          selectedEvaluators,
          instrumentCode,
          proposalStage,
          budgetType: proposalStage === "stage1" ? null : budgetType,
        },
      });
      cancelled = true;
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success("Evaluation complete");
      setStage("complete");
      // Reload history
      const { data: hist } = await supabase
        .from("proposal_analyses")
        .select(
          "id, created_at, overall_score, total_score_unweighted, total_score_weighted, excellence_score, impact_score_raw, impact_score_weighted, implementation_score, proposal_stage, budget_type_used, instrument_id, model_used, evaluators_selected, cost_eur, analysis_data",
        )
        .eq("proposal_id", proposalId)
        .order("created_at", { ascending: true });
      setHistory((hist || []) as AnalysisRow[]);
      if (hist && hist.length > 0) setSelectedHistoryId(hist[hist.length - 1].id);
    } catch (e: any) {
      toast.error(`Evaluation failed: ${e.message || e}`);
      setStage("panelReview");
    }
  }

  function cancel() {
    setStage("idle");
    setEligibilityFlags([]);
    setProposedPanel([]);
    setAllPersonas([]);
    setSelectedPersonaIds(new Set());
  }

  async function generatePersona() {
    if (!personaDescription.trim()) return;
    setGeneratingPersona(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-persona", {
        body: { description: personaDescription, save: false },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setGeneratedPersona(data.persona);
    } catch (e: any) {
      toast.error(`Generation failed: ${e.message || e}`);
    } finally {
      setGeneratingPersona(false);
    }
  }

  async function savePersona(addToPanel: boolean) {
    if (!generatedPersona) return;
    try {
      const { data, error } = await supabase.functions.invoke("generate-persona", {
        body: { description: personaDescription, save: true },
      });
      if (error) throw error;
      const newPersona = data.persona;
      // Refetch active personas
      const { data: refreshed } = await supabase
        .from("evaluator_personas")
        .select("id, persona_number, name, brief, thematic_area")
        .eq("active", true);
      setAllPersonas((refreshed || []) as Persona[]);
      if (addToPanel && newPersona.id) {
        setSelectedPersonaIds((prev) => new Set(prev).add(newPersona.id));
      }
      setCreatePersonaOpen(false);
      setPersonaDescription("");
      setGeneratedPersona(null);
      toast.success(addToPanel ? "Persona saved and added to panel" : "Persona saved to library");
    } catch (e: any) {
      toast.error(`Save failed: ${e.message || e}`);
    }
  }

  // Active history record
  const activeAnalysis = useMemo(
    () => history.find((h) => h.id === selectedHistoryId) || null,
    [history, selectedHistoryId],
  );

  // Chart data
  const chartData = history.map((h) => ({
    date: new Date(h.created_at).toLocaleDateString(),
    score: Number(h.total_score_unweighted ?? h.overall_score ?? 0),
    id: h.id,
  }));

  const yMax = proposalStage === "stage1" ? 10 : selectedInstrument?.code === "ia" ? 17.5 : 15;
  const overallThreshold = proposalStage === "stage1" ? 8 : 10;

  // Group personas by area for selection UI
  const personasByArea = useMemo(() => {
    const map: Record<string, Persona[]> = {};
    allPersonas.forEach((p) => {
      const k = p.thematic_area || "Other";
      if (!map[k]) map[k] = [];
      map[k].push(p);
    });
    return map;
  }, [allPersonas]);

  const filteredAreas =
    areaFilter === "all" ? Object.keys(personasByArea) : [areaFilter];

  return (
    <div className="space-y-6">
      {/* Description card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600" />
            AI Panel Evaluation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            This tool simulates a Horizon Europe expert evaluation panel. It reads the current
            state of your proposal and produces an Evaluation Summary Report (ESR) with scores
            and detailed feedback for each criterion — in the style of the official EC evaluation form.
          </p>
          <p>
            <strong>Access:</strong> Proposal coordinators, platform admins, and owners only.
          </p>
          <p>
            <strong>Use sparingly</strong> — only when significant changes have been made. Each run
            incurs a small AI cost.
          </p>
          <p>
            <strong>Estimated cost:</strong> ~€{costAvg.eur.toFixed(2)} per evaluation{" "}
            {costAvg.isFallback
              ? "(indicative)"
              : `(based on last ${costAvg.samples} evaluation${costAvg.samples === 1 ? "" : "s"})`}
          </p>
        </CardContent>
      </Card>

      {/* Configuration row */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Instrument type</Label>
              <Select value={instrumentCode} onValueChange={setInstrumentCode} disabled={stage !== "idle"}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {instruments.map((i) => (
                    <SelectItem key={i.id} value={i.code}>{i.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {showStage && (
              <div className="space-y-2">
                <Label>Stage</Label>
                <RadioGroup
                  value={proposalStage}
                  onValueChange={(v) => setProposalStage(v as "full" | "stage1")}
                  disabled={stage !== "idle"}
                  className="flex gap-4"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="full" id="stage-full" />
                    <Label htmlFor="stage-full" className="font-normal cursor-pointer">Full proposal</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="stage1" id="stage-1" />
                    <Label htmlFor="stage-1" className="font-normal cursor-pointer">Stage 1</Label>
                  </div>
                </RadioGroup>
              </div>
            )}
            {proposalStage !== "stage1" && (
              <div className="space-y-2">
                <Label>Budget type</Label>
                <RadioGroup
                  value={budgetType}
                  onValueChange={(v) => setBudgetType(v as "traditional" | "lump_sum")}
                  disabled={stage !== "idle"}
                  className="flex gap-4"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="traditional" id="bt-trad" />
                    <Label htmlFor="bt-trad" className="font-normal cursor-pointer">Traditional</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="lump_sum" id="bt-ls" />
                    <Label htmlFor="bt-ls" className="font-normal cursor-pointer">Lump sum</Label>
                  </div>
                </RadioGroup>
              </div>
            )}
          </div>

          {stage === "idle" && (
            <Button onClick={startEvaluation} disabled={!instrumentCode} className="gap-2">
              <Sparkles className="h-4 w-4" /> Start Evaluation
            </Button>
          )}

          {stage === "stageA" && (
            <Alert>
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertDescription>{stageAStatus}</AlertDescription>
            </Alert>
          )}

          {stage === "stageB" && (
            <Alert>
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertDescription>
                {stageBStatus}
                <div className="text-xs mt-1 text-muted-foreground">This typically takes 2–4 minutes.</div>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Progress chart */}
      <Card>
        <CardHeader><CardTitle className="text-base">Score progression</CardTitle></CardHeader>
        <CardContent>
          {chartData.length < 2 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              Run your first evaluation to track progress.
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis domain={[0, yMax]} />
                  <RTooltip />
                  <ReferenceLine
                    y={overallThreshold}
                    stroke="hsl(var(--destructive))"
                    strokeDasharray="4 4"
                    label={{ value: `Threshold ${overallThreshold}`, fontSize: 11 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="hsl(var(--primary))"
                    activeDot={{
                      r: 6,
                      onClick: (_e: any, payload: any) => {
                        if (payload?.payload?.id) setSelectedHistoryId(payload.payload.id);
                      },
                    }}
                    dot={(props: any) => {
                      const v = props.payload.score;
                      const color =
                        v < overallThreshold
                          ? "hsl(var(--destructive))"
                          : v < overallThreshold + 1
                          ? "hsl(38 92% 50%)"
                          : "hsl(142 71% 45%)";
                      return <Dot {...props} r={5} fill={color} stroke={color} />;
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stage A results: panel review */}
      {stage === "panelReview" && (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">Compliance flags</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>These flags are advisory and do not prevent evaluation.</AlertDescription>
              </Alert>
              <div className="space-y-2">
                {eligibilityFlags.map((f, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded border">
                    <StatusIcon status={f.status} />
                    <div className="flex-1">
                      <div className="text-sm font-medium">{f.check}</div>
                      <div className="text-xs text-muted-foreground">{f.note}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Select evaluation panel</CardTitle>
                <div className={`text-sm font-medium ${validPanelSize ? "text-emerald-600" : "text-destructive"}`}>
                  {selectedCount} evaluator{selectedCount !== 1 ? "s" : ""} selected (min 3, max 10)
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Tabs value={areaFilter} onValueChange={setAreaFilter}>
                  <TabsList>
                    <TabsTrigger value="all">All</TabsTrigger>
                    {THEMATIC_AREAS.map((a) => (
                      <TabsTrigger key={a} value={a}>{a}</TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
                <Button variant="outline" size="sm" className="ml-auto gap-2" onClick={() => setCreatePersonaOpen(true)}>
                  <Plus className="h-4 w-4" /> Create new evaluator
                </Button>
              </div>

              <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                {filteredAreas.map((area) => (
                  <div key={area}>
                    <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">{area}</div>
                    <div className="space-y-1">
                      {(personasByArea[area] || []).map((p) => {
                        const recommended = p.persona_number !== undefined && recommendedIds.has(p.persona_number);
                        const recommendedRank = recommended
                          ? proposedPanel.findIndex((pp) => pp.id === p.persona_number) + 1
                          : 0;
                        return (
                          <label
                            key={p.id}
                            className="flex items-start gap-3 p-2 rounded hover:bg-muted/50 cursor-pointer"
                          >
                            <Checkbox
                              checked={selectedPersonaIds.has(p.id)}
                              onCheckedChange={(c) => {
                                setSelectedPersonaIds((prev) => {
                                  const next = new Set(prev);
                                  if (c) next.add(p.id);
                                  else next.delete(p.id);
                                  return next;
                                });
                              }}
                            />
                            <div className="flex-1 text-sm">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{p.name}</span>
                                {recommended && (
                                  <Badge variant="secondary" className="text-[10px]">
                                    Recommended #{recommendedRank}
                                  </Badge>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground">{p.brief}</div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <Button onClick={runEvaluation} disabled={!validPanelSize} className="gap-2">
                  <Sparkles className="h-4 w-4" /> Run Evaluation
                </Button>
                <Button variant="outline" onClick={cancel}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* ESR display */}
      {activeAnalysis && stage !== "panelReview" && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="text-base">Evaluation Summary Report</CardTitle>
                <div className="text-xs text-muted-foreground mt-1">
                  {new Date(activeAnalysis.created_at).toLocaleString()} ·{" "}
                  Model: {activeAnalysis.model_used || "—"} ·{" "}
                  {Array.isArray(activeAnalysis.evaluators_selected)
                    ? `${activeAnalysis.evaluators_selected.length} evaluators`
                    : ""}
                </div>
              </div>
              <Badge variant="outline">
                Total: {activeAnalysis.total_score_unweighted ?? activeAnalysis.overall_score ?? "—"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap text-sm font-sans bg-muted/30 p-4 rounded border max-h-[700px] overflow-y-auto">
              {activeAnalysis.analysis_data?.esr_markdown || "(no ESR available)"}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Version history */}
      {history.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Version history</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1">
              {[...history].reverse().map((h) => (
                <button
                  key={h.id}
                  onClick={() => setSelectedHistoryId(h.id)}
                  className={`w-full text-left flex items-center justify-between p-2 rounded text-sm hover:bg-muted/50 ${selectedHistoryId === h.id ? "bg-muted" : ""}`}
                >
                  <span>{new Date(h.created_at).toLocaleString()}</span>
                  <span className="flex items-center gap-3">
                    <Badge variant="outline" className="text-[10px]">
                      {instruments.find((i) => i.id === h.instrument_id)?.name || "?"}
                    </Badge>
                    <span className="text-muted-foreground">
                      Score: {h.total_score_unweighted ?? h.overall_score ?? "—"}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create persona dialog */}
      <Dialog open={createPersonaOpen} onOpenChange={(o) => { setCreatePersonaOpen(o); if (!o) { setGeneratedPersona(null); setPersonaDescription(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create new evaluator</DialogTitle>
            <DialogDescription>Saved personas are available platform-wide for all future evaluations.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              placeholder="Describe the expert you want to add (e.g., 'A senior climate adaptation policymaker focused on coastal cities')"
              value={personaDescription}
              onChange={(e) => setPersonaDescription(e.target.value)}
              rows={4}
            />
            {!generatedPersona ? (
              <Button onClick={generatePersona} disabled={generatingPersona || !personaDescription.trim()} className="gap-2">
                {generatingPersona ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Generate
              </Button>
            ) : (
              <div className="space-y-2 p-3 border rounded">
                <div>
                  <Label>Name</Label>
                  <input
                    className="w-full border rounded px-2 py-1 text-sm bg-background"
                    value={generatedPersona.name}
                    onChange={(e) => setGeneratedPersona({ ...generatedPersona, name: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Brief</Label>
                  <Textarea
                    rows={2}
                    value={generatedPersona.brief}
                    onChange={(e) => setGeneratedPersona({ ...generatedPersona, brief: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Thematic area</Label>
                  <Select
                    value={generatedPersona.thematic_area}
                    onValueChange={(v) => setGeneratedPersona({ ...generatedPersona, thematic_area: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {THEMATIC_AREAS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            {generatedPersona && (
              <>
                <Button variant="outline" onClick={() => savePersona(false)}>Save to library only</Button>
                <Button onClick={() => savePersona(true)}>Save to library and add to panel</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
