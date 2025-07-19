
import { NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getUserFromRequest, hasRole } from "@/utils/auth";
import { createSuccessResponse, createErrorResponse } from "@/utils/response";
import { mapDepartmentNameToId } from "@/utils/department-mapping";

export async function GET(request: NextRequest) {
  try {
    const authResult = await getUserFromRequest(request);
    if (!authResult.success) {
      return createErrorResponse(authResult.message, 401);
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") || "";
    const department = searchParams.get("department");
    const type = searchParams.get("type"); // "tasks", "sops", "users", "all"
    const limit = parseInt(searchParams.get("limit") || "50");

    if (!query.trim()) {
      return createErrorResponse("Search query is required", 400);
    }

    const supabase = createClient();
    const user = authResult.user;
    const results: any = {};

    // Department filtering
    let departmentId = null;
    if (department && department !== "All Departments") {
      departmentId = mapDepartmentNameToId(department);
      if (!departmentId) {
        return createErrorResponse("Invalid department", 400);
      }
    }

    // Search tasks
    if (!type || type === "tasks" || type === "all") {
      let tasksQuery = supabase
        .from("tasks")
        .select("id, title, description, status, priority, due_date, department")
        .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
        .order("created_at", { ascending: false })
        .limit(type === "all" ? 10 : limit);

      // Apply department filtering
      if (departmentId) {
        tasksQuery = tasksQuery.eq("department_id", departmentId);
      } else if (!hasRole(user, ["god", "admin"])) {
        // Non-admin users see only their department
        const userDeptId = mapDepartmentNameToId(user.department);
        if (userDeptId) {
          tasksQuery = tasksQuery.eq("department_id", userDeptId);
        }
      }

      const { data: tasks } = await tasksQuery;
      results.tasks = tasks || [];
    }

    // Search SOPs
    if (!type || type === "sops" || type === "all") {
      let sopsQuery = supabase
        .from("sops")
        .select("id, title, content, department, created_at")
        .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
        .order("created_at", { ascending: false })
        .limit(type === "all" ? 10 : limit);

      // Apply department filtering
      if (departmentId) {
        sopsQuery = sopsQuery.eq("department_id", departmentId);
      } else if (!hasRole(user, ["god", "admin"])) {
        const userDeptId = mapDepartmentNameToId(user.department);
        if (userDeptId) {
          sopsQuery = sopsQuery.eq("department_id", userDeptId);
        }
      }

      const { data: sops } = await sopsQuery;
      results.sops = sops || [];
    }

    // Search users (admin only)
    if (hasRole(user, ["god", "admin"]) && (!type || type === "users" || type === "all")) {
      let usersQuery = supabase
        .from("profiles")
        .select("id, name, email, department, role")
        .or(`name.ilike.%${query}%,email.ilike.%${query}%`)
        .order("name", { ascending: true })
        .limit(type === "all" ? 10 : limit);

      if (departmentId) {
        usersQuery = usersQuery.eq("department_id", departmentId);
      }

      const { data: users } = await usersQuery;
      results.users = users || [];
    }

    return createSuccessResponse("Search completed successfully", {
      query,
      results,
      total_results: Object.values(results).reduce((sum: number, arr: any) => sum + (arr?.length || 0), 0)
    });

  } catch (error) {
    console.error("Search error:", error);
    return createErrorResponse("Search failed", 500);
  }
}
