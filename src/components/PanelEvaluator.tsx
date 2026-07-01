import { useEffect, useMemo, useRef, useState } from "react";
import { formatNumber, formatCurrency } from "@/lib/formatNumber";
import { formatDate, formatDateTime } from "@/lib/formatDate";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles, Plus, AlertTriangle, CheckCircle2, XCircle, Info, Download, Trash2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useProposalRole } from "@/hooks/useProposalRole";
import { useProposalData } from "@/hooks/useProposalData";
import { useProposalSections } from "@/hooks/useProposalSections";
import { useQueryClient } from "@tanstack/react-query";
import { prepareExportContainer, replaceFiguresWithText } from "@/lib/printRenderer";
import { extractEvaluationText } from "@/lib/extractEvaluationText";
import { computeBudgetRow } from "@/lib/budgetCompute";
import { EsrRenderer } from "@/components/EsrRenderer";
// esrPdfExport is loaded lazily inside downloadEsr() to keep jsPDF out of the initial bundle.
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

async function buildComputedBudget(proposalId: string) {
  const [{ data: proposalRow }, { data: rows }, { data: participants }, { data: effortData }] =
    await Promise.all([
      supabase.from("proposals").select("type").eq("id", proposalId).maybeSingle(),
      supabase
        .from("budget_rows")
        .select(
          "participant_id, personnel_costs, subcontracting_costs, purchase_travel, purchase_equipment, purchase_other_goods, financial_support_third_parties, internally_invoiced, procurement, pm_rate, indirect_costs_override, funding_rate_override, requested_eu_contribution, has_in_kind, requested_personnel_costs, requested_subcontracting, requested_travel, requested_equipment, requested_other_goods, requested_fstp, requested_internally_invoiced",
        )
        .eq("proposal_id", proposalId),
      supabase
        .from("participants")
        .select("id, participant_number, organisation_short_name, organisation_name, organisation_category")
        .eq("proposal_id", proposalId),
      supabase
        .from("wp_draft_effort")
        .select("participant_id, person_months, wp_drafts!inner(proposal_id)")
        .eq("wp_drafts.proposal_id", proposalId),
    ]);

  const pmTotals = new Map<string, number>();
  (effortData || []).forEach((e: any) => {
    pmTotals.set(e.participant_id, (pmTotals.get(e.participant_id) || 0) + Number(e.person_months || 0));
  });
  const partById = new Map((participants || []).map((p: any) => [p.id, p]));
  const proposalType = (proposalRow as any)?.type ?? null;

  let totalRequestedEu = 0;
  let totalDirectCosts = 0;
  let totalIndirect = 0;
  let totalEligible = 0;
  const perParticipant: Array<{
    participantId: string;
    participantNumber: number | null;
    shortName: string | null;
    requestedEu: number;
    totalEligible: number;
    fundingRate: number;
  }> = [];

  for (const r of rows || []) {
    const p: any = partById.get((r as any).participant_id);
    const out = computeBudgetRow({
      ...(r as any),
      totalPersonMonths: pmTotals.get((r as any).participant_id) || 0,
      proposalType,
      organisationCategory: p?.organisation_category ?? null,
    });
    totalRequestedEu += out.requestedEuContribution;
    totalDirectCosts += out.directCosts;
    totalIndirect += out.indirect;
    totalEligible += out.totalEligible;
    perParticipant.push({
      participantId: (r as any).participant_id,
      participantNumber: p?.participant_number ?? null,
      shortName: p?.organisation_short_name ?? p?.organisation_name ?? null,
      requestedEu: out.requestedEuContribution,
      totalEligible: out.totalEligible,
      fundingRate: out.fundingRate,
    });
  }

  perParticipant.sort((a, b) => (a.participantNumber || 999) - (b.participantNumber || 999));
  return { totalRequestedEu, totalDirectCosts, totalIndirect, totalEligible, perParticipant };
}


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
  status?: string | null;
  error_message?: string | null;
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
  "Circular Economy",
  "Data & AI",
  "Democracy & Trust",
  "Health & Wellbeing",
];


function StatusIcon({ status }: { status: string }) {
  if (status === "pass") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (status === "warning") return <AlertTriangle className="h-4 w-4 text-amber-600" />;
  return <XCircle className="h-4 w-4 text-destructive" />;
}

export function PanelEvaluator({ proposalId }: Props) {
  const { roleTier } = useProposalRole(proposalId);
  const isCoordinator = roleTier === "coordinator";
  const { proposal: proposalData, participants } = useProposalData(proposalId);
  const { sections: allSections } = useProposalSections(
    proposalData?.templateTypeId || null,
    proposalId,
    !!proposalData,
    isCoordinator,
  );
  const appQueryClient = useQueryClient();
  const [proposal, setProposal] = useState<any>(null);
  const [instruments, setInstruments] = useState<InstrumentType[]>([]);
  const [instrumentCode, setInstrumentCode] = useState<string>("");
  const [proposalStage, setProposalStage] = useState<"full" | "stage1">("full");
  const [budgetType, setBudgetType] = useState<"traditional" | "lump_sum">("traditional");
  // Per-run model choice. Defaults to Sonnet 5 every time the pane opens.
  // Selecting Opus 4.8 is a per-run override only; the stored default (Sonnet 5) is unchanged.
  const [modelChoice, setModelChoice] = useState<"claude-sonnet-5" | "claude-opus-4-8">("claude-sonnet-5");


  const [history, setHistory] = useState<AnalysisRow[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);

  const [stage, setStage] = useState<"idle" | "stageA" | "panelReview" | "stageB" | "complete">("idle");
  const [stageAStatus, setStageAStatus] = useState<string>("");

  const [eligibilityFlags, setEligibilityFlags] = useState<EligibilityFlag[]>([]);
  const [proposedPanel, setProposedPanel] = useState<ProposedEvaluator[]>([]);
  const [allPersonas, setAllPersonas] = useState<Persona[]>([]);
  const [haikuUsage, setHaikuUsage] = useState<{
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens: number;
    cache_creation_input_tokens: number;
  } | null>(null);
  const [haikuModel, setHaikuModel] = useState<string | null>(null);

  const [selectedPersonaIds, setSelectedPersonaIds] = useState<Set<string>>(new Set());
  // ID of a persisted status='panel_proposed' row (Stage A result stored so
  // navigating away / reloading before Start doesn't discard the paid Haiku panel).
  const [panelProposedRowId, setPanelProposedRowId] = useState<string | null>(null);
  // Preserved failed-run info so the user can Resume (only re-runs errored evaluators)
  // instead of paying for a full re-run.
  const [failedRun, setFailedRun] = useState<{
    id: string;
    successCount: number;
    failCount: number;
    total: number;
    errorMessage: string | null;
  } | null>(null);
  const [resumingFailedRun, setResumingFailedRun] = useState(false);
  // Filter as a Set: empty = "All" mode
  const [activeAreaFilters, setActiveAreaFilters] = useState<Set<string>>(new Set());

  const [createPersonaOpen, setCreatePersonaOpen] = useState(false);
  const [personaDescription, setPersonaDescription] = useState("");
  const [generatingPersona, setGeneratingPersona] = useState(false);
  const [generatedPersona, setGeneratedPersona] = useState<{ name: string; brief: string; thematic_area: string } | null>(null);

  // Self-improving cost estimate state.
  // - costHistory: recent per-run actuals from evaluation_cost_log (per instrument+stage+budget).
  // - thisPayloadTokens: rough token count of this proposal's last rendered_proposal payload
  //   (analysis_data.rendered_proposal length / 4). Used to size-scale the historical avg.
  const [costHistory, setCostHistory] = useState<
    Array<{ cost_eur: number; model_used: string | null; payload_tokens: number | null }>
  >([]);
  const [thisPayloadTokens, setThisPayloadTokens] = useState<number | null>(null);

  // Polling state
  const [runningEvaluationId, setRunningEvaluationId] = useState<string | null>(null);
  const [runningStatus, setRunningStatus] = useState<string | null>(null);
  const [runningMessage, setRunningMessage] = useState<string>("");
  const [runStartedAt, setRunStartedAt] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (tickIntervalRef.current) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }
  };

  const formatElapsed = (startIso: string | null, now: number) => {
    if (!startIso) return "";
    const elapsedMs = Math.max(0, now - new Date(startIso).getTime());
    const totalSec = Math.floor(elapsedMs / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const formatDurationMs = (ms: number | null | undefined) => {
    if (ms == null || !Number.isFinite(Number(ms)) || Number(ms) <= 0) return "—";
    const totalSec = Math.floor(Number(ms) / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}m ${s}s`;
  };

  // Friendly, color-coded model badge. Green = Sonnet 5, Red = Opus 4.8.
  const renderModelBadge = (modelUsed: string | null | undefined) => {
    const raw = String(modelUsed || "").toLowerCase();
    const isOpus = raw.includes("opus");
    const isSonnet = raw.includes("sonnet");
    const label = isOpus ? "Opus 4.8" : isSonnet ? "Sonnet 5" : (modelUsed || "—");
    const cls = isOpus
      ? "border-red-600 text-red-700 font-semibold"
      : isSonnet
        ? "border-green-600 text-green-700 font-semibold"
        : "";
    return (
      <Badge variant="outline" className={cls}>
        {label}
      </Badge>
    );
  };



  const refreshHistory = async () => {
    const { data: hist } = await supabase
      .from("proposal_analyses")
      .select(
        "id, created_at, status, error_message, overall_score, total_score_unweighted, total_score_weighted, excellence_score, impact_score_raw, impact_score_weighted, implementation_score, proposal_stage, budget_type_used, instrument_id, model_used, evaluators_selected, cost_eur, analysis_data",
      )
      .eq("proposal_id", proposalId)
      .in("status", ["complete", "failed"])
      .order("created_at", { ascending: true });
    setHistory((hist || []) as AnalysisRow[]);
  };

  // Extract success/fail counts from a failed evaluation row's analysis_data.
  // Returns null if the row has no preserved evaluator results to resume from.
  const summarizeFailedRow = (row: {
    id: string;
    error_message?: string | null;
    analysis_data: any;
    evaluators_selected?: any;
  }) => {
    const ad = (row.analysis_data ?? {}) as Record<string, any>;
    const evaluations = Array.isArray(ad.evaluations) ? ad.evaluations : [];
    if (evaluations.length === 0) return null;
    const successCount = evaluations.filter((e: any) => e && !e?.data?.error).length;
    const failCount = evaluations.filter((e: any) => e?.data?.error).length;
    const total = Array.isArray(row.evaluators_selected)
      ? row.evaluators_selected.length
      : evaluations.length;
    return {
      id: row.id,
      successCount,
      failCount: Math.max(failCount, Math.max(0, total - evaluations.length)),
      total,
      errorMessage: row.error_message ?? null,
    };
  };

  const downloadEsr = async (h: AnalysisRow) => {
    const analysisData = (h.analysis_data ?? {}) as Record<string, any>;
    const markdown = analysisData.esr_markdown || "(no ESR available)";
    const acronym = proposal?.acronym || "proposal";
    try {
      const { exportEsrToPdf } = await import("@/lib/esrPdfExport");
      exportEsrToPdf({ acronym, createdAt: h.created_at, markdown });
    } catch (err) {
      console.error("ESR PDF export failed:", err);
      toast.error("Failed to generate PDF.");
    }
  };

  const deleteEsr = async (h: AnalysisRow) => {
    if (!isCoordinator) return;
    const ok = window.confirm(
      `Delete this Evaluation Summary Report from ${formatDateTime(h.created_at)}? This cannot be undone.`,
    );
    if (!ok) return;
    const { error } = await supabase.from("proposal_analyses").delete().eq("id", h.id);
    if (error) {
      toast.error(`Failed to delete ESR: ${error.message}`);
      return;
    }
    if (selectedHistoryId === h.id) setSelectedHistoryId(null);
    toast.success("ESR deleted");
    await refreshHistory();
  };

  const startPolling = (evaluationId: string, startedAtIso?: string | null) => {
    stopPolling();
    setRunningEvaluationId(evaluationId);
    setRunningStatus("queued");
    setRunningMessage("Queued for evaluator run");
    setStage("stageB");
    // Elapsed-time ticker (1s)
    if (startedAtIso) setRunStartedAt(startedAtIso);
    setNowTick(Date.now());
    tickIntervalRef.current = setInterval(() => setNowTick(Date.now()), 1000);

    pollIntervalRef.current = setInterval(async () => {
      const { data } = await supabase
        .from("proposal_analyses")
        .select("status, error_message, analysis_data, created_at")
        .eq("id", evaluationId)
        .single();
      if (!data) return;

      const status = data.status || "queued";
      const analysisData = (data.analysis_data ?? {}) as Record<string, any>;
      const progressMessage = analysisData.progress_message || "";
      setRunningStatus(status);
      setRunningMessage(progressMessage);
      if (!runStartedAt && (data as any).created_at) {
        setRunStartedAt((data as any).created_at);
      }

      if (status === "cancelled") {
        stopPolling();
        setRunningEvaluationId(null);
        setRunningStatus("cancelled");
        setRunningMessage("Cancelled");
        toast.info("Evaluation cancelled");
        setStage("idle");
        return;
      }

      if (status === "queued" || status === "running" || status === "processing") {
        const { error } = await supabase.functions.invoke("run-panel-evaluation", {
          body: { action: "evaluate", evaluationId },
        });
        if (error) {
          stopPolling();
          setRunningEvaluationId(null);
          setRunningStatus("failed");
          setRunningMessage(progressMessage || error.message || String(error));
          setStage("panelReview");
          toast.error(progressMessage || `Evaluation paused: ${error.message || error}`);
        }
        return;
      }

      if (status === "synthesizing" && !analysisData.esr_markdown) {
        const { error } = await supabase.functions.invoke("run-panel-evaluation", {
          body: { action: "synthesis", evaluationId },
        });
        if (error) {
          stopPolling();
          setRunningEvaluationId(null);
          setRunningStatus("failed");
          setRunningMessage(progressMessage || error.message || String(error));
          setStage("panelReview");
          toast.error(progressMessage || `ESR synthesis paused: ${error.message || error}`);
        }
        return;
      }

      if (status === "complete") {
        stopPolling();
        // Persist total run duration (Run click → ESR delivered) into
        // analysis_data.total_duration_ms so the history badge can show it.
        try {
          const startIso = runStartedAt || (data as any).created_at;
          if (startIso && analysisData.total_duration_ms == null) {
            const totalDurationMs = Math.max(
              0,
              Date.now() - new Date(startIso).getTime(),
            );
            await supabase
              .from("proposal_analyses")
              .update({
                analysis_data: { ...analysisData, total_duration_ms: totalDurationMs },
              })
              .eq("id", evaluationId);
          }
        } catch (_e) {
          /* non-fatal: badge just falls back to "—" */
        }
        setRunningEvaluationId(null);
        setRunningStatus(null);
        setRunningMessage("");
        setRunStartedAt(null);
        toast.success("Evaluation complete");
        await refreshHistory();
        setStage("complete");
      } else if (status === "failed") {
        stopPolling();
        setRunningEvaluationId(null);
        setRunningStatus(null);
        setRunningMessage("");
        setRunStartedAt(null);
        toast.error(`Evaluation failed: ${data.error_message || "unknown error"}`);
        // Load the full row so we can offer a Resume button if any evaluator
        // results survived (they're preserved in analysis_data.evaluations).
        const { data: fullRow } = await supabase
          .from("proposal_analyses")
          .select("id, error_message, analysis_data, evaluators_selected")
          .eq("id", evaluationId)
          .maybeSingle();
        const summary = fullRow ? summarizeFailedRow(fullRow as any) : null;
        if (summary) {
          setFailedRun(summary);
        }
        await refreshHistory();
        setStage("idle");
      }
    }, 10_000);
  };

  async function cancelRun() {
    if (!runningEvaluationId) return;
    const id = runningEvaluationId;
    try {
      const { error } = await supabase.functions.invoke("run-panel-evaluation", {
        body: { action: "cancel", evaluationId: id },
      });
      if (error) throw error;
      stopPolling();
      setRunningEvaluationId(null);
      setRunningStatus("cancelled");
      setRunningMessage("Cancelled");
      setRunStartedAt(null);
      setStage("idle");
      toast.info("Cancellation sent. No further evaluator calls will fire.");
    } catch (e: any) {
      toast.error(`Cancel failed: ${e.message || e}`);
    }
  }

  async function resumeFailedRun() {
    if (!failedRun) return;
    setResumingFailedRun(true);
    try {
      const { data, error } = await supabase.functions.invoke("run-panel-evaluation", {
        body: { action: "resume", evaluationId: failedRun.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const evalId = data?.evaluationId || failedRun.id;
      toast.info(`Resuming ${failedRun.failCount} evaluator${failedRun.failCount === 1 ? "" : "s"}…`);
      setFailedRun(null);
      startPolling(evalId, new Date().toISOString());
    } catch (e: any) {
      toast.error(`Resume failed: ${e.message || e}`);
    } finally {
      setResumingFailedRun(false);
    }
  }

  function dismissFailedRun() {
    setFailedRun(null);
  }


  // Load proposal + instruments + history on mount; resume polling if a run is in progress
  useEffect(() => {
    if (!proposalId) return;
    void (async () => {
      const [{ data: prop }, { data: insts }, { data: hist }, { data: runningEval }] = await Promise.all([
        supabase
          .from("proposals")
          .select("id, type, budget_type, submission_stage, is_two_stage_second_stage, acronym, title")
          .eq("id", proposalId)
          .single(),
        supabase.from("instrument_types").select("*").eq("active", true).order("name"),
        supabase
          .from("proposal_analyses")
          .select(
            "id, created_at, status, error_message, overall_score, total_score_unweighted, total_score_weighted, excellence_score, impact_score_raw, impact_score_weighted, implementation_score, proposal_stage, budget_type_used, instrument_id, model_used, evaluators_selected, cost_eur, analysis_data",
          )
          .eq("proposal_id", proposalId)
          .in("status", ["complete", "failed"])
          .order("created_at", { ascending: true }),
        supabase
          .from("proposal_analyses")
          .select("id, status, analysis_data, created_at")
          .eq("proposal_id", proposalId)
          .in("status", ["queued", "running", "processing", "synthesizing"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      setProposal(prop);
      setInstruments((insts || []) as InstrumentType[]);
      setHistory((hist || []) as AnalysisRow[]);

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

      if (runningEval?.id) {
        setRunningStatus(runningEval.status || "queued");
        setRunningMessage(
          ((runningEval.analysis_data ?? {}) as Record<string, any>).progress_message || "",
        );
        startPolling(runningEval.id, (runningEval as any).created_at ?? null);
      } else {
        // No in-flight run — try to rehydrate a stored panel_proposed row so
        // returning to Part B after Stage A doesn't force a paid Haiku re-run.
        const { data: proposedRow } = await supabase
          .from("proposal_analyses")
          .select("id, analysis_data, proposal_stage, budget_type_used, eligibility_flags")
          .eq("proposal_id", proposalId)
          .eq("status", "panel_proposed")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (proposedRow?.id) {
          const ad = (proposedRow.analysis_data ?? {}) as Record<string, any>;
          setPanelProposedRowId(proposedRow.id);
          setEligibilityFlags(
            (ad.eligibility_flags as unknown as EligibilityFlag[]) ??
              (proposedRow.eligibility_flags as unknown as EligibilityFlag[]) ??
              [],
          );
          setProposedPanel((ad.proposed_panel as unknown as ProposedEvaluator[]) ?? []);
          setAllPersonas((ad.all_personas as unknown as Persona[]) ?? []);
          setHaikuUsage(ad.haiku_usage ?? null);
          setHaikuModel(ad.haiku_model ?? null);
          if (Array.isArray(ad.selected_persona_ids)) {
            setSelectedPersonaIds(new Set(ad.selected_persona_ids as string[]));
          }
          if (typeof ad.instrument_code === "string") setInstrumentCode(ad.instrument_code);
          if (proposedRow.proposal_stage === "stage1" || proposedRow.proposal_stage === "full") {
            setProposalStage(proposedRow.proposal_stage as "full" | "stage1");
          }
          if (proposedRow.budget_type_used === "lump_sum" || proposedRow.budget_type_used === "traditional") {
            setBudgetType(proposedRow.budget_type_used);
          }
          setStage("panelReview");
        } else {
          // No panel_proposed either — check for a recent failed run with
          // preserved evaluator results so we can offer Resume.
          const latestFailed = (hist || [])
            .filter((r: any) => r.status === "failed")
            .slice()
            .reverse()[0];
          if (latestFailed) {
            const summary = summarizeFailedRow(latestFailed as any);
            if (summary && summary.failCount > 0) setFailedRun(summary);
          }
        }
      }

    })();
    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposalId]);

  // Load recent per-run actuals for this instrument+stage(+budget) — used to learn the estimate.
  useEffect(() => {
    if (!instrumentCode || !proposalStage) return;
    void (async () => {
      let q = supabase
        .from("evaluation_cost_log")
        .select("cost_eur, model_used, payload_tokens")
        .eq("instrument_code", instrumentCode)
        .eq("proposal_stage", proposalStage)
        .order("created_at", { ascending: false })
        .limit(30);
      if (proposalStage !== "stage1") q = q.eq("budget_type", budgetType);
      const { data } = await q;
      setCostHistory(
        (data || []).map((r: any) => ({
          cost_eur: Number(r.cost_eur || 0),
          model_used: r.model_used ?? null,
          payload_tokens: r.payload_tokens != null ? Number(r.payload_tokens) : null,
        })),
      );
    })();
  }, [instrumentCode, proposalStage, budgetType]);

  // Pull this proposal's most recent rendered_proposal length to size the estimate.
  // (rendered_proposal is produced on each run and persisted in analysis_data.)
  useEffect(() => {
    if (!proposalId) return;
    void (async () => {
      const { data } = await supabase
        .from("proposal_analyses")
        .select("analysis_data")
        .eq("proposal_id", proposalId)
        .order("created_at", { ascending: false })
        .limit(5);
      for (const row of data || []) {
        const rp = (row as any)?.analysis_data?.rendered_proposal;
        if (typeof rp === "string" && rp.length > 0) {
          setThisPayloadTokens(Math.ceil(rp.length / 4));
          return;
        }
      }
    })();
  }, [proposalId]);

  const selectedInstrument = useMemo(
    () => instruments.find((i) => i.code === instrumentCode),
    [instruments, instrumentCode],
  );
  const showStage = selectedInstrument?.has_stage1;
  const selectedCount = selectedPersonaIds.size;
  const validPanelSize = selectedCount >= 3 && selectedCount <= 10;
  const recommendedIds = new Set(proposedPanel.map((p) => p.id));

  // Self-improving per-model cost estimate.
  //
  // Preferred path (≥3 actuals for same model+instrument+stage+budget):
  //   est = avg(actual cost_eur) × (this_payload_tokens / avg(payload_tokens))
  //
  // Fallback (thin history): model the typical run shape — K=evaluators+1 synthesis calls,
  // proposal block cache-written once then cache-read by the remaining K-1 calls — and price
  // it through the corrected per-model formula (uncached×in + cacheRead×in×0.10 +
  // cacheWrite×in×1.25 + output×out). Sonnet intro $2/$10 auto-switches to $3/$15 from 2026-09-01.
  const modelCostEstimate = useMemo(() => {
    const sonnetStandardActive = Date.now() >= new Date("2026-09-01T00:00:00Z").getTime();
    const PRICES: Record<"sonnet" | "opus", { in: number; out: number }> = {
      sonnet: { in: sonnetStandardActive ? 3 : 2, out: sonnetStandardActive ? 15 : 10 },
      opus: { in: 5, out: 25 },
    };
    const USD_EUR = 0.88;
    const K = Math.max(3, Math.min(10, (selectedCount || 4) + 1));

    // Token-based fallback in EUR.
    const tokenFallback = (m: "sonnet" | "opus") => {
      const p = PRICES[m];
      const payload =
        thisPayloadTokens ??
        Math.round(
          (costHistory.filter((h) => h.payload_tokens).reduce((s, h) => s + (h.payload_tokens || 0), 0) /
            Math.max(1, costHistory.filter((h) => h.payload_tokens).length)) || 50000,
        );
      const cacheWrite = payload * K * 2; // each evaluator writes its own prefix (proposal + persona + instructions ≈ 2× payload)
      const cacheRead = 0; // observed pattern: little/no cross-evaluator cache reuse
      const uncached = 600 * K; // per-call instruction overhead
      const output = 3000 * K; // ~3k tokens per evaluator/synthesis call
      const usd =
        (uncached * p.in + cacheRead * p.in * 0.1 + cacheWrite * p.in * 1.25 + output * p.out) /
        1_000_000;
      return usd * USD_EUR;
    };

    const learned = (modelKey: string, fallback: number) => {
      const samples = costHistory
        .filter((h) => h.model_used === modelKey && h.payload_tokens && h.cost_eur > 0)
        .slice(0, 10);
      if (samples.length < 3) return fallback;
      const avgCost = samples.reduce((s, h) => s + h.cost_eur, 0) / samples.length;
      const avgPayload =
        samples.reduce((s, h) => s + (h.payload_tokens || 0), 0) / samples.length;
      const scale = thisPayloadTokens && avgPayload ? thisPayloadTokens / avgPayload : 1;
      return avgCost * scale;
    };

    return {
      sonnet: learned("claude-sonnet-5", tokenFallback("sonnet")),
      opus: learned("claude-opus-4-8", tokenFallback("opus")),
      sonnetStandardActive,
    };
  }, [costHistory, thisPayloadTokens, selectedCount]);

  async function startEvaluation() {

    setStage("stageA");
    setStageAStatus("Reading proposal content...");
    try {
      setStageAStatus("Computing budget totals...");
      const computedBudget = await buildComputedBudget(proposalId);

      setStageAStatus("Running compliance check and assembling panel...");
      const { data, error } = await supabase.functions.invoke("propose-evaluation-panel", {
        body: {
          proposalId,
          instrumentCode,
          proposalStage,
          budgetType: proposalStage === "stage1" ? null : budgetType,
          computedBudget,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setEligibilityFlags(data.eligibility_flags || []);
      setProposedPanel(data.proposed_panel || []);
      setAllPersonas(data.all_personas || []);
      setHaikuUsage(data.haiku_usage || null);
      setHaikuModel(data.haiku_model || null);


      const recommendedNumbers = new Set((data.proposed_panel || []).map((p: any) => p.id));
      const preselected = new Set<string>();
      (data.all_personas || []).forEach((p: Persona) => {
        if (p.persona_number !== undefined && recommendedNumbers.has(p.persona_number)) {
          preselected.add(p.id);
        }
      });
      setSelectedPersonaIds(preselected);

      // Persist the proposed panel so a reload / tab-switch before Start
      // doesn't discard the (paid) Haiku Stage A output.
      try {
        // Clear any prior panel_proposed rows for this proposal — only one active proposal at a time.
        await supabase
          .from("proposal_analyses")
          .delete()
          .eq("proposal_id", proposalId)
          .eq("status", "panel_proposed");
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData?.user?.id;
        if (uid) {
          const { data: inserted } = await supabase
            .from("proposal_analyses")
            .insert({
              proposal_id: proposalId,
              created_by: uid,
              status: "panel_proposed",
              proposal_stage: proposalStage,
              budget_type_used: proposalStage === "stage1" ? null : budgetType,
              eligibility_flags: data.eligibility_flags ?? [],
              analysis_data: {
                eligibility_flags: data.eligibility_flags ?? [],
                proposed_panel: data.proposed_panel ?? [],
                all_personas: data.all_personas ?? [],
                haiku_usage: data.haiku_usage ?? null,
                haiku_model: data.haiku_model ?? null,
                computed_budget: computedBudget,
                instrument_code: instrumentCode,
                proposal_stage: proposalStage,
                budget_type: proposalStage === "stage1" ? null : budgetType,
                selected_persona_ids: Array.from(preselected),
              },
            })
            .select("id")
            .single();
          if (inserted?.id) setPanelProposedRowId(inserted.id);
        }
      } catch (persistErr) {
        console.warn("Failed to persist proposed panel (non-fatal):", persistErr);
      }

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

    let cleanup: (() => void) | null = null;
    try {
      if (!proposalData || !allSections || allSections.length === 0) {
        throw new Error("Proposal content is still loading — please retry in a moment.");
      }

      toast.info("Rendering proposal for evaluator payload…");

      // 1) Fetch the section_content rows (same shape the PDF/Word export uses).
      const { data: sectionRows } = await supabase
        .from("section_content")
        .select("id, section_id, content")
        .eq("proposal_id", proposalId);
      const sectionContents = (sectionRows || []).map((sc: any) => ({
        id: sc.id,
        sectionId: sc.section_id,
        content: sc.content || "",
      }));

      // 2) Prepare the offscreen export container exactly as the PDF export
      //    does (Part A mirror, B3.1 / B3.2 / B1.2 React mounts, real
      //    figures). The visual container keeps real figures.
      const prepared = await prepareExportContainer(
        {
          proposal: {
            id: proposalData.id,
            title: proposalData.title || "",
            acronym: proposalData.acronym || "",
            submissionStage: (proposalData as any).submissionStage ?? null,
            topicId: (proposalData as any).topicId ?? null,
            topicTitle: (proposalData as any).topicTitle ?? null,
            type: (proposalData as any).type ?? null,
          },
          sections: allSections as any,
          sectionContents,
          participants,
        },
        undefined,
        appQueryClient,
      );
      cleanup = prepared.cleanup;

      // 3) Clone, swap figures to text on the clone, extract markdown.
      const clone = prepared.container.cloneNode(true) as HTMLElement;
      // The clone must be attached to render text measurements / innerText
      // consistently — keep it off-screen.
      clone.style.position = "absolute";
      clone.style.left = "-99999px";
      clone.style.top = "0";
      document.body.appendChild(clone);
      try {
        await replaceFiguresWithText(clone, proposalId);
        const renderedProposal = extractEvaluationText(clone);

        if (!renderedProposal || renderedProposal.length < 200) {
          throw new Error("Rendered proposal payload is empty — aborting.");
        }

        const { data, error } = await supabase.functions.invoke("run-panel-evaluation", {
          body: {
            action: "start",
            proposalId,
            selectedEvaluators,
            instrumentCode,
            proposalStage,
            budgetType: proposalStage === "stage1" ? null : budgetType,
            eligibilityFlags,
            renderedProposal,
            modelOverride: modelChoice,
            haikuUsage,
            haikuModel,
          },

        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        if (!data?.evaluationId) throw new Error("Edge function did not return an evaluationId");

        toast.info("Evaluation running in background. You can leave this page and return.");
        // Remove the panel_proposed row now that the real run is queued —
        // exactly one active row per proposal.
        if (panelProposedRowId) {
          await supabase.from("proposal_analyses").delete().eq("id", panelProposedRowId);
          setPanelProposedRowId(null);
        }
        startPolling(data.evaluationId, new Date().toISOString());


      } finally {
        if (clone.parentNode) clone.parentNode.removeChild(clone);
      }
    } catch (e: any) {
      toast.error(`Evaluation failed to start: ${e.message || e}`);
      setStage("panelReview");
    } finally {
      if (cleanup) cleanup();
    }
  }







  async function cancel() {
    // Discard the persisted panel_proposed row so it doesn't rehydrate later.
    if (panelProposedRowId) {
      await supabase.from("proposal_analyses").delete().eq("id", panelProposedRowId);
      setPanelProposedRowId(null);
    }
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

  const activeAnalysis = useMemo(
    () => history.find((h) => h.id === selectedHistoryId) || null,
    [history, selectedHistoryId],
  );

  const chartData = history.map((h) => ({
    date: formatDate(h.created_at),
    score: Number(h.total_score_unweighted ?? h.overall_score ?? 0),
    id: h.id,
    model: h.model_used || "",
  }));

  const yMax = proposalStage === "stage1" ? 10 : selectedInstrument?.code === "ia" ? 17.5 : 15;
  const overallThreshold = proposalStage === "stage1" ? 8 : 10;

  // Group personas by area
  const personasByArea = useMemo(() => {
    const map: Record<string, Persona[]> = {};
    allPersonas.forEach((p) => {
      const k = p.thematic_area || "Other";
      if (!map[k]) map[k] = [];
      map[k].push(p);
    });
    return map;
  }, [allPersonas]);

  const selectedPersonas = useMemo(
    () => allPersonas.filter((p) => selectedPersonaIds.has(p.id)),
    [allPersonas, selectedPersonaIds],
  );

  const sortedSelectedPersonas = useMemo(() => {
    const recommendedRank = (p: Persona) =>
      p.persona_number !== undefined && recommendedIds.has(p.persona_number)
        ? proposedPanel.findIndex((pp) => pp.id === p.persona_number) + 1
        : 0;
    return [...selectedPersonas].sort((a, b) => {
      const ra = recommendedRank(a);
      const rb = recommendedRank(b);
      if (ra && rb) return ra - rb;
      if (ra) return -1;
      if (rb) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [selectedPersonas, recommendedIds, proposedPanel]);

  const togglePersona = (id: string, checked: boolean) => {
    setSelectedPersonaIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const isAreaVisible = (area: string) => activeAreaFilters.size === 0 || activeAreaFilters.has(area);
  const toggleAreaFilter = (area: string) => {
    setActiveAreaFilters((prev) => {
      const next = new Set(prev);
      if (next.has(area)) next.delete(area);
      else next.add(area);
      return next;
    });
  };
  const allFilterActive = activeAreaFilters.size === 0;

  const renderPersonaRow = (p: Persona, opts: { showCheckbox: boolean }) => {
    const recommended = p.persona_number !== undefined && recommendedIds.has(p.persona_number);
    const recommendedRank = recommended
      ? proposedPanel.findIndex((pp) => pp.id === p.persona_number) + 1
      : 0;
    return (
      <label
        key={p.id}
        className="flex items-start gap-3 p-2 rounded hover:bg-muted/50 cursor-pointer"
      >
        {opts.showCheckbox && (
          <Checkbox
            checked={selectedPersonaIds.has(p.id)}
            onCheckedChange={(c) => togglePersona(p.id, !!c)}
          />
        )}
        <div className="flex-1 text-sm">
          <div className="flex items-center gap-2 flex-wrap">
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
  };

  return (
    <div className="space-y-6">
      {/* Description card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-5 w-5 text-purple-600" />
            Mock AI evaluation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            This tool simulates a Horizon Europe expert evaluation panel using Anthropic's API.
            After an eligibility check by an agentic AI European Commission evaluator using
            Haiku 4.5, it assembles a panel of agentic AI "evaluators" with different expert
            roles and personas, which evaluate the proposal in its current state from different
            perspectives, using either Sonnet 5 or Opus 4.8. Finally, another agent assembles
            scores and detailed feedback into an Evaluation Summary Report (ESR). Only proposal
            coordinators can run an evaluation, but all users can view the ESRs associated with
            a proposal.
          </p>
        </CardContent>
        {isCoordinator && (
          <CardContent className="pt-0 space-y-4">

          {/* Per-run model toggle switch. Defaults to Sonnet 5 each time the pane opens.
              Choosing Opus 4.8 overrides for THIS RUN ONLY — the stored default stays Sonnet 5. */}
          {(stage === "idle" || stage === "panelReview") && (() => {
            const isOpus = modelChoice === "claude-opus-4-8";
            const disabled = stage !== "idle" && stage !== "panelReview";
            const GREEN = "#16a34a"; // tailwind green-600
            const RED = "#dc2626"; // tailwind red-600
            const sonnetSelected = !isOpus;
            const opusSelected = isOpus;
            const activeColor = opusSelected ? RED : GREEN;
            return (
              <div className="space-y-2 -mt-1">
                {/* Row 1: model name (right) · toggle switch · model name (left) */}
                <div className="flex items-start gap-5 max-w-3xl">
                  <button
                    type="button"
                    onClick={() => setModelChoice("claude-sonnet-5")}
                    disabled={disabled}
                    className="flex-1 text-right disabled:opacity-60"
                  >
                    <div
                      className={`text-sm font-semibold transition-colors ${
                        sonnetSelected ? "" : "text-muted-foreground"
                      }`}
                      style={sonnetSelected ? { color: GREEN } : undefined}
                    >
                      Sonnet 5 <span className="font-normal text-xs text-muted-foreground">~{formatCurrency(modelCostEstimate.sonnet)}</span>
                    </div>
                  </button>

                  {/* Toggle switch — knob turns RED when Opus is active, GREEN when Sonnet is active. */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={opusSelected}
                    aria-label="Toggle evaluation model"
                    onClick={() => setModelChoice(isOpus ? "claude-sonnet-5" : "claude-opus-4-8")}
                    disabled={disabled}
                    className="relative shrink-0 mt-1 h-7 w-14 rounded-full border border-gray-300 bg-white transition-colors disabled:opacity-60"
                  >
                    <span
                      className="absolute left-0 top-1/2 h-5 w-5 rounded-full shadow transition-transform"
                      style={{
                        backgroundColor: activeColor,
                        transform: `translateY(-50%) translateX(${opusSelected ? 32 : 4}px)`,
                      }}
                    />
                  </button>

                  <button
                    type="button"
                    onClick={() => setModelChoice("claude-opus-4-8")}
                    disabled={disabled}
                    className="flex-1 text-left disabled:opacity-60"
                  >
                    <div
                      className={`text-sm font-semibold transition-colors ${
                        opusSelected ? "" : "text-muted-foreground"
                      }`}
                      style={opusSelected ? { color: RED } : undefined}
                    >
                      Opus 4.8 <span className="font-normal text-xs text-muted-foreground">~{formatCurrency(modelCostEstimate.opus)}</span>
                    </div>
                  </button>
                </div>

                {/* Row 2: descriptions flank a small Start button centred under the toggle. */}
                <div className="flex items-center gap-5 max-w-3xl">
                  <div className="flex-1 text-right text-xs text-muted-foreground leading-snug">
                    Cheaper &amp; faster, quality close to Opus — recommended through development.
                  </div>
                  <div className="shrink-0 flex justify-center">
                    {stage === "idle" && !failedRun ? (
                      <Button
                        onClick={startEvaluation}
                        disabled={!instrumentCode}
                        size="sm"
                        className="gap-2 h-8 px-3"
                      >
                        <Sparkles className="h-4 w-4" /> Start
                      </Button>
                    ) : (
                      <span className="w-[88px]" aria-hidden />
                    )}
                  </div>
                  <div className="flex-1 text-left text-xs text-muted-foreground leading-snug">
                    Highest accuracy — use late, for extra scrutiny before submission.{" "}
                    <span className="italic">(per-run only)</span>
                  </div>
                </div>
              </div>
            );
          })()}

          {stage === "idle" && failedRun && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <div className="font-medium">
                    Previous evaluation failed —{" "}
                    {failedRun.successCount} of {failedRun.total} evaluators succeeded,{" "}
                    {failedRun.failCount} errored.
                  </div>
                  {failedRun.errorMessage && (
                    <div className="text-xs opacity-90">{failedRun.errorMessage}</div>
                  )}
                  <div className="text-xs opacity-90">
                    Resuming only re-runs the errored evaluators (cached prefix — near-free) and
                    proceeds to synthesis if at least 3 succeed. Starting a new evaluation
                    discards this run and re-runs everything.
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={resumeFailedRun}
                      disabled={resumingFailedRun || failedRun.failCount === 0}
                      className="gap-2"
                    >
                      {resumingFailedRun ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                      Resume failed evaluators
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        dismissFailedRun();
                        void startEvaluation();
                      }}
                      disabled={!instrumentCode || resumingFailedRun}
                    >
                      Start new evaluation
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={dismissFailedRun}
                      disabled={resumingFailedRun}
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {stage === "idle" && !failedRun && (
            <div className="flex justify-center pt-2">
              <Button onClick={startEvaluation} disabled={!instrumentCode} className="gap-2">
                <Sparkles className="h-4 w-4" /> Start Evaluation
              </Button>
            </div>
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
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    {runningStatus === "synthesizing"
                      ? "Synthesizing the ESR from evaluator reports. This typically takes a few minutes."
                      : runningStatus === "processing"
                      ? "Evaluator agents are reviewing the proposal. This typically takes 4–8 minutes."
                      : "Evaluation running in the background. This typically takes 4–8 minutes."}
                    <div className="text-xs mt-1 text-muted-foreground">
                      {runningMessage || "You can leave this page and return — the result will be saved automatically."}
                      {runStartedAt && (
                        <span className="ml-2 font-mono">· elapsed {formatElapsed(runStartedAt, nowTick)}</span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={cancelRun}
                    disabled={!runningEvaluationId}
                  >
                    Cancel
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          </CardContent>
        )}
      </Card>


      {/* Evaluation Summary Reports — chart + most recent + previous in one card */}
      {history.length > 0 && stage !== "panelReview" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Evaluation Summary Reports</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {chartData.length >= 2 && (
              <div className="space-y-1">
                <div className="h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis domain={[0, yMax]} tick={{ fontSize: 10 }} width={28} />
                      <RTooltip />
                      <ReferenceLine
                        y={overallThreshold}
                        stroke="hsl(var(--destructive))"
                        strokeDasharray="4 4"
                        label={{ value: `Threshold ${overallThreshold}`, fontSize: 10 }}
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
                          const { key, cx, cy, payload } = props;
                          const isOpus = (payload?.model || "").includes("opus");
                          const color = isOpus ? "#dc2626" : "#16a34a";
                          return (
                            <Dot
                              key={key}
                              cx={cx}
                              cy={cy}
                              r={4}
                              fill={color}
                              stroke={color}
                            />
                          );
                        }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex items-center justify-end gap-3 text-[10px] text-muted-foreground pr-2">
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: "#16a34a" }} />
                    Sonnet 5
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: "#dc2626" }} />
                    Opus 4.8
                  </span>
                </div>
              </div>
            )}
            <div className="space-y-2">
              {[...history].reverse().map((h) => {
                const isOpen = selectedHistoryId === h.id;
                return (
                  <div key={h.id} className="border rounded">
                    <div
                      className={cn(
                        "w-full flex items-center justify-between gap-2 p-3 text-sm hover:bg-muted/50",
                        isOpen && "bg-muted/40",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedHistoryId(isOpen ? null : h.id)}
                        className="flex-1 min-w-0 flex items-center gap-3 text-left"
                      >
                        <span className="font-medium truncate">
                          {formatDateTime(h.created_at)}
                        </span>
                      </button>
                      <div className="flex items-center gap-2 shrink-0">
                        {(() => {
                          const inst = instruments.find((i) => i.id === h.instrument_id);
                          const weighting = inst?.impact_weighting ?? 1;
                          const isStage1 = h.proposal_stage === "stage1";
                          const max = isStage1 ? 10 : 5 + 5 * weighting + 5;
                          const score = weighting !== 1
                            ? (h.total_score_weighted ?? h.overall_score)
                            : (h.total_score_unweighted ?? h.overall_score);
                          const scoreLabel = score == null ? "—" : Number(score).toFixed(1).replace(/\.0$/, "");
                          const maxLabel = Number(max).toFixed(1).replace(/\.0$/, "");
                          return (
                            <Badge variant="outline">
                              Score: {scoreLabel}/{maxLabel}
                            </Badge>
                          );
                        })()}
                        {renderModelBadge(h.model_used)}
                        {h.cost_eur != null && (() => {
                          const cb = h.analysis_data?.cost_breakdown as
                            | {
                                model?: string;
                                input_tokens?: number;
                                output_tokens?: number;
                                cache_read_tokens?: number;
                                cache_write_tokens?: number;
                                price_in_per_mtok_usd?: number;
                                price_out_per_mtok_usd?: number;
                                cache_read_multiplier?: number;
                                cache_write_multiplier?: number;
                                usd_eur_rate?: number;
                                cost_usd?: number;
                              }
                            | undefined;
                          const fmt = (n: number | undefined) =>
                            n == null ? "—" : formatNumber(Number(n));

                          return (
                            <TooltipProvider delayDuration={150}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge
                                    variant="outline"
                                    className="cursor-help border-green-600 text-green-700 font-semibold"
                                  >
                                    Actual: {formatCurrency(Number(h.cost_eur))}
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs">
                                  {cb ? (
                                    <div className="space-y-1 text-xs">
                                      <div className="font-medium">{cb.model || h.model_used || "—"}</div>
                                      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                                        <span className="text-muted-foreground">Input tokens</span>
                                        <span className="text-right">{fmt(cb.input_tokens)}</span>
                                        <span className="text-muted-foreground">Output tokens</span>
                                        <span className="text-right">{fmt(cb.output_tokens)}</span>
                                        <span className="text-muted-foreground">Cache reads</span>
                                        <span className="text-right">{fmt(cb.cache_read_tokens)}</span>
                                        <span className="text-muted-foreground">Cache writes</span>
                                        <span className="text-right">{fmt(cb.cache_write_tokens)}</span>
                                      </div>
                                      <div className="border-t pt-1 mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5">
                                        <span className="text-muted-foreground">Rate (in / out)</span>
                                        <span className="text-right">
                                          ${cb.price_in_per_mtok_usd?.toFixed(2) ?? "—"} / ${cb.price_out_per_mtok_usd?.toFixed(2) ?? "—"} per Mtok
                                        </span>
                                        <span className="text-muted-foreground">Cache (read / write)</span>
                                        <span className="text-right">
                                          {cb.cache_read_multiplier ?? "—"}× / {cb.cache_write_multiplier ?? "—"}×
                                        </span>
                                        <span className="text-muted-foreground">USD → EUR</span>
                                        <span className="text-right">{cb.usd_eur_rate ?? "—"}</span>
                                      </div>
                                      <div className="border-t pt-1 mt-1 flex justify-between font-medium">
                                        <span>Total</span>
                                        <span>
                                          ${cb.cost_usd?.toFixed(4) ?? "—"} ≈ €{Number(h.cost_eur).toFixed(4)}
                                        </span>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="text-xs">
                                      Model: {h.model_used || "—"}
                                      <br />
                                      Detailed breakdown unavailable for this run.
                                    </div>
                                  )}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          );
                        })()}
                        <Badge variant="outline" title="Total run time">
                          {formatDurationMs(
                            (h.analysis_data as any)?.total_duration_ms as number | undefined,
                          )}
                        </Badge>
                        <Button
 variant="ghost"
 size="icon"
 className="h-7 w-7"
 title="Download ESR (PDF)"
 onClick={(e) => {
 e.stopPropagation();
 downloadEsr(h);
 }}
 aria-label="Download" >
                          <Download className="h-4 w-4" />
                        </Button>
                        {isCoordinator && (
                          <Button
 variant="ghost"
 size="icon"
 className="h-7 w-7 text-destructive hover:text-destructive"
 title="Delete ESR"
 onClick={(e) => {
 e.stopPropagation();
 void deleteEsr(h);
 }}
 aria-label="Delete" >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                    {isOpen && (
                      <div className="p-3 border-t">
                        <EsrRenderer
                          markdown={h.analysis_data?.esr_markdown || "(no ESR available)"}
                          acronym={proposal?.acronym}
                          createdAt={h.created_at}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

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

          {/* Selected Panel section */}
          <Card>
            <CardHeader>
              <CardTitle
                className={cn(
                  "text-base",
                  !validPanelSize && "text-destructive",
                )}
              >
                Selected Evaluation Panel ({selectedCount} selected — min 3, max 10)
              </CardTitle>
              <p className="text-xs text-muted-foreground italic mt-1">
                The "evaluators" are agentic AI avatars with different personas, each of which
                conducts the evaluation from a different perspective based on their profession
                and expertise.
              </p>
            </CardHeader>
            <CardContent>
              {sortedSelectedPersonas.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No evaluators selected yet. Select from the list below.
                </p>
              ) : (
                <div className="space-y-1">
                  {sortedSelectedPersonas.map((p) => renderPersonaRow(p, { showCheckbox: true }))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Filter bar + full list */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base">Evaluator library</CardTitle>
                <Button variant="outline" size="sm" className="gap-2" onClick={() => setCreatePersonaOpen(true)}>
                  <Plus className="h-4 w-4" /> Create new evaluator
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={allFilterActive ? "default" : "outline"}
                  onClick={() => setActiveAreaFilters(new Set())}
                >
                  All
                </Button>
                {THEMATIC_AREAS.map((a) => (
                  <Button
                    key={a}
                    type="button"
                    size="sm"
                    variant={activeAreaFilters.has(a) ? "default" : "outline"}
                    onClick={() => toggleAreaFilter(a)}
                  >
                    {a}
                  </Button>
                ))}
              </div>

              <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                {Object.keys(personasByArea).map((area) => (
                  <div
                    key={area}
                    style={{ display: isAreaVisible(area) ? undefined : "none" }}
                  >
                    <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                      {area}
                    </div>
                    <div className="space-y-1">
                      {(personasByArea[area] || []).map((p) =>
                        renderPersonaRow(p, { showCheckbox: true }),
                      )}
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
