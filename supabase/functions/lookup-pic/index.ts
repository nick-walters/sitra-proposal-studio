import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";

interface OrganisationInfo {
  picNumber: string;
  legalName: string;
  shortName?: string;
  country: string;
  countryCode: string;
  city?: string;
  legalEntityType?: string;
  isSme: boolean;
  organisationCategory?: 'HES' | 'RES' | 'SME' | 'LE' | 'PUB' | 'INT' | 'OTH' | 'PRC';
  englishName?: string;
  logoUrl?: string;
}

// EC dictionary id → ISO country code. Harvested from live SEDIA ORGANISATION queries.
const COUNTRY_ID_TO_ISO: Record<string, string> = {
  '20000832': 'AT', '20000839': 'BE', '20000841': 'BG', '20000860': 'CH',
  '20000871': 'CY', '20000872': 'CZ', '20000873': 'DE', '20000875': 'DK',
  '20000880': 'EE', '20000883': 'ES', '20000885': 'FI', '20000890': 'FR',
  '20000893': 'GB', '20000902': 'GR', '20000911': 'HR', '20000913': 'HU',
  '20000915': 'IE', '20000916': 'IL', '20000921': 'IS', '20000922': 'IT',
  '20000944': 'LT', '20000945': 'LU', '20000946': 'LV', '20000960': 'MT',
  '20000973': 'NL', '20000974': 'NO', '20000986': 'PL', '20000990': 'PT',
  '20000994': 'RO', '20001001': 'SE', '20001004': 'SI', '20001005': 'SK',
  '20001026': 'TR', '20001034': 'US',
};

const SEDIA_ORG_TYPE_TO_CATEGORY: Record<string, OrganisationInfo['organisationCategory']> = {
  '31079051': 'RES',
  '31079052': 'HES',
  '31079053': 'PUB',
};

const COUNTRY_NAMES: Record<string, string> = {
  'AT': 'Austria', 'BE': 'Belgium', 'BG': 'Bulgaria', 'CY': 'Cyprus', 'CZ': 'Czech Republic',
  'DE': 'Germany', 'DK': 'Denmark', 'EE': 'Estonia', 'ES': 'Spain', 'FI': 'Finland',
  'FR': 'France', 'GR': 'Greece', 'HR': 'Croatia', 'HU': 'Hungary', 'IE': 'Ireland',
  'IT': 'Italy', 'LT': 'Lithuania', 'LU': 'Luxembourg', 'LV': 'Latvia', 'MT': 'Malta',
  'NL': 'Netherlands', 'PL': 'Poland', 'PT': 'Portugal', 'RO': 'Romania', 'SE': 'Sweden',
  'SI': 'Slovenia', 'SK': 'Slovakia', 'NO': 'Norway', 'CH': 'Switzerland', 'UK': 'United Kingdom',
  'GB': 'United Kingdom', 'IL': 'Israel', 'TR': 'Turkey', 'IS': 'Iceland',
};

function mapLegalEntityToCategory(legalEntityType?: string, isSme?: boolean): OrganisationInfo['organisationCategory'] {
  if (!legalEntityType) return 'OTH';
  const t = legalEntityType.toUpperCase();
  if (t === 'REC') return 'RES';
  if (t === 'HES') return 'HES';
  if (t === 'PUB') return 'PUB';
  if (t === 'PRC') return isSme ? 'SME' : 'LE';
  if (t === 'INT') return 'INT';
  return 'OTH';
}

function sanitiseTerm(raw: string): string {
  return String(raw)
    .replace(/[,()%_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

async function searchDatabase(supabase: any, searchTerm: string): Promise<OrganisationInfo[]> {
  const results: OrganisationInfo[] = [];
  const seenPics = new Set<string>();
  const term = sanitiseTerm(searchTerm);
  if (!term) return results;

  try {
    const { data: organisations } = await supabase
      .from('organisations')
      .select('*')
      .or(`name.ilike.%${term}%,short_name.ilike.%${term}%,pic_number.eq.${term}`)
      .limit(15);

    for (const org of organisations || []) {
      if (org.pic_number || org.name) {
        const picKey = org.pic_number || '';
        if (picKey) seenPics.add(picKey);
        results.push({
          picNumber: org.pic_number || '',
          legalName: org.name,
          shortName: org.short_name,
          country: COUNTRY_NAMES[org.country] || org.country || '',
          countryCode: org.country || '',
          legalEntityType: org.legal_entity_type,
          isSme: org.is_sme || false,
          organisationCategory: mapLegalEntityToCategory(org.legal_entity_type, org.is_sme),
          englishName: org.english_name,
          logoUrl: org.logo_url,
        });
      }
    }

    const { data: participants } = await supabase
      .from('participants')
      .select('*')
      .or(`organisation_name.ilike.%${term}%,organisation_short_name.ilike.%${term}%,english_name.ilike.%${term}%,pic_number.eq.${term}`)
      .limit(15);

    for (const p of participants || []) {
      if (p.pic_number && seenPics.has(p.pic_number)) continue;
      if (p.pic_number || p.organisation_name) {
        if (p.pic_number) seenPics.add(p.pic_number);
        results.push({
          picNumber: p.pic_number || '',
          legalName: p.english_name || p.organisation_name,
          shortName: p.organisation_short_name,
          country: COUNTRY_NAMES[p.country] || p.country || '',
          countryCode: p.country || '',
          legalEntityType: p.legal_entity_type,
          isSme: p.is_sme || false,
          organisationCategory: p.organisation_category || mapLegalEntityToCategory(p.legal_entity_type, p.is_sme),
          englishName: p.english_name,
          logoUrl: p.logo_url,
        });
      }
    }
  } catch (error) {
    console.log('Database search error:', error);
  }
  return results;
}

function mapSediaCategory(orgType?: string): OrganisationInfo['organisationCategory'] {
  if (!orgType) return 'OTH';
  const t = orgType.toUpperCase();
  if (t === 'REC') return 'RES';
  if (t === 'HES') return 'HES';
  if (t === 'PUB') return 'PUB';
  if (t === 'PRC') return 'PRC';
  if (t === 'INT') return 'INT';
  return 'OTH';
}

function mapSediaResult(metadata: any): OrganisationInfo {
  const pic = metadata.pic?.[0] || '';
  const englishName = metadata.englishName?.[0];
  const legalName = metadata.legalName?.[0] || englishName || '';
  const shortName = metadata.businessName?.[0] || metadata.acronym?.[0];
  const countryCode = metadata.country?.[0] || '';
  const isSme = String(metadata.sme?.[0]).toLowerCase() === 'true';
  const orgType = metadata.organisationType?.[0];
  return {
    picNumber: pic,
    legalName,
    englishName,
    shortName,
    countryCode,
    country: COUNTRY_NAMES[countryCode] || countryCode || '',
    isSme,
    legalEntityType: orgType,
    organisationCategory: mapSediaCategory(orgType),
    logoUrl: undefined,
  };
}

async function searchSedia(text: string, apiKey: string = 'SEDIA_PERSON'): Promise<{ results: OrganisationInfo[]; raw: any }> {
  const url = `https://api.tech.ec.europa.eu/search-api/prod/rest/search?apiKey=${apiKey}&text=${encodeURIComponent(text)}&pageSize=10&pageNumber=1`;
  console.log(`SEDIA request: ${url}`);

  const form = new FormData();
  form.append(
    'query',
    new Blob([JSON.stringify({ bool: { must: [{ terms: { type: ['ORGANISATION'] } }] } })], { type: 'application/json' }),
    'blob'
  );
  form.append(
    'languages',
    new Blob([JSON.stringify(['en'])], { type: 'application/json' }),
    'blob'
  );

  const response = await fetch(url, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: form,
  });

  const bodyText = await response.text();
  console.log(`SEDIA status ${response.status}; body preview: ${bodyText.slice(0, 1500)}`);

  if (!response.ok) return { results: [], raw: null };

  let json: any;
  try { json = JSON.parse(bodyText); } catch { return { results: [], raw: null }; }

  const rawResults = Array.isArray(json?.results) ? json.results : [];
  const mapped = rawResults
    .map((r: any) => mapSediaResult(r?.metadata || {}))
    .filter((o: OrganisationInfo) => o.legalName || o.picNumber);
  return { results: mapped, raw: json };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const supabase = auth.callerClient;

    const { picNumber, searchTerm } = await req.json();
    console.log(`Lookup: PIC=${picNumber}, Search=${searchTerm}`);

    if (searchTerm !== undefined && searchTerm !== null && (typeof searchTerm !== 'string' || searchTerm.length > 200)) {
      return new Response(
        JSON.stringify({ success: false, error: 'searchTerm too long or invalid' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (picNumber !== undefined && picNumber !== null) {
      const picStr = String(picNumber);
      if (picStr.length > 20 || !/^\d{1,20}$/.test(picStr.replace(/\s/g, ''))) {
        return new Response(
          JSON.stringify({ success: false, error: 'picNumber invalid (must be digits, max 20 chars)' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const query = picNumber || searchTerm;
    if (!query || String(query).length < 2) {
      return new Response(
        JSON.stringify({ success: false, error: 'Please provide a search term' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const dbResults = await searchDatabase(supabase, String(query));
    console.log(`DB results: ${dbResults.length}`);

    const isNumericPic = /^\d{9}$/.test(String(query).trim());

    // Direct PIC lookup
    if (picNumber) {
      const cleanPic = String(picNumber).replace(/\D/g, '');
      const localMatch = dbResults.find(o => o.picNumber === cleanPic);
      if (localMatch) {
        return new Response(
          JSON.stringify({ success: true, organisation: localMatch }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const { results: sediaResults } = await searchSedia(cleanPic);
      const match = sediaResults.find(o => o.picNumber === cleanPic);
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
          suggestManualEntry: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Name search: always also query SEDIA to enrich
    let sediaResults: OrganisationInfo[] = [];
    try {
      const r = await searchSedia(String(query));
      sediaResults = r.results;
    } catch (e) {
      console.log('SEDIA search failed:', e);
    }

    const seen = new Set<string>();
    const uniqueResults: OrganisationInfo[] = [];
    for (const org of [...dbResults, ...sediaResults]) {
      const key = org.picNumber || (org.legalName || '').toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      uniqueResults.push(org);
    }

    return new Response(
      JSON.stringify({
        success: true,
        results: uniqueResults.slice(0, 20),
        note: uniqueResults.length === 0 ? 'No results found. Try a different search term or enter details manually.' : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.log('lookup-pic error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Lookup failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
