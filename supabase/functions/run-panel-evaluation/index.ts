// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const stripHtml = (s: string | null | undefined) =>
  (s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

function extractJson(text: string): any {
  const cleaned = text.replace(/```json\s*|```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/[\[{][\s\S]*[\]}]/);
    if (match) return JSON.parse(match[0]);
    throw new Error("Failed to parse JSON from model output");
  }
}

interface AnthropicCallResult {
  text: string;
  usage: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

class RateLimitError extends Error {
  retryAfter?: number;
  constructor(message: string, retryAfter?: number) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function callAnthropicWithCache(
  apiKey: string,
  model: string,
  systemBlocks: { type: "text"; text: string; cache_control?: { type: "ephemeral" } }[],
  userPrompt: string,
  maxTokens: number,
  enableThinking = false,
  maxRetries = 3,
): Promise<AnthropicCallResult> {
  const body: any = {
    model,
    max_tokens: maxTokens,
    system: systemBlocks,
    messages: [{ role: "user", content: userPrompt }],
  };

  if (enableThinking) {
    body.thinking = { type: "adaptive" };
    body.output_config = { effort: "medium" };
  }

  let attempt = 0;
  while (true) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "prompt-caching-2024-07-31",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json();
      const text =
        (data?.content || [])
          .filter((block: any) => block.type === "text")
          .map((block: any) => block.text)
          .join("\n") || "";
      return { text, usage: data?.usage || {} };
    }

    const errorBody = await res.text();
    console.error(
      `Anthropic API error ${res.status} (model=${model}, thinking=${enableThinking}, attempt=${attempt + 1}):`,
      errorBody.slice(0, 500),
    );

    if (res.status === 429 && attempt < maxRetries) {
      const retryAfterHeader = res.headers.get("retry-after");
      const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : NaN;
      const backoffMs = Number.isFinite(retryAfterSec)
        ? retryAfterSec * 1000
        : Math.min(120_000, 2 ** attempt * 1000) + Math.floor(Math.random() * 500);
      console.warn(`Rate limited. Backing off ${backoffMs}ms before retry ${attempt + 2}/${maxRetries + 1}.`);
      await sleep(backoffMs);
      attempt++;
      continue;
    }

    if (res.status === 429) {
      const retryAfterHeader = res.headers.get("retry-after");
      const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;
      throw new RateLimitError(
        `Anthropic rate limit exceeded after ${maxRetries + 1} attempts. ${errorBody.slice(0, 300)}`,
        retryAfterSec,
      );
    }

    if (enableThinking && res.status === 400 && /thinking/i.test(errorBody)) {
      console.warn("Retrying Anthropic call without extended thinking...");
      delete body.thinking;
      delete body.output_config;
      enableThinking = false;
      continue;
    }

    throw new Error(`Anthropic ${res.status}: ${errorBody}`);
  }
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

const round05 = (n: number) => Math.round(n * 2) / 2;
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
const EVALUATOR_MAX_TOKENS = 3200;
const SYNTHESIS_MAX_TOKENS = 4200;
const MAX_SECTION_CHARS = 2200;
const MAX_TOTAL_SECTION_CHARS = 32000;
const ACTIVE_STEP_STALE_MS = 180_000;

function formatRetryDelay(retryAfterSeconds?: number) {
  const seconds = Math.max(30, Math.min(retryAfterSeconds ?? 60, 300));
  const retryAt = new Date(Date.now() + seconds * 1000).toISOString();
  const minutes = seconds >= 60 ? `${Math.ceil(seconds / 60)} min` : `${seconds}s`;
  return { seconds, retryAt, label: minutes };
}

function buildSectionDigest(sections: any[]) {
  let consumed = 0;

  return sections
    .map((section: any) => {
      const text = stripHtml(section.content);
      if (!text) return `### ${section.section_id}\n[No content provided]`;

      const remaining = MAX_TOTAL_SECTION_CHARS - consumed;
      if (remaining <= 0) return `### ${section.section_id}\n[Additional content omitted to stay within model limits]`;

      const excerptLength = Math.min(MAX_SECTION_CHARS, remaining);
      const excerpt = text.slice(0, excerptLength);
      consumed += excerpt.length;
      const truncated = text.length > excerpt.length ? "\n[Section excerpt truncated for model budget]" : "";
      return `### ${section.section_id}\n${excerpt}${truncated}`;
    })
    .join("\n\n");
}

function isRecentStepStart(value: unknown) {
  if (typeof value !== "string") return false;
  const started = Date.parse(value);
  return Number.isFinite(started) && Date.now() - started < ACTIVE_STEP_STALE_MS;
}

interface EvaluatorSelection {
  name: string;
  brief: string;
}

interface EvaluationRecord {
  id: string;
  proposal_id: string;
  created_by: string;
  instrument_id: string | null;
  proposal_stage: string | null;
  budget_type_used: string | null;
  evaluators_selected: EvaluatorSelection[] | null;
  eligibility_flags: any;
  analysis_data: any;
  status: string | null;
}

interface LoadedContext {
  evaluation: EvaluationRecord;
  proposal: any;
  sections: any[];
  participants: any[];
  wpDrafts: any[];
  deliverables: any[];
  milestones: any[];
  risks: any[];
  budget: any[];
  instrument: any;
  criteriaForRun: any[];
  configMap: Record<string, string>;
  selectedEvaluators: EvaluatorSelection[];
  stageKey: "stage1" | "full";
  budgetType: string | null;
  budgetTypeLabel: string;
  eligibilityFlags: any[];
}

async function getEvaluationRecord(serviceClient: any, evaluationId: string): Promise<EvaluationRecord> {
  const { data, error } = await serviceClient
    .from("proposal_analyses")
    .select(
      "id, proposal_id, created_by, instrument_id, proposal_stage, budget_type_used, evaluators_selected, eligibility_flags, analysis_data, status",
    )
    .eq("id", evaluationId)
    .single();

  if (error || !data) {
    throw new Error("Evaluation record not found");
  }

  return data as EvaluationRecord;
}

async function loadEvaluationContext(serviceClient: any, evaluationId: string): Promise<LoadedContext> {
  const evaluation = await getEvaluationRecord(serviceClient, evaluationId);
  const instrumentCode = evaluation.analysis_data?.instrument_code;

  const instrumentQuery = evaluation.instrument_id
    ? serviceClient.from("instrument_types").select("*").eq("id", evaluation.instrument_id).maybeSingle()
    : serviceClient.from("instrument_types").select("*").eq("code", instrumentCode).maybeSingle();

  const [
    proposalRes,
    sectionsRes,
    participantsRes,
    wpDraftsRes,
    deliverablesRes,
    milestonesRes,
    risksRes,
    budgetRes,
    instrumentRes,
    criteriaRes,
    configRes,
  ] = await Promise.all([
    serviceClient.from("proposals").select("*").eq("id", evaluation.proposal_id).single(),
    serviceClient.from("section_content").select("section_id, content").eq("proposal_id", evaluation.proposal_id),
    serviceClient
      .from("participants")
      .select("id, organisation_short_name, organisation_name, participant_number, country, organisation_category, is_sme")
      .eq("proposal_id", evaluation.proposal_id),
    serviceClient
      .from("wp_drafts")
      .select("id, number, short_name, title, lead_participant_id, methodology, objectives")
      .eq("proposal_id", evaluation.proposal_id)
      .order("number"),
    serviceClient
      .from("b31_deliverables")
      .select("number, name, description, due_month, type, dissemination_level")
      .eq("proposal_id", evaluation.proposal_id),
    serviceClient
      .from("b31_milestones")
      .select("number, name, due_month, means_of_verification, wps")
      .eq("proposal_id", evaluation.proposal_id),
    serviceClient
      .from("b31_risks")
      .select("number, description, mitigation, likelihood, severity, wps")
      .eq("proposal_id", evaluation.proposal_id),
    serviceClient
      .from("budget_rows")
      .select("participant_id, personnel_costs, subcontracting_costs, purchase_equipment, purchase_other_goods, purchase_travel, requested_eu_contribution")
      .eq("proposal_id", evaluation.proposal_id),
    instrumentQuery,
    serviceClient.from("evaluation_criteria").select("*").order("criterion_order"),
    serviceClient.from("ai_platform_config").select("key, value"),
  ]);

  const proposal = proposalRes.data;
  const instrument = instrumentRes.data;
  if (!proposal || !instrument) {
    throw new Error("Proposal or instrument not found");
  }

  const stageKey = evaluation.proposal_stage === "stage1" ? "stage1" : "full";
  const allCriteria = criteriaRes.data || [];
  const criteriaForRun = allCriteria.filter(
    (criterion: any) =>
      criterion.instrument_id === instrument.id &&
      Array.isArray(criterion.applicable_stages) &&
      criterion.applicable_stages.includes(stageKey),
  );

  const configMap = Object.fromEntries((configRes.data || []).map((row: any) => [row.key, row.value]));
  const selectedEvaluators = Array.isArray(evaluation.evaluators_selected)
    ? evaluation.evaluators_selected.filter(
        (e: any) => e && typeof e.name === "string" && typeof e.brief === "string",
      )
    : [];

  if (selectedEvaluators.length < 3 || selectedEvaluators.length > 10) {
    throw new Error("Saved evaluation panel is invalid");
  }

  const budgetType = evaluation.budget_type_used ?? null;
  const budgetTypeLabel = budgetType === "lump_sum" ? "Lump sum" : "Actual cost";
  const eligibilityFlags = Array.isArray(evaluation.eligibility_flags)
    ? evaluation.eligibility_flags
    : Array.isArray(evaluation.analysis_data?.eligibility_flags)
    ? evaluation.analysis_data.eligibility_flags
    : [];

  return {
    evaluation,
    proposal,
    sections: sectionsRes.data || [],
    participants: participantsRes.data || [],
    wpDrafts: wpDraftsRes.data || [],
    deliverables: deliverablesRes.data || [],
    milestones: milestonesRes.data || [],
    risks: risksRes.data || [],
    budget: budgetRes.data || [],
    instrument,
    criteriaForRun,
    configMap,
    selectedEvaluators,
    stageKey,
    budgetType,
    budgetTypeLabel,
    eligibilityFlags,
  };
}

async function runEvaluatorPhase(serviceClient: any, evaluationId: string) {
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

  const context = await loadEvaluationContext(serviceClient, evaluationId);
  const {
    evaluation,
    proposal,
    sections,
    participants,
    wpDrafts,
    deliverables,
    milestones,
    risks,
    budget,
    instrument,
    criteriaForRun,
    configMap,
    selectedEvaluators,
    stageKey,
    budgetType,
    budgetTypeLabel,
    eligibilityFlags,
  } = context;

  if (!["queued", "running", "processing", "failed"].includes(evaluation.status || "queued")) {
    return { evaluationId, status: evaluation.status || "unknown" };
  }

  const baseAnalysisData = evaluation.analysis_data || {};
  const savedEvaluations = Array.isArray(baseAnalysisData.evaluations) ? baseAnalysisData.evaluations : [];
  const savedUsage = baseAnalysisData.token_usage || {};
  const activeStepStartedAt = baseAnalysisData.active_step_started_at;
  if (isRecentStepStart(activeStepStartedAt) && ["running", "processing"].includes(evaluation.status || "")) {
    return {
      evaluationId,
      status: evaluation.status || "processing",
      active: true,
    };
  }
  const usageTotals = {
    evaluator_input_tokens: Number(savedUsage.evaluator_input_tokens || 0),
    evaluator_output_tokens: Number(savedUsage.evaluator_output_tokens || 0),
    evaluator_cached_tokens: Number(savedUsage.evaluator_cached_tokens || 0),
    evaluator_cache_write_tokens: Number(savedUsage.evaluator_cache_write_tokens || 0),
  };

  const evaluationModel = configMap.evaluation_model || "claude-opus-4-5-20250929";

  const WORDS_PER_PAGE = 500;
  const FRONT_MATTER_PAGES = 1;
  const allText = sections.map((section: any) => stripHtml(section.content)).join(" ");
  const totalWords = allText.split(/\s+/).filter((word: string) => word.length > 0).length;
  const estimatedPages = Math.ceil(totalWords / WORDS_PER_PAGE) + FRONT_MATTER_PAGES;

  const partA = `PROPOSAL TITLE: ${proposal.title}
ACRONYM: ${proposal.acronym}
INSTRUMENT: ${instrument.name}
DURATION: ${proposal.duration ?? "?"} months
TOPIC: ${proposal.topic_id || "?"}
WORK PROGRAMME: ${proposal.work_programme || "?"}
ESTIMATED PAGES: ${estimatedPages} (~${totalWords} words at 500 words/page + 1 front-matter)

PARTICIPANTS:
${participants.map((participant: any) => `- #${participant.participant_number} ${participant.organisation_short_name || participant.organisation_name} (${participant.country}, ${participant.organisation_category || "?"}${participant.is_sme ? ", SME" : ""})`).join("\n")}

WORK PACKAGES:
${wpDrafts.map((wp: any) => `WP${wp.number} ${wp.short_name || ""} ${wp.title || ""}\nObjectives: ${stripHtml(wp.objectives).slice(0, 600)}\nMethodology: ${stripHtml(wp.methodology).slice(0, 800)}`).join("\n\n")}

DELIVERABLES:
${deliverables.map((deliverable: any) => `- D${deliverable.number} ${deliverable.name} (M${deliverable.due_month}, ${deliverable.type || "?"}, ${deliverable.dissemination_level || "?"})`).join("\n")}

MILESTONES:
${milestones.map((milestone: any) => `- MS${milestone.number} ${milestone.name} (M${milestone.due_month}, WPs: ${milestone.wps})`).join("\n")}

RISKS:
${risks.map((risk: any) => `- R${risk.number} ${stripHtml(risk.description)} | Mitigation: ${stripHtml(risk.mitigation)} | L:${risk.likelihood} S:${risk.severity}`).join("\n")}

BUDGET (sum requested EU contribution): €${budget.reduce((sum: number, row: any) => sum + Number(row.requested_eu_contribution || 0), 0).toLocaleString()}
`;

  const partB = buildSectionDigest(sections);
  const proposalContentBlock = `=== PART A: ADMINISTRATIVE ===\n${partA}\n\n=== PART B: TECHNICAL ===\n${partB}`;

  const criteriaText = criteriaForRun
    .map((criterion: any) => {
      const threshold = stageKey === "stage1" ? criterion.threshold_stage1 : criterion.threshold_full;
      return `## ${criterion.criterion_name} (threshold ${threshold}/5)
SUB-CRITERIA:
${criterion.sub_criteria}

SCORING DESCRIPTORS:
${criterion.scoring_descriptors}`;
    })
    .join("\n\n");

  const instrumentContext =
    instrument.code === "ria"
      ? "Research and Innovation Actions primarily fund fundamental and applied research. The emphasis is on generating new knowledge, with innovation and commercial exploitation as longer-term downstream goals. Excellence and methodological rigour are particularly important."
      : instrument.code === "ia"
      ? "Innovation Actions primarily fund activities closer to the market — prototyping, demonstrating, piloting, and scaling. The Impact criterion is weighted 1.5× in IA evaluations, reflecting the greater emphasis on real-world uptake and commercial viability. Proposals must demonstrate a credible route to market or deployment."
      : "Coordination and Support Actions fund coordination, networking, policy support, dissemination, and standardisation activities. They do not fund research or innovation directly. The methodology criterion focuses on the quality of coordination and support measures rather than scientific methodology.";

  const stageContext =
    stageKey === "stage1"
      ? "This is a Stage 1 outline proposal in a two-stage submission procedure. Only Excellence and Impact are evaluated. Do not penalise the proposal for absence of detail that is not required at Stage 1. This evaluation is blind — the proposal must not contain identifying information about the consortium. If you find any, note it."
      : "This is a full proposal. All three criteria — Excellence, Impact, and Implementation — are evaluated.";

  const budgetContext =
    budgetType === "lump_sum"
      ? "\n\nFOR LUMP SUM: This is a lump sum proposal. The entire project budget has been agreed as a fixed amount rather than actual costs. Assess whether the proposed lump sum is realistic and well-justified by the budget breakdown provided. Include specific commentary on this under Implementation."
      : "";

  const specialExceptions = instrument.special_exceptions?.trim()
    ? `\n\nSPECIAL EVALUATION RULES FOR THIS INSTRUMENT:\n${instrument.special_exceptions}`
    : "";

  const evaluationCriteriaNotes = (proposal.evaluation_criteria_notes || "").trim();
  const topicSpecificContext = evaluationCriteriaNotes
    ? `\n\nTOPIC-SPECIFIC CONTEXT FROM THE PROPOSAL TEAM:\n${evaluationCriteriaNotes}`
    : "";

  const finalizeEvaluatorPhase = async (parsedEvaluations: any[], nextUsageTotals: Record<string, number>) => {
    const validEvaluations = parsedEvaluations.filter((item) => !item?.data?.error);
    if (validEvaluations.length === 0) {
      throw new Error("All evaluator outputs failed to parse");
    }

    const excellenceScores = validEvaluations
      .map((item) => Number(item.data.excellence_score))
      .filter((value) => !Number.isNaN(value));
    const impactScores = validEvaluations
      .map((item) => Number(item.data.impact_score))
      .filter((value) => !Number.isNaN(value));
    const implementationScores =
      stageKey === "full"
        ? validEvaluations
            .map((item) => Number(item.data.implementation_score))
            .filter((value) => !Number.isNaN(value))
        : [];

    const excellenceMean = round05(mean(excellenceScores));
    const impactMean = round05(mean(impactScores));
    const implementationMean = stageKey === "full" ? round05(mean(implementationScores)) : null;
    const impactWeighting = Number(instrument.impact_weighting || 1.0);
    const impactWeighted = round05(impactMean * impactWeighting * 2) / 2;
    const totalUnweighted =
      stageKey === "full"
        ? excellenceMean + impactMean + (implementationMean || 0)
        : excellenceMean + impactMean;
    const totalWeighted =
      stageKey === "full"
        ? excellenceMean + impactWeighted + (implementationMean || 0)
        : excellenceMean + impactWeighted;

    const findThreshold = (criterionName: string) => {
      const criterion = criteriaForRun.find((item: any) =>
        String(item.criterion_name || "").toLowerCase().includes(criterionName.toLowerCase()),
      );
      if (!criterion) return null;
      return stageKey === "stage1" ? criterion.threshold_stage1 : criterion.threshold_full;
    };

    const synthesisContext = {
      stage_key: stageKey,
      budget_type: budgetType,
      budget_type_label: budgetTypeLabel,
      impact_weighting: impactWeighting,
      excellence_mean: excellenceMean,
      impact_mean: impactMean,
      implementation_mean: implementationMean,
      impact_weighted: impactWeighted,
      total_unweighted: totalUnweighted,
      total_weighted: totalWeighted,
      thresholds: {
        excellence: findThreshold("excellence"),
        impact: findThreshold("impact"),
        implementation: findThreshold("implementation"),
      },
      proposal_title: proposal.title,
      proposal_acronym: proposal.acronym,
      work_programme: proposal.work_programme || "n/a",
      topic_id: proposal.topic_id || "n/a",
      instrument_name: instrument.name,
      instrument_code: instrument.code,
      evaluation_model: evaluationModel,
      token_usage: nextUsageTotals,
    };

    await serviceClient
      .from("proposal_analyses")
      .update({
        status: "synthesizing",
        error_message: null,
        model_used: evaluationModel,
        excellence_score: excellenceMean,
        impact_score_raw: impactMean,
        impact_score_weighted: impactWeighted,
        implementation_score: implementationMean,
        total_score_unweighted: totalUnweighted,
        total_score_weighted: totalWeighted,
        overall_score: totalUnweighted,
        analysis_data: {
          ...baseAnalysisData,
          eligibility_flags: eligibilityFlags,
          evaluations: parsedEvaluations.map((item) => ({ persona: item.persona, data: item.data })),
          synthesis_context: synthesisContext,
          token_usage: nextUsageTotals,
          instrument_code: instrument.code,
          active_step_started_at: null,
          progress_message: "Synthesizing evaluation summary report",
        },
      })
      .eq("id", evaluationId);

    return { evaluationId, status: "synthesizing" };
  };

  if (savedEvaluations.length >= selectedEvaluators.length) {
    return finalizeEvaluatorPhase(savedEvaluations, usageTotals);
  }

  const evaluator = selectedEvaluators[savedEvaluations.length];
  const fullProposalOutputBlock =
    stageKey === "stage1"
      ? `{
  "excellence_comments": "120–220 words",
  "excellence_score": number (0–5 in 0.5 steps),
  "impact_comments": "120–220 words",
  "impact_score": number (0–5 in 0.5 steps),
  "overall_comments": "40–70 words",
  "key_strength": "one sentence",
  "key_concern": "one sentence"
}`
      : `{
  "excellence_comments": "120–220 words",
  "excellence_score": number,
  "impact_comments": "120–220 words",
  "impact_score": number,
  "implementation_comments": "120–220 words",
  "implementation_score": number,
  "overall_comments": "40–70 words",
  "key_strength": "one sentence",
  "key_concern": "one sentence"
}`;

  const evaluatorSystem = `You are ${evaluator.name}. ${evaluator.brief}.

You are serving as an independent Horizon Europe evaluator. Evaluate strictly from your professional perspective.

PROGRAMME CONTEXT
INSTRUMENT TYPE: ${instrument.name}
${instrumentContext}

PROPOSAL STAGE: ${stageKey === "stage1" ? "Stage 1 of 2" : "Full proposal"}
${stageContext}

BUDGET TYPE: ${budgetTypeLabel}${budgetContext}

EVALUATION RULES
- Evaluate the proposal as submitted.
- Do not recommend changes.
- Be specific and reference actual content or omissions.
- Identify at least two distinct weaknesses per criterion.
- Use the full scoring scale realistically; scores above 4 are rare.${specialExceptions}${topicSpecificContext}

EVALUATION CRITERIA:
${criteriaText}

OUTPUT — respond with a JSON object only:
${fullProposalOutputBlock}`;

  const systemBlocks: any = [
    { type: "text", text: evaluatorSystem },
    {
      type: "text",
      text: `--- PROPOSAL CONTENT ---\n${proposalContentBlock}`,
      cache_control: { type: "ephemeral" },
    },
  ];

  await serviceClient
    .from("proposal_analyses")
    .update({
      status: "processing",
      error_message: null,
      analysis_data: {
        ...baseAnalysisData,
        eligibility_flags: eligibilityFlags,
        evaluations: savedEvaluations,
        token_usage: usageTotals,
        instrument_code: instrument.code,
        active_step_started_at: new Date().toISOString(),
        progress_message: `Running evaluator ${savedEvaluations.length + 1} of ${selectedEvaluators.length}`,
      },
    })
    .eq("id", evaluationId);

  let result: AnthropicCallResult;
  try {
    result = await callAnthropicWithCache(
      ANTHROPIC_API_KEY,
      evaluationModel,
      systemBlocks,
      "Evaluate the proposal above according to your instructions. Respond with the JSON object only.",
      EVALUATOR_MAX_TOKENS,
      false,
      2,
    );
  } catch (error) {
    if (error instanceof RateLimitError) {
      const retry = formatRetryDelay(error.retryAfter);
      const message = `The evaluator model is rate limited right now. Please retry after ${retry.label}.`;
      await serviceClient
        .from("proposal_analyses")
        .update({
          status: "failed",
          error_message: message,
          analysis_data: {
            ...baseAnalysisData,
            eligibility_flags: eligibilityFlags,
            evaluations: savedEvaluations,
            token_usage: usageTotals,
            instrument_code: instrument.code,
            retry_after_seconds: retry.seconds,
            retry_after_at: retry.retryAt,
            active_step_started_at: null,
            progress_message: message,
          },
        })
        .eq("id", evaluationId);
      return { evaluationId, status: "failed", error: message };
    }
    throw error;
  }

  const parsedEvaluation = {
    persona: evaluator,
    data: (() => {
      try {
        return extractJson(result.text);
      } catch (error) {
        return { error: error instanceof Error ? error.message : "parse error", raw: result.text };
      }
    })(),
  };

  const nextEvaluations = [...savedEvaluations, parsedEvaluation];
  const nextUsageTotals = {
    evaluator_input_tokens: usageTotals.evaluator_input_tokens + Number(result.usage?.input_tokens || 0),
    evaluator_output_tokens: usageTotals.evaluator_output_tokens + Number(result.usage?.output_tokens || 0),
    evaluator_cached_tokens: usageTotals.evaluator_cached_tokens + Number(result.usage?.cache_read_input_tokens || 0),
    evaluator_cache_write_tokens:
      usageTotals.evaluator_cache_write_tokens + Number(result.usage?.cache_creation_input_tokens || 0),
  };

  if (nextEvaluations.length < selectedEvaluators.length) {
    await serviceClient
      .from("proposal_analyses")
      .update({
        status: "running",
        error_message: null,
        analysis_data: {
          ...baseAnalysisData,
          eligibility_flags: eligibilityFlags,
          evaluations: nextEvaluations,
          token_usage: nextUsageTotals,
          instrument_code: instrument.code,
          active_step_started_at: null,
          progress_message: `Completed evaluator ${nextEvaluations.length} of ${selectedEvaluators.length}`,
        },
      })
      .eq("id", evaluationId);

    return {
      evaluationId,
      status: "running",
      completedEvaluators: nextEvaluations.length,
      totalEvaluators: selectedEvaluators.length,
    };
  }

  return finalizeEvaluatorPhase(nextEvaluations, nextUsageTotals);
}

async function runSynthesisPhase(serviceClient: any, evaluationId: string) {
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

  const evaluation = await getEvaluationRecord(serviceClient, evaluationId);
  const analysisData = evaluation.analysis_data || {};
  const synthesisContext = analysisData.synthesis_context || {};
  const parsedEvaluations = Array.isArray(analysisData.evaluations) ? analysisData.evaluations : [];

  if (parsedEvaluations.length === 0) {
    throw new Error("No evaluator reports available for synthesis");
  }

  const [proposalRes, instrumentRes, criteriaRes, configRes] = await Promise.all([
    serviceClient.from("proposals").select("title, acronym, work_programme, topic_id, evaluation_criteria_notes").eq("id", evaluation.proposal_id).single(),
    evaluation.instrument_id
      ? serviceClient.from("instrument_types").select("*").eq("id", evaluation.instrument_id).single()
      : serviceClient.from("instrument_types").select("*").eq("code", synthesisContext.instrument_code).single(),
    serviceClient.from("evaluation_criteria").select("*").order("criterion_order"),
    serviceClient.from("ai_platform_config").select("key, value"),
  ]);

  const proposal = proposalRes.data;
  const instrument = instrumentRes.data;
  if (!proposal || !instrument) {
    throw new Error("Proposal or instrument not found for synthesis");
  }

  const configMap = Object.fromEntries((configRes.data || []).map((row: any) => [row.key, row.value]));
  const stageKey = synthesisContext.stage_key === "stage1" ? "stage1" : "full";
  const budgetType = synthesisContext.budget_type || null;
  const budgetTypeLabel = synthesisContext.budget_type_label || (budgetType === "lump_sum" ? "Lump sum" : "Actual cost");
  const impactWeighting = Number(synthesisContext.impact_weighting || instrument.impact_weighting || 1.0);
  const excellenceMean = Number(synthesisContext.excellence_mean || 0);
  const impactMean = Number(synthesisContext.impact_mean || 0);
  const implementationMean =
    synthesisContext.implementation_mean === null || synthesisContext.implementation_mean === undefined
      ? null
      : Number(synthesisContext.implementation_mean);
  const impactWeighted = Number(synthesisContext.impact_weighted || 0);
  const totalUnweighted = Number(synthesisContext.total_unweighted || 0);
  const totalWeighted = Number(synthesisContext.total_weighted || 0);
  const impactWeighting = Number(synthesisContext.impact_weighting || instrument.impact_weighting || 1.0);
  const maxPoints = stageKey === "stage1" ? 10 : 5 + 5 * impactWeighting + 5;
  const overallThreshold =
    stageKey === "stage1"
      ? instrument.overall_threshold_stage1
      : instrument.overall_threshold_full;
  const totalThreshold =
    overallThreshold !== null && overallThreshold !== undefined ? Number(overallThreshold) : null;
  const totalThresholdSuffix =
    totalThreshold !== null ? ` (threshold: ${totalThreshold} / ${maxPoints})` : "";

  const evaluationModel = synthesisContext.evaluation_model || configMap.evaluation_model || "claude-opus-4-5-20250929";
  const opusInPrice = parseFloat(configMap.opus_price_input_per_mtok || "15.00");
  const opusOutPrice = parseFloat(configMap.opus_price_output_per_mtok || "75.00");
  const cacheReadMul = parseFloat(configMap.cache_read_multiplier || "0.10");
  const cacheWriteMul = parseFloat(configMap.cache_write_multiplier || "1.25");
  const usdEurRate = parseFloat(configMap.usd_eur_rate || "0.92");

  const topicSpecificContext = (proposal.evaluation_criteria_notes || "").trim()
    ? `\n\nTOPIC-SPECIFIC CONTEXT FROM THE PROPOSAL TEAM:\n${proposal.evaluation_criteria_notes}`
    : "";

  const eligibilityFlags = Array.isArray(analysisData.eligibility_flags) ? analysisData.eligibility_flags : [];
  const eligibilityBlock = eligibilityFlags.length
    ? eligibilityFlags
        .map((f: any) => `- [${String(f.status || "").toUpperCase()}] ${f.check}: ${f.note}`)
        .join("\n")
    : "(no eligibility flags recorded)";

  const synthesisSystem = `You are the Panel Rapporteur for a Horizon Europe expert evaluation panel.
Synthesise ${parsedEvaluations.length} independent evaluator reports into a single Evaluation Summary Report (ESR)
in the style of the official EC evaluation form.

OUTPUT STRUCTURE — produce EXACTLY these top-level sections, in this order, and NOTHING else:

1. "# European Commission initial check" — narrative summary of the eligibility flags provided below, in 2–4 sentences. ${stageKey === "stage1" ? "Note Stage 1 blind evaluation status and explicitly flag any identifying information found in the eligibility flags." : ""} Do NOT list scores here.
2. "# 1. Excellence" — start with a line "**Score:** ${excellenceMean} / 5${thresholds.excellence !== null && thresholds.excellence !== undefined ? ` (threshold: ${thresholds.excellence} / 5)` : ""}", blank line, then narrative feedback (strengths followed by at least two specific weaknesses).
3. "# 2. Impact" — start with a line "**Score:** ${impactMean} / 5${thresholds.impact !== null && thresholds.impact !== undefined ? ` (threshold: ${thresholds.impact} / 5)` : ""}${impactWeighting !== 1 ? ` — weighted ${impactWeighted} / ${(5 * impactWeighting).toFixed(1)}` : ""}", blank line, then narrative feedback (strengths followed by at least two specific weaknesses).${impactWeighting !== 1 ? ` For this IA proposal, note that Impact is weighted ×${impactWeighting}.` : ""}
${stageKey === "full" ? `4. "# 3. Implementation" — start with a line "**Score:** ${implementationMean} / 5${thresholds.implementation !== null && thresholds.implementation !== undefined ? ` (threshold: ${thresholds.implementation} / 5)` : ""}", blank line, then narrative feedback (strengths followed by at least two specific weaknesses).${budgetType === "lump_sum" ? " Include specific lump-sum budget commentary." : ""}` : ""}

After the LAST major criterion section above (and before "Overall panel assessment"), include a new top-level section with the heading "# Total score" followed by a blank line and then a single line: "**Total score:** ${totalUnweighted} / ${stageKey === "full" ? 15 : 10}${totalThresholdSuffix}${impactWeighting !== 1 ? ` (weighted: ${totalWeighted} / ${(stageKey === "full" ? 5 + 5 * impactWeighting + 5 : 5 + 5 * impactWeighting).toFixed(1)})` : ""}".

End with a single "## Overall panel assessment" subsection (placed under the LAST major section above, after the Total score line) — a coherent 3–4 sentence paragraph capturing the panel's collective view, the most critical issue, and an honest assessment of competitiveness for this call.

DO NOT include any of the following: panel composition section, scores summary table, individual evaluator scores table, "Section 1" preamble, or any other top-level headings.

SYNTHESIS RULES:
- Consensus scores are already computed and provided above. Use them verbatim — do not recalculate.
- Synthesise evaluator comments into coherent, substantive feedback. Do not list or average text.
- Strengths and weaknesses must be specific. Generic statements are not acceptable.
- Tone: direct, professional — matching official EC ESR style. Avoid hedging language.
- Flag minority opinion inline for any criterion where any evaluator scored more than 1.0 away from the mean.
- Do not inflate scores or soften criticism. The ESR must reflect the honest consensus of the panel.${topicSpecificContext}`;

  const synthesisUser = `PROPOSAL: ${proposal.title} (${proposal.acronym})
CALL: ${proposal.work_programme || "n/a"} | TOPIC: ${proposal.topic_id || "n/a"}
INSTRUMENT: ${instrument.name} | STAGE: ${stageKey === "stage1" ? "Stage 1 of 2" : "Full proposal"}
BUDGET TYPE: ${budgetTypeLabel}
DATE: ${new Date().toISOString().slice(0, 10)}

ELIGIBILITY FLAGS (for the European Commission initial check section):
${eligibilityBlock}

EVALUATOR REPORTS:
${parsedEvaluations
  .map(
    (evaluationItem: any, index: number) => `
=== Evaluator ${index + 1}: ${evaluationItem.persona.name} ===
Excellence: ${evaluationItem.data.excellence_score}/5 — ${evaluationItem.data.excellence_comments}
Impact: ${evaluationItem.data.impact_score}/5 — ${evaluationItem.data.impact_comments}
${evaluationItem.data.implementation_score !== undefined ? `Implementation: ${evaluationItem.data.implementation_score}/5 — ${evaluationItem.data.implementation_comments}` : ""}
Key strength: ${evaluationItem.data.key_strength}
Key concern: ${evaluationItem.data.key_concern}
Overall: ${evaluationItem.data.overall_comments}
`,
  )
  .join("\n")}

Produce the full ESR markdown using the four-section structure defined in your system message. No other top-level headings.`;

  await serviceClient
    .from("proposal_analyses")
    .update({
      status: "synthesizing",
      error_message: null,
      analysis_data: {
        ...analysisData,
        active_step_started_at: new Date().toISOString(),
        progress_message: "Synthesizing evaluation summary report",
      },
    })
    .eq("id", evaluationId);

  let esrMarkdown = "";
  let synthesisUsage: any = {};
  try {
    console.log(`Running ESR synthesis for ${evaluationId}...`);
    const synthesisResult = await callAnthropicWithCache(
      ANTHROPIC_API_KEY,
      evaluationModel,
      [{ type: "text", text: synthesisSystem }],
      synthesisUser,
      SYNTHESIS_MAX_TOKENS,
      false,
      2,
    );
    esrMarkdown = synthesisResult.text;
    synthesisUsage = synthesisResult.usage;
  } catch (error) {
    console.error("Synthesis failed; falling back to deterministic ESR:", error);
    const fallbackEligibility = eligibilityFlags.length
      ? eligibilityFlags.map((f: any) => `- ${f.check}: ${f.note}`).join("\n")
      : "No eligibility issues recorded.";
    esrMarkdown = [
      `# European Commission initial check`,
      ``,
      fallbackEligibility,
      ``,
      `# 1. Excellence`,
      ``,
      `**Score:** ${excellenceMean} / 5`,
      ``,
      `Synthesis unavailable — see individual evaluator comments below.`,
      ``,
      `# 2. Impact`,
      ``,
      `**Score:** ${impactMean} / 5${impactWeighting !== 1 ? ` — weighted ${impactWeighted} / ${(5 * impactWeighting).toFixed(1)}` : ""}`,
      ``,
      `Synthesis unavailable — see individual evaluator comments below.`,
      ``,
      ...(stageKey === "full"
        ? [
            `# 3. Implementation`,
            ``,
            `**Score:** ${implementationMean} / 5`,
            ``,
            `Synthesis unavailable — see individual evaluator comments below.`,
            ``,
          ]
        : []),
      `# Total score`,
      ``,
      `**Total score:** ${totalUnweighted} / ${stageKey === "full" ? 15 : 10}${totalThresholdSuffix}${impactWeighting !== 1 ? ` (weighted: ${totalWeighted} / ${(stageKey === "full" ? 5 + 5 * impactWeighting + 5 : 5 + 5 * impactWeighting).toFixed(1)})` : ""}`,
      ``,
      `## Overall panel assessment`,
      ``,
      `Automatic synthesis failed for this evaluation.`,
    ].join("\n");
  }

  const evaluatorUsage = analysisData.token_usage || synthesisContext.token_usage || {};
  const totalInputTokens =
    Number(evaluatorUsage.evaluator_input_tokens || 0) + Number(synthesisUsage?.input_tokens || 0);
  const totalOutputTokens =
    Number(evaluatorUsage.evaluator_output_tokens || 0) + Number(synthesisUsage?.output_tokens || 0);
  const totalCachedTokens =
    Number(evaluatorUsage.evaluator_cached_tokens || 0) + Number(synthesisUsage?.cache_read_input_tokens || 0);
  const totalCacheWriteTokens =
    Number(evaluatorUsage.evaluator_cache_write_tokens || 0) +
    Number(synthesisUsage?.cache_creation_input_tokens || 0);

  const effectiveInput =
    totalInputTokens + totalCachedTokens * cacheReadMul + totalCacheWriteTokens * cacheWriteMul;
  const costUsd =
    (effectiveInput * opusInPrice) / 1_000_000 + (totalOutputTokens * opusOutPrice) / 1_000_000;
  const costEur = costUsd * usdEurRate;

  const costBreakdown = {
    model: evaluationModel,
    input_tokens: totalInputTokens,
    output_tokens: totalOutputTokens,
    cache_read_tokens: totalCachedTokens,
    cache_write_tokens: totalCacheWriteTokens,
    price_in_per_mtok_usd: opusInPrice,
    price_out_per_mtok_usd: opusOutPrice,
    cache_read_multiplier: cacheReadMul,
    cache_write_multiplier: cacheWriteMul,
    usd_eur_rate: usdEurRate,
    cost_usd: costUsd,
    cost_eur: costEur,
  };

  await serviceClient
    .from("proposal_analyses")
    .update({
      status: "complete",
      error_message: null,
      model_used: evaluationModel,
      tokens_input: totalInputTokens,
      tokens_output: totalOutputTokens,
      tokens_cached: totalCachedTokens,
      cost_usd: costUsd,
      cost_eur: costEur,
      analysis_data: {
        ...analysisData,
        esr_markdown: esrMarkdown,
        cost_breakdown: costBreakdown,
        active_step_started_at: null,
        progress_message: "Complete",
      },
    })
    .eq("id", evaluationId);

  await serviceClient.from("evaluation_cost_log").insert({
    evaluation_id: evaluationId,
    instrument_code: instrument.code,
    proposal_stage: stageKey,
    budget_type: budgetType || null,
    cost_usd: costUsd,
    cost_eur: costEur,
  });

  console.log(`Evaluation ${evaluationId} complete.`);
  return { evaluationId, status: "complete" };
}

async function ensureProposalAdmin(supabase: any, userId: string, proposalId: string) {
  const { data: roleCheck } = await supabase.rpc("is_proposal_admin", {
    _user_id: userId,
    _proposal_id: proposalId,
  });
  if (!roleCheck) {
    throw new Response(JSON.stringify({ error: "Insufficient permissions" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();
    const action = body?.action || "start";

    if (action === "start") {
      const { proposalId, selectedEvaluators, instrumentCode, proposalStage, budgetType, eligibilityFlags } = body || {};
      if (
        !proposalId ||
        !Array.isArray(selectedEvaluators) ||
        selectedEvaluators.length < 3 ||
        selectedEvaluators.length > 10 ||
        !instrumentCode ||
        !proposalStage
      ) {
        return new Response(
          JSON.stringify({ error: "Invalid input: need 3–10 evaluators and instrument/stage info" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      await ensureProposalAdmin(supabase, userId, proposalId);

      const { data: instrument } = await serviceClient
        .from("instrument_types")
        .select("id")
        .eq("code", instrumentCode)
        .maybeSingle();

      const { data: evalRecord, error: insertError } = await serviceClient
        .from("proposal_analyses")
        .insert({
          proposal_id: proposalId,
          created_by: userId,
          status: "queued",
          instrument_id: instrument?.id ?? null,
          proposal_stage: proposalStage,
          budget_type_used: budgetType,
          evaluators_selected: selectedEvaluators,
          eligibility_flags: eligibilityFlags ?? [],
          analysis_data: {
            eligibility_flags: eligibilityFlags ?? [],
            instrument_code: instrumentCode,
            progress_message: "Queued for evaluator run",
          },
        })
        .select("id")
        .single();

      if (insertError || !evalRecord) {
        console.error("Failed to create evaluation record:", insertError);
        return new Response(JSON.stringify({ error: "Failed to create evaluation record" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ evaluationId: evalRecord.id, status: "queued" }), {
        status: 202,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

  if (action === "evaluate") {
      const evaluationId = body?.evaluationId;
      if (!evaluationId) {
        return new Response(JSON.stringify({ error: "evaluationId is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const evaluation = await getEvaluationRecord(serviceClient, evaluationId);
      await ensureProposalAdmin(supabase, userId, evaluation.proposal_id);
      const result = await runEvaluatorPhase(serviceClient, evaluationId);

      return new Response(JSON.stringify(result), {
        status: result.status === "failed" ? 429 : 202,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "synthesis") {
      const evaluationId = body?.evaluationId;
      if (!evaluationId) {
        return new Response(JSON.stringify({ error: "evaluationId is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const evaluation = await getEvaluationRecord(serviceClient, evaluationId);
      await ensureProposalAdmin(supabase, userId, evaluation.proposal_id);
      const result = await runSynthesisPhase(serviceClient, evaluationId);

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unsupported action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("run-panel-evaluation error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
