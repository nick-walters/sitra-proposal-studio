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

// Search CORDIS using their public search
async function searchCordis(searchQuery: string): Promise<OrganisationInfo[]> {
  try {
    // Use simple text search in CORDIS
    const url = `https://cordis.europa.eu/search/en?q=${encodeURIComponent(searchQuery)}+contenttype%3D%27organization%27&format=json&num=20`;
    console.log(`CORDIS search: ${url}`);
    
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });
    
    if (!response.ok) {
      console.log(`CORDIS status: ${response.status}`);
      return [];
    }
    
    const text = await response.text();
    if (text.startsWith('<!') || text.startsWith('<html')) return [];
    
    const data = JSON.parse(text);
    console.log(`CORDIS keys: ${Object.keys(data).join(',')}`);
    
    // Find payload in response
    let items: any[] = [];
    if (data.payload?.organizations) items = data.payload.organizations;
    else if (data.result?.payload?.organizations) items = data.result.payload.organizations;
    else if (Array.isArray(data.result)) items = data.result;
    else if (Array.isArray(data)) items = data;
    
    console.log(`CORDIS items: ${items.length}`);
    
    return items.slice(0, 15).map((org: any) => ({
      picNumber: String(org.organizationID || org.pic || org.id || ''),
      legalName: org.legalName || org.name || '',
      shortName: org.shortName || org.acronym,
      country: COUNTRY_NAMES[org.country] || org.country || '',
      countryCode: org.country || '',
      legalEntityType: org.activityType || org.legalEntityType || '',
      isSme: org.sme === true || org.sme === 'true',
      organisationCategory: mapLegalEntityToCategory(org.activityType || org.legalEntityType, org.sme === true),
    })).filter((o: OrganisationInfo) => o.legalName);
  } catch (error) {
    console.error('CORDIS error:', error);
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

    // Search both sources
    const [dbResults, cordisResults] = await Promise.all([
      searchDatabase(supabase, query),
      searchCordis(query),
    ]);
    
    console.log(`DB: ${dbResults.length}, CORDIS: ${cordisResults.length}`);
    
    // Deduplicate by PIC
    const seen = new Set<string>();
    const allResults: OrganisationInfo[] = [];
    
    for (const org of [...dbResults, ...cordisResults]) {
      const key = org.picNumber || org.legalName.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        allResults.push(org);
      }
    }
    
    // For direct PIC lookup, return single organisation
    if (picNumber) {
      const match = allResults.find(o => o.picNumber === picNumber.replace(/\D/g, ''));
      if (match) {
        return new Response(
          JSON.stringify({ success: true, organisation: match }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({ success: false, error: 'PIC not found', suggestManualEntry: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    return new Response(
      JSON.stringify({ success: true, results: allResults.slice(0, 20) }),
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
