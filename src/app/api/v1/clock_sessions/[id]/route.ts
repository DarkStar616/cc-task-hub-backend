import { NextRequest } from "next/server";
import {
  getAuthContext,
  hasRole,
  createUnauthorizedResponse,
  createForbiddenResponse,
  createBadRequestResponse,
  createSuccessResponse,
  createErrorResponse,
  createNotFoundResponse,
} from "@/utils/auth";
import { validateRequestBody, clockOutSchema } from "@/utils/validation";
import { logSensitiveAction, SENSITIVE_ACTIONS } from "@/utils/audit-log";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const authContext = await getAuthContext(request);

    if (!authContext.user) {
      return createUnauthorizedResponse();
    }

    const sessionId = params.id;

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
      .eq("id", sessionId);

    // Apply role-based filtering
    if (!hasRole(authContext.user.role, ["God", "Admin"])) {
      if (hasRole(authContext.user.role, ["Manager"])) {
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
    }

    const { data: session, error } = await query.single();

    if (error || !session) {
      return createNotFoundResponse("Clock session not found");
    }

    return createSuccessResponse({ clock_session: session });
  } catch (error) {
    console.error("Clock session GET error:", error);
    return createErrorResponse("Internal server error");
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const authContext = await getAuthContext(request);

    if (!authContext.user) {
      return createUnauthorizedResponse();
    }

    const sessionId = params.id;
    const body = await request.json();
    const { action } = body;

    // Get current session data
    const { data: currentSession, error: fetchError } =
      await authContext.supabase
        .from("clock_sessions")
        .select("*")
        .eq("id", sessionId)
        .single();

    if (fetchError || !currentSession) {
      return createNotFoundResponse("Clock session not found");
    }

    // Check permissions - users can only modify their own sessions
    const canModify =
      currentSession.user_id === authContext.user.id ||
      hasRole(authContext.user.role, ["God", "Admin"]) ||
      (hasRole(authContext.user.role, ["Manager"]) &&
        authContext.user.department_id);

    if (!canModify) {
      return createForbiddenResponse("Cannot modify this clock session");
    }

    let updateData: any = {};

    if (action === "clock_out") {
      if (currentSession.clock_out) {
        return createBadRequestResponse("Session already clocked out");
      }

      const validation = validateRequestBody(clockOutSchema, body);
      if (!validation.success) {
        return createBadRequestResponse(validation.error);
      }

      const clockOutTime = new Date().toISOString();
      const clockInTime = new Date(currentSession.clock_in);
      const totalMs = new Date(clockOutTime).getTime() - clockInTime.getTime();

      // Convert to PostgreSQL interval format (simplified)
      const totalHours = Math.floor(totalMs / (1000 * 60 * 60));
      const totalMinutes = Math.floor(
        (totalMs % (1000 * 60 * 60)) / (1000 * 60),
      );
      const totalSeconds = Math.floor((totalMs % (1000 * 60)) / 1000);
      const totalDuration = `${totalHours.toString().padStart(2, "0")}:${totalMinutes.toString().padStart(2, "0")}:${totalSeconds.toString().padStart(2, "0")}`;

      updateData = {
        clock_out: clockOutTime,
        total_duration: totalDuration,
        status: "completed",
        notes: validation.data.notes || currentSession.notes,
        updated_at: new Date().toISOString(),
      };

      // Log clock out
      await logSensitiveAction(
        authContext,
        SENSITIVE_ACTIONS.CLOCK_OUT,
        {
          tableName: "clock_sessions",
          recordId: sessionId,
          oldValues: { status: currentSession.status },
          newValues: {
            clock_out: clockOutTime,
            total_duration: totalDuration,
            status: "completed",
          },
        },
        request,
      );
    } else if (action === "add_break") {
      const { duration } = body;
      if (!duration) {
        return createBadRequestResponse("Break duration is required");
      }

      updateData = {
        break_duration: duration,
        updated_at: new Date().toISOString(),
      };
    } else {
      return createBadRequestResponse("Invalid action");
    }

    const { data: updatedSession, error } = await authContext.supabase
      .from("clock_sessions")
      .update(updateData)
      .eq("id", sessionId)
      .select()
      .single();

    if (error) {
      console.error("Clock session update error:", error);
      return createErrorResponse("Failed to update clock session");
    }

    return createSuccessResponse({ clock_session: updatedSession });
  } catch (error) {
    console.error("Clock session PUT error:", error);
    return createErrorResponse("Internal server error");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const authContext = await getAuthContext(request);

    if (!authContext.user) {
      return createUnauthorizedResponse();
    }

    // Only Admin and God can delete clock sessions
    if (!hasRole(authContext.user.role, ["God", "Admin"])) {
      return createForbiddenResponse(
        "Insufficient permissions to delete clock sessions",
      );
    }

    const sessionId = params.id;

    const { data: currentSession, error: fetchError } =
      await authContext.supabase
        .from("clock_sessions")
        .select("*")
        .eq("id", sessionId)
        .single();

    if (fetchError || !currentSession) {
      return createNotFoundResponse("Clock session not found");
    }

    // Soft delete by updating status
    const { error } = await authContext.supabase
      .from("clock_sessions")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessionId);

    if (error) {
      console.error("Clock session deletion error:", error);
      return createErrorResponse("Failed to delete clock session");
    }

    return createSuccessResponse({
      message: "Clock session deleted successfully",
    });
  } catch (error) {
    console.error("Clock session DELETE error:", error);
    return createErrorResponse("Internal server error");
  }
}
