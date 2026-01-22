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

// Known organisations for fast lookup (common EU project partners)
const KNOWN_ORGANISATIONS: Record<string, OrganisationInfo> = {
  '906912365': {
    picNumber: '906912365',
    legalName: 'Suomen itsenäisyyden juhlarahasto',
    shortName: 'Sitra',
    country: 'Finland',
    countryCode: 'FI',
    legalEntityType: 'Public body',
    isSme: false,
    organisationCategory: 'PUB',
  },
  '999903840': {
    picNumber: '999903840',
    legalName: 'Aalto University Foundation sr',
    shortName: 'Aalto',
    country: 'Finland',
    countryCode: 'FI',
    legalEntityType: 'Higher education',
    isSme: false,
    organisationCategory: 'UNI',
  },
  '999981731': {
    picNumber: '999981731',
    legalName: 'Fraunhofer Gesellschaft zur Förderung der angewandten Forschung e.V.',
    shortName: 'Fraunhofer',
    country: 'Germany',
    countryCode: 'DE',
    legalEntityType: 'Research organisation',
    isSme: false,
    organisationCategory: 'RES',
  },
  '999997930': {
    picNumber: '999997930',
    legalName: 'Centre National de la Recherche Scientifique',
    shortName: 'CNRS',
    country: 'France',
    countryCode: 'FR',
    legalEntityType: 'Research organisation',
    isSme: false,
    organisationCategory: 'RES',
  },
  '999901512': {
    picNumber: '999901512',
    legalName: 'Teknologian tutkimuskeskus VTT Oy',
    shortName: 'VTT',
    country: 'Finland',
    countryCode: 'FI',
    legalEntityType: 'Research organisation',
    isSme: false,
    organisationCategory: 'RES',
  },
};

// Lookup from known organisations first (fastest)
function lookupFromKnownOrganisations(picNumber: string): OrganisationInfo | null {
  const known = KNOWN_ORGANISATIONS[picNumber];
  if (known) {
    console.log(`Found in known organisations: ${known.legalName}`);
    return known;
  }
  return null;
}

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

// Try to fetch from CORDIS API
async function lookupFromCordis(picNumber: string): Promise<OrganisationInfo | null> {
  // Use the CORDIS organisation search endpoint
  const url = `https://cordis.europa.eu/search/en?q=contenttype%3D%27organization%27+AND+organizationID%3D%27${picNumber}%27&format=json`;
  
  try {
    console.log(`Trying CORDIS: ${url}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (compatible; ProposalStudio/1.0)',
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
      console.log('CORDIS returned HTML, skipping');
      return null;
    }
    
    const data = JSON.parse(text);
    console.log(`CORDIS response keys: ${Object.keys(data).join(', ')}`);
    
    // CORDIS returns {result: {header: ..., payload: ...}, hits: {...}}
    // The actual results are in result.payload.organizations or similar
    let results: any[] = [];
    
    // Try various paths to find the results array
    if (Array.isArray(data.result)) {
      results = data.result;
    } else if (data.result?.payload?.organizations && Array.isArray(data.result.payload.organizations)) {
      results = data.result.payload.organizations;
    } else if (data.result?.payload?.results && Array.isArray(data.result.payload.results)) {
      results = data.result.payload.results;
    } else if (data.payload?.organizations && Array.isArray(data.payload.organizations)) {
      results = data.payload.organizations;
    } else if (data.results && Array.isArray(data.results)) {
      results = data.results;
    }
    
    console.log(`CORDIS found ${results.length} results`);
    
    if (results.length === 0) {
      return null;
    }
    
    // Find the org that matches our PIC exactly
    let org = null;
    for (const item of results) {
      // Handle different field names for PIC
      const itemPic = item.organizationID || item.pic || item.organisationID || item.id;
      console.log(`Checking item PIC: ${itemPic}`);
      
      if (itemPic && String(itemPic) === picNumber) {
        org = item;
        break;
      }
    }
    
    // If no exact match, use first result
    if (!org && results.length > 0) {
      org = results[0];
    }
    
    if (org) {
      const countryCode = org.country || org.organisationCountry || '';
      const isSme = org.sme === 'true' || org.sme === true || org.SME === true;
      const legalEntityType = org.activityType || org.legalEntityType || org.organisationType || '';
      const legalName = org.legalName || org.name || org.title || '';
      
      console.log(`CORDIS found: ${legalName} (${countryCode}, Type: ${legalEntityType})`);
      
      return {
        picNumber: picNumber,
        legalName: legalName,
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

// Search CORDIS by organisation name - use same approach as PIC lookup
async function searchCordisOrganisations(searchTerm: string): Promise<OrganisationInfo[]> {
  // Use legalName field search similar to PIC lookup
  const encodedTerm = encodeURIComponent(searchTerm);
  const url = `https://cordis.europa.eu/search/en?q=contenttype%3D%27organization%27+AND+legalName%3D%27*${encodedTerm}*%27&format=json`;
  
  try {
    console.log(`Searching CORDIS for: ${searchTerm}`);
    console.log(`CORDIS search URL: ${url}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (compatible; ProposalStudio/1.0)',
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    console.log(`CORDIS search status: ${response.status}`);
    
    if (!response.ok) {
      console.log(`CORDIS search returned ${response.status}`);
      return [];
    }
    
    const text = await response.text();
    
    if (text.trim().startsWith('<!') || text.trim().startsWith('<html')) {
      console.log('CORDIS returned HTML, skipping');
      return [];
    }
    
    const data = JSON.parse(text);
    console.log(`CORDIS search response keys: ${Object.keys(data).join(', ')}`);
    
    // Use same parsing logic as PIC lookup
    let results: any[] = [];
    if (Array.isArray(data.result)) {
      results = data.result;
    } else if (data.result?.payload?.organizations && Array.isArray(data.result.payload.organizations)) {
      results = data.result.payload.organizations;
    } else if (data.result?.payload?.results && Array.isArray(data.result.payload.results)) {
      results = data.result.payload.results;
    } else if (data.payload?.organizations && Array.isArray(data.payload.organizations)) {
      results = data.payload.organizations;
    } else if (data.results && Array.isArray(data.results)) {
      results = data.results;
    }
    
    console.log(`CORDIS search found ${results.length} results`);
    
    if (results.length > 0) {
      console.log(`First result sample: ${JSON.stringify(results[0]).substring(0, 200)}`);
    }
    
    return results.slice(0, 15).map((org: any) => {
      const countryCode = org.country || org.organisationCountry || '';
      const isSme = org.sme === 'true' || org.sme === true || org.SME === true;
      const legalEntityType = org.activityType || org.legalEntityType || org.organisationType || '';
      
      return {
        picNumber: String(org.organizationID || org.pic || org.id || ''),
        legalName: org.legalName || org.name || org.title || '',
        shortName: org.shortName || org.acronym,
        country: COUNTRY_NAMES[countryCode] || countryCode,
        countryCode: countryCode,
        legalEntityType: legalEntityType,
        isSme: isSme,
        organisationCategory: mapLegalEntityToCategory(legalEntityType, isSme),
      };
    }).filter((org: OrganisationInfo) => org.legalName && org.picNumber); // Filter out empty results
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.log('CORDIS search request timed out');
    } else {
      console.error('CORDIS search error:', error);
    }
    return [];
  }
}

// Search known organisations by name
function searchKnownOrganisations(searchTerm: string): OrganisationInfo[] {
  const term = searchTerm.toLowerCase();
  return Object.values(KNOWN_ORGANISATIONS).filter(org => 
    org.legalName.toLowerCase().includes(term) || 
    (org.shortName && org.shortName.toLowerCase().includes(term))
  );
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
      
      // 1. First check known organisations (fastest)
      let org = lookupFromKnownOrganisations(cleanPic);
      
      // 2. Then check our database
      if (!org) {
        org = await lookupFromDatabase(supabase, cleanPic);
      }
      
      // 3. Finally try CORDIS API
      if (!org) {
        console.log('Not in database, trying CORDIS...');
        org = await lookupFromCordis(cleanPic);
      }
      
      if (org) {
        console.log(`Found organisation: ${org.legalName} (${org.countryCode}, Category: ${org.organisationCategory})`);
        return new Response(
          JSON.stringify({ success: true, organisation: org }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        console.log(`PIC ${cleanPic} not found`);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'PIC not found',
            message: `Organisation with PIC ${cleanPic} was not found. The organisation may not have participated in previous EU projects, or the PIC may be new. Please enter details manually.`,
            suggestManualEntry: true
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Search by name - also check if it might be a PIC first
    if (searchTerm && searchTerm.length >= 2) {
      console.log(`Searching for: ${searchTerm}`);
      
      // Check if the search term looks like a PIC number (5-9 digits)
      const cleanedSearchTerm = searchTerm.replace(/\s/g, '');
      if (/^\d{5,9}$/.test(cleanedSearchTerm)) {
        console.log(`Search term looks like a PIC number, doing PIC lookup first`);
        
        // Try PIC lookup first
        let org = lookupFromKnownOrganisations(cleanedSearchTerm);
        if (!org) {
          org = await lookupFromDatabase(supabase, cleanedSearchTerm);
        }
        if (!org) {
          org = await lookupFromCordis(cleanedSearchTerm);
        }
        
        if (org) {
          console.log(`Found organisation by PIC: ${org.legalName}`);
          return new Response(
            JSON.stringify({ success: true, results: [org] }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
      
      // 1. Search known organisations first
      const knownResults = searchKnownOrganisations(searchTerm);
      console.log(`Found ${knownResults.length} in known organisations`);
      
      // 2. Search local database
      const { data: orgs, error } = await supabase
        .from('organisations')
        .select('*')
        .or(`name.ilike.%${searchTerm}%,short_name.ilike.%${searchTerm}%`)
        .limit(10);
      
      if (error) {
        console.error('Search error:', error);
      }
      
      const dbResults = (orgs || []).map((org: any) => ({
        picNumber: org.pic_number || '',
        legalName: org.name,
        shortName: org.short_name,
        country: COUNTRY_NAMES[org.country] || org.country || '',
        countryCode: org.country || '',
        legalEntityType: org.legal_entity_type,
        isSme: org.is_sme || false,
        organisationCategory: mapLegalEntityToCategory(org.legal_entity_type, org.is_sme),
      }));
      console.log(`Found ${dbResults.length} in database`);
      
      // 3. Also search participants table for previously used organisations
      const { data: participants, error: partError } = await supabase
        .from('participants')
        .select('*')
        .or(`organisation_name.ilike.%${searchTerm}%,organisation_short_name.ilike.%${searchTerm}%,english_name.ilike.%${searchTerm}%`)
        .limit(10);
      
      if (partError) {
        console.error('Participants search error:', partError);
      }
      
      const participantResults = (participants || []).map((p: any) => ({
        picNumber: p.pic_number || '',
        legalName: p.english_name || p.organisation_name,
        shortName: p.organisation_short_name,
        country: COUNTRY_NAMES[p.country] || p.country || '',
        countryCode: p.country || '',
        legalEntityType: p.legal_entity_type,
        isSme: p.is_sme || false,
        organisationCategory: p.organisation_category || mapLegalEntityToCategory(p.legal_entity_type, p.is_sme),
      }));
      console.log(`Found ${participantResults.length} in participants`);
      
      // Combine and deduplicate results
      const seenPics = new Set<string>();
      const seenNames = new Set<string>();
      const allResults: OrganisationInfo[] = [];
      
      const addResult = (org: OrganisationInfo) => {
        const nameKey = org.legalName.toLowerCase();
        // Dedupe by PIC or by name
        if (org.picNumber && seenPics.has(org.picNumber)) return;
        if (!org.picNumber && seenNames.has(nameKey)) return;
        
        if (org.picNumber) seenPics.add(org.picNumber);
        seenNames.add(nameKey);
        allResults.push(org);
      };
      
      // Add known results first (highest priority)
      knownResults.forEach(addResult);
      
      // Add database results
      dbResults.forEach(addResult);
      
      // Add participant results
      participantResults.forEach(addResult);
      
      console.log(`Total search results: ${allResults.length}`);
      return new Response(
        JSON.stringify({ success: true, results: allResults.slice(0, 20) }),
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
