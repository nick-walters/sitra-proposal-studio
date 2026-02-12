import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { action } = body;

    // Handle topic URL fetching
    if (action === 'fetch-topic') {
      const { topicUrl } = body;
      
      if (!topicUrl) {
        return new Response(
          JSON.stringify({ error: 'No topic URL provided' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Fetching topic content from:', topicUrl);

      try {
        const response = await fetch(topicUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; ProposalStudio/1.0)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
        });

        if (!response.ok) {
          console.error('Failed to fetch topic URL:', response.status);
          return new Response(
            JSON.stringify({ topicContent: '' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const html = await response.text();
        
        // Extract text content from HTML (basic extraction)
        // Remove scripts, styles, and HTML tags
        let textContent = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
          .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
          .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/\s+/g, ' ')
          .trim();

        // Limit content size
        textContent = textContent.slice(0, 12000);

        console.log('Topic content extracted, length:', textContent.length);

        return new Response(
          JSON.stringify({ topicContent: textContent }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (fetchError) {
        console.error('Error fetching topic URL:', fetchError);
        return new Response(
          JSON.stringify({ topicContent: '' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Handle pathway generation
    const { projectDescription, expectedOutcomes, topicId, topicContent, proposalContent, workProgramme, destination } = body;

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
5. Use active, engaging language that demonstrates the project's unique value
6. Align with the topic's expected outcomes and the work programme's goals`;

    // Build context sections
    let contextSections = '';
    
    if (proposalContent) {
      contextSections += `\nEXISTING PROPOSAL CONTENT (analyse this to understand the project):\n${proposalContent.slice(0, 6000)}\n`;
    }
    
    if (topicContent) {
      contextSections += `\nTOPIC DESCRIPTION (from EU Funding Portal - align pathways with these requirements):\n${topicContent.slice(0, 6000)}\n`;
    }
    
    if (projectDescription) {
      contextSections += `\nADDITIONAL PROJECT CONTEXT:\n${projectDescription}\n`;
    }

    const userPrompt = `Generate impact pathways for a Horizon Europe proposal. Analyse the provided content carefully to create tailored, specific pathways.

${contextSections}
${expectedOutcomes ? `ADDITIONAL EXPECTED OUTCOMES:\n${expectedOutcomes}\n` : ''}
${topicId ? `TOPIC ID: ${topicId}\n` : ''}
${workProgramme ? `WORK PROGRAMME: ${workProgramme}\n` : ''}
${destination ? `DESTINATION: ${destination}\n` : ''}

Based on your analysis of the proposal content and topic requirements, generate a comprehensive impact pathway analysis in JSON format with the following structure:
{
  "outcomes": [
    {
      "title": "Short outcome title",
      "description": "2-3 sentence description of how the project contributes to this outcome, referencing specific project activities",
      "indicators": ["KPI 1", "KPI 2", "KPI 3"],
      "timeline": "Months X-Y"
    }
  ],
  "impacts": [
    {
      "title": "Wider impact title",
      "contribution": "How the project contributes to this impact, with specific references to project outputs",
      "quantification": "Specific numbers, percentages, or monetary values"
    }
  ],
  "barriers": [
    {
      "barrier": "Description of the barrier specific to this project context",
      "mitigation": "Concrete mitigation strategy"
    }
  ],
  "pathwayFigure": "ASCII art representation of the impact pathway showing outputs → outcomes → impacts"
}

Generate 2-3 outcomes, 2-3 impacts, and 2-3 barriers. Make all content specific to the project and aligned with the topic requirements.`;

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
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please add credits to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
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
