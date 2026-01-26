import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Try multiple logo sources for an organization
async function fetchLogoFromSources(organisationName: string, shortName?: string): Promise<string | null> {
  const cleanName = organisationName.trim();
  const cleanShortName = shortName?.trim();
  
  // Build list of domains to try
  const domainsToTry: string[] = [];
  
  // If short name provided, try it first (most reliable)
  if (cleanShortName) {
    const shortDomain = guessDomainFromName(cleanShortName);
    if (shortDomain) domainsToTry.push(shortDomain);
    // Also try .fi for Finnish orgs
    domainsToTry.push(`${cleanShortName.toLowerCase()}.fi`);
  }
  
  // Try full name
  const fullDomain = guessDomainFromName(cleanName);
  if (fullDomain) domainsToTry.push(fullDomain);
  
  // Remove duplicates
  const uniqueDomains = [...new Set(domainsToTry)];
  
  console.log('Trying domains:', uniqueDomains);
  
  for (const domain of uniqueDomains) {
    // Try Google favicon (more reliable than Clearbit)
    const googleFaviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
    try {
      const response = await fetch(googleFaviconUrl);
      if (response.ok) {
        // Check if it's not the default globe icon (very small)
        const blob = await response.blob();
        if (blob.size > 500) { // Real logos are usually bigger
          console.log('Found logo via Google favicon:', domain);
          return googleFaviconUrl;
        }
      }
    } catch (e) {
      console.log('Google favicon failed for', domain, ':', e);
    }
  }
  
  return null;
}

// Guess domain from organization name
function guessDomainFromName(name: string): string | null {
  // Known organization mappings
  const knownDomains: Record<string, string> = {
    'sitra': 'sitra.fi',
    'luke': 'luke.fi',
    'luonnonvarakeskus': 'luke.fi',
    'vtt': 'vttresearch.com',
    'aalto': 'aalto.fi',
    'helsinki': 'helsinki.fi',
    'tampere': 'tuni.fi',
    'oulu': 'oulu.fi',
    'turku': 'utu.fi',
    'jyväskylä': 'jyu.fi',
    'eth': 'ethz.ch',
    'epfl': 'epfl.ch',
    'max planck': 'mpg.de',
    'fraunhofer': 'fraunhofer.de',
    'cnrs': 'cnrs.fr',
    'csic': 'csic.es',
    'tno': 'tno.nl',
    'sintef': 'sintef.no',
    'dtu': 'dtu.dk',
    'kth': 'kth.se',
  };
  
  const lowerName = name.toLowerCase();
  
  // Check for known domains first
  for (const [pattern, domain] of Object.entries(knownDomains)) {
    if (lowerName.includes(pattern) || lowerName === pattern) {
      return domain;
    }
  }
  
  // Common academic/research domain patterns
  const academicPatterns: Record<string, string> = {
    'university': '.edu',
    'università': '.it',
    'universität': '.de',
    'université': '.fr',
    'universidad': '.es',
    'universiteit': '.nl',
    'politecnico': '.it',
  };
  
  // Check for academic patterns
  for (const [pattern, tld] of Object.entries(academicPatterns)) {
    if (lowerName.includes(pattern)) {
      const cleanedName = name
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .slice(0, 2)
        .join('');
      return cleanedName + tld;
    }
  }
  
  // Try constructing a simple domain
  const simpleName = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(word => !['the', 'of', 'and', 'for', 'in', 'a', 'an'].includes(word))
    .slice(0, 1)
    .join('');
  
  if (simpleName.length >= 3) {
    return `${simpleName}.com`;
  }
  
  return null;
}

// Convert image to pure black and white (crop empty space, light grey → white)
async function convertToBlackAndWhite(imageUrl: string): Promise<string> {
  try {
    // Fetch the original image first
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error('Failed to fetch image');
    }
    
    const imageBuffer = await response.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));
    const contentType = response.headers.get('content-type') || 'image/png';
    const imageDataUrl = `data:${contentType};base64,${base64}`;
    
    // Use Lovable AI to crop and convert to pure black and white
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.log('LOVABLE_API_KEY not available, returning original');
      return imageDataUrl;
    }
    
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Process this logo image: 1) CROP to remove all empty/white space around the logo, keeping only the logo itself with minimal padding. 2) Convert to pure black and white only - no grey tones. IMPORTANT: Mid-grey and light grey pixels should become WHITE (#FFFFFF), only dark colors should become BLACK (#000000). The threshold should be low so only truly dark elements become black. Keep the logo sharp and clean. Return only the processed image."
              },
              {
                type: "image_url",
                image_url: {
                  url: imageDataUrl
                }
              }
            ]
          }
        ],
        modalities: ["image", "text"]
      })
    });
    
    if (!aiResponse.ok) {
      console.log('AI conversion failed, returning original');
      return imageDataUrl;
    }
    
    const aiData = await aiResponse.json();
    const convertedImageUrl = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    
    if (convertedImageUrl) {
      console.log('Successfully cropped and converted logo to black and white');
      return convertedImageUrl;
    }
    
    return imageDataUrl;
  } catch (e) {
    console.error('Black and white conversion error:', e);
    throw e;
  }
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { organisationName, shortName, convertToGray = true } = await req.json();
    
    if (!organisationName) {
      return new Response(
        JSON.stringify({ error: 'Organisation name is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('Fetching logo for:', organisationName, 'short:', shortName);
    
    // Try to find a logo
    const logoUrl = await fetchLogoFromSources(organisationName, shortName);
    
    if (!logoUrl) {
      return new Response(
        JSON.stringify({ logoUrl: null, message: 'No logo found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('Found logo:', logoUrl);
    
    // If grayscale conversion requested, fetch and convert
    if (convertToGray) {
      try {
        const bwDataUrl = await convertToBlackAndWhite(logoUrl);
        return new Response(
          JSON.stringify({ logoUrl: bwDataUrl, originalUrl: logoUrl, isBlackAndWhite: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (e) {
        // Fall back to original if conversion fails
        console.log('Grayscale conversion failed, returning original:', e);
      }
    }
    
    return new Response(
      JSON.stringify({ logoUrl, isGrayscale: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error: unknown) {
    console.error('Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch logo';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
