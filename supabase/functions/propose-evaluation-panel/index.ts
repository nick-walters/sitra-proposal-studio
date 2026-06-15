import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";


const stripHtml = (s: string | null | undefined) =>
  (s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

async function callAnthropic(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 2000,
) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic ${res.status}: ${text}`);
  }
  const data = await res.json();
  const text = data?.content?.[0]?.text ?? "";
  return { text, usage: data?.usage ?? {} };
}

function extractJson(text: string): any {
  // Strip markdown fences and parse the first JSON object/array found
  const cleaned = text.replace(/```json\s*|```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/[\[{][\s\S]*[\]}]/);
    if (match) return JSON.parse(match[0]);
    throw new Error("Failed to parse JSON from model output");
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
    const { proposalId, instrumentCode, proposalStage, budgetType } = body || {};
    if (!proposalId || !instrumentCode || !proposalStage) {
      return new Response(
        JSON.stringify({ error: "proposalId, instrumentCode, proposalStage required" }),
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

    // Gather data
    const [proposalRes, sectionsRes, participantsRes, budgetRes, instrumentsRes, personasRes, configRes] =
      await Promise.all([
        supabase.from("proposals").select("*").eq("id", proposalId).single(),
        supabase
          .from("section_content")
          .select("section_id, content")
          .eq("proposal_id", proposalId),
        supabase
          .from("participants")
          .select("id, organisation_short_name, organisation_name, participant_number, country")
          .eq("proposal_id", proposalId),
        supabase
          .from("budget_rows")
          .select("requested_eu_contribution, personnel_costs, subcontracting_costs, purchase_equipment, purchase_other_goods, purchase_travel")
          .eq("proposal_id", proposalId),
        supabase.from("instrument_types").select("*").eq("code", instrumentCode).maybeSingle(),
        supabase.from("evaluator_personas").select("*").eq("active", true),
        supabase.from("ai_platform_config").select("key, value"),
      ]);

    const proposal = proposalRes.data;
    const sections = sectionsRes.data || [];
    const participants = participantsRes.data || [];
    const budgetRows = budgetRes.data || [];
    const instrument = instrumentsRes.data;
    const personas = personasRes.data || [];
    const configMap = Object.fromEntries(
      (configRes.data || []).map((r: any) => [r.key, r.value]),
    );

    if (!proposal || !instrument) {
      return new Response(JSON.stringify({ error: "Proposal or instrument not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const eligibilityModel = configMap.eligibility_model || "claude-haiku-4-5-20251001";
    const assemblyModel = configMap.assembly_model || "claude-haiku-4-5-20251001";

    // Estimate page count using platform formula (500 words/page + 1 front-matter page)
    const WORDS_PER_PAGE = 500;
    const FRONT_MATTER_PAGES = 1;
    const allText = sections.map((s: any) => stripHtml(s.content)).join(" ");
    const wordCount = allText.split(/\s+/).filter(Boolean).length;
    const estimatedPages = Math.ceil(wordCount / WORDS_PER_PAGE) + FRONT_MATTER_PAGES;

    const pageLimit =
      proposalStage === "stage1"
        ? instrument.stage1_page_limit
        : budgetType === "lump_sum"
        ? instrument.page_limit_lump_sum
        : instrument.page_limit_traditional;

    const countries = new Set(participants.map((p: any) => p.country).filter(Boolean));
    const sectionList = sections.map((s: any) => `- ${s.section_id}: ${stripHtml(s.content).slice(0, 200)}`).join("\n");

    // Map budgetType code → display label
    const budgetTypeLabel =
      budgetType === "lump_sum" ? "Lump sum" : budgetType === "traditional" ? "Actual cost" : "n/a";
    const isStage1 = proposalStage === "stage1";
    const isLumpSum = budgetType === "lump_sum";

    // Compute requested EU budget total from A3 budget rows
    const totalRequestedEu = budgetRows.reduce(
      (sum: number, r: any) => sum + Number(r.requested_eu_contribution || 0),
      0,
    );
    const totalDirectCosts = budgetRows.reduce(
      (sum: number, r: any) =>
        sum +
        Number(r.personnel_costs || 0) +
        Number(r.subcontracting_costs || 0) +
        Number(r.purchase_equipment || 0) +
        Number(r.purchase_other_goods || 0) +
        Number(r.purchase_travel || 0),
      0,
    );
    const budgetPopulated = totalRequestedEu > 0 || totalDirectCosts > 0;
    const budgetSummary = budgetPopulated
      ? `Requested EU contribution: €${Math.round(totalRequestedEu).toLocaleString()} (across ${budgetRows.length} participant row(s)); total direct costs entered: €${Math.round(totalDirectCosts).toLocaleString()}.`
      : "No budget figures have been entered in the A3 budget portal yet.";

    // ---- 0a Eligibility ----
    const eligibilitySystem = `You are a European Commission Programme Officer conducting an admissibility pre-check on a proposal that is STILL BEING DRAFTED (pre-submission). Flag compliance issues as advisory warnings only — they do not prevent the proposal from proceeding to evaluation.

DO NOT comment on submission timing, deadlines, or whether the proposal was submitted on time — this tool runs during the writing phase, before submission.

Check and output a JSON array of flag objects with: "check" (string), "status" ("pass" | "warning" | "fail"), "note" (max 30 words).

CHECKS:
1. PARTNER COUNTRIES: At least 3 participants from different eligible countries required.
2. PAGE LENGTH: Compare estimated page count (word count ÷ 500 + 1 front-matter page) against the page limit for this instrument and budget type.
3. BLIND EVALUATION (Stage 1 only): Check Part B for identifying references to the consortium.
4. MANDATORY SECTIONS: Check that Part B has content in all required sections for this stage.
5. BUDGET COMPLETENESS: Use the BUDGET SUMMARY field below as the source of truth. If a requested EU contribution or direct costs are reported, the budget IS populated — do not claim otherwise. Only flag if the summary explicitly states no figures are entered.
6. DURATION: Flag if missing, under 12 months, or over 72 months.
7. SCOPE: Compare the proposal's brief context against the TOPIC TITLE / SCOPE / EXPECTED OUTCOMES provided. Only suggest a different instrument if the proposal genuinely falls outside the topic's scope. If the proposal directly addresses the topic's call for action, mark this as 'pass' even if the proposal is incomplete.

IMPORTANT: Only include checks that are applicable to this proposal configuration.
- Check 3 (BLIND EVALUATION): Only include if proposalStage = 'stage1'. Omit entirely for full proposals.
- Check 5 (BUDGET COMPLETENESS): Always include, but base it on the BUDGET SUMMARY — never assume €0.

Output ONLY valid JSON. No preamble.`;

    const topicBlock = [
      proposal.topic_title ? `Topic title: ${proposal.topic_title}` : null,
      proposal.topic_scope ? `Topic scope: ${stripHtml(proposal.topic_scope).slice(0, 1500)}` : null,
      proposal.topic_expected_outcome
        ? `Topic expected outcomes: ${stripHtml(proposal.topic_expected_outcome).slice(0, 1500)}`
        : null,
      proposal.topic_destination_description
        ? `Destination: ${stripHtml(proposal.topic_destination_description).slice(0, 800)}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    const proposalBriefContext = stripHtml(
      sections.find((s: any) => s.section_id === "b1-1")?.content || "",
    ).slice(0, 1500);

    const eligibilityUser = `PROPOSAL CONTEXT:
- Acronym: ${proposal.acronym}
- Title: ${proposal.title}
- Instrument: ${instrument.name} (${instrument.code})
- Stage: ${proposalStage} ${isStage1 ? "(Stage 1 — INCLUDE blind evaluation check)" : "(Full proposal — OMIT blind evaluation check)"}
- Budget type: ${budgetTypeLabel}
- Duration (months): ${proposal.duration ?? "missing"}
- Topic ID: ${proposal.topic_id || proposal.work_programme || "missing"}
- Topic URL: ${proposal.topic_url || "missing"}

TOPIC DETAILS (use this to judge scope alignment):
${topicBlock || "(no topic details available)"}

PROPOSAL BRIEF CONTEXT (B1.1 excerpt):
${proposalBriefContext || "(no B1.1 content yet)"}

PARTICIPANTS (${participants.length}, ${countries.size} unique countries):
${participants.map((p: any) => `- ${p.organisation_short_name || p.organisation_name} (${p.country || "unknown"})`).join("\n")}

PAGE LIMIT: ${pageLimit ?? "n/a"} pages
ESTIMATED PAGES (words/500 + 1): ${estimatedPages} (~${wordCount} words)

BUDGET SUMMARY (authoritative — from A3 budget portal):
${budgetSummary}

PART B SECTIONS PRESENT:
${sectionList || "(none)"}
`;

    // ---- 0b Panel assembly ----
    const personasJson = JSON.stringify(
      personas.map((p: any) => ({
        id: p.persona_number,
        name: p.name,
        brief: p.brief,
        thematic_area: p.thematic_area,
      })),
    );

    const assemblySystem = `You are a European Commission Programme Officer assembling an expert evaluation panel.

SELECTION RULES:
- Select minimum 3, maximum 10 evaluators. Target 5–8. Rank in order of relevance.
- Ensure disciplinary diversity. Include at least one critical/sceptical perspective.
- For Stage 1, prioritise evaluators strong on Excellence and Impact.

OUTPUT: Return ONLY valid JSON — array of evaluator objects ranked by relevance:
[{"id": number, "name": string, "brief": string}]

EVALUATOR LIBRARY:
${personasJson}`;

    const assemblyUser = `Assemble a panel for:
- Instrument: ${instrument.name}
- Stage: ${proposalStage}
- Topic: ${proposal.topic_id || proposal.work_programme || "general"}
- Title: ${proposal.title}
- Brief context: ${stripHtml(sections.find((s: any) => s.section_id === "b1-1")?.content || "").slice(0, 1500)}

Return JSON array only.`;

    const [eligibilityRes, assemblyRes] = await Promise.all([
      callAnthropic(ANTHROPIC_API_KEY, eligibilityModel, eligibilitySystem, eligibilityUser, 1500),
      callAnthropic(ANTHROPIC_API_KEY, assemblyModel, assemblySystem, assemblyUser, 1500),
    ]);

    const eligibilityFlagsRaw = extractJson(eligibilityRes.text);
    const proposedPanel = extractJson(assemblyRes.text);

    // Server-side filter: drop inapplicable / out-of-scope checks defensively
    const eligibilityFlags = (Array.isArray(eligibilityFlagsRaw) ? eligibilityFlagsRaw : []).filter(
      (f: any) => {
        const name = String(f?.check || "").toUpperCase();
        const note = String(f?.note || "").toUpperCase();
        if (!isStage1 && name.includes("BLIND")) return false;
        // Drop any submission-timing checks — this tool runs pre-submission.
        if (
          name.includes("SUBMISSION") ||
          name.includes("SUBMITTED") ||
          name.includes("DEADLINE") ||
          name.includes("ON TIME") ||
          note.includes("SUBMITTED ON TIME") ||
          note.includes("SUBMISSION DEADLINE")
        ) {
          return false;
        }
        return true;
      },
    );

    return new Response(
      JSON.stringify({
        eligibility_flags: eligibilityFlags,
        proposed_panel: proposedPanel,
        all_personas: personas.map((p: any) => ({
          id: p.id,
          persona_number: p.persona_number,
          name: p.name,
          brief: p.brief,
          thematic_area: p.thematic_area,
        })),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("propose-evaluation-panel error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
