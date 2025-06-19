import { NextRequest } from "next/server";
import {
  getAuthContext,
  hasRole,
  createUnauthorizedResponse,
  createForbiddenResponse,
  createBadRequestResponse,
  createSuccessResponse,
  createErrorResponse,
} from "@/utils/auth";
import { analyticsQuerySchema, validateQueryParams } from "@/utils/validation";

// GET /api/v1/analytics - Get analytics data (Admin/God only)
export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext(request);
    const { user, supabase } = authContext;

    if (!user) {
      return createUnauthorizedResponse("Authentication required");
    }

    // Only Admin and God can access analytics
    if (!hasRole(user.role, ["Admin", "God"])) {
      return createForbiddenResponse(
        "Insufficient permissions to access analytics",
      );
    }

    // Parse query parameters
    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams.entries());
    const validation = validateQueryParams(analyticsQuerySchema, queryParams);

    if (!validation.success) {
      return createBadRequestResponse(validation.error);
    }

    const {
      metric_type,
      department_id,
      user_id,
      task_id,
      period_start,
      period_end,
      limit = 100,
      offset = 0,
    } = validation.data;

    // If no specific metric type is requested, return dashboard overview
    if (!metric_type) {
      const dashboardData = await getDashboardAnalytics(
        supabase,
        department_id,
        period_start,
        period_end,
      );
      return createSuccessResponse({ analytics: dashboardData });
    }

    // Handle specific metric types
    let analyticsData;

    switch (metric_type) {
      case "task_completion":
        analyticsData = await getTaskCompletionAnalytics(
          supabase,
          department_id,
          user_id,
          period_start,
          period_end,
        );
        break;
      case "user_productivity":
        analyticsData = await getUserProductivityAnalytics(
          supabase,
          department_id,
          user_id,
          period_start,
          period_end,
        );
        break;
      case "department_performance":
        analyticsData = await getDepartmentPerformanceAnalytics(
          supabase,
          department_id,
          period_start,
          period_end,
        );
        break;
      case "clock_sessions":
        analyticsData = await getClockSessionAnalytics(
          supabase,
          department_id,
          user_id,
          period_start,
          period_end,
        );
        break;
      case "feedback_trends":
        analyticsData = await getFeedbackTrendsAnalytics(
          supabase,
          department_id,
          period_start,
          period_end,
        );
        break;
      default:
        return createBadRequestResponse("Invalid metric type");
    }

    return createSuccessResponse({ analytics: analyticsData });
  } catch (error) {
    console.error("Analytics GET error:", error);
    return createErrorResponse("Internal server error");
  }
}

// Helper functions for different analytics types
async function getDashboardAnalytics(
  supabase: any,
  department_id?: string,
  period_start?: string,
  period_end?: string,
) {
  const now = new Date();
  const startDate =
    period_start ||
    new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const endDate = period_end || now.toISOString();

  // Build base queries with date filters
  let taskQuery = supabase
    .from("tasks")
    .select("*")
    .gte("created_at", startDate)
    .lte("created_at", endDate);

  let userQuery = supabase.from("users").select("*");
  let clockQuery = supabase
    .from("clock_sessions")
    .select("*")
    .gte("clock_in_time", startDate)
    .lte("clock_in_time", endDate);

  if (department_id) {
    taskQuery = taskQuery.eq("department_id", department_id);
    userQuery = userQuery.eq("department_id", department_id);
    clockQuery = clockQuery.eq("department_id", department_id);
  }

  const [tasksResult, usersResult, clockResult] = await Promise.all([
    taskQuery,
    userQuery,
    clockQuery,
  ]);

  const tasks = tasksResult.data || [];
  const users = usersResult.data || [];
  const clockSessions = clockResult.data || [];

  return {
    overview: {
      total_tasks: tasks.length,
      completed_tasks: tasks.filter((t) => t.status === "completed").length,
      pending_tasks: tasks.filter((t) => t.status === "pending").length,
      in_progress_tasks: tasks.filter((t) => t.status === "in_progress").length,
      total_users: users.length,
      active_users: users.filter((u) => u.status === "active").length,
      total_clock_sessions: clockSessions.length,
      total_hours_worked: clockSessions
        .filter((cs) => cs.clock_out_time)
        .reduce((acc, cs) => {
          const duration =
            new Date(cs.clock_out_time).getTime() -
            new Date(cs.clock_in_time).getTime();
          return acc + duration / (1000 * 60 * 60); // Convert to hours
        }, 0),
    },
    period: {
      start: startDate,
      end: endDate,
    },
  };
}

async function getTaskCompletionAnalytics(
  supabase: any,
  department_id?: string,
  user_id?: string,
  period_start?: string,
  period_end?: string,
) {
  let query = supabase.from("tasks").select("*").eq("status", "completed");

  if (department_id) query = query.eq("department_id", department_id);
  if (user_id) query = query.eq("assigned_to", user_id);
  if (period_start) query = query.gte("completed_at", period_start);
  if (period_end) query = query.lte("completed_at", period_end);

  const { data: completedTasks, error } = await query;

  if (error) throw error;

  return {
    total_completed: completedTasks?.length || 0,
    tasks: completedTasks || [],
  };
}

async function getUserProductivityAnalytics(
  supabase: any,
  department_id?: string,
  user_id?: string,
  period_start?: string,
  period_end?: string,
) {
  let query = supabase.from("tasks").select(
    `
      *,
      users(
        id,
        full_name,
        email
      )
    `,
  );

  if (department_id) query = query.eq("department_id", department_id);
  if (user_id) query = query.eq("assigned_to", user_id);
  if (period_start) query = query.gte("created_at", period_start);
  if (period_end) query = query.lte("created_at", period_end);

  const { data: tasks, error } = await query;

  if (error) throw error;

  // Group by user and calculate productivity metrics
  const userStats = (tasks || []).reduce((acc: any, task: any) => {
    const userId = task.assigned_to;
    if (!userId) return acc;

    if (!acc[userId]) {
      acc[userId] = {
        user: task.users,
        total_tasks: 0,
        completed_tasks: 0,
        pending_tasks: 0,
        in_progress_tasks: 0,
        completion_rate: 0,
      };
    }

    acc[userId].total_tasks++;
    if (task.status === "completed") acc[userId].completed_tasks++;
    if (task.status === "pending") acc[userId].pending_tasks++;
    if (task.status === "in_progress") acc[userId].in_progress_tasks++;

    acc[userId].completion_rate =
      acc[userId].total_tasks > 0
        ? (acc[userId].completed_tasks / acc[userId].total_tasks) * 100
        : 0;

    return acc;
  }, {});

  return {
    user_productivity: Object.values(userStats),
  };
}

async function getDepartmentPerformanceAnalytics(
  supabase: any,
  department_id?: string,
  period_start?: string,
  period_end?: string,
) {
  let query = supabase.from("tasks").select(
    `
      *,
      departments(
        id,
        name
      )
    `,
  );

  if (department_id) query = query.eq("department_id", department_id);
  if (period_start) query = query.gte("created_at", period_start);
  if (period_end) query = query.lte("created_at", period_end);

  const { data: tasks, error } = await query;

  if (error) throw error;

  // Group by department
  const deptStats = (tasks || []).reduce((acc: any, task: any) => {
    const deptId = task.department_id;
    if (!deptId) return acc;

    if (!acc[deptId]) {
      acc[deptId] = {
        department: task.departments,
        total_tasks: 0,
        completed_tasks: 0,
        pending_tasks: 0,
        in_progress_tasks: 0,
        completion_rate: 0,
      };
    }

    acc[deptId].total_tasks++;
    if (task.status === "completed") acc[deptId].completed_tasks++;
    if (task.status === "pending") acc[deptId].pending_tasks++;
    if (task.status === "in_progress") acc[deptId].in_progress_tasks++;

    acc[deptId].completion_rate =
      acc[deptId].total_tasks > 0
        ? (acc[deptId].completed_tasks / acc[deptId].total_tasks) * 100
        : 0;

    return acc;
  }, {});

  return {
    department_performance: Object.values(deptStats),
  };
}

async function getClockSessionAnalytics(
  supabase: any,
  department_id?: string,
  user_id?: string,
  period_start?: string,
  period_end?: string,
) {
  let query = supabase.from("clock_sessions").select(
    `
      *,
      users(
        id,
        full_name,
        email
      )
    `,
  );

  if (department_id) query = query.eq("department_id", department_id);
  if (user_id) query = query.eq("user_id", user_id);
  if (period_start) query = query.gte("clock_in_time", period_start);
  if (period_end) query = query.lte("clock_in_time", period_end);

  const { data: sessions, error } = await query;

  if (error) throw error;

  const totalHours = (sessions || [])
    .filter((s) => s.clock_out_time)
    .reduce((acc, session) => {
      const duration =
        new Date(session.clock_out_time).getTime() -
        new Date(session.clock_in_time).getTime();
      return acc + duration / (1000 * 60 * 60); // Convert to hours
    }, 0);

  return {
    total_sessions: sessions?.length || 0,
    total_hours: totalHours,
    sessions: sessions || [],
  };
}

async function getFeedbackTrendsAnalytics(
  supabase: any,
  department_id?: string,
  period_start?: string,
  period_end?: string,
) {
  let query = supabase.from("feedback").select("*");

  if (period_start) query = query.gte("created_at", period_start);
  if (period_end) query = query.lte("created_at", period_end);

  const { data: feedback, error } = await query;

  if (error) throw error;

  const trends = {
    total_feedback: feedback?.length || 0,
    by_type: {} as Record<string, number>,
    by_priority: {} as Record<string, number>,
    by_status: {} as Record<string, number>,
    average_rating: 0,
  };

  if (feedback && feedback.length > 0) {
    // Group by type, priority, status
    feedback.forEach((f) => {
      if (f.type) {
        trends.by_type[f.type] = (trends.by_type[f.type] || 0) + 1;
      }
      if (f.priority) {
        trends.by_priority[f.priority] =
          (trends.by_priority[f.priority] || 0) + 1;
      }
      if (f.status) {
        trends.by_status[f.status] = (trends.by_status[f.status] || 0) + 1;
      }
    });

    // Calculate average rating
    const ratingsSum = feedback
      .filter((f) => f.rating)
      .reduce((sum, f) => sum + f.rating, 0);
    const ratingsCount = feedback.filter((f) => f.rating).length;
    trends.average_rating = ratingsCount > 0 ? ratingsSum / ratingsCount : 0;
  }

  return trends;
}
