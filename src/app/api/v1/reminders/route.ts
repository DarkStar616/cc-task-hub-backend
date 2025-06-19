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
import { validateRequestBody, createReminderSchema } from "@/utils/validation";

export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext(request);

    if (!authContext.user) {
      return createUnauthorizedResponse();
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("user_id");
    const taskId = searchParams.get("task_id");
    const status = searchParams.get("status");
    const reminderType = searchParams.get("reminder_type");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    let query = authContext.supabase
      .from("reminders")
      .select(
        `
        id,
        user_id,
        task_id,
        title,
        message,
        reminder_type,
        scheduled_for,
        repeat_pattern,
        status,
        metadata,
        created_at,
        updated_at,
        user:users(full_name),
        task:tasks(title)
      `,
      )
      .range(offset, offset + limit - 1)
      .order("scheduled_for", { ascending: true });

    // Apply role-based filtering
    if (hasRole(authContext.user.role, ["God", "Admin"])) {
      // God and Admin can see all reminders
    } else if (hasRole(authContext.user.role, ["Manager"])) {
      // Managers can see department reminders
      if (authContext.user.department_id) {
        const { data: departmentUsers } = await authContext.supabase
          .from("users")
          .select("id")
          .eq("department_id", authContext.user.department_id);

        if (departmentUsers) {
          const userIds = departmentUsers.map((u) => u.id);
          query = query.in("user_id", userIds);
        }
      }
    } else {
      // Users can only see their own reminders
      query = query.eq("user_id", authContext.user.id);
    }

    // Apply additional filters
    if (userId && hasRole(authContext.user.role, ["God", "Admin", "Manager"])) {
      query = query.eq("user_id", userId);
    }
    if (taskId) {
      query = query.eq("task_id", taskId);
    }
    if (status) {
      query = query.eq("status", status);
    }
    if (reminderType) {
      query = query.eq("reminder_type", reminderType);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Reminders fetch error:", error);
      return createErrorResponse("Failed to fetch reminders");
    }

    return createSuccessResponse({ reminders: data });
  } catch (error) {
    console.error("Reminders GET error:", error);
    return createErrorResponse("Internal server error");
  }
}

export async function POST(request: NextRequest) {
  try {
    const authContext = await getAuthContext(request);

    if (!authContext.user) {
      return createUnauthorizedResponse();
    }

    const body = await request.json();
    const validation = validateRequestBody(createReminderSchema, body);

    if (!validation.success) {
      return createBadRequestResponse(validation.error);
    }

    const reminderData = validation.data;

    // Validate task assignment if provided
    if (reminderData.task_id) {
      const { data: task } = await authContext.supabase
        .from("tasks")
        .select("assigned_to, created_by, department_id")
        .eq("id", reminderData.task_id)
        .single();

      if (!task) {
        return createBadRequestResponse("Invalid task ID");
      }

      // Check if user can create reminders for this task
      const canCreateReminder =
        task.assigned_to === authContext.user.id ||
        task.created_by === authContext.user.id ||
        hasRole(authContext.user.role, ["God", "Admin"]) ||
        (hasRole(authContext.user.role, ["Manager"]) &&
          task.department_id === authContext.user.department_id);

      if (!canCreateReminder) {
        return createForbiddenResponse("Cannot create reminder for this task");
      }
    }

    const { data: newReminder, error } = await authContext.supabase
      .from("reminders")
      .insert({
        ...reminderData,
        user_id: authContext.user.id,
        status: "pending",
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("Reminder creation error:", error);
      return createErrorResponse("Failed to create reminder");
    }

    return createSuccessResponse({ reminder: newReminder }, 201);
  } catch (error) {
    console.error("Reminders POST error:", error);
    return createErrorResponse("Internal server error");
  }
}
