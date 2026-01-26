import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Try multiple logo sources for an organization
async function fetchLogoFromSources(organisationName: string): Promise<string | null> {
  const cleanName = organisationName.trim();
  
  // Try Clearbit Logo API (free, no auth needed)
  const domain = guessDomainFromName(cleanName);
  if (domain) {
    const clearbitUrl = `https://logo.clearbit.com/${domain}`;
    try {
      const response = await fetch(clearbitUrl, { method: 'HEAD' });
      if (response.ok) {
        return clearbitUrl;
      }
    } catch (e) {
      console.log('Clearbit failed:', e);
    }
  }
  
  // Try Google favicon as fallback
  if (domain) {
    const googleFaviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
    try {
      const response = await fetch(googleFaviconUrl, { method: 'HEAD' });
      if (response.ok) {
        return googleFaviconUrl;
      }
    } catch (e) {
      console.log('Google favicon failed:', e);
    }
  }
  
  return null;
}

// Guess domain from organization name
function guessDomainFromName(name: string): string | null {
  // Common academic/research domains
  const academicPatterns: Record<string, string> = {
    'university': '.edu',
    'università': '.it',
    'universität': '.de',
    'université': '.fr',
    'universidad': '.es',
    'universiteit': '.nl',
    'politecnico': '.it',
    'eth': 'ethz.ch',
    'epfl': 'epfl.ch',
    'max planck': 'mpg.de',
    'fraunhofer': 'fraunhofer.de',
    'cnrs': 'cnrs.fr',
    'csic': 'csic.es',
    'vtt': 'vtt.fi',
    'tno': 'tno.nl',
    'sintef': 'sintef.no',
    'dtu': 'dtu.dk',
    'kth': 'kth.se',
    'aalto': 'aalto.fi',
    'sitra': 'sitra.fi',
  };
  
  const lowerName = name.toLowerCase();
  
  // Check for known patterns
  for (const [pattern, domain] of Object.entries(academicPatterns)) {
    if (lowerName.includes(pattern)) {
      if (domain.startsWith('.')) {
        // It's a TLD hint, construct domain from name
        const cleanedName = name
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, '')
          .split(/\s+/)
          .slice(0, 2)
          .join('');
        return cleanedName + domain;
      }
      return domain;
    }
  }
  
  // Try constructing a simple domain
  const simpleName = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(word => !['the', 'of', 'and', 'for', 'in', 'a', 'an'].includes(word))
    .slice(0, 2)
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
    const { organisationName, convertToGray = true } = await req.json();
    
    if (!organisationName) {
      return new Response(
        JSON.stringify({ error: 'Organisation name is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('Fetching logo for:', organisationName);
    
    // Try to find a logo
    const logoUrl = await fetchLogoFromSources(organisationName);
    
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
