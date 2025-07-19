
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
    const query = searchParams.get("q") || "";
    const department = searchParams.get("department");
    const type = searchParams.get("type"); // "tasks", "sops", "users", "all"
    const limit = parseInt(searchParams.get("limit") || "50");

    if (!query.trim()) {
      return createBadRequestResponse("Search query is required");
    }

    const results: any = {};

    // Search tasks
    if (!type || type === "tasks" || type === "all") {
      let tasksQuery = authContext.supabase
        .from("tasks")
        .select(`
          id,
          title,
          description,
          status,
          priority,
          due_date,
          department_id,
          assigned_to,
          created_by,
          created_user:users!tasks_created_by_fkey(full_name),
          assigned_user:users!tasks_assigned_to_fkey(full_name),
          department:departments(name)
        `)
        .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
        .order("created_at", { ascending: false })
        .limit(type === "all" ? 10 : limit);

      // Apply role-based filtering
      if (hasRole(authContext.user.role, ["God", "Admin"])) {
        // God and Admin can search all tasks
      } else if (hasRole(authContext.user.role, ["Manager"])) {
        // Managers can search department tasks
        if (authContext.user.department_id) {
          tasksQuery = tasksQuery.eq("department_id", authContext.user.department_id);
        }
      } else {
        // Users can search tasks assigned to them or created by them
        tasksQuery = tasksQuery.or(
          `assigned_to.eq.${authContext.user.id},created_by.eq.${authContext.user.id}`,
        );
      }

      // Apply department filter
      if (department && hasRole(authContext.user.role, ["God", "Admin", "Manager"])) {
        tasksQuery = tasksQuery.eq("department_id", department);
      }

      const { data: tasks } = await tasksQuery;
      results.tasks = tasks || [];
    }

    // Search SOPs
    if (!type || type === "sops" || type === "all") {
      let sopsQuery = authContext.supabase
        .from("sops")
        .select(`
          id,
          title,
          description,
          content,
          department_id,
          status,
          tags,
          created_at,
          updated_at,
          created_user:users!sops_created_by_fkey(full_name),
          department:departments(name)
        `)
        .or(`title.ilike.%${query}%,description.ilike.%${query}%,content.ilike.%${query}%`)
        .order("created_at", { ascending: false })
        .limit(type === "all" ? 10 : limit);

      // Apply role-based filtering
      if (hasRole(authContext.user.role, ["God", "Admin"])) {
        // God and Admin can search all SOPs
      } else if (hasRole(authContext.user.role, ["Manager"])) {
        // Managers can search department SOPs
        if (authContext.user.department_id) {
          sopsQuery = sopsQuery.eq("department_id", authContext.user.department_id);
        }
      } else {
        // Users can search SOPs in their department
        if (authContext.user.department_id) {
          sopsQuery = sopsQuery.eq("department_id", authContext.user.department_id);
        }
      }

      // Apply department filter
      if (department && hasRole(authContext.user.role, ["God", "Admin", "Manager"])) {
        sopsQuery = sopsQuery.eq("department_id", department);
      }

      const { data: sops } = await sopsQuery;
      results.sops = sops || [];
    }

    // Search users (admin only)
    if (hasRole(authContext.user.role, ["God", "Admin"]) && (!type || type === "users" || type === "all")) {
      let usersQuery = authContext.supabase
        .from("users")
        .select(`
          id,
          full_name,
          email,
          department_id,
          role,
          created_at,
          department:departments(name)
        `)
        .or(`full_name.ilike.%${query}%,email.ilike.%${query}%`)
        .order("full_name", { ascending: true })
        .limit(type === "all" ? 10 : limit);

      // Apply department filter
      if (department) {
        usersQuery = usersQuery.eq("department_id", department);
      }

      const { data: users } = await usersQuery;
      results.users = users || [];
    }

    const totalResults = Object.values(results).reduce(
      (sum: number, arr: any) => sum + (arr?.length || 0),
      0
    );

    return createSuccessResponse(
      {
        query,
        results,
        total_results: totalResults,
        search_type: type || "all",
        department_filter: department,
      },
      200,
      "Search completed successfully"
    );

  } catch (error) {
    console.error("Search error:", error);
    return createErrorResponse("Search failed");
  }
}
