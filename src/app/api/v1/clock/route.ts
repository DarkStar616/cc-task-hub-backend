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
    const userId = searchParams.get("user_id");
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");

    // Get clock sessions
    let query = authContext.supabase
      .from("clock_sessions")
      .select(`
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
      `)
      .order("clock_in", { ascending: false });

    // Apply role-based filtering
    if (!hasRole(authContext.user.role, ["God", "Admin"])) {
      if (hasRole(authContext.user.role, ["Manager"]) && authContext.user.department_id) {
        const { data: departmentUsers } = await authContext.supabase
          .from("users")
          .select("id")
          .eq("department_id", authContext.user.department_id);

        if (departmentUsers) {
          const userIds = departmentUsers.map((u) => u.id);
          query = query.in("user_id", userIds);
        }
      } else {
        query = query.eq("user_id", authContext.user.id);
      }
    }

    if (userId && hasRole(authContext.user.role, ["God", "Admin", "Manager"])) {
      query = query.eq("user_id", userId);
    }

    if (startDate) {
      query = query.gte("clock_in", startDate);
    }

    if (endDate) {
      query = query.lte("clock_in", endDate);
    }

    const { data: sessions, error } = await query;

    if (error) {
      console.error("Clock sessions fetch error:", error);
      return createErrorResponse("Failed to fetch clock sessions");
    }

    // Get current active session
    const { data: currentSession } = await authContext.supabase
      .from("clock_sessions")
      .select("*")
      .eq("user_id", authContext.user.id)
      .is("clock_out", null)
      .single();

    // Calculate total hours today
    const today = new Date().toISOString().split('T')[0];
    const { data: todaySessions } = await authContext.supabase
      .from("clock_sessions")
      .select("total_duration")
      .eq("user_id", authContext.user.id)
      .gte("clock_in", `${today}T00:00:00.000Z`);

    const totalHoursToday = todaySessions?.reduce((total, session) => {
      return total + (session.total_duration || 0);
    }, 0) || 0;

    return createSuccessResponse({
      sessions: sessions || [],
      current_session: currentSession,
      total_hours_today: totalHoursToday / 3600 // Convert seconds to hours
    }, 200, "Clock sessions fetched successfully");
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
    const { action } = body;

    if (!action || !["clock_in", "clock_out"].includes(action)) {
      return createBadRequestResponse("Valid action (clock_in/clock_out) is required");
    }

    if (action === "clock_in") {
      // Check if user already has an active session
      const { data: activeSession } = await authContext.supabase
        .from("clock_sessions")
        .select("id")
        .eq("user_id", authContext.user.id)
        .is("clock_out", null)
        .single();

      if (activeSession) {
        return createBadRequestResponse("User already has an active clock session");
      }

      const { data: newSession, error } = await authContext.supabase
        .from("clock_sessions")
        .insert({
          user_id: authContext.user.id,
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

      return createSuccessResponse({
        session: newSession
      }, 201, "Clocked in successfully");
    } else {
      // Clock out
      const { data: activeSession } = await authContext.supabase
        .from("clock_sessions")
        .select("*")
        .eq("user_id", authContext.user.id)
        .is("clock_out", null)
        .single();

      if (!activeSession) {
        return createBadRequestResponse("No active clock session found");
      }

      const clockOutTime = new Date();
      const clockInTime = new Date(activeSession.clock_in);
      const totalDuration = Math.floor((clockOutTime.getTime() - clockInTime.getTime()) / 1000);

      const { data: updatedSession, error } = await authContext.supabase
        .from("clock_sessions")
        .update({
          clock_out: clockOutTime.toISOString(),
          total_duration: totalDuration,
          status: "completed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", activeSession.id)
        .select()
        .single();

      if (error) {
        console.error("Clock out error:", error);
        return createErrorResponse("Failed to clock out");
      }

      return createSuccessResponse({
        session: updatedSession
      }, 200, "Clocked out successfully");
    }
  } catch (error) {
    console.error("Clock sessions POST error:", error);
    return createErrorResponse("Internal server error");
  }
}