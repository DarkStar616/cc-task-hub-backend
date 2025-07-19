
import { NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getUserFromRequest, hasRole } from "@/utils/auth";
import { createSuccessResponse, createErrorResponse } from "@/utils/response";
import { mapDepartmentNameToId } from "@/utils/department-mapping";

export async function GET(request: NextRequest) {
  try {
    const authResult = await getUserFromRequest(request);
    if (!authResult.success) {
      return createErrorResponse(authResult.message, 401);
    }

    const { searchParams } = new URL(request.url);
    const start = searchParams.get("start");
    const end = searchParams.get("end");
    const department = searchParams.get("department");

    if (!start || !end) {
      return createErrorResponse("Start and end dates are required", 400);
    }

    const supabase = createClient();
    const user = authResult.user;

    // Department filtering
    let departmentId = null;
    if (department && department !== "All Departments") {
      departmentId = mapDepartmentNameToId(department);
      if (!departmentId) {
        return createErrorResponse("Invalid department", 400);
      }
    }

    // Get tasks with due dates in the specified range
    let tasksQuery = supabase
      .from("tasks")
      .select(`
        id,
        title,
        description,
        status,
        priority,
        due_date,
        department,
        owner:profiles!tasks_owner_id_fkey(id, name, avatar),
        assignees:task_assignments(
          assignee:profiles!task_assignments_user_id_fkey(id, name, avatar)
        )
      `)
      .gte("due_date", start)
      .lte("due_date", end)
      .not("due_date", "is", null)
      .order("due_date", { ascending: true });

    // Apply department filtering
    if (departmentId) {
      tasksQuery = tasksQuery.eq("department_id", departmentId);
    } else if (!hasRole(user, ["god", "admin"])) {
      // Non-admin users see only their department
      const userDeptId = mapDepartmentNameToId(user.department);
      if (userDeptId) {
        tasksQuery = tasksQuery.eq("department_id", userDeptId);
      }
    }

    const { data: tasks, error: tasksError } = await tasksQuery;

    if (tasksError) {
      console.error("Tasks fetch error:", tasksError);
      return createErrorResponse("Failed to fetch calendar tasks", 500);
    }

    // Get reminders in the specified range
    let remindersQuery = supabase
      .from("reminders")
      .select("id, text, time, recurrence, is_active, created_at")
      .gte("time", start)
      .lte("time", end);

    // Filter reminders by user unless admin
    if (!hasRole(user, ["god", "admin"])) {
      remindersQuery = remindersQuery.eq("user_id", user.id);
    }

    const { data: reminders, error: remindersError } = await remindersQuery;

    if (remindersError) {
      console.error("Reminders fetch error:", remindersError);
      return createErrorResponse("Failed to fetch calendar reminders", 500);
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
        department: task.department,
        owner: task.owner,
        assignees: task.assignees?.map((a: any) => a.assignee) || []
      })),
      ...(reminders || []).map((reminder: any) => ({
        id: reminder.id,
        title: reminder.text,
        type: "reminder",
        start: reminder.time,
        recurrence: reminder.recurrence,
        is_active: reminder.is_active
      }))
    ];

    return createSuccessResponse("Calendar data retrieved successfully", {
      events,
      period: { start, end },
      total_events: events.length
    });

  } catch (error) {
    console.error("Calendar error:", error);
    return createErrorResponse("Failed to retrieve calendar data", 500);
  }
}
