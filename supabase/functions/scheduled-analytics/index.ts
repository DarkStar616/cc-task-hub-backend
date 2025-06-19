import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "@shared/cors.ts";
import { Database } from "@shared/database.types.ts";
import { logSystemAction } from "@shared/audit-logger.ts";

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

    // Get processing period from query params or default to yesterday
    const url = new URL(req.url);
    const period = url.searchParams.get("period") || "daily"; // daily, weekly, monthly
    const date = url.searchParams.get("date") || today;

    let periodStart: Date;
    let periodEnd: Date;

    switch (period) {
      case "weekly":
        periodEnd = new Date(date);
        periodStart = new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "monthly":
        periodEnd = new Date(date);
        periodStart = new Date(
          periodEnd.getFullYear(),
          periodEnd.getMonth(),
          1,
        );
        break;
      default: // daily
        periodEnd = new Date(date);
        periodStart = new Date(periodEnd.getTime() - 24 * 60 * 60 * 1000);
    }

    const periodStartISO = periodStart.toISOString();
    const periodEndISO = periodEnd.toISOString();

    console.log(
      `Processing ${period} analytics for period: ${periodStartISO} to ${periodEndISO}`,
    );

    const results = {
      period,
      period_start: periodStartISO,
      period_end: periodEndISO,
      metrics_calculated: 0,
      metrics_stored: 0,
      errors: [] as string[],
    };

    // 1. TASK COMPLETION METRICS
    try {
      const { data: tasks, error: tasksError } = await supabase
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
          estimated_duration,
          actual_duration
        `,
        )
        .gte("created_at", periodStartISO)
        .lt("created_at", periodEndISO);

      if (tasksError) throw tasksError;

      const completedTasks =
        tasks?.filter((t) => t.status === "completed") || [];
      const overdueTasks =
        tasks?.filter(
          (t) =>
            t.due_date &&
            new Date(t.due_date) < periodEnd &&
            t.status !== "completed",
        ) || [];

      // Overall completion rate
      const completionRate = tasks?.length
        ? (completedTasks.length / tasks.length) * 100
        : 0;

      await supabase.from("analytics").insert({
        metric_name: "task_completion_rate",
        metric_type: "system",
        metric_value: completionRate,
        metric_unit: "percentage",
        period_start: periodStartISO,
        period_end: periodEndISO,
        metadata: {
          total_tasks: tasks?.length || 0,
          completed_tasks: completedTasks.length,
          overdue_tasks: overdueTasks.length,
          period: period,
        },
      });

      results.metrics_calculated++;
      results.metrics_stored++;

      // Average completion time
      const completedWithDuration = completedTasks.filter(
        (t) => t.completed_at && t.created_at,
      );
      if (completedWithDuration.length > 0) {
        const avgCompletionTime =
          completedWithDuration.reduce((sum, task) => {
            const duration =
              new Date(task.completed_at!).getTime() -
              new Date(task.created_at).getTime();
            return sum + duration;
          }, 0) / completedWithDuration.length;

        const avgCompletionHours = avgCompletionTime / (1000 * 60 * 60);

        await supabase.from("analytics").insert({
          metric_name: "avg_task_completion_time",
          metric_type: "system",
          metric_value: avgCompletionHours,
          metric_unit: "hours",
          period_start: periodStartISO,
          period_end: periodEndISO,
          metadata: {
            tasks_with_duration: completedWithDuration.length,
            period: period,
          },
        });

        results.metrics_calculated++;
        results.metrics_stored++;
      }

      // Overdue rate
      const overdueRate = tasks?.length
        ? (overdueTasks.length / tasks.length) * 100
        : 0;

      await supabase.from("analytics").insert({
        metric_name: "task_overdue_rate",
        metric_type: "system",
        metric_value: overdueRate,
        metric_unit: "percentage",
        period_start: periodStartISO,
        period_end: periodEndISO,
        metadata: {
          total_tasks: tasks?.length || 0,
          overdue_tasks: overdueTasks.length,
          period: period,
        },
      });

      results.metrics_calculated++;
      results.metrics_stored++;
    } catch (error) {
      const errorMsg = `Task metrics calculation failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      console.error(errorMsg);
      results.errors.push(errorMsg);
    }

    // 2. USER ENGAGEMENT METRICS
    try {
      const { data: clockSessions, error: clockError } = await supabase
        .from("clock_sessions")
        .select(
          `
          id,
          user_id,
          clock_in,
          clock_out,
          total_duration,
          status
        `,
        )
        .gte("clock_in", periodStartISO)
        .lt("clock_in", periodEndISO);

      if (clockError) throw clockError;

      const completedSessions =
        clockSessions?.filter((s) => s.status === "completed") || [];

      // Average session duration
      if (completedSessions.length > 0) {
        const totalMinutes = completedSessions.reduce((sum, session) => {
          if (session.total_duration) {
            // Parse PostgreSQL interval format (e.g., "02:30:00")
            const parts = session.total_duration.toString().split(":");
            const hours = parseInt(parts[0] || "0");
            const minutes = parseInt(parts[1] || "0");
            return sum + hours * 60 + minutes;
          }
          return sum;
        }, 0);

        const avgSessionMinutes = totalMinutes / completedSessions.length;

        await supabase.from("analytics").insert({
          metric_name: "avg_session_duration",
          metric_type: "system",
          metric_value: avgSessionMinutes,
          metric_unit: "minutes",
          period_start: periodStartISO,
          period_end: periodEndISO,
          metadata: {
            total_sessions: clockSessions?.length || 0,
            completed_sessions: completedSessions.length,
            period: period,
          },
        });

        results.metrics_calculated++;
        results.metrics_stored++;
      }

      // Active users count
      const activeUsers = new Set(clockSessions?.map((s) => s.user_id) || []);

      await supabase.from("analytics").insert({
        metric_name: "active_users_count",
        metric_type: "system",
        metric_value: activeUsers.size,
        metric_unit: "count",
        period_start: periodStartISO,
        period_end: periodEndISO,
        metadata: {
          total_sessions: clockSessions?.length || 0,
          period: period,
        },
      });

      results.metrics_calculated++;
      results.metrics_stored++;
    } catch (error) {
      const errorMsg = `User engagement metrics calculation failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      console.error(errorMsg);
      results.errors.push(errorMsg);
    }

    // 3. DEPARTMENT PERFORMANCE METRICS
    try {
      const { data: departments, error: deptError } = await supabase.from(
        "departments",
      ).select(`
          id,
          name,
          tasks!tasks_department_id_fkey(
            id,
            status,
            created_at,
            completed_at
          )
        `);

      if (deptError) throw deptError;

      for (const dept of departments || []) {
        const deptTasks =
          (dept.tasks as any[])?.filter(
            (t) =>
              t.created_at >= periodStartISO && t.created_at < periodEndISO,
          ) || [];

        if (deptTasks.length > 0) {
          const completedDeptTasks = deptTasks.filter(
            (t) => t.status === "completed",
          );
          const deptCompletionRate =
            (completedDeptTasks.length / deptTasks.length) * 100;

          await supabase.from("analytics").insert({
            metric_name: "department_completion_rate",
            metric_type: "department",
            department_id: dept.id,
            metric_value: deptCompletionRate,
            metric_unit: "percentage",
            period_start: periodStartISO,
            period_end: periodEndISO,
            metadata: {
              department_name: dept.name,
              total_tasks: deptTasks.length,
              completed_tasks: completedDeptTasks.length,
              period: period,
            },
          });

          results.metrics_calculated++;
          results.metrics_stored++;
        }
      }
    } catch (error) {
      const errorMsg = `Department metrics calculation failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      console.error(errorMsg);
      results.errors.push(errorMsg);
    }

    // 4. USER PERFORMANCE METRICS
    try {
      const { data: users, error: usersError } = await supabase
        .from("users")
        .select(
          `
          id,
          email,
          department_id,
          tasks!tasks_assigned_to_fkey(
            id,
            status,
            created_at,
            completed_at,
            priority
          )
        `,
        )
        .eq("status", "active");

      if (usersError) throw usersError;

      for (const user of users || []) {
        const userTasks =
          (user.tasks as any[])?.filter(
            (t) =>
              t.created_at >= periodStartISO && t.created_at < periodEndISO,
          ) || [];

        if (userTasks.length > 0) {
          const completedUserTasks = userTasks.filter(
            (t) => t.status === "completed",
          );
          const userCompletionRate =
            (completedUserTasks.length / userTasks.length) * 100;

          await supabase.from("analytics").insert({
            metric_name: "user_completion_rate",
            metric_type: "user",
            user_id: user.id,
            department_id: user.department_id,
            metric_value: userCompletionRate,
            metric_unit: "percentage",
            period_start: periodStartISO,
            period_end: periodEndISO,
            metadata: {
              user_email: user.email,
              total_tasks: userTasks.length,
              completed_tasks: completedUserTasks.length,
              high_priority_tasks: userTasks.filter(
                (t) => t.priority === "high",
              ).length,
              period: period,
            },
          });

          results.metrics_calculated++;
          results.metrics_stored++;
        }
      }
    } catch (error) {
      const errorMsg = `User metrics calculation failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      console.error(errorMsg);
      results.errors.push(errorMsg);
    }

    // 5. FEEDBACK AND QUALITY METRICS
    try {
      const { data: feedback, error: feedbackError } = await supabase
        .from("feedback")
        .select(
          `
          id,
          rating,
          type,
          status,
          user_id,
          task_id,
          created_at
        `,
        )
        .gte("created_at", periodStartISO)
        .lt("created_at", periodEndISO);

      if (feedbackError) throw feedbackError;

      if (feedback && feedback.length > 0) {
        // Average rating
        const ratingsWithValues = feedback.filter((f) => f.rating !== null);
        if (ratingsWithValues.length > 0) {
          const avgRating =
            ratingsWithValues.reduce((sum, f) => sum + (f.rating || 0), 0) /
            ratingsWithValues.length;

          await supabase.from("analytics").insert({
            metric_name: "avg_feedback_rating",
            metric_type: "system",
            metric_value: avgRating,
            metric_unit: "rating",
            period_start: periodStartISO,
            period_end: periodEndISO,
            metadata: {
              total_feedback: feedback.length,
              rated_feedback: ratingsWithValues.length,
              period: period,
            },
          });

          results.metrics_calculated++;
          results.metrics_stored++;
        }

        // Feedback volume
        await supabase.from("analytics").insert({
          metric_name: "feedback_volume",
          metric_type: "system",
          metric_value: feedback.length,
          metric_unit: "count",
          period_start: periodStartISO,
          period_end: periodEndISO,
          metadata: {
            by_type: {
              task: feedback.filter((f) => f.type === "task").length,
              system: feedback.filter((f) => f.type === "system").length,
              user: feedback.filter((f) => f.type === "user").length,
              department: feedback.filter((f) => f.type === "department")
                .length,
            },
            period: period,
          },
        });

        results.metrics_calculated++;
        results.metrics_stored++;
      }
    } catch (error) {
      const errorMsg = `Feedback metrics calculation failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      console.error(errorMsg);
      results.errors.push(errorMsg);
    }

    // Log the overall execution
    await logSystemAction(
      supabase,
      "scheduled_analytics_execution",
      "system",
      "scheduled-analytics",
      {
        period,
        period_start: periodStartISO,
        period_end: periodEndISO,
        results,
      },
    );

    console.log("Scheduled analytics processing completed:", results);

    return new Response(
      JSON.stringify({
        success: true,
        message: `${period} analytics processed successfully`,
        results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    console.error("Scheduled analytics function error:", error);

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
