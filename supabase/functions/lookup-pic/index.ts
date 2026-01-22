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
  city?: string;
  address?: string;
  legalEntityType?: string;
  isSme: boolean;
  vatNumber?: string;
  registrationNumber?: string;
  organisationCategory?: 'RES' | 'UNI' | 'IND' | 'SME' | 'NGO' | 'CSO' | 'PUB' | 'INT' | 'OTH';
}

// Map legal entity types to organisation categories
function mapLegalEntityToCategory(legalEntityType?: string, isSme?: boolean): 'RES' | 'UNI' | 'IND' | 'SME' | 'NGO' | 'CSO' | 'PUB' | 'INT' | 'OTH' {
  if (!legalEntityType) return 'OTH';
  
  const type = legalEntityType.toLowerCase();
  
  if (isSme && (type.includes('private') || type.includes('enterprise') || type.includes('company') || type.includes('prc'))) {
    return 'SME';
  }
  
  if (type.includes('public') || type.includes('government') || type.includes('authority') || 
      type.includes('ministry') || type.includes('pub') || type.includes('state') ||
      type.includes('municipal') || type.includes('regional') || type.includes('national body')) {
    return 'PUB';
  }
  
  if (type.includes('international') || type.includes('intergovernmental') || type.includes('igo')) {
    return 'INT';
  }
  
  if (type.includes('university') || type.includes('higher education') || 
      type.includes('academic') || type.includes('hen') || type.includes('hes')) {
    return 'UNI';
  }
  
  if (type.includes('research') || type.includes('rto') || type.includes('rec') || 
      type.includes('r&d') || type.includes('scientific')) {
    return 'RES';
  }
  
  if (type.includes('private') || type.includes('enterprise') || type.includes('company') || 
      type.includes('industry') || type.includes('prc') || type.includes('for-profit') ||
      type.includes('commercial')) {
    return isSme ? 'SME' : 'IND';
  }
  
  if (type.includes('civil society') || type.includes('cso')) {
    return 'CSO';
  }
  
  if (type.includes('non-governmental') || type.includes('ngo') || 
      type.includes('non-profit') || type.includes('nonprofit') ||
      (type.includes('foundation') && !type.includes('public'))) {
    return 'NGO';
  }
  
  return 'OTH';
}

// Map country codes to country names
const COUNTRY_NAMES: Record<string, string> = {
  'AT': 'Austria', 'BE': 'Belgium', 'BG': 'Bulgaria', 'HR': 'Croatia', 'CY': 'Cyprus',
  'CZ': 'Czech Republic', 'DK': 'Denmark', 'EE': 'Estonia', 'FI': 'Finland', 'FR': 'France',
  'DE': 'Germany', 'GR': 'Greece', 'HU': 'Hungary', 'IE': 'Ireland', 'IT': 'Italy',
  'LV': 'Latvia', 'LT': 'Lithuania', 'LU': 'Luxembourg', 'MT': 'Malta', 'NL': 'Netherlands',
  'PL': 'Poland', 'PT': 'Portugal', 'RO': 'Romania', 'SK': 'Slovakia', 'SI': 'Slovenia',
  'ES': 'Spain', 'SE': 'Sweden', 'GB': 'United Kingdom', 'UK': 'United Kingdom',
  'NO': 'Norway', 'IS': 'Iceland', 'CH': 'Switzerland', 'IL': 'Israel', 'TR': 'Turkey',
  'UA': 'Ukraine', 'RS': 'Serbia', 'ME': 'Montenegro', 'AL': 'Albania', 'MK': 'North Macedonia',
};

// Search our database of previously added organisations
async function lookupFromDatabase(supabase: any, picNumber: string): Promise<OrganisationInfo | null> {
  try {
    console.log(`Checking database for PIC: ${picNumber}`);
    
    const { data: org, error } = await supabase
      .from('organisations')
      .select('*')
      .eq('pic_number', picNumber)
      .maybeSingle();
    
    if (error) {
      console.error('Database lookup error:', error);
    }
    
    if (org) {
      console.log(`Found in organisations table: ${org.name}`);
      return {
        picNumber: picNumber,
        legalName: org.name,
        shortName: org.short_name,
        country: COUNTRY_NAMES[org.country] || org.country || '',
        countryCode: org.country || '',
        legalEntityType: org.legal_entity_type,
        isSme: org.is_sme || false,
        organisationCategory: mapLegalEntityToCategory(org.legal_entity_type, org.is_sme) as any,
      };
    }
    
    // Also check participants table for previously used PICs
    const { data: participant, error: partError } = await supabase
      .from('participants')
      .select('*')
      .eq('pic_number', picNumber)
      .limit(1)
      .maybeSingle();
    
    if (partError) {
      console.error('Participants lookup error:', partError);
    }
    
    if (participant) {
      console.log(`Found in participants table: ${participant.organisation_name}`);
      return {
        picNumber: picNumber,
        legalName: participant.english_name || participant.organisation_name,
        shortName: participant.organisation_short_name,
        country: COUNTRY_NAMES[participant.country] || participant.country || '',
        countryCode: participant.country || '',
        legalEntityType: participant.legal_entity_type,
        isSme: participant.is_sme || false,
        organisationCategory: participant.organisation_category as any || mapLegalEntityToCategory(participant.legal_entity_type, participant.is_sme),
      };
    }
    
    return null;
  } catch (error) {
    console.error('Database lookup error:', error);
    return null;
  }
}

// Try to fetch from CORDIS project data - search for organizations that participated in projects
async function lookupFromCordis(picNumber: string): Promise<OrganisationInfo | null> {
  // Use project search which has better organization data
  const url = `https://cordis.europa.eu/search/en?q=${picNumber}&format=json`;
  
  try {
    console.log(`Trying CORDIS project search: ${url}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    console.log(`CORDIS status: ${response.status}`);
    
    if (!response.ok) {
      console.log(`CORDIS returned ${response.status}`);
      return null;
    }
    
    const text = await response.text();
    
    // Skip if it's HTML
    if (text.trim().startsWith('<!') || text.trim().startsWith('<html')) {
      console.log('CORDIS returned HTML instead of JSON');
      return null;
    }
    
    const data = JSON.parse(text);
    
    // Log the actual structure for debugging
    console.log(`CORDIS data keys: ${Object.keys(data).join(', ')}`);
    
    // Extract results - handle various response formats
    let results: any[] = [];
    
    // Format 1: data.result is an array
    if (Array.isArray(data.result)) {
      results = data.result;
      console.log(`Found ${results.length} results in data.result array`);
    }
    // Format 2: data.result.results is an array
    else if (data.result && Array.isArray(data.result.results)) {
      results = data.result.results;
      console.log(`Found ${results.length} results in data.result.results`);
    }
    // Format 3: data.results is an array
    else if (Array.isArray(data.results)) {
      results = data.results;
      console.log(`Found ${results.length} results in data.results`);
    }
    // Format 4: data.result is an object with items
    else if (data.result && typeof data.result === 'object') {
      // Log what's inside result
      console.log(`data.result is object with keys: ${Object.keys(data.result).join(', ')}`);
      
      // Check for various nested structures
      if (data.result.items && Array.isArray(data.result.items)) {
        results = data.result.items;
      } else if (data.result.records && Array.isArray(data.result.records)) {
        results = data.result.records;
      }
    }
    
    if (results.length === 0) {
      // Log first 500 chars of response for debugging
      console.log(`No results extracted. Response sample: ${text.substring(0, 500)}`);
      return null;
    }
    
    console.log(`Processing ${results.length} results`);
    
    // Log first result structure
    if (results.length > 0) {
      const first = results[0];
      console.log(`First result keys: ${Object.keys(first).join(', ')}`);
    }
    
    // Look through results to find organization info
    for (const item of results) {
      // Check if this is a project with participants
      const participants = item.participants || item.organizations || item.organisation || [];
      
      if (Array.isArray(participants)) {
        for (const org of participants) {
          const orgPic = org.pic || org.organizationID || org.id || org.PIC;
          if (orgPic && String(orgPic) === picNumber) {
            console.log(`Found org in project participants: ${org.legalName || org.name}`);
            
            const countryCode = org.country || org.countryCode || '';
            const isSme = org.sme === true || org.sme === 'true' || org.SME === true;
            const legalEntityType = org.activityType || org.legalEntityType || org.type || '';
            
            return {
              picNumber: picNumber,
              legalName: org.legalName || org.name || '',
              shortName: org.shortName || org.acronym,
              country: COUNTRY_NAMES[countryCode] || countryCode,
              countryCode: countryCode,
              city: org.city,
              address: org.street || org.address,
              legalEntityType: legalEntityType,
              isSme: isSme,
              organisationCategory: mapLegalEntityToCategory(legalEntityType, isSme),
            };
          }
        }
      }
      
      // Also check if this item itself is an organization
      const itemPic = item.pic || item.organizationID || item.id || item.PIC;
      if (itemPic && String(itemPic) === picNumber) {
        console.log(`Found as direct result: ${item.legalName || item.title || item.name}`);
        
        const countryCode = item.country || item.countryCode || '';
        const isSme = item.sme === true || item.sme === 'true';
        const legalEntityType = item.activityType || item.legalEntityType || '';
        
        return {
          picNumber: picNumber,
          legalName: item.legalName || item.title || item.name || '',
          shortName: item.shortName || item.acronym,
          country: COUNTRY_NAMES[countryCode] || countryCode,
          countryCode: countryCode,
          city: item.city,
          address: item.street || item.address,
          legalEntityType: legalEntityType,
          isSme: isSme,
          organisationCategory: mapLegalEntityToCategory(legalEntityType, isSme),
        };
      }
    }
    
    return null;
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.log('CORDIS request timed out');
    } else {
      console.error('CORDIS lookup error:', error);
    }
    return null;
  }
}

// Fallback: Try OpenCorporates or similar public API
async function lookupFromOpenData(picNumber: string): Promise<OrganisationInfo | null> {
  // The EC Open Data Portal has organization data
  const url = `https://data.europa.eu/api/hub/search/search?q=${picNumber}&filter=dataset&limit=5`;
  
  try {
    console.log(`Trying EU Open Data: ${url}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.log(`EU Open Data returned ${response.status}`);
      return null;
    }
    
    // This is more of a fallback - results may not be directly useful
    const data = await response.json();
    console.log(`EU Open Data results: ${data.result?.count || 0}`);
    
    return null; // Would need specific parsing logic
  } catch (error) {
    console.log('EU Open Data lookup failed');
    return null;
  }
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { picNumber, searchTerm } = await req.json();
    
    console.log(`PIC Lookup request - PIC: ${picNumber}, Search: ${searchTerm}`);
    
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // If PIC number provided, do exact lookup
    if (picNumber) {
      const cleanPic = picNumber.replace(/\D/g, '');
      
      if (!cleanPic || cleanPic.length < 6 || cleanPic.length > 12) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Invalid PIC format',
            message: 'PIC numbers should be 9 digits. Please check and try again.'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      console.log(`Looking up PIC: ${cleanPic}`);
      
      // First check our database (fastest, includes previously used orgs)
      let org = await lookupFromDatabase(supabase, cleanPic);
      
      // If not in database, try CORDIS
      if (!org) {
        console.log('Not in database, trying CORDIS...');
        org = await lookupFromCordis(cleanPic);
      }
      
      // Fallback to EU Open Data
      if (!org) {
        console.log('Not in CORDIS, trying EU Open Data...');
        org = await lookupFromOpenData(cleanPic);
      }
      
      if (org) {
        console.log(`Found organisation: ${org.legalName} (${org.countryCode}, Category: ${org.organisationCategory})`);
        return new Response(
          JSON.stringify({ success: true, organisation: org }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        console.log(`PIC ${cleanPic} not found in any source`);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'PIC not found',
            message: `Organisation with PIC ${cleanPic} was not found in the EC databases. Please enter the organisation details manually.`,
            suggestManualEntry: true
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Search by name in our database
    if (searchTerm && searchTerm.length >= 2) {
      console.log(`Searching for: ${searchTerm}`);
      
      const { data: orgs, error } = await supabase
        .from('organisations')
        .select('*')
        .or(`name.ilike.%${searchTerm}%,short_name.ilike.%${searchTerm}%`)
        .limit(10);
      
      if (error) {
        console.error('Search error:', error);
      }
      
      const results = (orgs || []).map((org: any) => ({
        picNumber: org.pic_number || '',
        legalName: org.name,
        shortName: org.short_name,
        country: COUNTRY_NAMES[org.country] || org.country || '',
        countryCode: org.country || '',
        legalEntityType: org.legal_entity_type,
        isSme: org.is_sme || false,
        organisationCategory: mapLegalEntityToCategory(org.legal_entity_type, org.is_sme),
      }));
      
      console.log(`Search found ${results.length} results`);
      return new Response(
        JSON.stringify({ success: true, results }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Please provide a PIC number or search term' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('PIC Lookup error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error', message: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
