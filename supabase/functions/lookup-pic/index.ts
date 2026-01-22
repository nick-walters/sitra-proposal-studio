import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OrganisationInfo {
  picNumber: string;
  legalName: string;
  shortName?: string;
  country: string;
  countryCode: string;
  legalEntityType?: string;
  isSme: boolean;
  organisationCategory?: 'RES' | 'UNI' | 'IND' | 'SME' | 'NGO' | 'CSO' | 'PUB' | 'INT' | 'OTH';
}

function mapLegalEntityToCategory(legalEntityType?: string, isSme?: boolean): 'RES' | 'UNI' | 'IND' | 'SME' | 'NGO' | 'CSO' | 'PUB' | 'INT' | 'OTH' {
  if (!legalEntityType) return 'OTH';
  const type = legalEntityType.toLowerCase();
  if (isSme && (type.includes('private') || type.includes('prc'))) return 'SME';
  if (type.includes('public') || type.includes('government') || type.includes('pub')) return 'PUB';
  if (type.includes('university') || type.includes('higher education') || type.includes('hes')) return 'UNI';
  if (type.includes('research') || type.includes('rto') || type.includes('rec')) return 'RES';
  if (type.includes('private') || type.includes('prc')) return isSme ? 'SME' : 'IND';
  if (type.includes('ngo') || type.includes('non-profit')) return 'NGO';
  return 'OTH';
}

const COUNTRY_NAMES: Record<string, string> = {
  'AT': 'Austria', 'BE': 'Belgium', 'BG': 'Bulgaria', 'CY': 'Cyprus', 'CZ': 'Czech Republic',
  'DE': 'Germany', 'DK': 'Denmark', 'EE': 'Estonia', 'ES': 'Spain', 'FI': 'Finland',
  'FR': 'France', 'GR': 'Greece', 'HR': 'Croatia', 'HU': 'Hungary', 'IE': 'Ireland',
  'IT': 'Italy', 'LT': 'Lithuania', 'LU': 'Luxembourg', 'LV': 'Latvia', 'MT': 'Malta',
  'NL': 'Netherlands', 'PL': 'Poland', 'PT': 'Portugal', 'RO': 'Romania', 'SE': 'Sweden',
  'SI': 'Slovenia', 'SK': 'Slovakia', 'NO': 'Norway', 'CH': 'Switzerland', 'UK': 'United Kingdom',
  'GB': 'United Kingdom', 'IL': 'Israel', 'TR': 'Turkey', 'IS': 'Iceland',
};

// Search database
async function searchDatabase(supabase: any, searchTerm: string): Promise<OrganisationInfo[]> {
  const results: OrganisationInfo[] = [];
  try {
    const { data: participants } = await supabase
      .from('participants')
      .select('*')
      .or(`organisation_name.ilike.%${searchTerm}%,organisation_short_name.ilike.%${searchTerm}%,english_name.ilike.%${searchTerm}%,pic_number.eq.${searchTerm}`)
      .limit(15);
    
    for (const p of participants || []) {
      if (p.pic_number || p.organisation_name) {
        results.push({
          picNumber: p.pic_number || '',
          legalName: p.english_name || p.organisation_name,
          shortName: p.organisation_short_name,
          country: COUNTRY_NAMES[p.country] || p.country || '',
          countryCode: p.country || '',
          legalEntityType: p.legal_entity_type,
          isSme: p.is_sme || false,
          organisationCategory: p.organisation_category || mapLegalEntityToCategory(p.legal_entity_type, p.is_sme),
        });
      }
    }
  } catch (error) {
    console.error('Database search error:', error);
  }
  return results;
}

// Lookup specific PIC from CORDIS organisation page
async function lookupPicFromCordis(pic: string): Promise<OrganisationInfo | null> {
  try {
    // Try direct organisation page
    const url = `https://cordis.europa.eu/organisation/rcn/${pic}`;
    console.log(`Trying CORDIS org page: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'text/html',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    
    console.log(`CORDIS page status: ${response.status}`);
    
    if (!response.ok) return null;
    
    const html = await response.text();
    
    // Try to extract organization data from JSON-LD in the page
    const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    if (jsonLdMatch) {
      try {
        const jsonLd = JSON.parse(jsonLdMatch[1]);
        console.log(`Found JSON-LD: ${JSON.stringify(jsonLd).substring(0, 200)}`);
        
        if (jsonLd['@type'] === 'Organization' || jsonLd.name) {
          return {
            picNumber: pic,
            legalName: jsonLd.name || jsonLd.legalName || '',
            country: jsonLd.address?.addressCountry || '',
            countryCode: jsonLd.address?.addressCountry || '',
            isSme: false,
            organisationCategory: 'OTH',
          };
        }
      } catch (e) {
        console.log('Failed to parse JSON-LD');
      }
    }
    
    return null;
  } catch (error) {
    console.error('CORDIS lookup error:', error);
    return null;
  }
}

// Search for organizations - currently limited to database only
// CORDIS APIs require authentication, so we'll rely on building up our database
// as users add organizations
async function searchCordis(searchQuery: string): Promise<OrganisationInfo[]> {
  // CORDIS public APIs currently return 0 results or require auth
  // Will return empty and rely on database results
  console.log(`CORDIS search not available for: ${searchQuery}`);
  return [];
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { picNumber, searchTerm } = await req.json();
    console.log(`Lookup: PIC=${picNumber}, Search=${searchTerm}`);
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const query = picNumber || searchTerm;
    if (!query || query.length < 2) {
      return new Response(
        JSON.stringify({ success: false, error: 'Please provide a search term' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Search database
    const dbResults = await searchDatabase(supabase, query);
    console.log(`DB results: ${dbResults.length}`);
    
    // If searching by PIC and not found in DB, try CORDIS page
    const isNumeric = /^\d{6,12}$/.test(query.trim());
    let cordisResult: OrganisationInfo | null = null;
    
    if (isNumeric && dbResults.length === 0) {
      cordisResult = await lookupPicFromCordis(query.trim());
      if (cordisResult) {
        console.log(`Found in CORDIS: ${cordisResult.legalName}`);
      }
    }
    
    // Combine results
    const allResults = [...dbResults];
    if (cordisResult) {
      allResults.push(cordisResult);
    }
    
    // Deduplicate by PIC
    const seen = new Set<string>();
    const uniqueResults: OrganisationInfo[] = [];
    
    for (const org of allResults) {
      const key = org.picNumber || org.legalName.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        uniqueResults.push(org);
      }
    }
    
    // For direct PIC lookup, return single organisation
    if (picNumber) {
      const cleanPic = picNumber.replace(/\D/g, '');
      const match = uniqueResults.find(o => o.picNumber === cleanPic);
      if (match) {
        return new Response(
          JSON.stringify({ success: true, organisation: match }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'PIC not found',
          message: 'This PIC was not found in available databases. The organisation may not have participated in EU projects yet, or you may need to enter details manually.',
          suggestManualEntry: true 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        results: uniqueResults.slice(0, 20),
        note: uniqueResults.length === 0 ? 'No results found. Try a different search term or enter details manually.' : undefined
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
