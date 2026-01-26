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

// Convert image to grayscale using canvas
async function convertToGrayscale(imageUrl: string): Promise<string> {
  try {
    // Fetch the image
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error('Failed to fetch image');
    }
    
    const imageBuffer = await response.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));
    const contentType = response.headers.get('content-type') || 'image/png';
    
    // Return as data URL with grayscale CSS filter hint
    // The actual grayscale will be applied via CSS on the frontend
    return `data:${contentType};base64,${base64}`;
  } catch (e) {
    console.error('Grayscale conversion error:', e);
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
        const grayscaleDataUrl = await convertToGrayscale(logoUrl);
        return new Response(
          JSON.stringify({ logoUrl: grayscaleDataUrl, originalUrl: logoUrl, isGrayscale: true }),
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
