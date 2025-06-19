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
import { validateRequestBody, clockInSchema } from "@/utils/validation";
import { logSensitiveAction, SENSITIVE_ACTIONS } from "@/utils/audit-log";

export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext(request);

    if (!authContext.user) {
      return createUnauthorizedResponse();
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("user_id");
    const status = searchParams.get("status");
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    let query = authContext.supabase
      .from("clock_sessions")
      .select(
        `
        id,
        user_id,
        task_id,
        clock_in,
        clock_out,
        break_duration,
        total_duration,
        status,
        location,
        notes,
        metadata,
        created_at,
        updated_at,
        user:users(full_name),
        task:tasks(title)
      `,
      )
      .range(offset, offset + limit - 1)
      .order("clock_in", { ascending: false });

    // Apply role-based filtering
    if (hasRole(authContext.user.role, ["God", "Admin"])) {
      // God and Admin can see all sessions
    } else if (hasRole(authContext.user.role, ["Manager"])) {
      // Managers can see department sessions
      if (authContext.user.department_id) {
        const { data: departmentUsers } = await authContext.supabase
          .from("users")
          .select("id")
          .eq("department_id", authContext.user.department_id);

        if (departmentUsers) {
          const userIds = departmentUsers.map((u) => u.id);
          query = query.in("user_id", userIds);
        }
      }
    } else {
      // Users can only see their own sessions
      query = query.eq("user_id", authContext.user.id);
    }

    // Apply additional filters
    if (userId && hasRole(authContext.user.role, ["God", "Admin", "Manager"])) {
      query = query.eq("user_id", userId);
    }
    if (status) {
      query = query.eq("status", status);
    }
    if (startDate) {
      query = query.gte("clock_in", startDate);
    }
    if (endDate) {
      query = query.lte("clock_in", endDate);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Clock sessions fetch error:", error);
      return createErrorResponse("Failed to fetch clock sessions");
    }

    return createSuccessResponse({ clock_sessions: data });
  } catch (error) {
    console.error("Clock sessions GET error:", error);
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
    const validation = validateRequestBody(clockInSchema, body);

    if (!validation.success) {
      return createBadRequestResponse(validation.error);
    }

    const clockData = validation.data;

    // Check if user already has an active session
    const { data: activeSession } = await authContext.supabase
      .from("clock_sessions")
      .select("id")
      .eq("user_id", authContext.user.id)
      .is("clock_out", null)
      .single();

    if (activeSession) {
      return createBadRequestResponse(
        "User already has an active clock session",
      );
    }

    // Validate task assignment if provided
    if (clockData.task_id) {
      const { data: task } = await authContext.supabase
        .from("tasks")
        .select("assigned_to, department_id")
        .eq("id", clockData.task_id)
        .single();

      if (!task) {
        return createBadRequestResponse("Invalid task ID");
      }

      // Check if user can clock in for this task
      const canClockIn =
        task.assigned_to === authContext.user.id ||
        hasRole(authContext.user.role, ["God", "Admin"]) ||
        (hasRole(authContext.user.role, ["Manager"]) &&
          task.department_id === authContext.user.department_id);

      if (!canClockIn) {
        return createForbiddenResponse("Cannot clock in for this task");
      }
    }

    const { data: newSession, error } = await authContext.supabase
      .from("clock_sessions")
      .insert({
        user_id: authContext.user.id,
        task_id: clockData.task_id,
        location: clockData.location,
        notes: clockData.notes,
        clock_in: new Date().toISOString(),
        status: "active",
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("Clock in error:", error);
      return createErrorResponse("Failed to clock in");
    }

    // Log clock in
    await logSensitiveAction(
      authContext,
      SENSITIVE_ACTIONS.CLOCK_IN,
      {
        tableName: "clock_sessions",
        recordId: newSession.id,
        newValues: {
          user_id: authContext.user.id,
          task_id: clockData.task_id,
          clock_in: newSession.clock_in,
        },
      },
      request,
    );

    return createSuccessResponse({ clock_session: newSession }, 201);
  } catch (error) {
    console.error("Clock sessions POST error:", error);
    return createErrorResponse("Internal server error");
  }
}
