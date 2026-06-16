// Shared auth helper for edge functions.
//
// Most functions repeat the same pattern: read the Authorization header,
// build a Supabase client with the caller's JWT, call getClaims, and
// short-circuit with 401 on failure. This helper centralises that flow.
//
// Usage:
//   const auth = await requireAuth(req);
//   if (!auth.ok) return auth.response;
//   const { userId, callerClient } = auth;
//
// Notes:
// - Uses getClaims (token introspection via JWKS) rather than getUser,
//   matching the project's current security posture.
// - Callers that need the service role client should create it separately;
//   this helper deliberately does not expose it.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "./cors.ts";

export type AuthResult =
  | {
      ok: true;
      userId: string;
      token: string;
      authHeader: string;
      callerClient: SupabaseClient;
    }
  | {
      ok: false;
      response: Response;
    };

function unauthorized(message = "Unauthorized"): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export async function requireAuth(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, response: unauthorized("Missing or invalid Authorization header") };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "Server misconfigured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
    };
  }

  const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await callerClient.auth.getClaims(token);
  const sub = data?.claims?.sub as string | undefined;
  if (error || !sub) {
    return { ok: false, response: unauthorized() };
  }

  return { ok: true, userId: sub, token, authHeader, callerClient };
}
