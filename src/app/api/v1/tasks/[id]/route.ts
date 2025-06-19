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
import { validateRequestBody, updateTaskSchema } from "@/utils/validation";
import { logSensitiveAction, SENSITIVE_ACTIONS } from "@/utils/audit-log";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const authContext = await getAuthContext(request);

    if (!authContext.user) {
      return createUnauthorizedResponse();
    }

    const taskId = params.id;

    let query = authContext.supabase
      .from("tasks")
      .select(
        `
        id,
        title,
        description,
        assigned_to,
        department_id,
        sop_id,
        priority,
        status,
        due_date,
        estimated_duration,
        actual_duration,
        completed_at,
        completion_notes,
        attachments,
        metadata,
        created_at,
        updated_at,
        created_by,
        created_by_user:users!tasks_created_by_fkey(full_name),
        assigned_user:users!tasks_assigned_to_fkey(full_name),
        department:departments(name),
        sop:sops(title)
      `,
      )
      .eq("id", taskId);

    // Apply role-based filtering
    if (!hasRole(authContext.user.role, ["God", "Admin"])) {
      if (hasRole(authContext.user.role, ["Manager"])) {
        query = query.eq("department_id", authContext.user.department_id);
      } else {
        query = query.or(
          `assigned_to.eq.${authContext.user.id},created_by.eq.${authContext.user.id}`,
        );
      }
    }

    const { data: task, error } = await query.single();

    if (error || !task) {
      return createNotFoundResponse("Task not found");
    }

    return createSuccessResponse({ task });
  } catch (error) {
    console.error("Task GET error:", error);
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

    const taskId = params.id;
    const body = await request.json();
    const validation = validateRequestBody(updateTaskSchema, body);

    if (!validation.success) {
      return createBadRequestResponse(validation.error);
    }

    const updateData = validation.data;

    // Get current task data
    const { data: currentTask, error: fetchError } = await authContext.supabase
      .from("tasks")
      .select("*")
      .eq("id", taskId)
      .single();

    if (fetchError || !currentTask) {
      return createNotFoundResponse("Task not found");
    }

    // Check permissions
    const canUpdate =
      hasRole(authContext.user.role, ["God", "Admin"]) ||
      (hasRole(authContext.user.role, ["Manager"]) &&
        currentTask.department_id === authContext.user.department_id) ||
      currentTask.assigned_to === authContext.user.id ||
      currentTask.created_by === authContext.user.id;

    if (!canUpdate) {
      return createForbiddenResponse("Cannot update this task");
    }

    // Validate assignment changes
    if (
      updateData.assigned_to &&
      updateData.assigned_to !== currentTask.assigned_to
    ) {
      if (!hasRole(authContext.user.role, ["God", "Admin", "Manager"])) {
        return createForbiddenResponse("Cannot reassign tasks");
      }

      const { data: assignedUser } = await authContext.supabase
        .from("users")
        .select("department_id")
        .eq("id", updateData.assigned_to)
        .single();

      if (
        assignedUser &&
        authContext.user.role === "Manager" &&
        assignedUser.department_id !== authContext.user.department_id
      ) {
        return createForbiddenResponse(
          "Can only assign tasks to users in your department",
        );
      }
    }

    // Handle task completion
    if (
      updateData.status === "completed" &&
      currentTask.status !== "completed"
    ) {
      updateData.completed_at = new Date().toISOString();

      // Calculate actual duration if clock sessions exist
      const { data: clockSessions } = await authContext.supabase
        .from("clock_sessions")
        .select("total_duration")
        .eq("task_id", taskId)
        .not("total_duration", "is", null);

      if (clockSessions && clockSessions.length > 0) {
        // Sum up total durations (this would need proper interval arithmetic in production)
        updateData.actual_duration = "00:00:00"; // Placeholder
      }
    }

    const { data: updatedTask, error } = await authContext.supabase
      .from("tasks")
      .update({
        ...updateData,
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId)
      .select()
      .single();

    if (error) {
      console.error("Task update error:", error);
      return createErrorResponse("Failed to update task");
    }

    // Log sensitive actions
    if (
      updateData.assigned_to &&
      updateData.assigned_to !== currentTask.assigned_to
    ) {
      await logSensitiveAction(
        authContext,
        SENSITIVE_ACTIONS.TASK_ASSIGNMENT,
        {
          tableName: "tasks",
          recordId: taskId,
          oldValues: { assigned_to: currentTask.assigned_to },
          newValues: { assigned_to: updateData.assigned_to },
        },
        request,
      );
    }

    if (
      updateData.status === "completed" &&
      currentTask.status !== "completed"
    ) {
      await logSensitiveAction(
        authContext,
        SENSITIVE_ACTIONS.TASK_COMPLETION,
        {
          tableName: "tasks",
          recordId: taskId,
          oldValues: { status: currentTask.status },
          newValues: {
            status: "completed",
            completed_at: updateData.completed_at,
          },
        },
        request,
      );
    }

    return createSuccessResponse({ task: updatedTask });
  } catch (error) {
    console.error("Task PUT error:", error);
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

    const taskId = params.id;

    // Get current task data
    const { data: currentTask, error: fetchError } = await authContext.supabase
      .from("tasks")
      .select("*")
      .eq("id", taskId)
      .single();

    if (fetchError || !currentTask) {
      return createNotFoundResponse("Task not found");
    }

    // Check permissions - only creators, managers of department, or admin/god can delete
    const canDelete =
      hasRole(authContext.user.role, ["God", "Admin"]) ||
      (hasRole(authContext.user.role, ["Manager"]) &&
        currentTask.department_id === authContext.user.department_id) ||
      currentTask.created_by === authContext.user.id;

    if (!canDelete) {
      return createForbiddenResponse("Cannot delete this task");
    }

    // Soft delete by updating status
    const { error } = await authContext.supabase
      .from("tasks")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId);

    if (error) {
      console.error("Task deletion error:", error);
      return createErrorResponse("Failed to delete task");
    }

    return createSuccessResponse({ message: "Task deleted successfully" });
  } catch (error) {
    console.error("Task DELETE error:", error);
    return createErrorResponse("Internal server error");
  }
}
