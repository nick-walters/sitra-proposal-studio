import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { proposalId } = await req.json();
    if (!proposalId) {
      return new Response(JSON.stringify({ error: "proposalId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all data in parallel
    const [
      proposalRes,
      sectionsRes,
      wpDraftsRes,
      deliverablesRes,
      milestonesRes,
      risksRes,
      participantsRes,
      budgetRowsRes,
    ] = await Promise.all([
      supabase.from("proposals").select("*").eq("id", proposalId).single(),
      supabase.from("section_content").select("section_id, content").eq("proposal_id", proposalId),
      supabase.from("wp_drafts").select("id, number, short_name, title, objectives, methodology, duration_months, lead_participant_id").eq("proposal_id", proposalId).order("number"),
      supabase.from("b31_deliverables").select("number, name, wp_number, task_id, lead_participant_id, due_month, type, dissemination_level").eq("proposal_id", proposalId),
      supabase.from("b31_milestones").select("number, name, due_month, task_id, wps, means_of_verification").eq("proposal_id", proposalId),
      supabase.from("b31_risks").select("number, description, wps, mitigation, likelihood, severity").eq("proposal_id", proposalId),
      supabase.from("participants").select("id, organisation_short_name, participant_number, country, organisation_type").eq("proposal_id", proposalId),
      supabase.from("budget_rows").select("participant_id, personnel_costs, purchase_equipment, purchase_travel, purchase_other_goods, subcontracting_costs").eq("proposal_id", proposalId),
    ]);

    const proposal = proposalRes.data;
    if (!proposal) {
      return new Response(JSON.stringify({ error: "Proposal not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch tasks for WPs
    const wpIds = (wpDraftsRes.data || []).map((w: any) => w.id);
    const { data: tasks } = await supabase
      .from("wp_draft_tasks")
      .select("id, number, title, description, start_month, end_month, wp_draft_id, lead_participant_id")
      .in("wp_draft_id", wpIds.length > 0 ? wpIds : ["__none__"]);

    const { data: wpDeliverables } = await supabase
      .from("wp_draft_deliverables")
      .select("id, number, title, type, dissemination_level, due_month, wp_draft_id")
      .in("wp_draft_id", wpIds.length > 0 ? wpIds : ["__none__"]);

    // Build section content map
    const sectionMap: Record<string, string> = {};
    (sectionsRes.data || []).forEach((s: any) => {
      sectionMap[s.section_id] = stripHtml(s.content || "");
    });

    // Build WP summary
    const wpSummaries = (wpDraftsRes.data || []).map((wp: any) => {
      const wpTasks = (tasks || []).filter((t: any) => t.wp_draft_id === wp.id);
      const wpDelivs = (wpDeliverables || []).filter((d: any) => d.wp_draft_id === wp.id);
      return {
        number: wp.number,
        shortName: wp.short_name || "",
        title: wp.title || "",
        objectives: stripHtml(wp.objectives || ""),
        methodology: stripHtml(wp.methodology || ""),
        tasks: wpTasks.map((t: any) => ({
          number: `T${wp.number}.${t.number}`,
          title: t.title || "",
          startMonth: t.start_month,
          endMonth: t.end_month,
          leader: (participantsRes.data || []).find((p: any) => p.id === t.lead_participant_id)?.organisation_short_name || "",
        })),
        deliverables: wpDelivs.map((d: any) => ({
          number: `D${wp.number}.${d.number}`,
          title: d.title || "",
          dueMonth: d.due_month,
          type: d.type || "",
        })),
      };
    });

    // Build cross-reference data for consistency checking
    const b31Deliverables = (deliverablesRes.data || []).map((d: any) => ({
      number: d.number,
      name: d.name,
      wpNumber: d.wp_number,
      dueMonth: d.due_month,
      taskId: d.task_id,
      leadParticipantId: d.lead_participant_id,
    }));

    const b31Milestones = (milestonesRes.data || []).map((m: any) => ({
      number: m.number,
      name: m.name,
      dueMonth: m.due_month,
      wps: m.wps,
      taskId: m.task_id,
    }));

    // Topic information
    const topicInfo = {
      title: proposal.topic_title || "",
      description: stripHtml(proposal.topic_description || ""),
      expectedOutcome: stripHtml(proposal.topic_expected_outcome || ""),
      scope: stripHtml(proposal.topic_scope || ""),
      destination: stripHtml(proposal.topic_destination_description || ""),
    };

    // Build the prompt
    const systemPrompt = `You are a Horizon Europe proposal evaluator and quality assurance expert. You will analyse a proposal deeply against the official Horizon Europe evaluation criteria (Excellence, Impact, Implementation) and the specific topic requirements.

You MUST return a JSON object with this exact structure:
{
  "overallAssessment": "A 2-3 sentence summary of the proposal's overall quality and readiness",
  "sections": [
    {
      "id": "excellence",
      "title": "Excellence",
      "score": 4.0,
      "maxScore": 5,
      "threshold": 4,
      "strengths": ["strength 1", "strength 2"],
      "weaknesses": ["weakness 1"],
      "improvements": ["specific improvement suggestion 1", "suggestion 2"],
      "missingElements": ["element that should be covered but isn't"],
      "topicAlignment": "How well this criterion addresses the specific topic requirements"
    },
    {
      "id": "impact",
      "title": "Impact",
      "score": 3.5,
      "maxScore": 5,
      "threshold": 4,
      "strengths": [],
      "weaknesses": [],
      "improvements": [],
      "missingElements": [],
      "topicAlignment": ""
    },
    {
      "id": "implementation",
      "title": "Implementation",
      "score": 3.0,
      "maxScore": 5,
      "threshold": 3,
      "strengths": [],
      "weaknesses": [],
      "improvements": [],
      "missingElements": [],
      "topicAlignment": ""
    }
  ],
  "crossRefIssues": [
    {
      "type": "error",
      "category": "Deliverables|Milestones|Tasks|Work packages|Timing|Numbering",
      "message": "Description of the inconsistency found"
    }
  ],
  "completenessChecklist": [
    {
      "item": "Description of required element",
      "status": "done|partial|missing",
      "details": "Explanation"
    }
  ],
  "strategicRecommendations": [
    "High-level strategic recommendation for strengthening the proposal"
  ]
}

Scoring guidelines:
- Score 5: Excellent – the proposal successfully addresses all relevant aspects of the criterion. Any shortcomings are minor.
- Score 4: Very good – the proposal addresses the criterion very well, but a small number of shortcomings are present.
- Score 3: Good – the proposal addresses the criterion well, but a number of shortcomings are present.
- Score 2: Fair – the proposal broadly addresses the criterion, but there are significant weaknesses.
- Score 1: Poor – the criterion is inadequately addressed, or there are serious inherent weaknesses.

For cross-reference checking, carefully verify:
1. WP/Task/Deliverable/Milestone numbering consistency between WP drafts and B3.1 tables
2. Timing consistency: task start/end months should be within WP duration; deliverable due months should be within task/WP timeframe
3. All deliverables should be linked to existing tasks and WPs
4. Milestone due months should align with the tasks they reference
5. Cross-references in text (e.g., "as described in WP3" or "see T2.1") should reference existing items

For completeness, check all required Horizon Europe Part B elements are present and substantive.
For topic alignment, compare each section's content against the topic's expected outcomes, scope, and destination.`;

    const userPrompt = `Analyse this Horizon Europe proposal in depth.

PROPOSAL: "${proposal.acronym}" - ${proposal.title}
Type: ${proposal.type}
Duration: ${proposal.duration_months || "Not specified"} months

=== TOPIC INFORMATION ===
Topic: ${topicInfo.title}
Expected Outcome: ${topicInfo.expectedOutcome || "Not provided"}
Scope: ${topicInfo.scope || "Not provided"}
Destination: ${topicInfo.destination || "Not provided"}

=== PART B SECTION CONTENT ===
${Object.entries(sectionMap).map(([id, content]) => `--- ${id} ---\n${content.substring(0, 3000)}`).join("\n\n")}

=== WORK PACKAGES ===
${wpSummaries.map(wp => `WP${wp.number} (${wp.shortName}): ${wp.title}
Objectives: ${wp.objectives.substring(0, 500)}
Methodology: ${wp.methodology.substring(0, 500)}
Tasks: ${wp.tasks.map(t => `${t.number} "${t.title}" M${t.startMonth || '?'}-M${t.endMonth || '?'} (Lead: ${t.leader || 'unassigned'})`).join("; ")}
Deliverables: ${wp.deliverables.map(d => `${d.number} "${d.title}" M${d.dueMonth || '?'} (${d.type})`).join("; ")}`).join("\n\n")}

=== TABLE 3.1 DELIVERABLES ===
${b31Deliverables.map(d => `D${d.wpNumber || '?'}.${d.number} "${d.name}" WP${d.wpNumber || '?'} due:M${d.dueMonth || '?'}`).join("\n")}

=== TABLE 3.1 MILESTONES ===
${b31Milestones.map(m => `MS${m.number} "${m.name}" WPs:${m.wps || '?'} due:M${m.dueMonth || '?'}`).join("\n")}

=== PARTICIPANTS (${(participantsRes.data || []).length}) ===
${(participantsRes.data || []).map((p: any) => `P${p.participant_number}: ${p.organisation_short_name} (${p.country}, ${p.organisation_type})`).join("\n")}

=== RISKS ===
${(risksRes.data || []).map((r: any) => `Risk ${r.number}: "${stripHtml(r.description || "")}" WPs:${r.wps || '?'} Severity:${r.severity || '?'} Likelihood:${r.likelihood || '?'}`).join("\n")}

Provide a thorough, detailed analysis. Be specific in your recommendations - reference specific sections, WP numbers, and deliverables. For cross-reference issues, check EVERY numbering and timing detail carefully.`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "proposal_analysis",
              description: "Return the complete proposal analysis as structured JSON",
              parameters: {
                type: "object",
                properties: {
                  overallAssessment: { type: "string" },
                  sections: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        title: { type: "string" },
                        score: { type: "number" },
                        maxScore: { type: "number" },
                        threshold: { type: "number" },
                        strengths: { type: "array", items: { type: "string" } },
                        weaknesses: { type: "array", items: { type: "string" } },
                        improvements: { type: "array", items: { type: "string" } },
                        missingElements: { type: "array", items: { type: "string" } },
                        topicAlignment: { type: "string" },
                      },
                      required: ["id", "title", "score", "maxScore", "threshold", "strengths", "weaknesses", "improvements", "missingElements", "topicAlignment"],
                    },
                  },
                  crossRefIssues: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        type: { type: "string", enum: ["error", "warning"] },
                        category: { type: "string" },
                        message: { type: "string" },
                      },
                      required: ["type", "category", "message"],
                    },
                  },
                  completenessChecklist: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        item: { type: "string" },
                        status: { type: "string", enum: ["done", "partial", "missing"] },
                        details: { type: "string" },
                      },
                      required: ["item", "status", "details"],
                    },
                  },
                  strategicRecommendations: {
                    type: "array",
                    items: { type: "string" },
                  },
                },
                required: ["overallAssessment", "sections", "crossRefIssues", "completenessChecklist", "strategicRecommendations"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "proposal_analysis" } },
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      return new Response(JSON.stringify({ error: "AI analysis failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      // Fallback: try to parse content as JSON
      const content = aiData.choices?.[0]?.message?.content || "";
      try {
        const parsed = JSON.parse(content);
        return new Response(JSON.stringify({ analysis: parsed }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch {
        return new Response(JSON.stringify({ error: "Failed to parse AI response" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    let analysis;
    try {
      analysis = typeof toolCall.function.arguments === "string"
        ? JSON.parse(toolCall.function.arguments)
        : toolCall.function.arguments;
    } catch {
      return new Response(JSON.stringify({ error: "Failed to parse AI analysis" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ analysis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyse-proposal error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
