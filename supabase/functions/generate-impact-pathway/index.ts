import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { projectDescription, expectedOutcomes, topicId, workProgramme, destination } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY not configured');
      throw new Error('API key not configured');
    }

    // Build the prompt with Sitra's tone of voice
    const systemPrompt = `You are an expert in EU Horizon Europe proposal writing, specifically focused on impact pathway development. 
You write in Sitra's tone of voice: clear, forward-looking, and grounded in practical solutions. 
You avoid generic AI language, bureaucratic jargon, and overly technical terminology.
You focus on concrete, measurable outcomes and quantifiable impacts wherever possible.
You acknowledge real-world barriers and provide practical mitigation strategies.

Generate impact pathways that:
1. Map concrete pathways from project outputs to expected outcomes to wider impacts
2. Include specific, measurable indicators and timelines
3. Quantify contributions wherever possible (percentages, numbers, monetary values)
4. Identify realistic barriers and propose concrete mitigation measures
5. Use active, engaging language that demonstrates the project's unique value`;

    const userPrompt = `Generate impact pathways for a Horizon Europe proposal with the following details:

PROJECT DESCRIPTION:
${projectDescription}

${expectedOutcomes ? `TOPIC EXPECTED OUTCOMES:\n${expectedOutcomes}\n` : ''}
${topicId ? `TOPIC ID: ${topicId}\n` : ''}
${workProgramme ? `WORK PROGRAMME: ${workProgramme}\n` : ''}
${destination ? `DESTINATION: ${destination}\n` : ''}

Please generate a comprehensive impact pathway analysis in JSON format with the following structure:
{
  "outcomes": [
    {
      "title": "Short outcome title",
      "description": "2-3 sentence description of how the project contributes to this outcome",
      "indicators": ["KPI 1", "KPI 2", "KPI 3"],
      "timeline": "Months X-Y"
    }
  ],
  "impacts": [
    {
      "title": "Wider impact title",
      "contribution": "How the project contributes to this impact",
      "quantification": "Specific numbers, percentages, or monetary values"
    }
  ],
  "barriers": [
    {
      "barrier": "Description of the barrier",
      "mitigation": "Concrete mitigation strategy"
    }
  ],
  "pathwayFigure": "ASCII art representation of the impact pathway showing outputs → outcomes → impacts"
}

Generate 2-3 outcomes, 2-3 impacts, and 2-3 barriers. Make all quantifications specific and realistic.`;

    console.log('Calling Lovable AI gateway for impact pathway generation');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content in AI response');
    }

    // Parse the JSON from the response
    // Try to extract JSON from the response
    let parsedResult;
    try {
      // Try direct parse first
      parsedResult = JSON.parse(content);
    } catch {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        parsedResult = JSON.parse(jsonMatch[1]);
      } else {
        // Try to find JSON object in the response
        const jsonStart = content.indexOf('{');
        const jsonEnd = content.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
          parsedResult = JSON.parse(content.substring(jsonStart, jsonEnd + 1));
        } else {
          throw new Error('Could not parse JSON from AI response');
        }
      }
    }

    console.log('Successfully generated impact pathways');

    return new Response(JSON.stringify(parsedResult), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error in generate-impact-pathway:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate impact pathways';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
