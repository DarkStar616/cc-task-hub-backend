import { NextRequest } from "next/server";
import {
  getAuthContext,
  hasRole,
  createUnauthorizedResponse,
  createForbiddenResponse,
  createBadRequestResponse,
  createSuccessResponse,
  createErrorResponse,
  createNotFoundResponse,
} from "@/utils/auth";
import { validateRequestBody, updateReminderSchema } from "@/utils/validation";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const authContext = await getAuthContext(request);

    if (!authContext.user) {
      return createUnauthorizedResponse();
    }

    const reminderId = params.id;

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
      .eq("id", reminderId);

    // Apply role-based filtering
    if (!hasRole(authContext.user.role, ["God", "Admin"])) {
      if (hasRole(authContext.user.role, ["Manager"])) {
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
    }

    const { data: reminder, error } = await query.single();

    if (error || !reminder) {
      return createNotFoundResponse("Reminder not found");
    }

    return createSuccessResponse({ reminder });
  } catch (error) {
    console.error("Reminder GET error:", error);
    return createErrorResponse("Internal server error");
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const authContext = await getAuthContext(request);

    if (!authContext.user) {
      return createUnauthorizedResponse();
    }

    const reminderId = params.id;
    const body = await request.json();
    const validation = validateRequestBody(updateReminderSchema, body);

    if (!validation.success) {
      return createBadRequestResponse(validation.error);
    }

    const updateData = validation.data;

    // Get current reminder data
    const { data: currentReminder, error: fetchError } =
      await authContext.supabase
        .from("reminders")
        .select("*")
        .eq("id", reminderId)
        .single();

    if (fetchError || !currentReminder) {
      return createNotFoundResponse("Reminder not found");
    }

    // Check permissions - users can only modify their own reminders
    const canModify =
      currentReminder.user_id === authContext.user.id ||
      hasRole(authContext.user.role, ["God", "Admin"]) ||
      (hasRole(authContext.user.role, ["Manager"]) &&
        authContext.user.department_id);

    if (!canModify) {
      return createForbiddenResponse("Cannot modify this reminder");
    }

    // Validate task assignment changes if provided
    if (updateData.task_id && updateData.task_id !== currentReminder.task_id) {
      const { data: task } = await authContext.supabase
        .from("tasks")
        .select("assigned_to, created_by, department_id")
        .eq("id", updateData.task_id)
        .single();

      if (!task) {
        return createBadRequestResponse("Invalid task ID");
      }

      // Check if user can link reminder to this task
      const canLinkTask =
        task.assigned_to === authContext.user.id ||
        task.created_by === authContext.user.id ||
        hasRole(authContext.user.role, ["God", "Admin"]) ||
        (hasRole(authContext.user.role, ["Manager"]) &&
          task.department_id === authContext.user.department_id);

      if (!canLinkTask) {
        return createForbiddenResponse("Cannot link reminder to this task");
      }
    }

    const { data: updatedReminder, error } = await authContext.supabase
      .from("reminders")
      .update({
        ...updateData,
        updated_at: new Date().toISOString(),
      })
      .eq("id", reminderId)
      .select()
      .single();

    if (error) {
      console.error("Reminder update error:", error);
      return createErrorResponse("Failed to update reminder");
    }

    return createSuccessResponse({ reminder: updatedReminder });
  } catch (error) {
    console.error("Reminder PUT error:", error);
    return createErrorResponse("Internal server error");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const authContext = await getAuthContext(request);

    if (!authContext.user) {
      return createUnauthorizedResponse();
    }

    const reminderId = params.id;

    // Get current reminder data
    const { data: currentReminder, error: fetchError } =
      await authContext.supabase
        .from("reminders")
        .select("*")
        .eq("id", reminderId)
        .single();

    if (fetchError || !currentReminder) {
      return createNotFoundResponse("Reminder not found");
    }

    // Check permissions - users can only delete their own reminders
    const canDelete =
      currentReminder.user_id === authContext.user.id ||
      hasRole(authContext.user.role, ["God", "Admin"]) ||
      (hasRole(authContext.user.role, ["Manager"]) &&
        authContext.user.department_id);

    if (!canDelete) {
      return createForbiddenResponse("Cannot delete this reminder");
    }

    // Soft delete by updating status
    const { error } = await authContext.supabase
      .from("reminders")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", reminderId);

    if (error) {
      console.error("Reminder deletion error:", error);
      return createErrorResponse("Failed to delete reminder");
    }

    return createSuccessResponse({ message: "Reminder deleted successfully" });
  } catch (error) {
    console.error("Reminder DELETE error:", error);
    return createErrorResponse("Internal server error");
  }
}
