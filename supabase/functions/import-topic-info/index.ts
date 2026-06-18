import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";

interface Section {
  label: string;
  html: string;
}

function splitDescription(html: string): { sections: Section[] } {
  if (!html) return { sections: [] };
  const markerRe = /<p\s+class=["']topicdescriptionkind["']\s*>([\s\S]*?)<\/p>/gi;
  const sections: Section[] = [];
  const matches: { label: string; start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = markerRe.exec(html)) !== null) {
    const rawLabel = m[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim().replace(/:\s*$/, "");
    matches.push({ label: rawLabel, start: m.index, end: m.index + m[0].length });
  }
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const next = matches[i + 1];
    const body = html.slice(cur.end, next ? next.start : html.length).trim();
    sections.push({ label: cur.label, html: body });
  }
  return { sections };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;

    let body: any;
    try { body = await req.json(); } catch { body = null; }
    const topicId = body?.topicId;

    if (!topicId || typeof topicId !== "string" || topicId.length > 200 || !/^[A-Z0-9-]+$/i.test(topicId)) {
      return new Response(
        JSON.stringify({ error: "Invalid topic ID" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = `https://api.tech.ec.europa.eu/search-api/prod/rest/search?apiKey=SEDIA&text=${encodeURIComponent(topicId)}&pageSize=20&pageNumber=1`;

    const form = new FormData();
    form.append(
      "query",
      new Blob([JSON.stringify({ bool: { must: [{ terms: { type: ["1"] } }] } })], { type: "application/json" }),
      "blob"
    );
    form.append(
      "languages",
      new Blob([JSON.stringify(["en"])], { type: "application/json" }),
      "blob"
    );

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { Accept: "application/json", "Accept-Encoding": "identity" },
        body: form,
      });
    } catch (e) {
      console.error("import-topic-info: SEDIA fetch threw:", e);
      return new Response(
        JSON.stringify({ error: "Could not reach the EU portal" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let raw = "";
    try {
      raw = await response.text();
    } catch {
      try { raw = new TextDecoder().decode(await response.arrayBuffer()); } catch { raw = ""; }
    }

    if (!response.ok) {
      console.error("import-topic-info: SEDIA non-OK", response.status, raw.slice(0, 500));
      return new Response(
        JSON.stringify({ error: "Could not reach the EU portal" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let json: any;
    try { json = JSON.parse(raw); } catch {
      console.error("import-topic-info: SEDIA parse failed");
      return new Response(
        JSON.stringify({ error: "Could not reach the EU portal" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: any[] = Array.isArray(json?.results) ? json.results : [];
    const hit = results.find((r) => r?.metadata?.identifier?.[0] === topicId);

    if (!hit) {
      return new Response(
        JSON.stringify({ error: "Topic not found on the portal" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const md = hit.metadata || {};
    const title: string | null = md.title?.[0] ?? null;
    const descriptionHtml: string = md.descriptionByte?.[0] ?? "";
    const destinationDetails: string | null = md.destinationDetails?.[0] ?? null;
    const hitUrl: string | null = hit.url ?? null;
    const typesOfAction: string | null = md.typesOfAction?.[0] ?? null;
    const deadlineDate: string | null = md.deadlineDate?.[0] ?? null;

    const { sections } = splitDescription(descriptionHtml);

    let expectedOutcome: string | null = null;
    let scope: string | null = null;
    const otherSections: Section[] = [];
    for (const s of sections) {
      const norm = s.label.toLowerCase().trim();
      if (/expected outcome/i.test(norm) && !expectedOutcome) {
        expectedOutcome = s.html || null;
      } else if (/^scope/i.test(norm) && !scope) {
        scope = s.html || null;
      } else {
        // Filter SEDIA sentinel/empty sections (e.g. trailing `<p class="topicdescriptionkind">null</p>`)
        if (!norm || norm === "null") continue;
        if (!s.html || !s.html.replace(/\s+/g, "")) continue;
        otherSections.push(s);
      }
    }


    return new Response(
      JSON.stringify({
        success: true,
        topic: {
          topicId,
          title,
          expectedOutcome,
          scope,
          destinationDetails,
          otherSections,
          rawDescriptionHtml: descriptionHtml,
          url: hitUrl,
          typesOfAction,
          deadlineDate,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("import-topic-info error:", error);
    return new Response(
      JSON.stringify({ error: "Import failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
