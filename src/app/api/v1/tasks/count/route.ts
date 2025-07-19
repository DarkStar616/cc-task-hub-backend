
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
    const departmentId = searchParams.get("department_id");
    const assignedTo = searchParams.get("assigned_to");
    const status = searchParams.get("status");
    const priority = searchParams.get("priority");

    let query = authContext.supabase
      .from("tasks")
      .select("id", { count: "exact", head: true });

    // Apply role-based filtering
    if (hasRole(authContext.user.role, ["God", "Admin"])) {
      // God and Admin can see all tasks
    } else if (hasRole(authContext.user.role, ["Manager"])) {
      // Managers can see department tasks
      if (authContext.user.department_id) {
        query = query.eq("department_id", authContext.user.department_id);
      }
    } else {
      // Users can see tasks assigned to them or created by them
      query = query.or(
        `assigned_to.eq.${authContext.user.id},created_by.eq.${authContext.user.id}`,
      );
    }

    // Apply additional filters
    if (
      departmentId &&
      hasRole(authContext.user.role, ["God", "Admin", "Manager"])
    ) {
      query = query.eq("department_id", departmentId);
    }
    if (assignedTo) {
      query = query.eq("assigned_to", assignedTo);
    }
    if (status) {
      query = query.eq("status", status);
    }
    if (priority) {
      query = query.eq("priority", priority);
    }

    const { count, error } = await query;

    if (error) {
      console.error("Tasks count error:", error);
      return createErrorResponse("Failed to count tasks");
    }

    return createSuccessResponse(
      {
        count: count || 0,
        filters: {
          department_id: departmentId,
          assigned_to: assignedTo,
          status,
          priority,
        },
      },
      200,
      "Task count retrieved successfully"
    );

  } catch (error) {
    console.error("Tasks count error:", error);
    return createErrorResponse("Internal server error");
  }
}
