import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "@shared/cors.ts";
import { Database } from "@shared/database.types.ts";
import { logSystemAction } from "@shared/audit-logger.ts";
import {
  sendEmail,
  sendWhatsAppMessage,
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
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weekStartISO = weekStart.toISOString();
    const nowISO = now.toISOString();

    console.log(
      `Generating weekly digest for period: ${weekStartISO} to ${nowISO}`,
    );

    // Get managers and admins who should receive the digest
    const { data: recipients, error: recipientsError } = await supabase
      .from("users")
      .select(
        `
        id,
        email,
        phone,
        department_id,
        roles!inner(
          name
        ),
        departments(
          name
        )
      `,
      )
      .in("roles.name", ["Admin", "Manager", "God"])
      .eq("status", "active");

    if (recipientsError) {
      throw new Error(`Failed to fetch recipients: ${recipientsError.message}`);
    }

    // Aggregate weekly task statistics
    const { data: taskStats, error: taskStatsError } = await supabase
      .from("tasks")
      .select(
        `
        id,
        status,
        priority,
        department_id,
        assigned_to,
        created_at,
        completed_at,
        due_date,
        departments(name),
        users!tasks_assigned_to_fkey(email)
      `,
      )
      .gte("created_at", weekStartISO)
      .lt("created_at", nowISO);

    if (taskStatsError) {
      throw new Error(
        `Failed to fetch task statistics: ${taskStatsError.message}`,
      );
    }

    // Calculate completion statistics
    const completedTasks =
      taskStats?.filter((t) => t.status === "completed") || [];
    const overdueTasks =
      taskStats?.filter(
        (t) =>
          t.due_date && new Date(t.due_date) < now && t.status !== "completed",
      ) || [];
    const inProgressTasks =
      taskStats?.filter((t) => t.status === "in_progress") || [];
    const pendingTasks = taskStats?.filter((t) => t.status === "pending") || [];

    // Calculate department statistics
    const departmentStats = new Map();
    taskStats?.forEach((task) => {
      const deptName = (task.departments as any)?.name || "Unassigned";
      if (!departmentStats.has(deptName)) {
        departmentStats.set(deptName, {
          total: 0,
          completed: 0,
          overdue: 0,
          in_progress: 0,
          pending: 0,
        });
      }
      const stats = departmentStats.get(deptName);
      stats.total++;
      if (task.status === "completed") stats.completed++;
      else if (task.status === "in_progress") stats.in_progress++;
      else if (task.status === "pending") stats.pending++;
      if (
        task.due_date &&
        new Date(task.due_date) < now &&
        task.status !== "completed"
      ) {
        stats.overdue++;
      }
    });

    // Find top performers (users with most completed tasks)
    const userPerformance = new Map();
    completedTasks.forEach((task) => {
      const userEmail = (task.users as any)?.email || "Unknown";
      userPerformance.set(userEmail, (userPerformance.get(userEmail) || 0) + 1);
    });
    const topPerformers = Array.from(userPerformance.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Calculate average completion time
    const completedWithDuration = completedTasks.filter(
      (t) => t.completed_at && t.created_at,
    );
    const avgCompletionTime =
      completedWithDuration.length > 0
        ? completedWithDuration.reduce((sum, task) => {
            const duration =
              new Date(task.completed_at!).getTime() -
              new Date(task.created_at).getTime();
            return sum + duration;
          }, 0) / completedWithDuration.length
        : 0;

    const avgCompletionDays =
      Math.round((avgCompletionTime / (1000 * 60 * 60 * 24)) * 10) / 10;

    // Generate digest content
    const digestData = {
      period: {
        start: weekStartISO,
        end: nowISO,
        week_of: weekStart.toISOString().split("T")[0],
      },
      summary: {
        total_tasks: taskStats?.length || 0,
        completed_tasks: completedTasks.length,
        overdue_tasks: overdueTasks.length,
        in_progress_tasks: inProgressTasks.length,
        pending_tasks: pendingTasks.length,
        completion_rate: taskStats?.length
          ? Math.round((completedTasks.length / taskStats.length) * 100)
          : 0,
        avg_completion_days: avgCompletionDays,
      },
      department_breakdown: Object.fromEntries(departmentStats),
      top_performers: topPerformers,
      priority_breakdown: {
        high: taskStats?.filter((t) => t.priority === "high").length || 0,
        medium: taskStats?.filter((t) => t.priority === "medium").length || 0,
        low: taskStats?.filter((t) => t.priority === "low").length || 0,
        urgent: taskStats?.filter((t) => t.priority === "urgent").length || 0,
      },
    };

    // Generate human-readable digest message
    const digestMessage =
      `📊 WEEKLY TASK DIGEST\n` +
      `Week of ${new Date(weekStart).toLocaleDateString()}\n\n` +
      `📈 SUMMARY\n` +
      `• Total Tasks: ${digestData.summary.total_tasks}\n` +
      `• Completed: ${digestData.summary.completed_tasks} (${digestData.summary.completion_rate}%)\n` +
      `• In Progress: ${digestData.summary.in_progress_tasks}\n` +
      `• Pending: ${digestData.summary.pending_tasks}\n` +
      `• Overdue: ${digestData.summary.overdue_tasks}\n` +
      `• Avg Completion Time: ${digestData.summary.avg_completion_days} days\n\n` +
      `🏆 TOP PERFORMERS\n` +
      topPerformers
        .slice(0, 3)
        .map((p, i) => `${i + 1}. ${p[0]}: ${p[1]} tasks`)
        .join("\n") +
      `\n\n🏢 DEPARTMENT BREAKDOWN\n` +
      Array.from(departmentStats.entries())
        .map(
          ([dept, stats]) =>
            `• ${dept}: ${stats.completed}/${stats.total} completed (${Math.round((stats.completed / stats.total) * 100)}%)`,
        )
        .join("\n") +
      `\n\n⚡ PRIORITY BREAKDOWN\n` +
      `• Urgent: ${digestData.priority_breakdown.urgent}\n` +
      `• High: ${digestData.priority_breakdown.high}\n` +
      `• Medium: ${digestData.priority_breakdown.medium}\n` +
      `• Low: ${digestData.priority_breakdown.low}`;

    const results = {
      digest_generated: true,
      recipients_count: recipients?.length || 0,
      notifications_sent: 0,
      errors: [] as string[],
    };

    // Send digest to all recipients
    for (const recipient of recipients || []) {
      try {
        const user = recipient as any;
        const role = user.roles?.name;
        const department = user.departments?.name;

        // Customize message based on role and department
        let customMessage = digestMessage;
        if (role === "Manager" && department) {
          const deptStats = departmentStats.get(department);
          if (deptStats) {
            customMessage +=
              `\n\n📋 YOUR DEPARTMENT (${department})\n` +
              `• Total: ${deptStats.total}\n` +
              `• Completed: ${deptStats.completed}\n` +
              `• Overdue: ${deptStats.overdue}\n` +
              `• Completion Rate: ${Math.round((deptStats.completed / deptStats.total) * 100)}%`;
          }
        }

        // Send via email (preferred for digest reports)
        if (user.email) {
          const result = await sendEmail(
            user.email,
            `Weekly Task Digest - Week of ${new Date(weekStart).toLocaleDateString()}`,
            customMessage,
            {
              recipient_id: user.id,
              role: role,
              department: department,
              digest_data: digestData,
            },
          );

          if (result.success) {
            results.notifications_sent++;
          } else {
            results.errors.push(
              `Failed to send email to ${user.email}: ${result.error}`,
            );
          }
        }
        // Fallback to WhatsApp if no email
        else if (user.phone) {
          const result = await sendWhatsAppMessage(user.phone, customMessage, {
            recipient_id: user.id,
            role: role,
            department: department,
          });

          if (result.success) {
            results.notifications_sent++;
          } else {
            results.errors.push(
              `Failed to send WhatsApp to ${user.phone}: ${result.error}`,
            );
          }
        }

        // Log successful delivery
        if (results.notifications_sent > 0) {
          await logSystemAction(
            supabase,
            "weekly_digest_sent",
            "users",
            user.id,
            {
              week_of: digestData.period.week_of,
              role: role,
              department: department,
              delivery_method: user.email ? "email" : "whatsapp",
            },
          );
        }
      } catch (error) {
        const errorMsg = `Failed to send digest to recipient ${recipient.id}: ${error instanceof Error ? error.message : "Unknown error"}`;
        console.error(errorMsg);
        results.errors.push(errorMsg);
      }
    }

    // Store digest data in analytics table for historical tracking
    const analyticsEntries = [
      {
        metric_name: "weekly_completion_rate",
        metric_type: "system",
        metric_value: digestData.summary.completion_rate,
        metric_unit: "percentage",
        period_start: weekStartISO,
        period_end: nowISO,
        metadata: { digest_data: digestData },
      },
      {
        metric_name: "weekly_task_count",
        metric_type: "system",
        metric_value: digestData.summary.total_tasks,
        metric_unit: "count",
        period_start: weekStartISO,
        period_end: nowISO,
        metadata: { digest_data: digestData },
      },
      {
        metric_name: "weekly_avg_completion_time",
        metric_type: "system",
        metric_value: digestData.summary.avg_completion_days,
        metric_unit: "days",
        period_start: weekStartISO,
        period_end: nowISO,
        metadata: { digest_data: digestData },
      },
    ];

    const { error: analyticsError } = await supabase
      .from("analytics")
      .insert(analyticsEntries);

    if (analyticsError) {
      console.error("Failed to store analytics:", analyticsError);
      results.errors.push(
        `Analytics storage failed: ${analyticsError.message}`,
      );
    }

    // Log the overall execution
    await logSystemAction(
      supabase,
      "weekly_digest_execution",
      "system",
      "weekly-digest",
      {
        week_of: digestData.period.week_of,
        results,
        digest_data: digestData,
      },
    );

    console.log("Weekly digest processing completed:", results);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Weekly digest generated and sent successfully",
        results,
        digest_data: digestData,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    console.error("Weekly digest function error:", error);

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
