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

async function callAnthropicWithCache(
  apiKey: string,
  model: string,
  systemBlocks: { type: "text"; text: string; cache_control?: { type: "ephemeral" } }[],
  userPrompt: string,
  maxTokens: number,
  enableThinking = false,
): Promise<AnthropicCallResult> {
  const body: any = {
    model,
    max_tokens: maxTokens,
    system: systemBlocks,
    messages: [{ role: "user", content: userPrompt }],
  };
  if (enableThinking) {
    // Newer Anthropic models (e.g. opus-4-7) require adaptive thinking.
    // Use adaptive + output_config.effort, with a generous max_tokens (>= 16000)
    // and budget_tokens that is strictly less than max_tokens.
    body.thinking = { type: "adaptive", budget_tokens: 10000 };
    body.output_config = { effort: "medium" };
  }
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
  if (!res.ok) {
    const errorBody = await res.text();
    console.error(`Anthropic API error ${res.status} (model=${model}, thinking=${enableThinking}, max_tokens=${maxTokens}):`, errorBody);
    // Fallback: if adaptive thinking is rejected, retry once without thinking
    if (enableThinking && res.status === 400 && /thinking/i.test(errorBody)) {
      console.warn("Retrying Anthropic call without extended thinking...");
      const fallbackBody = { ...body };
      delete fallbackBody.thinking;
      delete fallbackBody.output_config;
      const retry = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "prompt-caching-2024-07-31",
          "content-type": "application/json",
        },
        body: JSON.stringify(fallbackBody),
      });
      if (!retry.ok) {
        const retryErr = await retry.text();
        console.error(`Anthropic retry failed ${retry.status}:`, retryErr);
        throw new Error(`Anthropic ${retry.status}: ${retryErr}`);
      }
      const retryData = await retry.json();
      const retryText =
        (retryData?.content || [])
          .filter((b: any) => b.type === "text")
          .map((b: any) => b.text)
          .join("\n") || "";
      return { text: retryText, usage: retryData?.usage || {} };
    }
    throw new Error(`Anthropic ${res.status}: ${errorBody}`);
  }
  const data = await res.json();
  // Extract text from non-thinking blocks
  const text =
    (data?.content || [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n") || "";
  return { text, usage: data?.usage || {} };
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
    const { proposalId, selectedEvaluators, instrumentCode, proposalStage, budgetType } = body || {};
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

    // Service role for writing the result
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Gather everything
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
      instrumentForId,
    ] = await Promise.all([
      supabase.from("proposals").select("*").eq("id", proposalId).single(),
      supabase.from("section_content").select("section_id, content").eq("proposal_id", proposalId),
      supabase
        .from("participants")
        .select("id, organisation_short_name, organisation_name, participant_number, country, organisation_category, is_sme")
        .eq("proposal_id", proposalId),
      supabase
        .from("wp_drafts")
        .select("id, number, short_name, title, lead_participant_id, methodology, objectives")
        .eq("proposal_id", proposalId)
        .order("number"),
      supabase
        .from("b31_deliverables")
        .select("number, name, description, due_month, type, dissemination_level")
        .eq("proposal_id", proposalId),
      supabase
        .from("b31_milestones")
        .select("number, name, due_month, means_of_verification, wps")
        .eq("proposal_id", proposalId),
      supabase
        .from("b31_risks")
        .select("number, description, mitigation, likelihood, severity, wps")
        .eq("proposal_id", proposalId),
      supabase
        .from("budget_rows")
        .select("participant_id, personnel_costs, subcontracting_costs, purchase_equipment, purchase_other_goods, purchase_travel, requested_eu_contribution")
        .eq("proposal_id", proposalId),
      supabase.from("instrument_types").select("*").eq("code", instrumentCode).maybeSingle(),
      supabase.from("evaluation_criteria").select("*").order("criterion_order"),
      supabase.from("ai_platform_config").select("key, value"),
      supabase.from("instrument_types").select("id, impact_weighting, special_exceptions").eq("code", instrumentCode).maybeSingle(),
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
    const instrumentMeta = instrumentForId.data;

    if (!proposal || !instrument || !instrumentMeta) {
      return new Response(JSON.stringify({ error: "Proposal or instrument not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const evaluationModel = configMap.evaluation_model || "claude-opus-4-5-20250929";
    const opusInPrice = parseFloat(configMap.opus_price_input_per_mtok || "5.00");
    const opusOutPrice = parseFloat(configMap.opus_price_output_per_mtok || "25.00");
    const cacheReadMul = parseFloat(configMap.cache_read_multiplier || "0.10");
    const usdEurRate = parseFloat(configMap.usd_eur_rate || "0.92");

    // Filter criteria for instrument + stage
    const stageKey = proposalStage === "stage1" ? "stage1" : "full";
    const criteriaForRun = allCriteria.filter(
      (c: any) =>
        c.instrument_id === instrumentMeta.id &&
        Array.isArray(c.applicable_stages) &&
        c.applicable_stages.includes(stageKey),
    );

    // Build proposal content block (large; cached)
    const partA = `PROPOSAL TITLE: ${proposal.title}
ACRONYM: ${proposal.acronym}
INSTRUMENT: ${instrument.name}
DURATION: ${proposal.duration ?? "?"} months
TOPIC: ${proposal.topic_id || "?"}
WORK PROGRAMME: ${proposal.work_programme || "?"}

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

    // Build criteria text for prompt
    const criteriaText = criteriaForRun
      .map((c: any) => {
        const threshold =
          stageKey === "stage1" ? c.threshold_stage1 : c.threshold_full;
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

    const specialExceptions = instrumentMeta.special_exceptions?.trim()
      ? `\n\nSPECIAL EVALUATION RULES FOR THIS INSTRUMENT:\n${instrumentMeta.special_exceptions}`
      : "";

    const evaluationCriteriaNotes = (proposal.evaluation_criteria_notes || "").trim();
    const topicSpecificContext = evaluationCriteriaNotes
      ? `\n\nTOPIC-SPECIFIC CONTEXT FROM THE PROPOSAL TEAM:\n${evaluationCriteriaNotes}`
      : "";

    // ---- Evaluator agents (parallel) ----
    const evaluatorPromises = (selectedEvaluators as Array<{ name: string; brief: string }>).map(
      (ev) => {
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

Horizon Europe is the European Union's primary research and innovation funding programme (2021–2027, ~€95.5 billion total budget). Pillar II — Global Challenges and European Industrial Competitiveness — funds collaborative, transnational research and innovation projects addressing major societal challenges across six clusters: Health; Culture, Creativity and Inclusive Society; Civil Security for Society; Digital, Industry and Space; Climate, Energy and Mobility; and Food, Bioeconomy, Natural Resources, Agriculture and Environment.

Projects are funded through calls published in Work Programmes. Each call targets a specific topic with a defined scope, expected outcomes, and budget. Proposals that are technically strong but off-topic will be rejected regardless of quality.

INSTRUMENT TYPE: ${instrument.name}

${instrumentContext}

PROPOSAL STAGE: ${stageKey === "stage1" ? "Stage 1 of 2" : "Full proposal"}

${stageContext}

BUDGET TYPE: ${budgetTypeLabel}${budgetContext}

---

EVALUATION RULES

- Evaluate the proposal as submitted. Do not consider its potential if changes were made.
- Do not recommend changes to consortia, budget, or work packages. Shortcomings must be reflected in lower scores, not suggestions.
- Evaluate based solely on the content of the submitted document. Do not factor in the applicant organisation's reputation, past performance, or any information not contained in this proposal.
- Be specific. Reference actual content, section headings, specific claims, or gaps in the proposal when making observations. Vague or generic feedback is not acceptable.
- Apply your genuine professional critical lens. Your perspective as ${personaName} should shape what you scrutinise and what you value.

SCORING SCALE (0–5 in 0.5 increments):
0 = Fails to address criterion or cannot be assessed due to missing or incomplete information
1 = Poor — criterion inadequately addressed or serious inherent weaknesses
2 = Fair — broadly addresses criterion but significant weaknesses present
3 = Good — addresses criterion well but a number of shortcomings present
4 = Very Good — addresses criterion very well but a small number of shortcomings present
5 = Excellent — successfully addresses all relevant aspects; any shortcomings are minor

SCORING CALIBRATION — READ CAREFULLY:
Most competitive Horizon Europe proposals score between 3.0 and 4.0 per criterion. A score of 5 is rare and reserved for proposals that genuinely address all aspects of a criterion with no meaningful shortcomings. A score of 4 indicates a strong proposal with only minor issues clearly identified. A score of 3 indicates a reasonable proposal with identifiable weaknesses that must be described specifically. Scores below 3 indicate significant problems that require detailed explanation.

Do not award scores of 4.5 or 5 unless you can clearly articulate why the proposal has no more than very minor shortcomings for that criterion. Inflated scores without justification are a failure of the evaluation process.

NON-SYCOPHANCY RULES — MANDATORY:
- You must identify at least two specific weaknesses per criterion, even for high-scoring proposals.
- Do not soften weaknesses with hedging language. State weaknesses directly.
- Do not repeat the same weakness across criteria.
- A well-written proposal is not the same as a strong proposal.
- Generic praise without specific reference to the proposal content is not acceptable.${specialExceptions}${topicSpecificContext}

---

EVALUATION CRITERIA:
${criteriaText}

---

OUTPUT — respond with a JSON object only, no preamble, no explanation outside the JSON:
${fullProposalOutputBlock}`;

        const systemBlocks: any = [
          { type: "text", text: evaluatorSystem },
          {
            type: "text",
            text: `--- PROPOSAL CONTENT ---\n${proposalContentBlock}`,
            cache_control: { type: "ephemeral" },
          },
        ];

        return callAnthropicWithCache(
          ANTHROPIC_API_KEY,
          evaluationModel,
          systemBlocks,
          "Evaluate the proposal above according to your instructions. Respond with the JSON object only.",
          16000,
          true,
        ).then((r) => ({ persona: ev, raw: r.text, usage: r.usage }));
      },
    );

    const evaluatorResults = await Promise.all(evaluatorPromises);

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

    // Aggregate scores
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

    const impactWeighting = Number(instrumentMeta.impact_weighting || 1.0);
    const impactWeighted = round05(impactMean * impactWeighting * 2) / 2;

    const totalUnweighted =
      stageKey === "full" ? excellenceMean + impactMean + (implMean || 0) : excellenceMean + impactMean;
    const totalWeighted =
      stageKey === "full"
        ? excellenceMean + impactWeighted + (implMean || 0)
        : excellenceMean + impactWeighted;

    // ---- Synthesis ----
    const evaluatorReportsForSynthesis = parsedEvaluations
      .map(
        (e, i) =>
          `### Evaluator ${i + 1}: ${e.persona.name}\n${JSON.stringify(e.data, null, 2)}`,
      )
      .join("\n\n");

    const panelTable = parsedEvaluations
      .map((e, i) => `| ${i + 1} | ${e.persona.name} | ${e.persona.brief} |`)
      .join("\n");

    const dateStr = new Date().toISOString().slice(0, 10);

    const synthesisSystem = `You are the Panel Rapporteur for a Horizon Europe expert evaluation panel. You have received ${parsedEvaluations.length} independent evaluation reports. Your task is to synthesise these into a single Evaluation Summary Report (ESR) in the style of the official EC evaluation form.

PROGRAMME CONTEXT
Horizon Europe is the EU's primary research and innovation funding programme. Pillar II funds collaborative transnational projects addressing major societal challenges. Proposals are evaluated against three criteria — Excellence, Impact, and Implementation — on a 0–5 scale. The ESR is the formal feedback document provided to applicants and must meet the European Commission's standards for specificity, rigour, and professionalism.

SYNTHESIS RULES:
- Consensus score = mean of all evaluator scores per criterion, rounded to nearest 0.5.
- Flag a minority opinion for any criterion where any evaluator's score differs from the mean by more than 1.0 points.
- For IA proposals, apply ${impactWeighting}× weighting to the consensus Impact score.
- Synthesise comments into coherent, substantive feedback — do not simply average or concatenate evaluator text.
- Strengths and weaknesses must be specific to the proposal content. Generic statements are not acceptable.
- Tone: direct, professional — matching official EC ESR style. Avoid hedging language.
- For lump sum proposals, include specific budget commentary under Implementation.
- For Stage 1, note the blind evaluation status and flag any identifying information found by evaluators.
- The ESR must identify specific weaknesses for every criterion. A criterion with no identified weaknesses will be returned for revision — this is EC policy.
- Do not inflate scores or soften criticism to appear balanced. The ESR must reflect the honest consensus of the panel.

SCORING CALIBRATION:
Most competitive proposals score 3.0–4.0 per criterion. A score of 5 is rare. Ensure the consensus scores accurately reflect the evaluator reports — do not round up generously.${specialExceptions}${topicSpecificContext}

CONSENSUS SCORES YOU MUST USE (already computed):
- Excellence: ${excellenceMean}/5
- Impact (raw): ${impactMean}/5${impactWeighting !== 1 ? ` | weighted: ${impactWeighted}/${5 * impactWeighting}` : ""}
${stageKey === "full" ? `- Implementation: ${implMean}/5` : ""}
- Total unweighted: ${totalUnweighted}
- Total weighted: ${totalWeighted}

OUTPUT: Structured markdown ESR following the exact template provided. Use the consensus scores above verbatim.`;

    const synthesisUser = `## EVALUATION SUMMARY REPORT
*(Simulated — AI-generated for internal development purposes only)*

**Proposal:** ${proposal.acronym} — ${proposal.title}
**Call:** ${proposal.work_programme || "n/a"} | **Topic:** ${proposal.topic_id || "n/a"}
**Instrument:** ${instrument.name} | **Stage:** ${stageKey === "stage1" ? "Stage 1 of 2" : "Full proposal"}
**Budget type:** ${budgetTypeLabel}
**Date:** ${dateStr} | **Model:** ${evaluationModel}

### PANEL COMPOSITION
| # | Evaluator | Specialism |
|---|-----------|------------|
${panelTable}

---

### EVALUATOR REPORTS (synthesise these into the ESR)
${evaluatorReportsForSynthesis}

Now produce the full ESR markdown document following the prescribed template, using the consensus scores already computed in your system message.`;

    const synthesisRes = await callAnthropicWithCache(
      ANTHROPIC_API_KEY,
      evaluationModel,
      [{ type: "text", text: synthesisSystem }],
      synthesisUser,
      8000,
      false,
    );

    const esrMarkdown = synthesisRes.text;

    // ---- Cost calculation ----
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCachedTokens = 0;
    [...evaluatorResults, { usage: synthesisRes.usage }].forEach((r: any) => {
      const u = r.usage || {};
      totalInputTokens += Number(u.input_tokens || 0);
      totalOutputTokens += Number(u.output_tokens || 0);
      totalCachedTokens += Number(u.cache_read_input_tokens || 0);
    });

    // Cost: input tokens at full price; cached at multiplier; output at output price
    const effectiveInput = totalInputTokens + totalCachedTokens * cacheReadMul;
    const costUsd =
      (effectiveInput * opusInPrice) / 1_000_000 + (totalOutputTokens * opusOutPrice) / 1_000_000;
    const costEur = costUsd * usdEurRate;

    // ---- Persist ----
    const { data: inserted, error: insErr } = await serviceClient
      .from("proposal_analyses")
      .insert({
        proposal_id: proposalId,
        analysis_data: {
          esr_markdown: esrMarkdown,
          evaluations: parsedEvaluations.map((e) => ({
            persona: e.persona,
            data: e.data,
          })),
        },
        overall_score: totalUnweighted,
        created_by: userId,
        instrument_id: instrumentMeta.id,
        proposal_stage: stageKey,
        budget_type_used: budgetType || null,
        evaluators_selected: selectedEvaluators,
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
      .select("id")
      .single();

    if (insErr) {
      console.error("Insert proposal_analyses error:", insErr);
      throw insErr;
    }

    await serviceClient.from("evaluation_cost_log").insert({
      evaluation_id: inserted.id,
      instrument_code: instrumentCode,
      proposal_stage: stageKey,
      budget_type: budgetType || null,
      cost_usd: costUsd,
      cost_eur: costEur,
    });

    return new Response(
      JSON.stringify({
        evaluation_id: inserted.id,
        esr_markdown: esrMarkdown,
        scores: {
          excellence: excellenceMean,
          impact_raw: impactMean,
          impact_weighted: impactWeighted,
          implementation: implMean,
          total_unweighted: totalUnweighted,
          total_weighted: totalWeighted,
        },
        cost_usd: costUsd,
        cost_eur: costEur,
        model_used: evaluationModel,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
