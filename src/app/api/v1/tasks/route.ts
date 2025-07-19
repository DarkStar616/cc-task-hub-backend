import { NextRequest } from "next/server";
import {
  getAuthContext,
  hasRole,
  createUnauthorizedResponse,
  createForbiddenResponse,
  createBadRequestResponse,
  createSuccessResponse,
  createErrorResponse,
} from "@/utils/auth";
import { validateRequestBody, createTaskSchema } from "@/utils/validation";
import { logSensitiveAction, SENSITIVE_ACTIONS } from "@/utils/audit-log";

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
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

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
        created_at,
        updated_at,
        created_by_user:users!tasks_created_by_fkey(full_name),
        assigned_user:users!tasks_assigned_to_fkey(full_name),
        department:departments(name),
        sop:sops(title)
      `,
      )
      .range(offset, offset + limit - 1)
      .order("created_at", { ascending: false });

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
      // Validate status parameter
      const validStatuses = ["pending", "in_progress", "completed", "cancelled", "overdue"];
      if (!validStatuses.includes(status)) {
        return createBadRequestResponse("Invalid status parameter");
      }
      query = query.eq("status", status);
    }
    if (priority) {
      query = query.eq("priority", priority);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Tasks fetch error:", error);
      return createErrorResponse("Failed to fetch tasks");
    }

    return createSuccessResponse(data, 200, "Tasks fetched successfully");
  } catch (error) {
    console.error("Tasks GET error:", error);
    return createErrorResponse("Internal server error");
  }
}

export async function POST(request: NextRequest) {
  try {
    const authContext = await getAuthContext(request);

    if (!authContext.user) {
      return createUnauthorizedResponse();
    }

    const body = await request.json();
    const validation = validateRequestBody(createTaskSchema, body);

    if (!validation.success) {
      return createBadRequestResponse(validation.error);
    }

    const taskData = validation.data;

    // Set department based on user role
    if (!taskData.department_id) {
      if (authContext.user.department_id) {
        taskData.department_id = authContext.user.department_id;
      }
    } else {
      // Check if user can create tasks in specified department
      if (
        authContext.user.role === "Manager" &&
        taskData.department_id !== authContext.user.department_id
      ) {
        return createForbiddenResponse(
          "Can only create tasks in your department",
        );
      }
    }

    // Validate assignment permissions
    if (taskData.assigned_to) {
      const { data: assignedUser } = await authContext.supabase
        .from("users")
        .select("department_id")
        .eq("id", taskData.assigned_to)
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

    const { data: newTask, error } = await authContext.supabase
      .from("tasks")
      .insert({
        ...taskData,
        created_by: authContext.user.id,
        status: taskData.status || "pending",
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("Task creation error:", error);
      return createErrorResponse("Failed to create task");
    }

    // Log task creation
    if (taskData.assigned_to) {
      await logSensitiveAction(
        authContext,
        SENSITIVE_ACTIONS.TASK_ASSIGNMENT,
        {
          tableName: "tasks",
          recordId: newTask.id,
          newValues: { assigned_to: taskData.assigned_to },
          metadata: { action: "task_created_and_assigned" },
        },
        request,
      );
    }

    return createSuccessResponse(newTask, 201, "Task created successfully");
  } catch (error) {
    console.error("Tasks POST error:", error);
    return createErrorResponse("Internal server error");
  }
}