import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * One-time migration: converts inline base64 logo_url values in the proposals table
 * to proper files in the proposal-files storage bucket.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Find proposals with base64 logos
    const { data: proposals, error: fetchErr } = await supabase
      .from("proposals")
      .select("id, acronym, logo_url")
      .like("logo_url", "data:%");

    if (fetchErr) throw fetchErr;
    if (!proposals || proposals.length === 0) {
      return new Response(JSON.stringify({ message: "No base64 logos to migrate" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Array<{ id: string; acronym: string; status: string }> = [];

    for (const proposal of proposals) {
      try {
        const base64Url: string = proposal.logo_url;

        // Parse the data URI
        const match = base64Url.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) {
          results.push({ id: proposal.id, acronym: proposal.acronym, status: "invalid_data_uri" });
          continue;
        }

        const contentType = match[1];
        const base64Data = match[2];
        const ext = contentType.split("/")[1] || "png";

        // Decode base64 to bytes
        const binaryStr = atob(base64Data);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }

        // Upload to proposal-files bucket
        const filePath = `${proposal.id}/logo/project-logo-migrated.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("proposal-files")
          .upload(filePath, bytes, {
            contentType,
            upsert: true,
          });

        if (uploadErr) {
          results.push({ id: proposal.id, acronym: proposal.acronym, status: `upload_error: ${uploadErr.message}` });
          continue;
        }

        // Update the proposal to store the file path instead of the base64
        const { error: updateErr } = await supabase
          .from("proposals")
          .update({ logo_url: filePath })
          .eq("id", proposal.id);

        if (updateErr) {
          results.push({ id: proposal.id, acronym: proposal.acronym, status: `update_error: ${updateErr.message}` });
          continue;
        }

        results.push({ id: proposal.id, acronym: proposal.acronym, status: "migrated" });
      } catch (err) {
        results.push({ id: proposal.id, acronym: proposal.acronym, status: `error: ${err.message}` });
      }
    }

    return new Response(JSON.stringify({ migrated: results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
