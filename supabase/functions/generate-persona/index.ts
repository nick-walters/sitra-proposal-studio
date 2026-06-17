import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireAuth } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/cors.ts";


const VALID_AREAS = [
  "Circular Economy",
  "Data & AI",
  "Democracy & Trust",
  "Health & Wellbeing",
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY is not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = auth.callerClient;
    const userId = auth.userId;

    // Coordinator+ on any proposal is sufficient (this affects platform-wide library)
    const { data: hasCoord } = await supabase.rpc("is_coordinator_or_above", {
      _user_id: userId,
    });
    if (!hasCoord) {
      return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { description, save = false } = await req.json();
    if (!description || typeof description !== "string" || description.length > 2000) {
      return new Response(JSON.stringify({ error: "description (string, <=2000 chars) required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: cfgRows } = await supabase
      .from("ai_platform_config")
      .select("key, value")
      .in("key", ["persona_generation_model", "persona_creation_model"]);
    const cfgMap = Object.fromEntries((cfgRows || []).map((r: any) => [r.key, r.value]));
    const model = cfgMap.persona_generation_model || cfgMap.persona_creation_model || "claude-haiku-4-5-20251001";

    const systemPrompt = `You are building an evaluator persona library. Generate a structured persona from the user's description.
OUTPUT: JSON only: {"name": "Title, field — max 10 words", "brief": "One sentence, max 25 words", "thematic_area": "Circular Economy|Data & AI|Democracy & Trust|Health & Wellbeing"}
Name style examples: "Machine learning researcher, applied AI" / "Health equity researcher". Brief should convey expertise AND critical lens.`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 500,
        system: systemPrompt,
        messages: [{ role: "user", content: description }],
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Anthropic ${res.status}: ${txt}`);
    }
    const data = await res.json();
    const text = data?.content?.[0]?.text ?? "";
    const cleaned = text.replace(/```json\s*|```/g, "").trim();
    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("Failed to parse persona JSON");
      parsed = JSON.parse(m[0]);
    }

    const name = String(parsed.name || "").trim();
    const brief = String(parsed.brief || "").trim();
    let area = String(parsed.thematic_area || "Democracy & Trust").trim();
    if (!VALID_AREAS.includes(area)) area = "Democracy & Trust";

    if (!name || !brief) {
      return new Response(JSON.stringify({ error: "Generated persona is incomplete" }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let savedId: string | null = null;
    if (save) {
      const { data: ins, error: insErr } = await supabase
        .from("evaluator_personas")
        .insert({ name, brief, thematic_area: area, created_by: userId, active: true })
        .select("id")
        .single();
      if (insErr) throw insErr;
      savedId = ins.id;
    }

    return new Response(
      JSON.stringify({ persona: { name, brief, thematic_area: area, id: savedId } }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: unknown) {
    console.error("generate-persona error:", e);
    return new Response(JSON.stringify({ error: "An internal error occurred" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
