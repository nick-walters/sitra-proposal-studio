import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const WELCOME_MESSAGE = `Welcome to Sitra Proposal Studio, a co-writing platform for developing funding proposals!

Please acquaint yourself with the different pages of the platform from the left panel, including Part A forms, where we collect data that we will input into the Funding & Tenders Portal, and Part B, where we will co-write the work plan together with other participants.

Start by checking and completing or correcting the participant information for yourself, your organisation, and your colleagues.

You can leave public or private messages here on this message board, and allocate and be allocated tasks to complete via the tasks page. You can also access your collaborators' contact info via the menu bar.

If you experience any issues with the platform, please report them via the feedback form accessible from the menu bar.

The coordinator will allocate tasks according to priority, as and when they arise.

Please note that this is a new platform, currently in beta testing. It has a version history function, and we are also regularly downloading content as a backup. There may be bugs in the system that we will work to resolve throughout the process.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Get user from auth token
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) throw new Error("Unauthorized");

    const { proposalId } = await req.json();
    if (!proposalId) throw new Error("Missing proposalId");

    const admin = createClient(supabaseUrl, serviceKey);

    // Check if already onboarded
    const { data: existing } = await admin
      .from("proposal_user_onboarding")
      .select("id")
      .eq("proposal_id", proposalId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ already_onboarded: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark as onboarded
    await admin.from("proposal_user_onboarding").insert({
      proposal_id: proposalId,
      user_id: user.id,
    });

    const now = new Date();
    const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const startDate = now.toISOString().split("T")[0];
    const endDate = sevenDaysLater.toISOString().split("T")[0];

    // SYSTEM_AUTHOR_ID: a fake UUID that represents "Sitra Proposal Studio"
    // We use a deterministic UUID so the messaging board can recognise it
    const SYSTEM_AUTHOR_ID = "00000000-0000-0000-0000-000000000001";

    // 1. Create private welcome message visible only to this user
    const { data: msg, error: msgErr } = await admin
      .from("proposal_messages")
      .insert({
        proposal_id: proposalId,
        author_id: user.id, // must be a real user for FK, but we override display name
        content: WELCOME_MESSAGE,
        visibility: "private",
        priority_level: 2,
        is_high_priority: false,
        is_pinned: false,
        is_resolved: false,
      })
      .select()
      .single();

    if (msgErr) throw msgErr;

    // Add the user as the only recipient of this private message
    await admin.from("proposal_message_recipients").insert({
      message_id: msg.id,
      user_id: user.id,
    });

    // Tag it as a system message via metadata (we'll use a convention)
    // Store system sender info in a separate approach: we'll add a column or use content prefix
    // For now, we mark the message with a special metadata approach by updating content with a marker
    // Actually, let's just store the system flag differently - we'll handle display in the frontend

    // 2. Create notification for the welcome message
    await admin.from("notifications").insert({
      user_id: user.id,
      proposal_id: proposalId,
      type: "mention",
      title: "Welcome to Sitra Proposal Studio",
      message: "You have a welcome message on the message board",
      metadata: { source: "message", message_id: msg.id, system_message: true },
    });

    // 3. Create task: "Check contact info"
    const { data: task1, error: t1Err } = await admin
      .from("proposal_tasks")
      .insert({
        proposal_id: proposalId,
        title: "Check contact info",
        description: 'Check that the contact information for you, your colleagues, and your organisation is correct, accessible from "Participants" and then your organisation in the left panel',
        responsible_user_id: user.id,
        start_date: startDate,
        end_date: endDate,
        status: "not_started",
        order_index: 0,
        created_by: user.id,
      })
      .select()
      .single();

    if (t1Err) throw t1Err;

    // 4. Create task: "Indicate availability"
    const { data: task2, error: t2Err } = await admin
      .from("proposal_tasks")
      .insert({
        proposal_id: proposalId,
        title: "Indicate availability",
        description: "Add your availability during the proposal preparation period to the availability page accessible from the left panel",
        responsible_user_id: user.id,
        start_date: startDate,
        end_date: endDate,
        status: "not_started",
        order_index: 1,
        created_by: user.id,
      })
      .select()
      .single();

    if (t2Err) throw t2Err;

    // 5. Notifications for tasks
    await admin.from("notifications").insert([
      {
        user_id: user.id,
        proposal_id: proposalId,
        type: "mention",
        title: "You were assigned a task",
        message: `You have been assigned to task "Check contact info"`,
        metadata: { source: "task", task_id: task1.id },
      },
      {
        user_id: user.id,
        proposal_id: proposalId,
        type: "mention",
        title: "You were assigned a task",
        message: `You have been assigned to task "Indicate availability"`,
        metadata: { source: "task", task_id: task2.id },
      },
    ]);

    return new Response(JSON.stringify({ success: true, message_id: msg.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Onboard error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
