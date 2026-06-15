import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Category = 'grammar' | 'conciseness' | 'clarity' | 'tone' | 'terminology';

const CATEGORY_INSTRUCTIONS: Record<Category, string> = {
  grammar: `- GRAMMAR & SPELLING: Flag incorrect grammar, punctuation, agreement, tense, and spelling errors (Grammarly-style). Use type "grammar".`,
  conciseness: `- CONCISENESS: Flag redundant words, filler phrases, and sentences that can be restructured to be more direct without losing meaning. Use type "conciseness".`,
  clarity: `- CLARITY: Flag confusing, ambiguous, or convoluted phrasing. Suggest clearer alternatives. Use type "clarity".`,
  tone: `- TONE (Sitra tone model): Reshape phrasing to match Sitra's tone — inspiring, curious, hopeful, understandable (clear, plain language), and expert (credible, evidence-based, confident but not arrogant). Prefer:
    * Solution-oriented framing (what can be done, not just problems)
    * Collaboration & partnership language (Sitra as strategic partner, bridge-builder, networker)
    * Future tense and formal language ("X will be done" rather than "We do X")
    * Active voice; no jargon; no hype, speculation, or unsupported claims
    * Professional, neutral, non-political; not promotional or marketing-style
    * Accessible to international audiences
    Preserve original meaning and commitments — invent no new facts. Use type "tone".`,
  terminology: `- TERMINOLOGY: Flag wording that should use proper EU policy and Horizon Europe terminology (Excellence / Impact / Implementation, work package, deliverable, milestone, beneficiary, affiliated entity, lump sum, etc.) and suggest the correct EU/HE term. Use type "terminology".`,
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

    const { text, categories } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    if (!text || text.trim().length === 0) {
      return new Response(
        JSON.stringify({ suggestions: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const allCategories: Category[] = ['grammar', 'conciseness', 'clarity', 'tone', 'terminology'];
    const selected: Category[] = Array.isArray(categories) && categories.length > 0
      ? (categories as string[]).filter((c): c is Category => (allCategories as string[]).includes(c))
      : allCategories;

    const instructionsBlock = selected.map(c => CATEGORY_INSTRUCTIONS[c]).join('\n');

    const systemPrompt = `You are an advanced writing reviewer for Horizon Europe grant proposals, applying Sitra's editorial standards.

The user has asked you to review ONLY the following categories — do NOT flag anything outside them:
${instructionsBlock}

ABSOLUTE STYLE RULE — avoid AI-style vocabulary:
Replacements MUST NOT introduce clichéd LLM/AI-style language. Specifically, never use (or only flag against, never propose) words and phrases such as:
"delve", "deep dive", "pivot", "leverage" (as verb), "unleash", "unlock", "harness", "navigate the landscape",
"in today's fast-paced world", "game-changer", "synergy", "tapestry", "realm", "robust", "seamless",
"cutting-edge", "revolutionary", "transformative" (as filler), "moreover"/"furthermore" used as filler,
"it is worth noting that", "embark on a journey", "at the forefront", "paradigm shift", "holistic",
"in the realm of", "a testament to", "ever-evolving", "dive into", "elevate", "supercharge", "empower" (as filler).
Prefer concrete, plain, specific verbs and nouns. If the original text contains any of these terms, you SHOULD flag them under the "tone" or "clarity" category and propose plain replacements.

For each issue found, return:
1. original: the exact substring from the input text (must match character-for-character)
2. replacement: the suggested replacement text (free of the banned vocabulary above)
3. type: one of ${selected.map(c => `"${c}"`).join(', ')}
4. explanation: a brief, concrete reason (1 sentence)

Be thorough but practical. If the text is already strong in the selected categories, return an empty array.`;

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
          { role: "user", content: `Review this text for the selected categories only:\n\n${text}` }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "provide_suggestions",
              description: "Provide writing improvement suggestions for the selected categories",
              parameters: {
                type: "object",
                properties: {
                  suggestions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        original: { type: "string", description: "The exact text that needs improvement" },
                        replacement: { type: "string", description: "The suggested replacement text" },
                        type: { type: "string", enum: selected },
                        explanation: { type: "string", description: "Brief explanation of the issue" }
                      },
                      required: ["original", "replacement", "type", "explanation"]
                    }
                  }
                },
                required: ["suggestions"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "provide_suggestions" } }
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
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      return new Response(
        JSON.stringify(parsed),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ suggestions: [] }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Grammar check error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
