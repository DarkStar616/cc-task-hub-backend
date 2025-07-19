
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

const bulkCompleteSchema = z.object({
  task_ids: z.array(z.string().uuid("Invalid task ID")).min(1, "At least one task ID required"),
  completion_notes: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const authContext = await getAuthContext(request);

    if (!authContext.user) {
      return createUnauthorizedResponse();
    }

    const body = await request.json();
    const validation = validateRequestBody(bulkCompleteSchema, body);

    if (!validation.success) {
      return createBadRequestResponse(validation.error);
    }

    const { task_ids, completion_notes } = validation.data;

    // First, check permissions for all tasks
    const { data: tasks, error: fetchError } = await authContext.supabase
      .from("tasks")
      .select("id, assigned_to, created_by, department_id, status")
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
        return false; // God and Admin can complete any task
      }
      if (hasRole(authContext.user.role, ["Manager"])) {
        return task.department_id !== authContext.user.department_id;
      }
      // Users can only complete tasks assigned to them
      return task.assigned_to !== authContext.user.id;
    });

    if (unauthorizedTasks.length > 0) {
      return createBadRequestResponse(
        `Not authorized to complete ${unauthorizedTasks.length} of the specified tasks`
      );
    }

    // Check for already completed tasks
    const alreadyCompleted = tasks.filter(task => task.status === "completed");
    if (alreadyCompleted.length > 0) {
      return createBadRequestResponse(
        `${alreadyCompleted.length} tasks are already completed`
      );
    }

    // Update all tasks
    const { data: updatedTasks, error: updateError } = await authContext.supabase
      .from("tasks")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        completion_notes: completion_notes || null,
        updated_at: new Date().toISOString(),
      })
      .in("id", task_ids)
      .select();

    if (updateError) {
      console.error("Bulk complete error:", updateError);
      return createErrorResponse("Failed to complete tasks");
    }

    // Log bulk action
    await logSensitiveAction(
      authContext,
      SENSITIVE_ACTIONS.BULK_TASK_UPDATE,
      {
        tableName: "tasks",
        recordId: "bulk_operation",
        newValues: { 
          task_ids,
          status: "completed",
          completion_notes 
        },
        metadata: { 
          action: "bulk_complete",
          task_count: task_ids.length 
        },
      },
      request,
    );

    return createSuccessResponse(
      {
        updated_tasks: updatedTasks,
        completed_count: updatedTasks?.length || 0,
        task_ids,
      },
      200,
      `Successfully completed ${updatedTasks?.length || 0} tasks`
    );

  } catch (error) {
    console.error("Bulk complete error:", error);
    return createErrorResponse("Internal server error");
  }
}
