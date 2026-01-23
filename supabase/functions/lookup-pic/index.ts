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

// Scrape CORDIS organisation page directly using Firecrawl
async function lookupPicFromCordis(pic: string): Promise<OrganisationInfo | null> {
  const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
  if (!apiKey) {
    console.error('FIRECRAWL_API_KEY not configured');
    return null;
  }
  
  try {
    const url = `https://cordis.europa.eu/organisation/id/${pic}/en`;
    console.log(`Scraping CORDIS organisation page: ${url}`);
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
        onlyMainContent: true,
        waitFor: 2000,
      }),
    });
    
    if (!response.ok) {
      console.error(`Firecrawl scrape error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    const content = data.data?.markdown || data.markdown || '';
    
    // Check for 404 or error page
    if (!content || content.length < 100 || 
        content.includes('Page not found') || 
        content.includes('Page not available') ||
        content.includes('Error [404]') ||
        content.includes('Error 404')) {
      console.log('CORDIS organisation page not found (404)');
      return null;
    }
    
    // Parse the organisation details
    const lines = content.split('\n').filter((line: string) => line.trim());
    let legalName = '';
    let country = '';
    let countryCode = '';
    let organisationType = '';
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('![') || trimmed.startsWith('[') || 
          trimmed.includes('europa.eu') || trimmed.includes('CORDIS') ||
          trimmed.length < 5 || trimmed.length > 300) continue;
      
      if (trimmed.startsWith('#') && !legalName) {
        const name = trimmed.replace(/^#+\s*/, '');
        if (name.length > 3 && !name.toLowerCase().includes('organisation')) {
          legalName = name;
          continue;
        }
      }
      
      if (trimmed.toLowerCase().includes('country')) {
        const match = trimmed.match(/country[:\s]+([A-Za-z\s]+)/i);
        if (match) {
          const countryText = match[1].trim();
          for (const [code, name] of Object.entries(COUNTRY_NAMES)) {
            if (countryText.toLowerCase() === name.toLowerCase()) {
              country = name;
              countryCode = code;
              break;
            }
          }
        }
      }
      
      if (trimmed.toLowerCase().includes('type')) {
        const match = trimmed.match(/(?:type|activity type)[:\s]+(.+)/i);
        if (match) organisationType = match[1].trim();
      }
    }
    
    if (!legalName) {
      for (const line of lines.slice(0, 20)) {
        const trimmed = line.replace(/[#*_\[\]]/g, '').trim();
        if (trimmed.length > 10 && trimmed.length < 200 &&
            !trimmed.includes('|') && !trimmed.includes('europa') &&
            /^[A-Z]/.test(trimmed)) {
          legalName = trimmed;
          break;
        }
      }
    }
    
    if (!country) {
      for (const [code, name] of Object.entries(COUNTRY_NAMES)) {
        if (new RegExp(`\\b${name}\\b`, 'i').test(content)) {
          country = name;
          countryCode = code;
          break;
        }
      }
    }
    
    let organisationCategory: OrganisationInfo['organisationCategory'] = 'OTH';
    let isSme = false;
    const typeCheck = (organisationType + ' ' + content).toLowerCase();
    
    if (typeCheck.includes('hes') || typeCheck.includes('higher education')) {
      organisationCategory = 'UNI';
    } else if (typeCheck.includes('rec') || typeCheck.includes('research organisation')) {
      organisationCategory = 'RES';
    } else if (typeCheck.includes('pub') || typeCheck.includes('public body')) {
      organisationCategory = 'PUB';
    } else if (typeCheck.includes('sme')) {
      organisationCategory = 'SME';
      isSme = true;
    } else if (typeCheck.includes('prc') || typeCheck.includes('private')) {
      organisationCategory = 'IND';
    }
    
    if (!legalName) return null;
    
    console.log(`CORDIS found: ${legalName} | ${country} | ${organisationCategory}`);
    return { picNumber: pic, legalName, country, countryCode, isSme, organisationCategory };
  } catch (error) {
    console.error('CORDIS scrape error:', error);
    return null;
  }
}

// Fallback: Try scraping EC Funding & Tenders participant info page
async function lookupFromECPortal(pic: string): Promise<OrganisationInfo | null> {
  const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
  if (!apiKey) return null;
  
  try {
    // Try multiple search strategies
    const searchQueries = [
      `site:ec.europa.eu "${pic}" organisation legal name`,
      `"PIC ${pic}" EU funding tenders participant`,
    ];
    
    for (const query of searchQueries) {
      console.log(`Searching: ${query}`);
      
      const response = await fetch('https://api.firecrawl.dev/v1/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          limit: 3,
          scrapeOptions: { formats: ['markdown'] },
        }),
      });
      
      if (!response.ok) {
        console.error(`Search error: ${response.status}`);
        continue;
      }
      
      const data = await response.json();
      const results = data.data || [];
      
      for (const result of results) {
        const content = result.markdown || '';
        const title = result.title || '';
        const url = result.url || '';
        
        // Skip if PIC not mentioned in content
        if (!content.includes(pic)) continue;
        
        // Skip EC general pages, not org-specific
        if (url.includes('/opportunities/') && !url.includes('participant')) continue;
        
        // Try to extract org name - look for patterns near PIC mention
        const picIndex = content.indexOf(pic);
        const contextStart = Math.max(0, picIndex - 500);
        const contextEnd = Math.min(content.length, picIndex + 500);
        const context = content.substring(contextStart, contextEnd);
        
        let legalName = '';
        let country = '';
        let countryCode = '';
        
        // Pattern: "Legal Name: XYZ" or "Organisation: XYZ" or "Name: XYZ"
        const namePatterns = [
          /(?:legal name|organisation name|company name|name)[:\s]+([A-Z][^\n|,]{3,100})/i,
          /\*\*([A-Z][^*\n]{3,80})\*\*/,  // Bold text often contains org name
        ];
        
        for (const pattern of namePatterns) {
          const match = context.match(pattern);
          if (match && match[1].length > 5 && match[1].length < 100) {
            const candidate = match[1].trim();
            // Skip if it's a generic term
            if (!candidate.toLowerCase().includes('participant') &&
                !candidate.toLowerCase().includes('commission') &&
                !candidate.toLowerCase().includes('funding')) {
              legalName = candidate;
              break;
            }
          }
        }
        
        // Find country
        for (const [code, name] of Object.entries(COUNTRY_NAMES)) {
          if (new RegExp(`\\b${name}\\b`, 'i').test(context)) {
            country = name;
            countryCode = code;
            break;
          }
        }
        
        if (legalName) {
          console.log(`EC Portal found: ${legalName} | ${country}`);
          return {
            picNumber: pic,
            legalName,
            country,
            countryCode,
            isSme: false,
            organisationCategory: 'OTH',
          };
        }
      }
    }
    
    console.log('EC Portal search did not find usable organisation info');
    return null;
  } catch (error) {
    console.error('EC Portal search error:', error);
    return null;
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
    
    // Step 2: If searching by PIC and no DB results, try CORDIS search
    const isNumericPic = /^\d{9}$/.test(query.trim());
    let cordisResult: OrganisationInfo | null = null;
    
    if (isNumericPic && dbResults.length === 0) {
      // Try CORDIS first (for orgs that have participated in EU projects)
      cordisResult = await lookupPicFromCordis(query.trim());
      console.log(`CORDIS result: ${cordisResult ? 'found' : 'not found'}`);
      
      // If CORDIS has no data, try EC Portal search as fallback
      if (!cordisResult) {
        cordisResult = await lookupFromECPortal(query.trim());
        console.log(`EC Portal result: ${cordisResult ? 'found' : 'not found'}`);
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
