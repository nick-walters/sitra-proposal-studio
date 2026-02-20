import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate the user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Create a client with the user's token for auth verification
    const userSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await userSupabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claimsData.claims.sub;

    const { proposalId, topicUrl } = await req.json();

    if (!proposalId || !topicUrl) {
      return new Response(
        JSON.stringify({ success: false, error: 'Proposal ID and topic URL are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the user has access to this proposal
    const serviceSupabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: userRole } = await serviceSupabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('proposal_id', proposalId)
      .maybeSingle();

    if (!userRole) {
      return new Response(
        JSON.stringify({ success: false, error: 'Access denied to this proposal' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate it's an EU portal URL
    if (!topicUrl.includes('ec.europa.eu') && !topicUrl.includes('europa.eu')) {
      return new Response(
        JSON.stringify({ success: false, error: 'URL must be from the EU Funding & Tenders Portal' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      console.warn('FIRECRAWL_API_KEY not configured, will use direct fetch fallback');
    }

    // Format URL
    let formattedUrl = topicUrl.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }

    console.log('Scraping topic URL:', formattedUrl);

    let markdown = '';
    let html = '';

    // Try Firecrawl first, fall back to direct fetch
    if (apiKey) {
      try {
        const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: formattedUrl,
            formats: ['markdown', 'html'],
            onlyMainContent: true,
            waitFor: 3000,
          }),
        });

        const scrapeData = await scrapeResponse.json();

        if (scrapeResponse.ok) {
          markdown = scrapeData.data?.markdown || scrapeData.markdown || '';
          html = scrapeData.data?.html || scrapeData.html || '';
          console.log('Firecrawl scrape successful, markdown length:', markdown.length);
        } else {
          console.warn('Firecrawl failed, falling back to direct fetch:', scrapeData.error);
        }
      } catch (fcError) {
        console.warn('Firecrawl error, falling back to direct fetch:', fcError);
      }
    }

    // Fallback: direct fetch if Firecrawl failed or returned empty
    if (!markdown && !html) {
      console.log('Using direct fetch fallback...');
      const directResponse = await fetch(formattedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      if (!directResponse.ok) {
        return new Response(
          JSON.stringify({ success: false, error: `Failed to fetch topic page (status ${directResponse.status})` }),
          { status: directResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      html = await directResponse.text();
      // Convert HTML to simple markdown-like text by stripping tags
      markdown = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
        .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
        .replace(/<h([1-6])[^>]*>(.*?)<\/h\1>/gi, (_, level, text) => '#'.repeat(parseInt(level)) + ' ' + text.replace(/<[^>]+>/g, ''))
        .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      console.log('Direct fetch successful, content length:', markdown.length);
    }

    console.log('Scrape successful, markdown length:', markdown.length);

    // Extract topic description and destination sections
    const extractedContent = extractTopicContent(markdown, html);

    if (!extractedContent.topicDescription && !extractedContent.destinationDescription) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Could not extract topic description or destination from the page. Please verify the URL points to a valid topic page.',
          rawContent: markdown.substring(0, 500)
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update the proposal with the extracted content (using serviceSupabase created earlier)

    const { error: updateError } = await serviceSupabase
      .from('proposals')
      .update({
        topic_description: extractedContent.topicDescription,
        topic_destination_description: extractedContent.destinationDescription,
        topic_content_imported_at: new Date().toISOString(),
      })
      .eq('id', proposalId);

    if (updateError) {
      console.error('Error updating proposal:', updateError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to save imported content' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Topic content imported successfully');

    return new Response(
      JSON.stringify({
        success: true,
        topicDescription: extractedContent.topicDescription,
        destinationDescription: extractedContent.destinationDescription,
        importedAt: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error scraping topic:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to scrape topic';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

interface ExtractedContent {
  topicDescription: string | null;
  destinationDescription: string | null;
}

function extractTopicContent(markdown: string, html: string): ExtractedContent {
  let topicDescription: string | null = null;
  let destinationDescription: string | null = null;

  // EU Portal topic pages typically have sections like:
  // - "Topic description" or "Description" 
  // - "Expected Outcome" / "Outcomes"
  // - "Scope"
  // - "Destination" sections

  // Try to extract from markdown first (cleaner)
  const lines = markdown.split('\n');
  let currentSection = '';
  let sectionContent: string[] = [];
  
  const topicSectionPatterns = [
    /^#+\s*topic\s*description/i,
    /^#+\s*description$/i,
    /^#+\s*expected\s*outcome/i,
    /^#+\s*scope$/i,
  ];
  
  const destinationPatterns = [
    /^#+\s*destination\s*-/i,
    /^#+\s*destination$/i,
    /^#+\s*destination\s*\d+/i,
  ];

  const isNewSection = (line: string) => /^#+\s/.test(line);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (isNewSection(line)) {
      // Save previous section if it was a topic description section
      if (currentSection === 'topic' && sectionContent.length > 0) {
        topicDescription = sectionContent.join('\n').trim();
      } else if (currentSection === 'destination' && sectionContent.length > 0) {
        destinationDescription = sectionContent.join('\n').trim();
      }
      
      // Check if this is a new relevant section
      sectionContent = [];
      if (topicSectionPatterns.some(p => p.test(line))) {
        currentSection = 'topic';
      } else if (destinationPatterns.some(p => p.test(line))) {
        currentSection = 'destination';
      } else {
        currentSection = '';
      }
    } else if (currentSection) {
      sectionContent.push(line);
    }
  }

  // Handle last section
  if (currentSection === 'topic' && sectionContent.length > 0 && !topicDescription) {
    topicDescription = sectionContent.join('\n').trim();
  } else if (currentSection === 'destination' && sectionContent.length > 0 && !destinationDescription) {
    destinationDescription = sectionContent.join('\n').trim();
  }

  // Alternative: Try to find by content patterns if section headers not found
  if (!topicDescription) {
    // Look for "Expected Outcome" followed by "Scope" pattern
    const expectedOutcomeMatch = markdown.match(/expected\s*outcome[s]?\s*[:\n]/i);
    const scopeMatch = markdown.match(/scope\s*[:\n]/i);
    
    if (expectedOutcomeMatch && scopeMatch) {
      const startIdx = expectedOutcomeMatch.index! + expectedOutcomeMatch[0].length;
      // Find the next major section (Budget, Eligibility, etc.)
      const endPatterns = [/\n#+\s*(budget|eligibility|legal|call|conditions|documents)/i, /\n---/];
      let endIdx = markdown.length;
      
      for (const pattern of endPatterns) {
        const match = markdown.substring(startIdx).match(pattern);
        if (match && match.index !== undefined) {
          const potentialEnd = startIdx + match.index;
          if (potentialEnd < endIdx) {
            endIdx = potentialEnd;
          }
        }
      }
      
      topicDescription = markdown.substring(startIdx, endIdx).trim();
    }
  }

  // Try to find destination by looking for "Destination X - Name" pattern
  if (!destinationDescription) {
    const destMatch = markdown.match(/destination\s*[\d\w]+\s*[-–:]\s*[^\n]+/i);
    if (destMatch) {
      const startIdx = destMatch.index!;
      // Find where this section ends
      const nextMajorSection = markdown.substring(startIdx + destMatch[0].length).match(/\n#+\s/);
      const endIdx = nextMajorSection 
        ? startIdx + destMatch[0].length + nextMajorSection.index! 
        : Math.min(startIdx + 2000, markdown.length);
      
      destinationDescription = markdown.substring(startIdx, endIdx).trim();
    }
  }

  // Clean up extracted content
  if (topicDescription) {
    topicDescription = cleanExtractedContent(topicDescription);
  }
  if (destinationDescription) {
    destinationDescription = cleanExtractedContent(destinationDescription);
  }

  return { topicDescription, destinationDescription };
}

function cleanExtractedContent(content: string): string {
  // Remove excessive whitespace and normalize
  let cleaned = content
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+|\s+$/g, '')
    .trim();
  
  // Limit to reasonable length (roughly 10000 chars)
  if (cleaned.length > 10000) {
    cleaned = cleaned.substring(0, 10000) + '...';
  }
  
  return cleaned;
}
