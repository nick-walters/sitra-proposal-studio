import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireAuth } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/cors.ts";


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
  const abbreviations: Record<string, string> = {
    "journal": "J",
    "journals": "J",
    "international": "Int",
    "environmental": "Environ",
    "environment": "Environ",
    "science": "Sci",
    "sciences": "Sci",
    "scientific": "Sci",
    "technology": "Technol",
    "technologies": "Technol",
    "engineering": "Eng",
    "research": "Res",
    "management": "Manag",
    "development": "Dev",
    "sustainable": "Sustain",
    "sustainability": "Sustain",
    "european": "Eur",
    "american": "Am",
    "review": "Rev",
    "reviews": "Rev",
    "proceedings": "Proc",
    "transactions": "Trans",
    "letters": "Lett",
    "advances": "Adv",
    "applied": "Appl",
    "chemistry": "Chem",
    "chemical": "Chem",
    "physics": "Phys",
    "physical": "Phys",
    "biology": "Biol",
    "biological": "Biol",
    "medicine": "Med",
    "medical": "Med",
    "economics": "Econ",
    "economic": "Econ",
    "production": "Prod",
    "cleaner": "Clean",
    "information": "Inf",
    "informatics": "Inform",
    "modeling": "Model",
    "modelling": "Model",
    "computer": "Comput",
    "computing": "Comput",
    "computational": "Comput",
    "communications": "Commun",
    "communication": "Commun",
    "education": "Educ",
    "educational": "Educ",
    "psychology": "Psychol",
    "psychological": "Psychol",
    "behaviour": "Behav",
    "behavior": "Behav",
    "behavioural": "Behav",
    "behavioral": "Behav",
    "molecular": "Mol",
    "biochemistry": "Biochem",
    "biochemical": "Biochem",
    "biotechnology": "Biotechnol",
    "pharmaceutical": "Pharm",
    "pharmacology": "Pharmacol",
    "neuroscience": "Neurosci",
    "neurological": "Neurol",
    "neurology": "Neurol",
    "clinical": "Clin",
    "experimental": "Exp",
    "theoretical": "Theor",
    "analytical": "Anal",
    "analysis": "Anal",
    "industrial": "Ind",
    "industry": "Ind",
    "national": "Natl",
    "academy": "Acad",
    "society": "Soc",
    "association": "Assoc",
    "annual": "Annu",
    "quarterly": "Q",
    "monthly": "Mon",
    "bulletin": "Bull",
    "report": "Rep",
    "reports": "Rep",
    "studies": "Stud",
    "study": "Stud",
    "energy": "Energy",
    "materials": "Mater",
    "material": "Mater",
    "agriculture": "Agric",
    "agricultural": "Agric",
    "ecology": "Ecol",
    "ecological": "Ecol",
    "geography": "Geogr",
    "geological": "Geol",
    "geology": "Geol",
    "mathematics": "Math",
    "mathematical": "Math",
    "statistics": "Stat",
    "statistical": "Stat",
    "policy": "Policy",
    "policies": "Policy",
    "innovation": "Innov",
    "renewable": "Renew",
    "natural": "Nat",
    "nature": "Nat",
  };

  // Drop common stop words from journal titles per ISO 4 conventions
  const drop = new Set(["of", "the", "and", "for", "in", "on", "an", "a", "to", "&", "from", "with", "by"]);

  return journal
    .split(/\s+/)
    .filter(w => !drop.has(w.toLowerCase()))
    .map(word => {
      const lower = word.toLowerCase().replace(/[^\w]/g, '');
      return abbreviations[lower] || word;
    })
    .join(" ");
}

function toSentenceCase(title: string): string {
  // Split keeping whitespace so we can preserve original spacing
  const parts = title.split(/(\s+)/);
  let firstSeen = false;
  return parts.map(p => {
    if (/^\s+$/.test(p) || p.length === 0) return p;
    // Preserve all-caps acronyms (>=2 letters) and tokens containing digits
    const core = p.replace(/[^A-Za-z0-9]/g, '');
    const isAcronym = core.length >= 2 && core === core.toUpperCase() && /[A-Z]/.test(core);
    const hasDigit = /\d/.test(core);
    if (!firstSeen) {
      firstSeen = true;
      if (isAcronym || hasDigit) return p;
      return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
    }
    if (isAcronym || hasDigit) return p;
    return p.toLowerCase();
  }).join('');
}

function formatCitation(ref: Reference): string {
  const authorStr = formatAuthors(ref.authors);
  const yearStr = ref.year ? `(${ref.year})` : "(n.d.)";
  const sentenceTitle = toSentenceCase(ref.title);
  const titleStr = sentenceTitle.endsWith(".") ? sentenceTitle : `${sentenceTitle}.`;

  let citation = `${authorStr} ${yearStr}. <span data-cite-title>${titleStr}</span>`;

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
    // Authenticate the user
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;

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
