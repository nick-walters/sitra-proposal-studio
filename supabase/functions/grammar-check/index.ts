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
    const { text } = await req.json();
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

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are an advanced grammar and style checker for academic/grant proposals. Analyze the text and provide suggestions for improvement.

For each issue found, provide:
1. The problematic text (exact match from original)
2. The suggested replacement
3. The type of issue: "grammar", "spelling", "style", "clarity", "wordiness", or "punctuation"
4. A brief explanation

Return a JSON array of suggestions. Be thorough but practical. Focus on:
- Grammar and spelling errors
- Awkward phrasing
- Wordiness that can be trimmed
- Academic writing improvements
- Clarity issues

If the text is perfect, return an empty array.`
          },
          {
            role: "user",
            content: `Please analyze this text and provide improvement suggestions:\n\n${text}`
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "provide_suggestions",
              description: "Provide grammar and style suggestions",
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
                        type: { 
                          type: "string", 
                          enum: ["grammar", "spelling", "style", "clarity", "wordiness", "punctuation"]
                        },
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
