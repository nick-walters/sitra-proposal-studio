// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void };

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
    const m = cleaned.match(/[\[{][\s\S]*[\]}]/);
    if (m) return JSON.parse(m[0]);
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
          .filter((b: any) => b.type === "text")
          .map((b: any) => b.text)
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

interface BackgroundParams {
  proposalId: string;
  selectedEvaluators: Array<{ name: string; brief: string }>;
  instrumentCode: string;
  proposalStage: string;
  budgetType: string | null;
  userId: string;
}

async function runEvaluationBackground(evaluationId: string, params: BackgroundParams) {
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { proposalId, selectedEvaluators, instrumentCode, proposalStage, budgetType, userId } = params;

    const [
      proposalRes,
      sectionsRes,
      participantsRes,
      wpDraftsRes,
      delivRes,
      milestonesRes,
      risksRes,
      budgetRes,
      instrumentRes,
      criteriaRes,
      configRes,
    ] = await Promise.all([
      serviceClient.from("proposals").select("*").eq("id", proposalId).single(),
      serviceClient.from("section_content").select("section_id, content").eq("proposal_id", proposalId),
      serviceClient
        .from("participants")
        .select("id, organisation_short_name, organisation_name, participant_number, country, organisation_category, is_sme")
        .eq("proposal_id", proposalId),
      serviceClient
        .from("wp_drafts")
        .select("id, number, short_name, title, lead_participant_id, methodology, objectives")
        .eq("proposal_id", proposalId)
        .order("number"),
      serviceClient
        .from("b31_deliverables")
        .select("number, name, description, due_month, type, dissemination_level")
        .eq("proposal_id", proposalId),
      serviceClient
        .from("b31_milestones")
        .select("number, name, due_month, means_of_verification, wps")
        .eq("proposal_id", proposalId),
      serviceClient
        .from("b31_risks")
        .select("number, description, mitigation, likelihood, severity, wps")
        .eq("proposal_id", proposalId),
      serviceClient
        .from("budget_rows")
        .select("participant_id, personnel_costs, subcontracting_costs, purchase_equipment, purchase_other_goods, purchase_travel, requested_eu_contribution")
        .eq("proposal_id", proposalId),
      serviceClient.from("instrument_types").select("*").eq("code", instrumentCode).maybeSingle(),
      serviceClient.from("evaluation_criteria").select("*").order("criterion_order"),
      serviceClient.from("ai_platform_config").select("key, value"),
    ]);

    const proposal = proposalRes.data;
    const sections = sectionsRes.data || [];
    const participants = participantsRes.data || [];
    const wpDrafts = wpDraftsRes.data || [];
    const deliverables = delivRes.data || [];
    const milestones = milestonesRes.data || [];
    const risks = risksRes.data || [];
    const budget = budgetRes.data || [];
    const instrument = instrumentRes.data;
    const allCriteria = criteriaRes.data || [];
    const configMap = Object.fromEntries((configRes.data || []).map((r: any) => [r.key, r.value]));

    if (!proposal || !instrument) {
      throw new Error("Proposal or instrument not found");
    }

    const evaluationModel = configMap.evaluation_model || "claude-opus-4-5-20250929";
    const opusInPrice = parseFloat(configMap.opus_price_input_per_mtok || "5.00");
    const opusOutPrice = parseFloat(configMap.opus_price_output_per_mtok || "25.00");
    const cacheReadMul = parseFloat(configMap.cache_read_multiplier || "0.10");
    const usdEurRate = parseFloat(configMap.usd_eur_rate || "0.92");

    const stageKey = proposalStage === "stage1" ? "stage1" : "full";
    const criteriaForRun = allCriteria.filter(
      (c: any) =>
        c.instrument_id === instrument.id &&
        Array.isArray(c.applicable_stages) &&
        c.applicable_stages.includes(stageKey),
    );

    // ---- Page count using platform formula (500 words/page + 1 front-matter page) ----
    const WORDS_PER_PAGE = 500;
    const FRONT_MATTER_PAGES = 1;
    const allText = sections.map((s: any) => stripHtml(s.content)).join(" ");
    const totalWords = allText.split(/\s+/).filter((w: string) => w.length > 0).length;
    const estimatedPages = Math.ceil(totalWords / WORDS_PER_PAGE) + FRONT_MATTER_PAGES;

    const partA = `PROPOSAL TITLE: ${proposal.title}
ACRONYM: ${proposal.acronym}
INSTRUMENT: ${instrument.name}
DURATION: ${proposal.duration ?? "?"} months
TOPIC: ${proposal.topic_id || "?"}
WORK PROGRAMME: ${proposal.work_programme || "?"}
ESTIMATED PAGES: ${estimatedPages} (~${totalWords} words at 500 words/page + 1 front-matter)

PARTICIPANTS:
${participants.map((p: any) => `- #${p.participant_number} ${p.organisation_short_name || p.organisation_name} (${p.country}, ${p.organisation_category || "?"}${p.is_sme ? ", SME" : ""})`).join("\n")}

WORK PACKAGES:
${wpDrafts.map((w: any) => `WP${w.number} ${w.short_name || ""} ${w.title || ""}\nObjectives: ${stripHtml(w.objectives).slice(0, 600)}\nMethodology: ${stripHtml(w.methodology).slice(0, 800)}`).join("\n\n")}

DELIVERABLES:
${deliverables.map((d: any) => `- D${d.number} ${d.name} (M${d.due_month}, ${d.type || "?"}, ${d.dissemination_level || "?"})`).join("\n")}

MILESTONES:
${milestones.map((m: any) => `- MS${m.number} ${m.name} (M${m.due_month}, WPs: ${m.wps})`).join("\n")}

RISKS:
${risks.map((r: any) => `- R${r.number} ${stripHtml(r.description)} | Mitigation: ${stripHtml(r.mitigation)} | L:${r.likelihood} S:${r.severity}`).join("\n")}

BUDGET (sum requested EU contribution): €${budget.reduce((s: number, r: any) => s + Number(r.requested_eu_contribution || 0), 0).toLocaleString()}
`;

    const partB = sections
      .map((s: any) => `### ${s.section_id}\n${stripHtml(s.content)}`)
      .join("\n\n");

    const proposalContentBlock = `=== PART A: ADMINISTRATIVE ===\n${partA}\n\n=== PART B: TECHNICAL ===\n${partB}`;

    const criteriaText = criteriaForRun
      .map((c: any) => {
        const threshold = stageKey === "stage1" ? c.threshold_stage1 : c.threshold_full;
        return `## ${c.criterion_name} (threshold ${threshold}/5)
SUB-CRITERIA:
${c.sub_criteria}

SCORING DESCRIPTORS:
${c.scoring_descriptors}`;
      })
      .join("\n\n");

    const instrumentContext =
      instrumentCode === "ria"
        ? "Research and Innovation Actions primarily fund fundamental and applied research. The emphasis is on generating new knowledge, with innovation and commercial exploitation as longer-term downstream goals. Excellence and methodological rigour are particularly important."
        : instrumentCode === "ia"
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

    const budgetTypeLabel =
      budgetType === "lump_sum" ? "Lump sum" : budgetType === "traditional" ? "Actual cost" : "n/a";

    const specialExceptions = instrument.special_exceptions?.trim()
      ? `\n\nSPECIAL EVALUATION RULES FOR THIS INSTRUMENT:\n${instrument.special_exceptions}`
      : "";

    const evaluationCriteriaNotes = (proposal.evaluation_criteria_notes || "").trim();
    const topicSpecificContext = evaluationCriteriaNotes
      ? `\n\nTOPIC-SPECIFIC CONTEXT FROM THE PROPOSAL TEAM:\n${evaluationCriteriaNotes}`
      : "";

    // ---- Evaluator agents ----
    const evaluatorTaskFactories = selectedEvaluators.map((ev) => {
      const personaName = ev.name;
      const personaBrief = ev.brief;

      const fullProposalOutputBlock =
        stageKey === "stage1"
          ? `{
  "excellence_comments": "150–300 words — specific, referenced, with at least two distinct weaknesses identified",
  "excellence_score": number (0–5 in 0.5 steps),
  "impact_comments": "150–300 words — specific, referenced, with at least two distinct weaknesses identified",
  "impact_score": number (0–5 in 0.5 steps),
  "overall_comments": "50–100 words",
  "key_strength": "one sentence",
  "key_concern": "one sentence"
}`
          : `{
  "excellence_comments": "150–300 words",
  "excellence_score": number,
  "impact_comments": "150–300 words",
  "impact_score": number,
  "implementation_comments": "150–300 words",
  "implementation_score": number,
  "overall_comments": "50–100 words",
  "key_strength": "one sentence",
  "key_concern": "one sentence"
}`;

      const evaluatorSystem = `You are ${personaName}. ${personaBrief}.

You have been invited by the European Commission to serve as an independent expert evaluator on a Horizon Europe proposal evaluation panel. Evaluate this proposal strictly and honestly from your professional perspective.

---

PROGRAMME CONTEXT

Horizon Europe is the European Union's primary research and innovation funding programme (2021–2027, ~€95.5 billion total budget). Pillar II — Global Challenges and European Industrial Competitiveness — funds collaborative, transnational research and innovation projects addressing major societal challenges.

INSTRUMENT TYPE: ${instrument.name}

${instrumentContext}

PROPOSAL STAGE: ${stageKey === "stage1" ? "Stage 1 of 2" : "Full proposal"}

${stageContext}

BUDGET TYPE: ${budgetTypeLabel}${budgetContext}

---

EVALUATION RULES

- Evaluate the proposal as submitted. Do not consider its potential if changes were made.
- Do not recommend changes. Shortcomings must be reflected in lower scores, not suggestions.
- Evaluate based solely on the content of the submitted document.
- Be specific. Reference actual content, section headings, specific claims, or gaps.
- Apply your genuine professional critical lens.

SCORING SCALE (0–5 in 0.5 increments):
0 = Fails to address criterion or cannot be assessed
1 = Poor — inadequately addressed or serious weaknesses
2 = Fair — broadly addresses criterion but significant weaknesses
3 = Good — addresses criterion well but a number of shortcomings present
4 = Very Good — small number of shortcomings present
5 = Excellent — any shortcomings are minor

SCORING CALIBRATION — READ CAREFULLY:
Most competitive Horizon Europe proposals score 3.0–4.0. A score of 5 is rare. Do not award 4.5 or 5 unless you can clearly articulate why the proposal has no more than very minor shortcomings.

NON-SYCOPHANCY RULES — MANDATORY:
- Identify at least two specific weaknesses per criterion, even for high-scoring proposals.
- State weaknesses directly without hedging.
- Do not repeat the same weakness across criteria.
- Generic praise without specific reference is not acceptable.${specialExceptions}${topicSpecificContext}

---

EVALUATION CRITERIA:
${criteriaText}

---

OUTPUT — respond with a JSON object only, no preamble:
${fullProposalOutputBlock}`;

      const systemBlocks: any = [
        { type: "text", text: evaluatorSystem },
        {
          type: "text",
          text: `--- PROPOSAL CONTENT ---\n${proposalContentBlock}`,
          cache_control: { type: "ephemeral" },
        },
      ];

      return () =>
        callAnthropicWithCache(
          ANTHROPIC_API_KEY,
          evaluationModel,
          systemBlocks,
          "Evaluate the proposal above according to your instructions. Respond with the JSON object only.",
          16000,
          true,
        ).then((r) => ({ persona: ev, raw: r.text, usage: r.usage }));
    });

    const evaluatorResults: Array<{ persona: { name: string; brief: string }; raw: string; usage: any }> = [];
    if (evaluatorTaskFactories.length > 0) {
      console.log(`Priming Anthropic prompt cache with first evaluator (1/${evaluatorTaskFactories.length})...`);
      evaluatorResults.push(await evaluatorTaskFactories[0]());
    }
    if (evaluatorTaskFactories.length > 1) {
      console.log(`Running remaining ${evaluatorTaskFactories.length - 1} evaluators with concurrency=2...`);
      const rest = await runWithConcurrency(evaluatorTaskFactories.slice(1), 2, (task) => task());
      evaluatorResults.push(...rest);
    }

    const parsedEvaluations = evaluatorResults.map((er) => ({
      persona: er.persona,
      usage: er.usage,
      data: (() => {
        try {
          return extractJson(er.raw);
        } catch (e) {
          return { error: e instanceof Error ? e.message : "parse error", raw: er.raw };
        }
      })(),
    }));

    const validEvals = parsedEvaluations.filter((e) => !e.data.error);
    const round05 = (n: number) => Math.round(n * 2) / 2;
    const mean = (arr: number[]) => arr.reduce((s, x) => s + x, 0) / Math.max(arr.length, 1);

    const excellenceScores = validEvals.map((e) => Number(e.data.excellence_score)).filter((n) => !Number.isNaN(n));
    const impactScores = validEvals.map((e) => Number(e.data.impact_score)).filter((n) => !Number.isNaN(n));
    const implScores =
      stageKey === "full"
        ? validEvals.map((e) => Number(e.data.implementation_score)).filter((n) => !Number.isNaN(n))
        : [];

    const excellenceMean = round05(mean(excellenceScores));
    const impactMean = round05(mean(impactScores));
    const implMean = stageKey === "full" ? round05(mean(implScores)) : null;

    const impactWeighting = Number(instrument.impact_weighting || 1.0);
    const impactWeighted = round05(impactMean * impactWeighting * 2) / 2;

    const totalUnweighted =
      stageKey === "full" ? excellenceMean + impactMean + (implMean || 0) : excellenceMean + impactMean;
    const totalWeighted =
      stageKey === "full"
        ? excellenceMean + impactWeighted + (implMean || 0)
        : excellenceMean + impactWeighted;

    const findThreshold = (criterionName: string) => {
      const c = criteriaForRun.find((it: any) =>
        String(it.criterion_name || "").toLowerCase().includes(criterionName.toLowerCase()),
      );
      if (!c) return null;
      return stageKey === "stage1" ? c.threshold_stage1 : c.threshold_full;
    };
    const excellenceThreshold = findThreshold("excellence");
    const impactThreshold = findThreshold("impact");
    const implThreshold = findThreshold("implementation");

    // ---- Opus synthesis (no full proposal content; ~2-4k tokens) ----
    const synthesisSystem = `You are the Panel Rapporteur for a Horizon Europe expert evaluation panel.
Synthesise ${parsedEvaluations.length} independent evaluator reports into a single Evaluation Summary Report (ESR)
in the style of the official EC evaluation form.

SYNTHESIS RULES:
- Consensus scores are already computed and provided below. Use them verbatim — do not recalculate.
- Synthesise evaluator comments into coherent, substantive feedback. Do not list or average text.
- Strengths and weaknesses must be specific. Generic statements are not acceptable.
- Identify at least two specific weaknesses per criterion, even for high-scoring proposals.
- Tone: direct, professional — matching official EC ESR style. Avoid hedging language.
- Flag minority opinion for any criterion where any evaluator scored more than 1.0 away from the mean.
- For IA proposals, note that Impact is weighted ×${impactWeighting}.
- For lump sum proposals, include specific budget commentary under Implementation.
- For Stage 1, note blind evaluation status and flag any identifying information found.
- The overall assessment must be a coherent 3–4 sentence paragraph capturing the panel's collective view,
  the most critical issue, and an honest assessment of competitiveness for this call.
- Do not inflate scores or soften criticism. The ESR must reflect the honest consensus of the panel.${topicSpecificContext}

CONSENSUS SCORES (use verbatim):
Excellence: ${excellenceMean}/5${excellenceThreshold !== null ? ` (threshold: ${excellenceThreshold}/5)` : ""}
Impact (raw): ${impactMean}/5${impactThreshold !== null ? ` (threshold: ${impactThreshold}/5)` : ""}${impactWeighting !== 1 ? ` | weighted: ${impactWeighted}/${(5 * impactWeighting).toFixed(1)}` : ""}
${stageKey === "full" ? `Implementation: ${implMean}/5${implThreshold !== null ? ` (threshold: ${implThreshold}/5)` : ""}` : ""}
Total unweighted: ${totalUnweighted}/${stageKey === "full" ? 15 : 10}
${impactWeighting !== 1 ? `Total weighted: ${totalWeighted}/${stageKey === "full" ? (5 + 5 * impactWeighting + 5).toFixed(1) : (5 + 5 * impactWeighting).toFixed(1)}` : ""}`;

    const synthesisUser = `PROPOSAL: ${proposal.title} (${proposal.acronym})
CALL: ${proposal.work_programme || "n/a"} | TOPIC: ${proposal.topic_id || "n/a"}
INSTRUMENT: ${instrument.name} | STAGE: ${stageKey === "stage1" ? "Stage 1 of 2" : "Full proposal"}
BUDGET TYPE: ${budgetTypeLabel}
DATE: ${new Date().toISOString().slice(0, 10)}

EVALUATOR REPORTS:
${parsedEvaluations.map((e, i) => `
=== Evaluator ${i + 1}: ${e.persona.name} ===
Excellence: ${e.data.excellence_score}/5 — ${e.data.excellence_comments}
Impact: ${e.data.impact_score}/5 — ${e.data.impact_comments}
${e.data.implementation_score !== undefined ? `Implementation: ${e.data.implementation_score}/5 — ${e.data.implementation_comments}` : ""}
Key strength: ${e.data.key_strength}
Key concern: ${e.data.key_concern}
Overall: ${e.data.overall_comments}
`).join("\n")}

Produce the full ESR markdown document using the consensus scores from your system message verbatim.
Follow the official EC ESR format with sections for: panel composition, criterion-by-criterion
evaluation (Excellence, Impact${stageKey === "full" ? ", Implementation" : ""}), scores summary,
overall panel assessment, and individual evaluator scores table.`;

    let esrMarkdown = "";
    let synthesisUsage: any = {};
    try {
      console.log("Running Opus synthesis...");
      const synthesisRes = await callAnthropicWithCache(
        ANTHROPIC_API_KEY,
        evaluationModel,
        [{ type: "text", text: synthesisSystem }],
        synthesisUser,
        8000,
        false,
        4,
      );
      esrMarkdown = synthesisRes.text;
      synthesisUsage = synthesisRes.usage;
    } catch (synthErr) {
      console.error("Synthesis failed; falling back to deterministic ESR:", synthErr);
      esrMarkdown = `## Evaluation Summary Report (deterministic fallback)\n\n**Proposal:** ${proposal.acronym} — ${proposal.title}\n**Date:** ${new Date().toISOString().slice(0, 10)}\n\n### Consensus scores\n- Excellence: ${excellenceMean}/5\n- Impact: ${impactMean}/5${stageKey === "full" ? `\n- Implementation: ${implMean}/5` : ""}\n- Total: ${totalUnweighted}/${stageKey === "full" ? 15 : 10}\n\n### Evaluator reports\n${parsedEvaluations.map((e, i) => `**${i + 1}. ${e.persona.name}** — Excellence ${e.data.excellence_score}, Impact ${e.data.impact_score}${e.data.implementation_score !== undefined ? `, Implementation ${e.data.implementation_score}` : ""}\n${e.data.overall_comments || ""}`).join("\n\n")}`;
    }

    // ---- Cost calculation ----
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCachedTokens = 0;
    [...evaluatorResults.map((r: any) => r.usage), synthesisUsage].forEach((u: any) => {
      totalInputTokens += Number(u?.input_tokens || 0);
      totalOutputTokens += Number(u?.output_tokens || 0);
      totalCachedTokens += Number(u?.cache_read_input_tokens || 0);
    });

    const effectiveInput = totalInputTokens + totalCachedTokens * cacheReadMul;
    const costUsd =
      (effectiveInput * opusInPrice) / 1_000_000 + (totalOutputTokens * opusOutPrice) / 1_000_000;
    const costEur = costUsd * usdEurRate;

    await serviceClient
      .from("proposal_analyses")
      .update({
        status: "complete",
        analysis_data: {
          esr_markdown: esrMarkdown,
          evaluations: parsedEvaluations.map((e) => ({ persona: e.persona, data: e.data })),
        },
        overall_score: totalUnweighted,
        excellence_score: excellenceMean,
        impact_score_raw: impactMean,
        impact_score_weighted: impactWeighted,
        implementation_score: implMean,
        total_score_unweighted: totalUnweighted,
        total_score_weighted: totalWeighted,
        model_used: evaluationModel,
        tokens_input: totalInputTokens,
        tokens_output: totalOutputTokens,
        tokens_cached: totalCachedTokens,
        cost_usd: costUsd,
        cost_eur: costEur,
      })
      .eq("id", evaluationId);

    await serviceClient.from("evaluation_cost_log").insert({
      evaluation_id: evaluationId,
      instrument_code: instrumentCode,
      proposal_stage: stageKey,
      budget_type: budgetType || null,
      cost_usd: costUsd,
      cost_eur: costEur,
    });

    console.log(`Background evaluation ${evaluationId} complete.`);
  } catch (error) {
    console.error("Background evaluation failed:", error);
    await serviceClient
      .from("proposal_analyses")
      .update({
        status: "failed",
        error_message: error instanceof Error ? error.message : String(error),
      })
      .eq("id", evaluationId);
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

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY is not configured" }), {
        status: 500,
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

    const body = await req.json();
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

    const { data: roleCheck } = await supabase.rpc("is_proposal_admin", {
      _user_id: userId,
      _proposal_id: proposalId,
    });
    if (!roleCheck) {
      return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

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
        status: "running",
        instrument_id: instrument?.id ?? null,
        proposal_stage: proposalStage,
        budget_type_used: budgetType,
        evaluators_selected: selectedEvaluators,
        analysis_data: { eligibility_flags: eligibilityFlags ?? [] },
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

    const evaluationId = evalRecord.id;

    EdgeRuntime.waitUntil(
      runEvaluationBackground(evaluationId, {
        proposalId,
        selectedEvaluators,
        instrumentCode,
        proposalStage,
        budgetType: budgetType ?? null,
        userId,
      }),
    );

    return new Response(
      JSON.stringify({ evaluationId, status: "running" }),
      { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("run-panel-evaluation error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
