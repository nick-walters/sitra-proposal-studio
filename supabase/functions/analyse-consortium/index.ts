import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

    const userId = claimsData.claims.sub as string;

    const { proposalId } = await req.json();
    if (!proposalId) {
      return new Response(
        JSON.stringify({ error: "proposalId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user has coordinator+ role
    const { data: roleCheck } = await supabase.rpc('is_proposal_admin', {
      _user_id: userId,
      _proposal_id: proposalId,
    });
    if (!roleCheck) {
      return new Response(
        JSON.stringify({ error: "Insufficient permissions" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Gather proposal context
    const [
      { data: proposal },
      { data: participants },
      { data: wpDrafts },
      { data: sectionContent },
    ] = await Promise.all([
      supabase.from('proposals').select('acronym, title, type, work_programme, destination, topic_url').eq('id', proposalId).single(),
      supabase.from('participants').select('organisation_name, organisation_short_name, country, organisation_category, legal_entity_type, is_sme').eq('proposal_id', proposalId),
      supabase.from('wp_drafts').select('number, short_name, title, lead_participant_id').eq('proposal_id', proposalId).order('number'),
      supabase.from('section_content').select('section_id, content').eq('proposal_id', proposalId).in('section_id', ['b1-1', 'b1-2', 'b2-1']),
    ]);

    // Build context summary
    const partsList = (participants || []).map(p => {
      const cat = p.organisation_category || 'Unknown';
      return `- ${p.organisation_short_name || p.organisation_name} (${cat}, ${p.country || 'Unknown country'}${p.is_sme ? ', SME' : ''})`;
    }).join('\n');

    const countriesSet = new Set((participants || []).map(p => p.country).filter(Boolean));
    const categories = (participants || []).map(p => p.organisation_category).filter(Boolean);
    const catCounts: Record<string, number> = {};
    categories.forEach(c => { catCounts[c!] = (catCounts[c!] || 0) + 1; });

    const wpSummary = (wpDrafts || []).map(wp => {
      const hasLead = wp.lead_participant_id ? 'has lead' : 'NO LEAD';
      return `WP${wp.number} ${wp.short_name || wp.title || ''} (${hasLead})`;
    }).join(', ');

    // Extract key text from sections (truncated for token efficiency)
    const sectionTexts = (sectionContent || []).map(sc => {
      const text = (sc.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      return `[${sc.section_id}]: ${text.slice(0, 1500)}`;
    }).join('\n\n');

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `You are an expert Horizon Europe consortium design advisor. Analyze the proposal context and current consortium, then identify gaps and recommend partner profiles.

Consider these Horizon Europe best practices:
- Geographic diversity across EU member states and associated countries
- Balance of organisation types: HES (Higher Education), RES (Research), PRC (Private/Industry), PUB (Public Bodies), OTH (NGOs/Civil society)
- SME involvement for exploitation and market access
- Widening participation countries (Eastern/Southern EU) for bonus scoring
- Each Work Package should have a credible lead
- Complementary expertise coverage
- Dissemination and communication capacity
- End-user/stakeholder representation

Organisation categories: HES (Higher Education), RES (Research Organisation), PRC (Private Company), PUB (Public Body), INT (International Org), OTH (Other/NGO/CSO)

Return your analysis as JSON with this exact structure:
{
  "summary": "Brief overall consortium assessment (2-3 sentences)",
  "strengths": ["strength 1", "strength 2"],
  "gaps": [
    {
      "type": "geographic" | "expertise" | "organisation_type" | "role_coverage" | "dissemination" | "exploitation",
      "priority": "high" | "medium" | "low",
      "description": "What is missing",
      "suggestedProfile": {
        "organisationType": "HES|RES|PRC|PUB|OTH",
        "region": "Suggested region/countries",
        "expertise": "Required expertise area",
        "role": "Suggested role in consortium"
      },
      "rationale": "Why this matters for evaluation"
    }
  ]
}

Return ONLY valid JSON, nothing else.`;

    const userPrompt = `PROPOSAL: "${proposal?.title || ''}" (${proposal?.acronym || ''})
Type: ${proposal?.type || 'Unknown'}
Work Programme: ${proposal?.work_programme || 'Not specified'}
Destination: ${proposal?.destination || 'Not specified'}

CURRENT CONSORTIUM (${(participants || []).length} partners):
${partsList || 'No participants added yet'}

Countries represented: ${[...countriesSet].join(', ') || 'None'}
Type distribution: ${Object.entries(catCounts).map(([k, v]) => `${k}: ${v}`).join(', ') || 'None'}

WORK PACKAGES: ${wpSummary || 'None defined'}

PROPOSAL CONTENT:
${sectionTexts || 'No content written yet'}

Analyze this consortium and identify gaps with specific partner profile recommendations.`;

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
          { role: "user", content: userPrompt },
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
    const resultText = data.choices?.[0]?.message?.content || "";

    // Parse JSON, handling markdown code blocks
    let parsed;
    try {
      let jsonStr = resultText;
      const jsonMatch = resultText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) jsonStr = jsonMatch[1].trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      parsed = { summary: resultText, strengths: [], gaps: [] };
    }

    return new Response(
      JSON.stringify({ result: parsed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Consortium analysis error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
