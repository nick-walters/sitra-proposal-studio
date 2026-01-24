import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, action, context } = await req.json();
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

    switch (action) {
      case "improve_clarity":
        systemPrompt = `You are an expert EU research proposal writer. Improve the clarity of the text while:
- Maintaining academic rigor and formality
- Making complex ideas more accessible to reviewers
- Avoiding jargon where possible
- Using active voice where appropriate
- Keeping the same meaning and technical accuracy
Return ONLY the improved text, nothing else.`;
        userPrompt = `Improve the clarity of this text:\n\n${text}`;
        break;

      case "improve_tone":
        systemPrompt = `You are an expert EU research proposal writer following Sitra's tone of voice guidelines:
- Avoid generic AI-style language
- Be professional but not overly technical
- Be confident and specific about outcomes
- Use concrete language over abstract terms
- Focus on impact and benefits
Return ONLY the improved text, nothing else.`;
        userPrompt = `Improve the tone of this text for a Horizon Europe proposal:\n\n${text}`;
        break;

      case "make_concise":
        systemPrompt = `You are an expert EU research proposal writer. Make the text more concise while:
- Preserving all key information
- Removing redundancy and filler words
- Using stronger, more direct language
- Maintaining academic standards
Return ONLY the concise version, nothing else.`;
        userPrompt = `Make this text more concise:\n\n${text}`;
        break;

      case "expand":
        systemPrompt = `You are an expert EU research proposal writer. Expand the text by:
- Adding relevant details and examples
- Strengthening arguments
- Adding supporting evidence where appropriate
- Making the case more compelling
${context ? `Context: ${context}` : ""}
Return ONLY the expanded text, nothing else.`;
        userPrompt = `Expand and strengthen this text:\n\n${text}`;
        break;

      case "eu_language":
        systemPrompt = `You are an expert EU research proposal writer. Adapt the text to use proper EU proposal language by:
- Using Horizon Europe terminology correctly
- Referencing appropriate evaluation criteria concepts (Excellence, Impact, Implementation)
- Following EC proposal writing conventions
- Including appropriate linking to expected outcomes/impacts where relevant
Return ONLY the adapted text, nothing else.`;
        userPrompt = `Adapt this text to proper EU Horizon Europe proposal language:\n\n${text}`;
        break;

      default:
        systemPrompt = `You are an expert EU research proposal writer. Improve this text for a Horizon Europe proposal.`;
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
