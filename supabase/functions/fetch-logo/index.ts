import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { Image } from 'https://deno.land/x/imagescript@1.3.0/mod.ts';

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

// Crop empty space around the logo
async function cropEmptySpace(imageBuffer: ArrayBuffer): Promise<Uint8Array> {
  try {
    const image = await Image.decode(new Uint8Array(imageBuffer));
    
    const width = image.width;
    const height = image.height;
    
    // Find bounds of non-empty pixels
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    
    // Threshold for considering a pixel as "empty" (white or transparent)
    // imagescript uses RGBA format where getPixelAt returns a 32-bit integer
    // The format is: RRGGBBAA
    const isEmptyPixel = (pixel: number): boolean => {
      const r = (pixel >> 24) & 0xFF;
      const g = (pixel >> 16) & 0xFF;
      const b = (pixel >> 8) & 0xFF;
      const a = pixel & 0xFF;
      
      // Consider transparent pixels as empty
      if (a < 10) return true;
      // Consider near-white pixels as empty (for white backgrounds)
      if (r > 245 && g > 245 && b > 245) return true;
      return false;
    };
    
    // Scan all pixels to find content bounds
    for (let y = 1; y <= height; y++) {
      for (let x = 1; x <= width; x++) {
        const pixel = image.getPixelAt(x, y); // 1-indexed in imagescript
        
        if (!isEmptyPixel(pixel)) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }
    
    // If no content found, return original
    if (minX > maxX || minY > maxY) {
      console.log('No content bounds found, returning original');
      return await image.encode();
    }
    
    // Add small padding (2px)
    const padding = 2;
    minX = Math.max(1, minX - padding);
    minY = Math.max(1, minY - padding);
    maxX = Math.min(width, maxX + padding);
    maxY = Math.min(height, maxY + padding);
    
    const cropWidth = maxX - minX + 1;
    const cropHeight = maxY - minY + 1;
    
    console.log(`Cropping from ${width}x${height} to ${cropWidth}x${cropHeight} (bounds: ${minX},${minY} to ${maxX},${maxY})`);
    
    // Crop the image (1-indexed)
    const cropped = image.crop(minX, minY, cropWidth, cropHeight);
    
    return await cropped.encode();
  } catch (e) {
    console.error('Crop error:', e);
    // Return original if cropping fails
    return new Uint8Array(imageBuffer);
  }
}

// Fetch and process logo (crop empty space)
async function fetchAndProcessLogo(imageUrl: string): Promise<string> {
  const response = await fetch(imageUrl, {
    headers: { 'Cache-Control': 'no-cache' }
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch image');
  }
  
  const imageBuffer = await response.arrayBuffer();
  
  // Crop empty space
  const croppedImage = await cropEmptySpace(imageBuffer);
  
  // Convert to base64 data URL
  const base64 = btoa(String.fromCharCode(...croppedImage));
  
  return `data:image/png;base64,${base64}`;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { organisationName, shortName } = await req.json();
    
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
    
    // Fetch, crop, and return as data URL
    try {
      const processedDataUrl = await fetchAndProcessLogo(logoUrl);
      console.log('Logo processed and cropped successfully');
      return new Response(
        JSON.stringify({ logoUrl: processedDataUrl, originalUrl: logoUrl, cropped: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (e) {
      console.log('Processing failed, returning original URL:', e);
      return new Response(
        JSON.stringify({ logoUrl, cropped: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
  } catch (error: unknown) {
    console.error('Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch logo';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
