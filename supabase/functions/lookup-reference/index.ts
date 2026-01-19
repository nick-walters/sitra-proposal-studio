import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Reference {
  authors: string[];
  year: number | null;
  title: string;
  journal: string | null;
  volume: string | null;
  pages: string | null;
  doi: string | null;
}

async function lookupDOI(doi: string): Promise<Reference | null> {
  try {
    const response = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
      headers: { "User-Agent": "grant.eu/1.0 (mailto:support@grant.eu)" }
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    const work = data.message;
    
    const authors = work.author?.map((a: any) => {
      if (a.family && a.given) return `${a.family}, ${a.given}`;
      if (a.family) return a.family;
      return a.name || "Unknown";
    }) || [];
    
    return {
      authors,
      year: work.published?.["date-parts"]?.[0]?.[0] || work["published-online"]?.["date-parts"]?.[0]?.[0] || null,
      title: work.title?.[0] || "Unknown Title",
      journal: work["container-title"]?.[0] || work["short-container-title"]?.[0] || null,
      volume: work.volume || null,
      pages: work.page || work["article-number"] || null,
      doi: work.DOI || doi
    };
  } catch (error) {
    console.error("DOI lookup error:", error);
    return null;
  }
}

function formatAuthors(authors: string[]): string {
  if (authors.length === 0) return "Unknown";
  if (authors.length === 1) {
    return authors[0].split(",")[0];
  }
  if (authors.length === 2) {
    return `${authors[0].split(",")[0]} & ${authors[1].split(",")[0]}`;
  }
  return `${authors[0].split(",")[0]} et al.`;
}

function abbreviateJournal(journal: string): string {
  // Common abbreviations
  const abbreviations: Record<string, string> = {
    "journal": "J",
    "international": "Int",
    "environmental": "Environ",
    "science": "Sci",
    "technology": "Technol",
    "engineering": "Eng",
    "research": "Res",
    "management": "Manag",
    "development": "Dev",
    "sustainable": "Sustain",
    "european": "Eur",
    "american": "Am",
    "review": "Rev",
    "proceedings": "Proc",
    "transactions": "Trans",
    "letters": "Lett",
    "advances": "Adv",
    "applied": "Appl",
    "chemistry": "Chem",
    "physics": "Phys",
    "biology": "Biol",
    "medicine": "Med",
    "economics": "Econ",
    "production": "Prod",
    "cleaner": "Clean"
  };

  return journal.split(/\s+/).map(word => {
    const lower = word.toLowerCase();
    return abbreviations[lower] || word;
  }).join(" ");
}

function formatCitation(ref: Reference): string {
  const authorStr = formatAuthors(ref.authors);
  const yearStr = ref.year ? `(${ref.year})` : "(n.d.)";
  const titleStr = ref.title.endsWith(".") ? ref.title : `${ref.title}.`;
  
  let citation = `${authorStr} ${yearStr}. ${titleStr}`;
  
  if (ref.journal) {
    const abbrevJournal = abbreviateJournal(ref.journal);
    citation += ` *${abbrevJournal}*`;
    
    if (ref.volume) {
      citation += ` **${ref.volume}**`;
    }
    
    if (ref.pages) {
      citation += `:${ref.pages.replace("–", "-")}`;
    }
  }
  
  return citation;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query } = await req.json();
    
    if (!query || query.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Query is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if it looks like a DOI
    const doiMatch = query.match(/10\.\d{4,}\/[^\s]+/);
    
    if (doiMatch) {
      const reference = await lookupDOI(doiMatch[0]);
      if (reference) {
        return new Response(
          JSON.stringify({
            reference,
            formattedCitation: formatCitation(reference),
            verified: true
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Try searching CrossRef for the query
    const searchResponse = await fetch(
      `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=1`,
      { headers: { "User-Agent": "grant.eu/1.0 (mailto:support@grant.eu)" } }
    );

    if (searchResponse.ok) {
      const searchData = await searchResponse.json();
      const work = searchData.message?.items?.[0];
      
      if (work) {
        const authors = work.author?.map((a: any) => {
          if (a.family && a.given) return `${a.family}, ${a.given}`;
          if (a.family) return a.family;
          return a.name || "Unknown";
        }) || [];

        const reference: Reference = {
          authors,
          year: work.published?.["date-parts"]?.[0]?.[0] || work["published-online"]?.["date-parts"]?.[0]?.[0] || null,
          title: work.title?.[0] || query,
          journal: work["container-title"]?.[0] || work["short-container-title"]?.[0] || null,
          volume: work.volume || null,
          pages: work.page || work["article-number"] || null,
          doi: work.DOI || null
        };

        return new Response(
          JSON.stringify({
            reference,
            formattedCitation: formatCitation(reference),
            verified: false,
            message: "Please verify this is the correct reference"
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({ 
        error: "Reference not found",
        message: "Could not find this reference. Please enter the DOI or more specific details."
      }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Reference lookup error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
