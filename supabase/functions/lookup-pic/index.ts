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

const COUNTRY_CODES: Record<string, string> = Object.fromEntries(
  Object.entries(COUNTRY_NAMES).map(([code, name]) => [name.toLowerCase(), code])
);

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

// Parse organisation info from Firecrawl search results
function parseOrganisationFromSearchResult(content: string, query: string): OrganisationInfo | null {
  try {
    console.log('Parsing content for organisation info...');
    
    // Try to extract PIC number (9 digits)
    const picMatch = content.match(/\b(\d{9})\b/);
    const pic = picMatch ? picMatch[1] : '';
    
    // If we're searching by PIC and found a different one, this isn't a match
    if (/^\d{9}$/.test(query) && pic && pic !== query) {
      return null;
    }
    
    // Extract organisation name - look for patterns like "Legal Name:" or organisation names near PIC
    let legalName = '';
    const legalNamePatterns = [
      /legal\s*name[:\s]+([^\n,]+)/i,
      /organisation[:\s]+([^\n,]+)/i,
      /organization[:\s]+([^\n,]+)/i,
      /name[:\s]+([^\n,]+)/i,
    ];
    
    for (const pattern of legalNamePatterns) {
      const match = content.match(pattern);
      if (match && match[1].trim().length > 2) {
        legalName = match[1].trim();
        break;
      }
    }
    
    // Extract country
    let country = '';
    let countryCode = '';
    
    // Check for country codes or names
    for (const [code, name] of Object.entries(COUNTRY_NAMES)) {
      if (content.toLowerCase().includes(name.toLowerCase())) {
        country = name;
        countryCode = code;
        break;
      }
      if (new RegExp(`\\b${code}\\b`).test(content)) {
        country = name;
        countryCode = code;
        break;
      }
    }
    
    // Determine organisation type
    let isSme = content.toLowerCase().includes('sme') || content.toLowerCase().includes('small and medium');
    let organisationCategory: OrganisationInfo['organisationCategory'] = 'OTH';
    
    if (content.toLowerCase().includes('university') || content.toLowerCase().includes('higher education')) {
      organisationCategory = 'UNI';
    } else if (content.toLowerCase().includes('research') || content.toLowerCase().includes('institute')) {
      organisationCategory = 'RES';
    } else if (content.toLowerCase().includes('public body') || content.toLowerCase().includes('government')) {
      organisationCategory = 'PUB';
    } else if (isSme) {
      organisationCategory = 'SME';
    }
    
    // Only return if we have meaningful data
    if (!pic && !legalName) {
      return null;
    }
    
    return {
      picNumber: pic || query,
      legalName: legalName || `Organisation (${query})`,
      country,
      countryCode,
      isSme,
      organisationCategory,
    };
  } catch (error) {
    console.error('Error parsing organisation info:', error);
    return null;
  }
}

// Search using Firecrawl web search
async function searchWithFirecrawl(query: string): Promise<OrganisationInfo[]> {
  const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
  if (!apiKey) {
    console.error('FIRECRAWL_API_KEY not configured');
    return [];
  }
  
  try {
    // Search for EU participant register data
    const searchQuery = `EU participant register ${query} PIC number`;
    console.log(`Firecrawl search: "${searchQuery}"`);
    
    const response = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: searchQuery,
        limit: 5,
        scrapeOptions: {
          formats: ['markdown'],
        },
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Firecrawl API error: ${response.status} - ${errorText}`);
      return [];
    }
    
    const data = await response.json();
    console.log(`Firecrawl returned ${data.data?.length || 0} results`);
    
    const results: OrganisationInfo[] = [];
    
    for (const result of data.data || []) {
      // Combine title, description, and markdown content
      const content = [
        result.title || '',
        result.description || '',
        result.markdown || '',
      ].join('\n');
      
      const org = parseOrganisationFromSearchResult(content, query);
      if (org) {
        results.push(org);
      }
    }
    
    return results;
  } catch (error) {
    console.error('Firecrawl search error:', error);
    return [];
  }
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

    // Step 1: Search local database first
    const dbResults = await searchDatabase(supabase, query);
    console.log(`DB results: ${dbResults.length}`);
    
    // Step 2: If no results, try Firecrawl web search
    let firecrawlResults: OrganisationInfo[] = [];
    if (dbResults.length === 0) {
      firecrawlResults = await searchWithFirecrawl(query.trim());
      console.log(`Firecrawl results: ${firecrawlResults.length}`);
    }
    
    // Combine results
    const allResults = [...dbResults, ...firecrawlResults];
    
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
