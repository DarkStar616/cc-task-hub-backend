
import { NextRequest } from "next/server";
import {
  getAuthContext,
  hasRole,
  createUnauthorizedResponse,
  createBadRequestResponse,
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
    const query = searchParams.get("q");

    if (!query || query.trim().length < 2) {
      return createBadRequestResponse("Search query must be at least 2 characters");
    }

    const searchTerm = `%${query.trim()}%`;
    const results: any = {
      tasks: [],
      sops: [],
      users: []
    };

    // Search tasks
    let taskQuery = authContext.supabase
      .from("tasks")
      .select(`
        id,
        title,
        description,
        status,
        priority,
        due_date,
        created_at
      `)
      .or(`title.ilike.${searchTerm},description.ilike.${searchTerm}`);

    // Apply role-based filtering
    if (!hasRole(authContext.user.role, ["God", "Admin"])) {
      if (hasRole(authContext.user.role, ["Manager"]) && authContext.user.department_id) {
        taskQuery = taskQuery.eq("department_id", authContext.user.department_id);
      } else {
        taskQuery = taskQuery.or(`assigned_to.eq.${authContext.user.id},created_by.eq.${authContext.user.id}`);
      }
    }

    const { data: tasks } = await taskQuery.limit(10);
    results.tasks = tasks || [];

    // Search SOPs
    let sopQuery = authContext.supabase
      .from("sops")
      .select(`
        id,
        title,
        description,
        department_id,
        file_name,
        created_at
      `)
      .or(`title.ilike.${searchTerm},description.ilike.${searchTerm}`);

    if (!hasRole(authContext.user.role, ["God", "Admin"]) && authContext.user.department_id) {
      sopQuery = sopQuery.eq("department_id", authContext.user.department_id);
    }

    const { data: sops } = await sopQuery.limit(10);
    results.sops = sops || [];

    // Search users (if user has permission)
    if (hasRole(authContext.user.role, ["God", "Admin", "Manager"])) {
      let userQuery = authContext.supabase
        .from("users")
        .select(`
          id,
          email,
          full_name,
          department_id,
          departments(name),
          roles(name)
        `)
        .or(`full_name.ilike.${searchTerm},email.ilike.${searchTerm}`);

      if (hasRole(authContext.user.role, ["Manager"]) && authContext.user.department_id) {
        userQuery = userQuery.eq("department_id", authContext.user.department_id);
      }

      const { data: users } = await userQuery.limit(10);
      results.users = users || [];
    }

    return createSuccessResponse(results, 200, "Search completed");
  } catch (error) {
    console.error("Search error:", error);
    return createErrorResponse("Internal server error");
  }
}
