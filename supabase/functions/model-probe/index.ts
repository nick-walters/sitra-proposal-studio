// Temporary diagnostic: lists Anthropic model IDs so we can verify the mock
// evaluation model identifiers. Delete after use.
Deno.serve(async () => {
  const key = Deno.env.get("ANTHROPIC_API_KEY") || "";
  const res = await fetch("https://api.anthropic.com/v1/models?limit=50", {
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
  });
  const data = await res.json();
  const ids = Array.isArray(data?.data) ? data.data.map((m: { id: string }) => m.id) : data;
  return new Response(JSON.stringify({ status: res.status, ids }), {
    headers: { "Content-Type": "application/json" },
  });
});
