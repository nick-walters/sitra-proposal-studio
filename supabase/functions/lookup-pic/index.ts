import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

// Map legal entity types from CORDIS to organisation categories
function mapLegalEntityToCategory(legalEntityType?: string, isSme?: boolean): 'RES' | 'UNI' | 'IND' | 'SME' | 'NGO' | 'CSO' | 'PUB' | 'INT' | 'OTH' {
  if (!legalEntityType) return 'OTH';
  
  const type = legalEntityType.toLowerCase();
  
  if (isSme) return 'SME';
  if (type.includes('university') || type.includes('higher') || type.includes('secondary education')) return 'UNI';
  if (type.includes('research')) return 'RES';
  if (type.includes('private for-profit') || type.includes('enterprise') || type.includes('company')) return 'IND';
  if (type.includes('non-governmental') || type.includes('ngo')) return 'NGO';
  if (type.includes('civil society')) return 'CSO';
  if (type.includes('public') || type.includes('government')) return 'PUB';
  if (type.includes('international')) return 'INT';
  
  return 'OTH';
}

// Mock database of known EU organisations for demo
// In production, this would connect to EC Participant Register API
const KNOWN_ORGANISATIONS: Record<string, OrganisationInfo> = {
  "999984156": {
    picNumber: "999984156",
    legalName: "UNIVERSITAET HEIDELBERG",
    shortName: "UNI-HD",
    country: "Germany",
    countryCode: "DE",
    city: "Heidelberg",
    legalEntityType: "Higher or Secondary Education Establishment",
    isSme: false,
    organisationCategory: "UNI",
  },
  "999977172": {
    picNumber: "999977172",
    legalName: "THE CHANCELLOR, MASTERS AND SCHOLARS OF THE UNIVERSITY OF CAMBRIDGE",
    shortName: "UCAM",
    country: "United Kingdom",
    countryCode: "GB",
    city: "Cambridge",
    legalEntityType: "Higher or Secondary Education Establishment",
    isSme: false,
    organisationCategory: "UNI",
  },
  "999994438": {
    picNumber: "999994438",
    legalName: "UNIVERSITY OF HELSINKI",
    shortName: "UH",
    country: "Finland",
    countryCode: "FI",
    city: "Helsinki",
    legalEntityType: "Higher or Secondary Education Establishment",
    isSme: false,
    organisationCategory: "UNI",
  },
  "999984059": {
    picNumber: "999984059",
    legalName: "FRAUNHOFER GESELLSCHAFT ZUR FOERDERUNG DER ANGEWANDTEN FORSCHUNG E.V.",
    shortName: "Fraunhofer",
    country: "Germany",
    countryCode: "DE",
    city: "München",
    legalEntityType: "Research Organisation",
    isSme: false,
    organisationCategory: "RES",
  },
  "999985417": {
    picNumber: "999985417",
    legalName: "UNIVERSITY OF OXFORD",
    shortName: "UOXF",
    country: "United Kingdom",
    countryCode: "GB",
    city: "Oxford",
    legalEntityType: "Higher or Secondary Education Establishment",
    isSme: false,
    organisationCategory: "UNI",
  },
  "999978433": {
    picNumber: "999978433",
    legalName: "LUDWIG-MAXIMILIANS-UNIVERSITAET MUENCHEN",
    shortName: "LMU",
    country: "Germany",
    countryCode: "DE",
    city: "München",
    legalEntityType: "Higher or Secondary Education Establishment",
    isSme: false,
    organisationCategory: "UNI",
  },
  "999976784": {
    picNumber: "999976784",
    legalName: "POLITECNICO DI MILANO",
    shortName: "POLIMI",
    country: "Italy",
    countryCode: "IT",
    city: "Milano",
    legalEntityType: "Higher or Secondary Education Establishment",
    isSme: false,
    organisationCategory: "UNI",
  },
  "999984253": {
    picNumber: "999984253",
    legalName: "TECHNISCHE UNIVERSITEIT DELFT",
    shortName: "TU Delft",
    country: "Netherlands",
    countryCode: "NL",
    city: "Delft",
    legalEntityType: "Higher or Secondary Education Establishment",
    isSme: false,
    organisationCategory: "UNI",
  },
  "999997930": {
    picNumber: "999997930",
    legalName: "CENTRE NATIONAL DE LA RECHERCHE SCIENTIFIQUE CNRS",
    shortName: "CNRS",
    country: "France",
    countryCode: "FR",
    city: "Paris",
    legalEntityType: "Research Organisation",
    isSme: false,
    organisationCategory: "RES",
  },
  "999978530": {
    picNumber: "999978530",
    legalName: "KAROLINSKA INSTITUTET",
    shortName: "KI",
    country: "Sweden",
    countryCode: "SE",
    city: "Stockholm",
    legalEntityType: "Higher or Secondary Education Establishment",
    isSme: false,
    organisationCategory: "UNI",
  },
  "999979500": {
    picNumber: "999979500",
    legalName: "CONSIGLIO NAZIONALE DELLE RICERCHE",
    shortName: "CNR",
    country: "Italy",
    countryCode: "IT",
    city: "Roma",
    legalEntityType: "Research Organisation",
    isSme: false,
    organisationCategory: "RES",
  },
  "999643007": {
    picNumber: "999643007",
    legalName: "AALTO KORKEAKOULUSAATIO SR",
    shortName: "Aalto",
    country: "Finland",
    countryCode: "FI",
    city: "Espoo",
    legalEntityType: "Higher or Secondary Education Establishment",
    isSme: false,
    organisationCategory: "UNI",
  },
  "999986096": {
    picNumber: "999986096",
    legalName: "UNIVERSITEIT GENT",
    shortName: "UGent",
    country: "Belgium",
    countryCode: "BE",
    city: "Gent",
    legalEntityType: "Higher or Secondary Education Establishment",
    isSme: false,
    organisationCategory: "UNI",
  },
  "999975620": {
    picNumber: "999975620",
    legalName: "UNIVERSITY COLLEGE LONDON",
    shortName: "UCL",
    country: "United Kingdom",
    countryCode: "GB",
    city: "London",
    legalEntityType: "Higher or Secondary Education Establishment",
    isSme: false,
    organisationCategory: "UNI",
  },
  "888897696": {
    picNumber: "888897696",
    legalName: "ACME INNOVATION GMBH",
    shortName: "ACME",
    country: "Germany",
    countryCode: "DE",
    city: "Berlin",
    legalEntityType: "Private for-profit entity",
    isSme: true,
    organisationCategory: "SME",
  },
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { picNumber, searchTerm } = await req.json();
    
    console.log(`PIC Lookup request - PIC: ${picNumber}, Search: ${searchTerm}`);

    // If PIC number provided, do exact lookup
    if (picNumber) {
      const cleanPic = picNumber.replace(/\D/g, '');
      const org = KNOWN_ORGANISATIONS[cleanPic];
      
      if (org) {
        // Auto-detect category if not already set
        const organisationWithCategory = {
          ...org,
          organisationCategory: org.organisationCategory || mapLegalEntityToCategory(org.legalEntityType, org.isSme),
        };
        
        console.log(`Found organisation: ${org.legalName} (Category: ${organisationWithCategory.organisationCategory})`);
        return new Response(
          JSON.stringify({ success: true, organisation: organisationWithCategory }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        console.log(`PIC ${cleanPic} not found in database`);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'PIC not found',
            message: `Organisation with PIC ${cleanPic} not found in the EC Participant Register. Please verify the PIC number or enter details manually.`
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // If search term provided, search by name
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const results = Object.values(KNOWN_ORGANISATIONS)
        .filter(org => 
          org.legalName.toLowerCase().includes(term) ||
          (org.shortName && org.shortName.toLowerCase().includes(term))
        )
        .map(org => ({
          ...org,
          organisationCategory: org.organisationCategory || mapLegalEntityToCategory(org.legalEntityType, org.isSme),
        }));

      console.log(`Search for "${searchTerm}" found ${results.length} results`);
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
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
