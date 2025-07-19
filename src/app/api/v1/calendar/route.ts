
import { NextRequest } from "next/server";
import {
  getAuthContext,
  hasRole,
  createUnauthorizedResponse,
  createSuccessResponse,
  createErrorResponse,
} from "@/utils/auth";

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

    // Get tasks as calendar events
    let query = authContext.supabase
      .from("tasks")
      .select(`
        id,
        title,
        description,
        due_date,
        status,
        priority,
        assigned_to,
        department_id,
        assigned_user:users!tasks_assigned_to_fkey(full_name),
        department:departments(name)
      `)
      .not("due_date", "is", null);

    // Apply date filters
    if (start) {
      query = query.gte("due_date", start);
    }
    if (end) {
      query = query.lte("due_date", end);
    }

    // Apply role-based filtering
    if (!hasRole(authContext.user.role, ["God", "Admin"])) {
      if (hasRole(authContext.user.role, ["Manager"]) && authContext.user.department_id) {
        query = query.eq("department_id", authContext.user.department_id);
      } else {
        query = query.or(`assigned_to.eq.${authContext.user.id},created_by.eq.${authContext.user.id}`);
      }
    }

    if (department && hasRole(authContext.user.role, ["God", "Admin", "Manager"])) {
      query = query.eq("department_id", department);
    }

    const { data: tasks, error } = await query;

    if (error) {
      console.error("Calendar fetch error:", error);
      return createErrorResponse("Failed to fetch calendar events");
    }

    // Transform tasks to calendar events
    const events = (tasks || []).map(task => ({
      id: task.id,
      title: task.title,
      description: task.description,
      start: task.due_date,
      end: task.due_date,
      type: "task",
      status: task.status,
      priority: task.priority,
      assigned_to: (task.assigned_user as any)?.full_name,
      department: (task.department as any)?.name,
    }));

    return createSuccessResponse({
      events
    }, 200, "Calendar events fetched successfully");
  } catch (error) {
    console.error("Calendar error:", error);
    return createErrorResponse("Internal server error");
  }
}
