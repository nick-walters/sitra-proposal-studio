import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

// Try multiple logo sources for an organization - always fresh, no caching
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
  
  // Add cache-busting timestamp
  const cacheBuster = Date.now();
  
  console.log('Trying domains (fresh fetch):', uniqueDomains, 'timestamp:', cacheBuster);
  
  for (const domain of uniqueDomains) {
    // Try multiple logo APIs in order of quality
    
    // 1. Try Logo.dev API (high quality, free tier available)
    try {
      const logoDevUrl = `https://img.logo.dev/${domain}?token=pk_X-1ZO13GSgeOoUrIuJ6GMQ&size=200&format=png`;
      const response = await fetch(logoDevUrl, {
        headers: { 'Cache-Control': 'no-cache' }
      });
      if (response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType?.startsWith('image/')) {
          const blob = await response.blob();
          if (blob.size > 1000) { // Real logos are usually bigger than 1KB
            console.log('Found logo via Logo.dev:', domain);
            return logoDevUrl;
          }
        }
      }
    } catch (e) {
      console.log('Logo.dev failed for', domain, ':', e);
    }
    
    // 2. Try Brandfetch (another high-quality source)
    try {
      const brandfetchUrl = `https://cdn.brandfetch.io/${domain}/w/400/h/400?c=${cacheBuster}`;
      const response = await fetch(brandfetchUrl, {
        headers: { 'Cache-Control': 'no-cache' }
      });
      if (response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType?.startsWith('image/')) {
          const blob = await response.blob();
          if (blob.size > 1000) {
            console.log('Found logo via Brandfetch:', domain);
            return brandfetchUrl;
          }
        }
      }
    } catch (e) {
      console.log('Brandfetch failed for', domain, ':', e);
    }
    
    // 3. Fallback to Google favicon (last resort, low quality)
    try {
      const googleFaviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
      const response = await fetch(googleFaviconUrl, {
        headers: { 'Cache-Control': 'no-cache' }
      });
      if (response.ok) {
        const blob = await response.blob();
        if (blob.size > 500) {
          console.log('Found logo via Google favicon (fallback):', domain);
          return googleFaviconUrl;
        }
      }
    } catch (e) {
      console.log('Google favicon failed for', domain, ':', e);
    }
  }
  
  return null;
}

// Convert image to grayscale data URL
async function convertToGrayscale(imageUrl: string): Promise<string> {
  try {
    const response = await fetch(imageUrl, {
      headers: { 'Cache-Control': 'no-cache' }
    });
    if (!response.ok) {
      throw new Error('Failed to fetch image');
    }
    
    const imageBuffer = await response.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));
    const contentType = response.headers.get('content-type') || 'image/png';
    
    // Return as data URL - grayscale will be applied via CSS on the frontend
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
    
    // Try to find a logo - always fresh fetch
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
