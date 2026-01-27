import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { Image } from 'https://deno.land/x/imagescript@1.3.0/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Extensive known organization domain mappings
const knownDomains: Record<string, string> = {
  // Finnish organizations
  'sitra': 'sitra.fi',
  'luke': 'luke.fi',
  'luonnonvarakeskus': 'luke.fi',
  'vtt': 'vttresearch.com',
  'aalto': 'aalto.fi',
  'helsingin yliopisto': 'helsinki.fi',
  'helsinki': 'helsinki.fi',
  'uhel': 'helsinki.fi',
  'tampere': 'tuni.fi',
  'oulu': 'oulu.fi',
  'turku': 'utu.fi',
  'jyväskylä': 'jyu.fi',
  'itä-suomen': 'uef.fi',
  'uef': 'uef.fi',
  'lappeenranta': 'lut.fi',
  'lut': 'lut.fi',
  'åbo akademi': 'abo.fi',
  'syke': 'syke.fi',
  'ilmatieteen laitos': 'fmi.fi',
  'fmi': 'fmi.fi',
  'gtk': 'gtk.fi',
  'ttl': 'ttl.fi',
  'thl': 'thl.fi',
  
  // Swedish organizations
  'kth': 'kth.se',
  'kungliga tekniska': 'kth.se',
  'chalmers': 'chalmers.se',
  'lund': 'lu.se',
  'uppsala': 'uu.se',
  'stockholm': 'su.se',
  'göteborgs': 'gu.se',
  'karolinska': 'ki.se',
  'linköping': 'liu.se',
  'rise': 'ri.se',
  
  // German organizations
  'fraunhofer': 'fraunhofer.de',
  'max planck': 'mpg.de',
  'mpg': 'mpg.de',
  'helmholtz': 'helmholtz.de',
  'leibniz': 'leibniz-gemeinschaft.de',
  'dlr': 'dlr.de',
  'tu münchen': 'tum.de',
  'tum': 'tum.de',
  'rwth': 'rwth-aachen.de',
  'tu berlin': 'tu-berlin.de',
  'tu dresden': 'tu-dresden.de',
  'karlsruhe': 'kit.edu',
  'kit': 'kit.edu',
  
  // Swiss organizations
  'eth': 'ethz.ch',
  'ethz': 'ethz.ch',
  'epfl': 'epfl.ch',
  'empa': 'empa.ch',
  'psi': 'psi.ch',
  
  // French organizations
  'cnrs': 'cnrs.fr',
  'inria': 'inria.fr',
  'cea': 'cea.fr',
  'inserm': 'inserm.fr',
  'inrae': 'inrae.fr',
  'ifremer': 'ifremer.fr',
  'cnes': 'cnes.fr',
  'onera': 'onera.fr',
  'sorbonne': 'sorbonne-universite.fr',
  'polytechnique': 'polytechnique.edu',
  
  // Spanish organizations
  'csic': 'csic.es',
  'upc': 'upc.edu',
  'politècnica de catalunya': 'upc.edu',
  'upm': 'upm.es',
  'politécnica de madrid': 'upm.es',
  'barcelona': 'ub.edu',
  
  // Dutch organizations
  'tno': 'tno.nl',
  'tu delft': 'tudelft.nl',
  'delft': 'tudelft.nl',
  'eindhoven': 'tue.nl',
  'tue': 'tue.nl',
  'twente': 'utwente.nl',
  'wageningen': 'wur.nl',
  'wur': 'wur.nl',
  'leiden': 'universiteitleiden.nl',
  'utrecht': 'uu.nl',
  'amsterdam': 'uva.nl',
  
  // Italian organizations
  'cnr': 'cnr.it',
  'consiglio nazionale': 'cnr.it',
  'polimi': 'polimi.it',
  'politecnico di milano': 'polimi.it',
  'politecnico di torino': 'polito.it',
  'polito': 'polito.it',
  'bologna': 'unibo.it',
  'sapienza': 'uniroma1.it',
  'infn': 'infn.it',
  'enea': 'enea.it',
  
  // UK organizations
  'oxford': 'ox.ac.uk',
  'cambridge': 'cam.ac.uk',
  'imperial': 'imperial.ac.uk',
  'ucl': 'ucl.ac.uk',
  'edinburgh': 'ed.ac.uk',
  'manchester': 'manchester.ac.uk',
  'bristol': 'bristol.ac.uk',
  'southampton': 'soton.ac.uk',
  'warwick': 'warwick.ac.uk',
  'nottingham': 'nottingham.ac.uk',
  
  // Danish organizations
  'dtu': 'dtu.dk',
  'copenhagen': 'ku.dk',
  'aarhus': 'au.dk',
  
  // Norwegian organizations
  'sintef': 'sintef.no',
  'ntnu': 'ntnu.no',
  'uio': 'uio.no',
  'oslo': 'uio.no',
  
  // Belgian organizations
  'imec': 'imec.be',
  'ku leuven': 'kuleuven.be',
  'leuven': 'kuleuven.be',
  'vub': 'vub.be',
  'ulb': 'ulb.be',
  'ugent': 'ugent.be',
  'ghent': 'ugent.be',
  
  // Austrian organizations
  'tu wien': 'tuwien.ac.at',
  'wien': 'univie.ac.at',
  'graz': 'tugraz.at',
  
  // Portuguese organizations
  'ist': 'tecnico.ulisboa.pt',
  'técnico': 'tecnico.ulisboa.pt',
  'inesc': 'inesc-id.pt',
  
  // Greek organizations
  'forth': 'forth.gr',
  'ntua': 'ntua.gr',
  'athens': 'ntua.gr',
  
  // Irish organizations
  'trinity': 'tcd.ie',
  'ucd': 'ucd.ie',
  'dublin': 'ucd.ie',
  
  // Polish organizations
  'polish academy': 'pan.pl',
  'pan': 'pan.pl',
  'warsaw': 'pw.edu.pl',
  
  // Czech organizations
  'czech academy': 'cas.cz',
  'cas': 'cas.cz',
  'cvut': 'cvut.cz',
  'prague': 'cvut.cz',
  
  // Israeli organizations
  'technion': 'technion.ac.il',
  'weizmann': 'weizmann.ac.il',
  'hebrew': 'huji.ac.il',
  'tel aviv': 'tau.ac.il',
};

// Guess domain from organization name
function guessDomainFromName(name: string, shortName?: string): string | null {
  const lowerName = name.toLowerCase();
  const lowerShort = shortName?.toLowerCase() || '';
  
  // Check for known domains first - try short name, then full name
  for (const [pattern, domain] of Object.entries(knownDomains)) {
    if (lowerShort === pattern || lowerName.includes(pattern)) {
      return domain;
    }
  }
  
  // Try short name as domain directly with common TLDs
  if (shortName && shortName.length >= 2) {
    const cleanShort = shortName.toLowerCase().replace(/[^a-z0-9]/g, '');
    // Don't return generic .com domains - they're usually wrong
    // Return null to try other approaches
  }
  
  return null;
}

// Try multiple logo sources for an organization - always fresh, no caching
async function fetchLogoFromSources(organisationName: string, shortName?: string): Promise<string | null> {
  const cleanName = organisationName.trim();
  const cleanShortName = shortName?.trim();
  
  // Build list of domains to try
  const domainsToTry: string[] = [];
  
  // Try known domain mapping first (most reliable)
  const knownDomain = guessDomainFromName(cleanName, cleanShortName);
  if (knownDomain) {
    domainsToTry.push(knownDomain);
  }
  
  // Remove duplicates
  const uniqueDomains = [...new Set(domainsToTry)];
  
  // If no known domain found, don't try random .com domains - they're usually wrong
  if (uniqueDomains.length === 0) {
    console.log('No known domain mapping for:', cleanName, cleanShortName);
    return null;
  }
  
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
