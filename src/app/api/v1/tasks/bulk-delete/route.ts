
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

    // Delete tasks
    const { error, count } = await authContext.supabase
      .from("tasks")
      .delete()
      .in("id", task_ids);

    if (error) {
      console.error("Bulk delete error:", error);
      return createErrorResponse("Failed to delete tasks");
    }

    return createSuccessResponse({
      deleted_count: count || 0,
    }, 200, "Tasks deleted successfully");
  } catch (error) {
    console.error("Bulk delete error:", error);
    return createErrorResponse("Internal server error");
  }
}
