import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SectionWithDeadline {
  id: string;
  title: string;
  section_number: string;
  due_date: string;
  assigned_to: string;
  proposal_template_id: string;
  proposal_id?: string;
  proposal_acronym?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    
    // Calculate date thresholds
    const oneDayFromNow = new Date(now);
    oneDayFromNow.setDate(oneDayFromNow.getDate() + 1);
    const oneDayStr = oneDayFromNow.toISOString().split('T')[0];
    
    const threeDaysFromNow = new Date(now);
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    const threeDaysStr = threeDaysFromNow.toISOString().split('T')[0];

    console.log(`Checking deadlines: today=${today}, 1day=${oneDayStr}, 3days=${threeDaysStr}`);

    // Fetch sections with due dates that are assigned
    const { data: sections, error: sectionsError } = await supabase
      .from("proposal_template_sections")
      .select(`
        id,
        title,
        section_number,
        due_date,
        assigned_to,
        proposal_template_id,
        proposal_templates!inner(
          proposal_id,
          proposals!inner(acronym)
        )
      `)
      .not("due_date", "is", null)
      .not("assigned_to", "is", null)
      .lte("due_date", threeDaysStr);

    if (sectionsError) {
      console.error("Error fetching sections:", sectionsError);
      throw sectionsError;
    }

    console.log(`Found ${sections?.length || 0} sections with upcoming/past deadlines`);

    const notificationsToCreate: Array<{
      user_id: string;
      proposal_id: string;
      section_id: string;
      section_title: string;
      type: string;
      title: string;
      message: string;
    }> = [];

    for (const section of sections || []) {
      const dueDate = section.due_date.split('T')[0];
      const proposalData = section.proposal_templates as any;
      const proposalId = proposalData?.proposal_id;
      const proposalAcronym = proposalData?.proposals?.acronym || "Unknown";

      if (!proposalId) {
        console.log(`Skipping section ${section.id} - no proposal found`);
        continue;
      }

      let notificationType: string | null = null;
      let title = "";
      let message = "";

      if (dueDate < today) {
        // Overdue
        notificationType = "deadline_overdue";
        title = "Section Overdue";
        message = `Section "${section.section_number} ${section.title}" in ${proposalAcronym} is overdue!`;
      } else if (dueDate === today) {
        // Due today
        notificationType = "deadline_today";
        title = "Section Due Today";
        message = `Section "${section.section_number} ${section.title}" in ${proposalAcronym} is due today.`;
      } else if (dueDate === oneDayStr) {
        // Due tomorrow
        notificationType = "deadline_tomorrow";
        title = "Section Due Tomorrow";
        message = `Section "${section.section_number} ${section.title}" in ${proposalAcronym} is due tomorrow.`;
      } else if (dueDate <= threeDaysStr) {
        // Due in 3 days
        notificationType = "deadline_soon";
        title = "Section Due Soon";
        const daysLeft = Math.ceil((new Date(dueDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        message = `Section "${section.section_number} ${section.title}" in ${proposalAcronym} is due in ${daysLeft} days.`;
      }

      if (notificationType) {
        // Check if we already sent this type of notification today
        const { data: existingNotification } = await supabase
          .from("notifications")
          .select("id")
          .eq("user_id", section.assigned_to)
          .eq("section_id", section.id)
          .eq("type", notificationType)
          .gte("created_at", `${today}T00:00:00`)
          .maybeSingle();

        if (!existingNotification) {
          notificationsToCreate.push({
            user_id: section.assigned_to,
            proposal_id: proposalId,
            section_id: section.id,
            section_title: `${section.section_number} ${section.title}`,
            type: notificationType,
            title,
            message,
          });
        } else {
          console.log(`Skipping duplicate notification for section ${section.id}, type ${notificationType}`);
        }
      }
    }

    console.log(`Creating ${notificationsToCreate.length} new notifications`);

    if (notificationsToCreate.length > 0) {
      const { error: insertError } = await supabase
        .from("notifications")
        .insert(notificationsToCreate);

      if (insertError) {
        console.error("Error creating notifications:", insertError);
        throw insertError;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        sectionsChecked: sections?.length || 0,
        notificationsCreated: notificationsToCreate.length,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in deadline-reminders function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
