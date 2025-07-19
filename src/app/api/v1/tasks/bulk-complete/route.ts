
import { NextRequest } from "next/server";
import {
  getAuthContext,
  hasRole,
  createUnauthorizedResponse,
  createBadRequestResponse,
  createSuccessResponse,
  createErrorResponse,
} from "@/utils/auth";

export async function POST(request: NextRequest) {
  try {
    const authContext = await getAuthContext(request);

    if (!authContext.user) {
      return createUnauthorizedResponse();
    }

    const body = await request.json();
    const { task_ids } = body;

    if (!Array.isArray(task_ids) || task_ids.length === 0) {
      return createBadRequestResponse("task_ids array is required");
    }

    // Update tasks to completed status
    const { data: updatedTasks, error } = await authContext.supabase
      .from("tasks")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .in("id", task_ids)
      .select();

    if (error) {
      console.error("Bulk complete error:", error);
      return createErrorResponse("Failed to complete tasks");
    }

    return createSuccessResponse({
      updated_count: updatedTasks?.length || 0,
      tasks: updatedTasks,
    }, 200, "Tasks completed successfully");
  } catch (error) {
    console.error("Bulk complete error:", error);
    return createErrorResponse("Internal server error");
  }
}
