import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "@shared/cors.ts";
import { Database } from "@shared/database.types.ts";
import { logSystemAction } from "@shared/audit-logger.ts";
import {
  sendWhatsAppMessage,
  sendEmail,
} from "@shared/notification-service.ts";

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_KEY")!;
    const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);

    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    console.log(`Processing daily reminders for ${today}`);

    // Query pending reminders scheduled for today
    const { data: reminders, error: remindersError } = await supabase
      .from("reminders")
      .select(
        `
        *,
        users!inner(
          id,
          email,
          phone,
          roles!inner(name)
        ),
        tasks(
          id,
          title,
          description,
          due_date,
          priority
        )
      `,
      )
      .eq("status", "pending")
      .gte("scheduled_for", today)
      .lt("scheduled_for", tomorrow);

    if (remindersError) {
      throw new Error(`Failed to fetch reminders: ${remindersError.message}`);
    }

    // Query overdue tasks that need reminders
    const { data: overdueTasks, error: tasksError } = await supabase
      .from("tasks")
      .select(
        `
        *,
        users!tasks_assigned_to_fkey(
          id,
          email,
          phone,
          roles!inner(name)
        )
      `,
      )
      .in("status", ["pending", "in_progress"])
      .lt("due_date", now.toISOString())
      .not("assigned_to", "is", null);

    if (tasksError) {
      throw new Error(`Failed to fetch overdue tasks: ${tasksError.message}`);
    }

    const results = {
      reminders_processed: 0,
      overdue_notifications: 0,
      notifications_sent: 0,
      errors: [] as string[],
    };

    // Process scheduled reminders
    for (const reminder of reminders || []) {
      try {
        const user = reminder.users as any;
        const task = reminder.tasks as any;

        let message = reminder.message || reminder.title;
        if (task) {
          message += `\n\nTask: ${task.title}`;
          if (task.due_date) {
            message += `\nDue: ${new Date(task.due_date).toLocaleDateString()}`;
          }
          if (task.priority) {
            message += `\nPriority: ${task.priority}`;
          }
        }

        // Send notification based on user preference (phone first, then email)
        let notificationSent = false;
        if (user.phone) {
          const result = await sendWhatsAppMessage(user.phone, message, {
            reminder_id: reminder.id,
            task_id: task?.id,
            user_id: user.id,
          });
          if (result.success) {
            notificationSent = true;
            results.notifications_sent++;
          }
        }

        if (!notificationSent && user.email) {
          const result = await sendEmail(
            user.email,
            `Reminder: ${reminder.title}`,
            message,
            {
              reminder_id: reminder.id,
              task_id: task?.id,
              user_id: user.id,
            },
          );
          if (result.success) {
            notificationSent = true;
            results.notifications_sent++;
          }
        }

        if (notificationSent) {
          // Mark reminder as sent
          await supabase
            .from("reminders")
            .update({ status: "sent", updated_at: now.toISOString() })
            .eq("id", reminder.id);

          // Log the action
          await logSystemAction(
            supabase,
            "daily_reminder_sent",
            "reminders",
            reminder.id,
            {
              user_id: user.id,
              task_id: task?.id,
              notification_method: user.phone ? "whatsapp" : "email",
            },
          );
        }

        results.reminders_processed++;
      } catch (error) {
        const errorMsg = `Failed to process reminder ${reminder.id}: ${error instanceof Error ? error.message : "Unknown error"}`;
        console.error(errorMsg);
        results.errors.push(errorMsg);
      }
    }

    // Process overdue task notifications
    for (const task of overdueTasks || []) {
      try {
        const user = task.users as any;

        const daysOverdue = Math.floor(
          (now.getTime() - new Date(task.due_date).getTime()) /
            (1000 * 60 * 60 * 24),
        );

        const message = `⚠️ OVERDUE TASK ALERT\n\nTask: ${task.title}\nDue Date: ${new Date(task.due_date).toLocaleDateString()}\nDays Overdue: ${daysOverdue}\nPriority: ${task.priority || "Medium"}\n\nPlease complete this task as soon as possible.`;

        // Send notification
        let notificationSent = false;
        if (user.phone) {
          const result = await sendWhatsAppMessage(user.phone, message, {
            task_id: task.id,
            user_id: user.id,
            days_overdue: daysOverdue,
          });
          if (result.success) {
            notificationSent = true;
            results.notifications_sent++;
          }
        }

        if (!notificationSent && user.email) {
          const result = await sendEmail(
            user.email,
            `⚠️ Overdue Task: ${task.title}`,
            message,
            {
              task_id: task.id,
              user_id: user.id,
              days_overdue: daysOverdue,
            },
          );
          if (result.success) {
            notificationSent = true;
            results.notifications_sent++;
          }
        }

        if (notificationSent) {
          // Log the overdue notification
          await logSystemAction(
            supabase,
            "overdue_task_notification",
            "tasks",
            task.id,
            {
              user_id: user.id,
              days_overdue: daysOverdue,
              notification_method: user.phone ? "whatsapp" : "email",
            },
          );
        }

        results.overdue_notifications++;
      } catch (error) {
        const errorMsg = `Failed to process overdue task ${task.id}: ${error instanceof Error ? error.message : "Unknown error"}`;
        console.error(errorMsg);
        results.errors.push(errorMsg);
      }
    }

    // Log the overall execution
    await logSystemAction(
      supabase,
      "daily_reminders_execution",
      "system",
      "daily-reminders",
      {
        execution_date: today,
        results,
      },
    );

    console.log("Daily reminders processing completed:", results);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Daily reminders processed successfully",
        results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    console.error("Daily reminders function error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
