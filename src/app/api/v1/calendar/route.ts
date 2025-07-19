
import { NextRequest } from "next/server";
import {
  getAuthContext,
  hasRole,
  createUnauthorizedResponse,
  createBadRequestResponse,
  createSuccessResponse,
  createErrorResponse,
} from "@/utils/auth";
import { logSensitiveAction, SENSITIVE_ACTIONS } from "@/utils/audit-log";

export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext(request);

    if (!authContext.user) {
      return createUnauthorizedResponse();
    }

    const { searchParams } = new URL(request.url);
    const start = searchParams.get("start");
    const end = searchParams.get("end");
    const department = searchParams.get("department");

    if (!start || !end) {
      return createBadRequestResponse("Start and end dates are required");
    }

    // Get tasks with due dates in the specified range
    let tasksQuery = authContext.supabase
      .from("tasks")
      .select(`
        id,
        title,
        description,
        status,
        priority,
        due_date,
        department_id,
        assigned_to,
        created_by,
        created_user:users!tasks_created_by_fkey(full_name),
        assigned_user:users!tasks_assigned_to_fkey(full_name),
        department:departments(name)
      `)
      .gte("due_date", start)
      .lte("due_date", end)
      .not("due_date", "is", null)
      .order("due_date", { ascending: true });

    // Apply role-based filtering
    if (hasRole(authContext.user.role, ["God", "Admin"])) {
      // God and Admin can see all tasks
    } else if (hasRole(authContext.user.role, ["Manager"])) {
      // Managers can see department tasks
      if (authContext.user.department_id) {
        tasksQuery = tasksQuery.eq("department_id", authContext.user.department_id);
      }
    } else {
      // Users can see tasks assigned to them or created by them
      tasksQuery = tasksQuery.or(
        `assigned_to.eq.${authContext.user.id},created_by.eq.${authContext.user.id}`,
      );
    }

    // Apply department filter
    if (department && hasRole(authContext.user.role, ["God", "Admin", "Manager"])) {
      tasksQuery = tasksQuery.eq("department_id", department);
    }

    const { data: tasks, error: tasksError } = await tasksQuery;

    if (tasksError) {
      console.error("Calendar tasks fetch error:", tasksError);
      return createErrorResponse("Failed to fetch calendar tasks");
    }

    // Get reminders in the specified range
    let remindersQuery = authContext.supabase
      .from("reminders")
      .select("id, title, message, scheduled_for, status, reminder_type, task_id")
      .gte("scheduled_for", start)
      .lte("scheduled_for", end)
      .order("scheduled_for", { ascending: true });

    // Filter reminders by user unless admin
    if (!hasRole(authContext.user.role, ["God", "Admin"])) {
      remindersQuery = remindersQuery.eq("user_id", authContext.user.id);
    }

    const { data: reminders, error: remindersError } = await remindersQuery;

    if (remindersError) {
      console.error("Calendar reminders fetch error:", remindersError);
      return createErrorResponse("Failed to fetch calendar reminders");
    }

    // Format events for calendar
    const events = [
      ...(tasks || []).map((task: any) => ({
        id: task.id,
        title: task.title,
        type: "task",
        start: task.due_date,
        status: task.status,
        priority: task.priority,
        department_id: task.department_id,
        department: task.department?.name,
        created_user: task.created_user?.full_name,
        assigned_user: task.assigned_user?.full_name,
      })),
      ...(reminders || []).map((reminder: any) => ({
        id: reminder.id,
        title: reminder.title,
        type: "reminder",
        start: reminder.scheduled_for,
        status: reminder.status,
        reminder_type: reminder.reminder_type,
        task_id: reminder.task_id,
      }))
    ];

    return createSuccessResponse(
      {
        events,
        period: { start, end },
        total_events: events.length,
        department_filter: department,
      },
      200,
      "Calendar data retrieved successfully"
    );

  } catch (error) {
    console.error("Calendar error:", error);
    return createErrorResponse("Failed to retrieve calendar data");
  }
}
