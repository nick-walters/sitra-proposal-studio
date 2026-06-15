import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from "../_shared/cors.ts";


serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate the user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: roles } = await supabase
      .from('user_roles')
      .select('id')
      .eq('user_id', claimsData.claims.sub)
      .limit(1);

    if (!roles || roles.length === 0) {
      return new Response(JSON.stringify({ error: 'No proposal access' }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { text, action, context, sectionType } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    if (!text || text.trim().length === 0) {
      return new Response(
        JSON.stringify({ result: "" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let systemPrompt = "";
    let userPrompt = "";

    // Determine which evaluation criteria apply based on section
    const sectionCriteria: Record<string, string> = {
      'b1-1': 'Excellence (clarity of objectives, soundness of methodology, novelty/ambition, inter/trans-disciplinary approach)',
      'b1-2': 'Implementation (quality of work plan, appropriateness of management, complementarity of consortium, allocation of resources)',
      'b2-1': 'Impact (credibility of pathways to impact, sustainability, communication/dissemination/exploitation strategy)',
    };

    const criteriaContext = sectionType && sectionCriteria[sectionType]
      ? `\nThis text is for a section evaluated under: ${sectionCriteria[sectionType]}. Tailor your improvements to strengthen alignment with these evaluation criteria.`
      : '';

    switch (action) {
      case "improve_clarity":
        systemPrompt = `You are an expert EU research proposal writer. Improve the clarity of the text while:
- Maintaining academic rigor and formality
- Making complex ideas more accessible to reviewers
- Avoiding jargon where possible
- Using active voice where appropriate
- Keeping the same meaning and technical accuracy${criteriaContext}
Return ONLY the improved text, nothing else.`;
        userPrompt = `Improve the clarity of this text:\n\n${text}`;
        break;

      case "improve_tone":
        systemPrompt = `You are an expert EU research proposal writer following Sitra's tone of voice guidelines:
- Avoid generic AI-style language
- Be professional but not overly technical
- Be confident and specific about outcomes
- Use concrete language over abstract terms
- Focus on impact and benefits${criteriaContext}
Return ONLY the improved text, nothing else.`;
        userPrompt = `Improve the tone of this text for a Horizon Europe proposal:\n\n${text}`;
        break;

      case "make_concise":
        systemPrompt = `You are an expert EU research proposal writer. Make the text more concise while:
- Preserving all key information
- Removing redundancy and filler words
- Using stronger, more direct language
- Maintaining academic standards${criteriaContext}
Return ONLY the concise version, nothing else.`;
        userPrompt = `Make this text more concise:\n\n${text}`;
        break;

      case "expand": {
        const expandSystemPrompt = `You are an expert EU research proposal writer. The user wants to enhance and expand a single passage of their proposal.

Return EXACTLY ONE enhancement suggestion for the passage — never more than one. The suggestion is a fuller, stronger version of the original passage that:
- Adds relevant detail, examples, or supporting evidence
- Strengthens the argument and makes the case more compelling
- Preserves the original meaning and commitments — invent NO new facts
- Matches Sitra's tone: inspiring, curious, hopeful, clear plain language, expert and confident (not promotional)
- Uses active voice, formal future tense ("X will be done"), and proper Horizon Europe terminology

ABSOLUTE STYLE RULE — avoid AI-style vocabulary:
Do NOT use clichéd LLM/AI-style language. Never use words/phrases such as:
"delve", "deep dive", "pivot", "leverage" (as verb), "unleash", "unlock", "harness", "navigate the landscape",
"in today's fast-paced world", "game-changer", "synergy", "tapestry", "realm", "robust", "seamless",
"cutting-edge", "revolutionary", "transformative" (as filler), "moreover"/"furthermore" used as filler,
"it is worth noting that", "embark on a journey", "at the forefront", "paradigm shift", "holistic",
"in the realm of", "a testament to", "ever-evolving", "dive into", "elevate", "supercharge", "empower" (as filler).
Prefer concrete, plain, specific verbs and nouns. These terms are giveaways that AI wrote the text and must never appear in your output.
${context ? `Context: ${context}` : ""}${criteriaContext}

Return your single suggestion via the provided tool (suggestions array of length exactly 1).`;

        const expandResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: expandSystemPrompt },
              { role: "user", content: `Expand and strengthen this text:\n\n${text}` }
            ],
            tools: [
              {
                type: "function",
                function: {
                  name: "provide_expansions",
                  description: "Provide expansion suggestions for the passage",
                  parameters: {
                    type: "object",
                    properties: {
                      suggestions: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            original: { type: "string", description: "The original passage being expanded (echo the input)" },
                            expanded: { type: "string", description: "The expanded version of the passage" },
                            rationale: { type: "string", description: "One short sentence explaining what was added" },
                          },
                          required: ["original", "expanded", "rationale"],
                        },
                      },
                    },
                    required: ["suggestions"],
                  },
                },
              },
            ],
            tool_choice: { type: "function", function: { name: "provide_expansions" } },
          }),
        });

        if (!expandResponse.ok) {
          if (expandResponse.status === 429) {
            return new Response(
              JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
              { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          if (expandResponse.status === 402) {
            return new Response(
              JSON.stringify({ error: "AI credits exhausted. Please add funds." }),
              { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          throw new Error(`AI gateway error: ${expandResponse.status}`);
        }

        const expandData = await expandResponse.json();
        const toolCall = expandData.choices?.[0]?.message?.tool_calls?.[0];
        let suggestions: Array<{ original: string; expanded: string; rationale: string }> = [];
        if (toolCall?.function?.arguments) {
          try {
            const parsed = JSON.parse(toolCall.function.arguments);
            suggestions = parsed.suggestions || [];
          } catch (_) {
            suggestions = [];
          }
        }

        return new Response(
          JSON.stringify({ suggestions }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "eu_language":
        systemPrompt = `You are an expert EU research proposal writer. Adapt the text to use proper EU proposal language by:
- Using Horizon Europe terminology correctly
- Referencing appropriate evaluation criteria concepts (Excellence, Impact, Implementation)
- Following EC proposal writing conventions
- Including appropriate linking to expected outcomes/impacts where relevant${criteriaContext}
Return ONLY the adapted text, nothing else.`;
        userPrompt = `Adapt this text to proper EU Horizon Europe proposal language:\n\n${text}`;
        break;

      case "evaluate_section":
        systemPrompt = `You are a STRICT, highly critical senior Horizon Europe proposal evaluator. Your job is to deduct points honestly, NOT to make the author feel good. False reassurance harms the applicant; reviewers in Brussels will be merciless.

SCORING MODEL (half-point deduction from a 5.0 maximum, floor 1.0, decimals in 0.5 increments allowed):
- Start every criterion at 5.0.
- Deduct 0.5 for each MINOR shortcoming (vague wording, missing detail, weak example, light repetition, minor structural issue).
- Deduct 1.0 for each MAJOR shortcoming (missing required element, unclear objectives, unsupported claims, weak methodology, no measurable indicators, missing risk analysis, weak link to EU/HE criteria, missing impact pathway, no quantification, etc.).
- Multiple shortcomings compound — apply EVERY deduction. Do NOT round up.

CALIBRATION ANCHORS (use these strictly):
- 5.0 = exceptional, no material weaknesses, fully meets every aspect of the criterion.
- 4.5 = strong, at most one minor gap.
- 4.0 = good, a few minor gaps OR very strong with one near-major gap.
- 3.5 = acceptable but with clear gaps; one major OR several minor weaknesses.
- 3.0 = several minor weaknesses or one clear major weakness; would not impress reviewers.
- 2.5–2.0 = major structural problems; unlikely to pass threshold.
- 1.5–1.0 = fails the criterion.

HARD RULES:
- A score of 4.5 or 5.0 is ONLY allowed if the "weaknesses" array contains essentially nothing material. If you list any real weakness, the score MUST be 4.0 or lower.
- The number of weaknesses must justify the deduction (e.g. a score of 3.5 must have at least 1 major OR ≥3 minor weaknesses listed).
- Be specific and concrete in weaknesses — no vague "could be stronger" filler.
- Never inflate scores out of politeness. Err on the side of being harsher than a real EC reviewer would be.

For each applicable criterion area, provide:
1. score (number, 1.0–5.0, 0.5 increments)
2. Specific strengths
3. Specific weaknesses (each one a concrete, named gap)
4. Concrete improvement suggestions

${sectionType && sectionCriteria[sectionType]
  ? `This section is evaluated under: ${sectionCriteria[sectionType]}`
  : 'Evaluate against all three Horizon Europe criteria: Excellence, Impact, Implementation'}

Format your response as JSON with this structure:
{
  "overallScore": <number 1.0–5.0, 0.5 increments — must equal the average of per-criterion scores, rounded to nearest 0.5>,
  "criteria": [
    {
      "name": "<criterion name>",
      "score": <number 1.0–5.0, 0.5 increments>,
      "strengths": ["..."],
      "weaknesses": ["..."],
      "suggestions": ["..."]
    }
  ],
  "summary": "<brief, honest overall assessment that names the biggest weaknesses>"
}

Return ONLY valid JSON, nothing else.`;
        userPrompt = `Evaluate this proposal text:\n\n${text}`;
        break;

      default:
        systemPrompt = `You are an expert EU research proposal writer. Improve this text for a Horizon Europe proposal.${criteriaContext}`;
        userPrompt = `Improve this text:\n\n${text}`;
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add funds." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const result = data.choices?.[0]?.message?.content || "";

    return new Response(
      JSON.stringify({ result: result.trim() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Writing assistant error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
