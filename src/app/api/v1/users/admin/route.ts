
import { NextRequest } from "next/server";
import {
  getAuthContext,
  hasRole,
  createUnauthorizedResponse,
  createForbiddenResponse,
  createSuccessResponse,
  createErrorResponse,
} from "@/utils/auth";

export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext(request);

    if (!authContext.user) {
      return createUnauthorizedResponse();
    }

    // Only God and Admin can access admin data
    if (!hasRole(authContext.user.role, ["God", "Admin"])) {
      return createForbiddenResponse("Admin access required");
    }

    // Fetch admin-specific data
    const { data: adminStats, error: statsError } = await authContext.supabase
      .from("users")
      .select(`
        id,
        role_id,
        department_id,
        status,
        created_at,
        roles(name),
        departments(name)
      `);

    if (statsError) {
      console.error("Admin stats error:", statsError);
      return createErrorResponse("Failed to fetch admin data");
    }

    // Get system statistics
    const { count: totalUsers } = await authContext.supabase
      .from("users")
      .select("*", { count: "exact", head: true });

    const { count: activeTasks } = await authContext.supabase
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .neq("status", "completed");

    const { count: totalSops } = await authContext.supabase
      .from("sops")
      .select("*", { count: "exact", head: true });

    return createSuccessResponse({
      users: adminStats,
      system_stats: {
        total_users: totalUsers || 0,
        active_tasks: activeTasks || 0,
        total_sops: totalSops || 0,
      }
    }, 200, "Admin data fetched successfully");
  } catch (error) {
    console.error("Admin endpoint error:", error);
    return createErrorResponse("Internal server error");
  }
}
