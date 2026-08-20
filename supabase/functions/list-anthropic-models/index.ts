// deno-lint-ignore-file no-explicit-any
//
// Lists the models available from Anthropic's /v1/models endpoint and marks
// which ones are already configured as evaluation model options.
//
// The ANTHROPIC_API_KEY never leaves the server: the client calls this function
// with its own Supabase JWT, we verify the caller is coordinator-or-above, and
// only then do we call Anthropic from inside the function.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Gate: coordinator-or-above may look; applying a model is gated separately
    // (owner/global-admin only) by RLS on evaluation_model_options.
    const [{ data: isCoordinator }, { data: isGlobalAdmin }] = await Promise.all([
      serviceClient.rpc("is_coordinator_or_above", { _user_id: auth.userId }),
      serviceClient.rpc("is_global_admin", { _user_id: auth.userId }),
    ]);
    if (!isCoordinator && !isGlobalAdmin) {
      return json({ error: "Insufficient permissions" }, 403);
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "ANTHROPIC_API_KEY is not configured" }, 500);

    const { data: options } = await serviceClient
      .from("evaluation_model_options")
      .select("model_id, label, price_input_per_mtok, price_output_per_mtok, is_active")
      .order("sort_order");

    let payload: any;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch("https://api.anthropic.com/v1/models?limit=100", {
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) {
        const text = await res.text();
        console.error("Anthropic models endpoint error", res.status, text.slice(0, 300));
        return json(
          {
            error: `Anthropic's models endpoint returned ${res.status}. Please try again later.`,
          },
          502,
        );
      }
      payload = await res.json();
    } catch (err) {
      console.error("Anthropic models endpoint unreachable:", err);
      return json(
        { error: "Could not reach Anthropic's models endpoint. Please check the connection and try again." },
        502,
      );
    }

    const configured = new Map(
      (options || []).map((o: any) => [o.model_id, o]),
    );
    // Newest configured release date, used to flag anything newer.
    const configuredCreatedAt = (payload?.data || [])
      .filter((m: any) => configured.has(m?.id))
      .map((m: any) => new Date(m?.created_at || 0).getTime())
      .filter((t: number) => Number.isFinite(t) && t > 0);
    const newestConfigured = configuredCreatedAt.length ? Math.max(...configuredCreatedAt) : 0;

    const models = (payload?.data || []).map((m: any) => {
      const created = m?.created_at ? new Date(m.created_at).getTime() : 0;
      return {
        id: m?.id,
        display_name: m?.display_name ?? null,
        created_at: m?.created_at ?? null,
        configured: configured.has(m?.id),
        is_newer: !configured.has(m?.id) && created > 0 && created > newestConfigured,
      };
    });

    return json({
      models,
      configured: options || [],
      can_apply: !!isGlobalAdmin,
    });
  } catch (error) {
    console.error("list-anthropic-models failed:", error);
    return json({ error: "Unexpected error while listing models" }, 500);
  }
});
