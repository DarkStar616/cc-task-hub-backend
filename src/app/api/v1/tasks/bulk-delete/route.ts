
import { NextRequest } from "next/server";
import {
  getAuthContext,
  hasRole,
  createUnauthorizedResponse,
  createBadRequestResponse,
  createSuccessResponse,
  createErrorResponse,
} from "@/utils/auth";
import { validateRequestBody } from "@/utils/validation";
import { z } from "zod";
import { logSensitiveAction, SENSITIVE_ACTIONS } from "@/utils/audit-log";

const bulkDeleteSchema = z.object({
  task_ids: z.array(z.string().uuid("Invalid task ID")).min(1, "At least one task ID required"),
});

export async function POST(request: NextRequest) {
  try {
    const authContext = await getAuthContext(request);

    if (!authContext.user) {
      return createUnauthorizedResponse();
    }

    const body = await request.json();
    const validation = validateRequestBody(bulkDeleteSchema, body);

    if (!validation.success) {
      return createBadRequestResponse(validation.error);
    }

    const { task_ids } = validation.data;

    // First, check permissions for all tasks
    const { data: tasks, error: fetchError } = await authContext.supabase
      .from("tasks")
      .select("id, assigned_to, created_by, department_id, title")
      .in("id", task_ids);

    if (fetchError) {
      console.error("Tasks fetch error:", fetchError);
      return createErrorResponse("Failed to fetch tasks for validation");
    }

    if (!tasks || tasks.length !== task_ids.length) {
      return createBadRequestResponse("Some task IDs not found or inaccessible");
    }

    // Check permissions for each task
    const unauthorizedTasks = tasks.filter(task => {
      if (hasRole(authContext.user.role, ["God", "Admin"])) {
        return false; // God and Admin can delete any task
      }
      if (hasRole(authContext.user.role, ["Manager"])) {
        return task.department_id !== authContext.user.department_id;
      }
      // Users can only delete tasks they created
      return task.created_by !== authContext.user.id;
    });

    if (unauthorizedTasks.length > 0) {
      return createBadRequestResponse(
        `Not authorized to delete ${unauthorizedTasks.length} of the specified tasks`
      );
    }

    // Delete all tasks
    const { error: deleteError } = await authContext.supabase
      .from("tasks")
      .delete()
      .in("id", task_ids);

    if (deleteError) {
      console.error("Bulk delete error:", deleteError);
      return createErrorResponse("Failed to delete tasks");
    }

    // Log bulk action
    await logSensitiveAction(
      authContext,
      SENSITIVE_ACTIONS.BULK_TASK_DELETE,
      {
        tableName: "tasks",
        recordId: "bulk_operation",
        oldValues: { 
          task_ids,
          task_titles: tasks.map(t => t.title)
        },
        metadata: { 
          action: "bulk_delete",
          task_count: task_ids.length 
        },
      },
      request,
    );

    return createSuccessResponse(
      {
        deleted_count: task_ids.length,
        task_ids,
      },
      200,
      `Successfully deleted ${task_ids.length} tasks`
    );

  } catch (error) {
    console.error("Bulk delete error:", error);
    return createErrorResponse("Internal server error");
  }
}
