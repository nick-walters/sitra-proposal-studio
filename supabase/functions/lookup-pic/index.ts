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
// Priority order matters - more specific types checked first
function mapLegalEntityToCategory(legalEntityType?: string, isSme?: boolean): 'RES' | 'UNI' | 'IND' | 'SME' | 'NGO' | 'CSO' | 'PUB' | 'INT' | 'OTH' {
  if (!legalEntityType) return 'OTH';
  
  const type = legalEntityType.toLowerCase();
  
  console.log(`Mapping legal entity type: "${legalEntityType}" (isSme: ${isSme})`);
  
  // SME check - but only if explicitly marked as SME AND is a private entity
  if (isSme && (type.includes('private') || type.includes('enterprise') || type.includes('company') || type.includes('prc'))) {
    return 'SME';
  }
  
  // Public organisations - check FIRST as "public" is explicit in EC register
  // Includes: public body, public organisation, government, authority, ministry
  if (type.includes('public') || type.includes('government') || type.includes('authority') || 
      type.includes('ministry') || type.includes('pub') || type.includes('state') ||
      type.includes('municipal') || type.includes('regional') || type.includes('national body')) {
    return 'PUB';
  }
  
  // International organisations
  if (type.includes('international') || type.includes('intergovernmental') || type.includes('igo')) {
    return 'INT';
  }
  
  // Universities and Higher Education
  if (type.includes('university') || type.includes('higher education') || 
      type.includes('academic') || type.includes('hen') || type.includes('hes')) {
    return 'UNI';
  }
  
  // Research organisations
  if (type.includes('research') || type.includes('rto') || type.includes('rec') || 
      type.includes('r&d') || type.includes('scientific')) {
    return 'RES';
  }
  
  // Private for-profit / Industry
  if (type.includes('private') || type.includes('enterprise') || type.includes('company') || 
      type.includes('industry') || type.includes('prc') || type.includes('for-profit') ||
      type.includes('commercial')) {
    return isSme ? 'SME' : 'IND';
  }
  
  // Civil society organisations
  if (type.includes('civil society') || type.includes('cso')) {
    return 'CSO';
  }
  
  // NGOs - non-governmental, non-profit, foundations (but NOT public foundations)
  if (type.includes('non-governmental') || type.includes('ngo') || 
      type.includes('non-profit') || type.includes('nonprofit') ||
      (type.includes('foundation') && !type.includes('public'))) {
    return 'NGO';
  }
  
  // Default fallback
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
    
    // First check organisations table
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

// Known organisations that may not be in CORDIS
const KNOWN_ORGANISATIONS: Record<string, OrganisationInfo> = {
  '906912365': {
    picNumber: '906912365',
    legalName: 'Suomen itsenäisyyden juhlarahasto Sitra',
    shortName: 'Sitra',
    country: 'Finland',
    countryCode: 'FI',
    city: 'Helsinki',
    legalEntityType: 'Public organisation',
    isSme: false,
    organisationCategory: 'PUB',
  },
  '999994438': {
    picNumber: '999994438',
    legalName: 'Aalto-korkeakoulusäätiö sr',
    shortName: 'Aalto University',
    country: 'Finland',
    countryCode: 'FI',
    city: 'Espoo',
    legalEntityType: 'Higher or Secondary Education Establishment',
    isSme: false,
    organisationCategory: 'UNI',
  },
  '999540381': {
    picNumber: '999540381',
    legalName: 'Teknologian tutkimuskeskus VTT Oy',
    shortName: 'VTT',
    country: 'Finland',
    countryCode: 'FI',
    city: 'Espoo',
    legalEntityType: 'Research Organisation',
    isSme: false,
    organisationCategory: 'RES',
  },
  '999997930': {
    picNumber: '999997930',
    legalName: 'Centre National de la Recherche Scientifique',
    shortName: 'CNRS',
    country: 'France',
    countryCode: 'FR',
    city: 'Paris',
    legalEntityType: 'Research Organisation',
    isSme: false,
    organisationCategory: 'RES',
  },
  '999984059': {
    picNumber: '999984059',
    legalName: 'Fraunhofer-Gesellschaft zur Förderung der angewandten Forschung e.V.',
    shortName: 'Fraunhofer',
    country: 'Germany',
    countryCode: 'DE',
    city: 'München',
    legalEntityType: 'Research Organisation',
    isSme: false,
    organisationCategory: 'RES',
  },
};

// Try to fetch from CORDIS Data Extractions API
async function lookupFromCordis(picNumber: string): Promise<OrganisationInfo | null> {
  try {
    // Use CORDIS Data Extractions API - more reliable JSON endpoint
    const url = `https://cordis.europa.eu/api/dataextractions/organization?q=pic:${picNumber}&format=json`;
    console.log(`Trying CORDIS API: ${url}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    console.log(`CORDIS API status: ${response.status}`);
    
    if (!response.ok) {
      console.log(`CORDIS API returned status ${response.status}`);
      return null;
    }
    
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      console.log(`CORDIS API returned non-JSON content type: ${contentType}`);
      return null;
    }
    
    const data = await response.json();
    console.log(`CORDIS API response:`, JSON.stringify(data).substring(0, 500));
    
    // Handle array response format
    const results = Array.isArray(data) ? data : (data.results || data.items || []);
    
    if (results.length > 0) {
      const org = results[0];
      const countryCode = org.country || org.organisationCountry || '';
      const isSme = org.sme === 'true' || org.sme === true || org.SME === 'true' || org.SME === true;
      const legalEntityType = org.activityType || org.legalEntityType || org.organisationType || '';
      
      console.log(`CORDIS found: ${org.legalName || org.name} (Type: ${legalEntityType})`);
      
      return {
        picNumber: picNumber,
        legalName: org.legalName || org.name || 'Unknown',
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
    
    console.log('No results found in CORDIS API response');
    return null;
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.log('CORDIS API request timed out');
    } else {
      console.error('CORDIS API lookup error:', error);
    }
    return null;
  }
}

// Check known organisations list
function lookupFromKnownOrganisations(picNumber: string): OrganisationInfo | null {
  const org = KNOWN_ORGANISATIONS[picNumber];
  if (org) {
    console.log(`Found in known organisations: ${org.legalName}`);
    return org;
  }
  return null;
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
      
      // First check known organisations (fastest, for common PICs)
      let org = lookupFromKnownOrganisations(cleanPic);
      
      // If not in known list, check our database
      if (!org) {
        org = await lookupFromDatabase(supabase, cleanPic);
      }
      
      // If not in database, try CORDIS API
      if (!org) {
        console.log('Not in database, trying CORDIS API...');
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