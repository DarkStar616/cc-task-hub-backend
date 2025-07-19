import { NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getUserFromRequest } from "@/utils/auth";
import { createSuccessResponse, createErrorResponse } from "@/utils/response";

export async function GET(request: NextRequest) {
  try {
    const authResult = await getUserFromRequest(request);
    if (!authResult.success) {
      return createErrorResponse(authResult.message, 401);
    }

    const supabase = createClient();
    const userId = authResult.user.id;

    // Get current active session
    const { data: currentSession } = await supabase
      .from("clock_sessions")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active")
      .single();

    // Calculate total hours today
    const today = new Date().toISOString().split('T')[0];
    const { data: todaySessions } = await supabase
      .from("clock_sessions")
      .select("*")
      .eq("user_id", userId)
      .gte("created_at", `${today}T00:00:00.000Z`)
      .lt("created_at", `${today}T23:59:59.999Z`);

    let totalHoursToday = 0;
    if (todaySessions) {
      todaySessions.forEach(session => {
        if (session.clock_out_time) {
          const clockIn = new Date(session.clock_in_time);
          const clockOut = new Date(session.clock_out_time);
          totalHoursToday += (clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60);
        }
      });
    }

    // Add current session time if active
    if (currentSession) {
      const clockIn = new Date(currentSession.clock_in_time);
      const now = new Date();
      totalHoursToday += (now.getTime() - clockIn.getTime()) / (1000 * 60 * 60);
    }

    return createSuccessResponse("Clock status retrieved successfully", {
      current_session: currentSession,
      total_hours_today: Math.round(totalHoursToday * 100) / 100,
      sessions_today: todaySessions || []
    });

  } catch (error) {
    console.error("Clock status error:", error);
    return createErrorResponse("Failed to retrieve clock status", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await getUserFromRequest(request);
    if (!authResult.success) {
      return createErrorResponse(authResult.message, 401);
    }

    const body = await request.json();
    const supabase = createClient();
    const userId = authResult.user.id;

    // Check if user already has an active session
    const { data: activeSession } = await supabase
      .from("clock_sessions")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active")
      .single();

    if (activeSession) {
      return createErrorResponse("User already has an active clock session", 400);
    }

    // Create new clock session
    const { data: newSession, error } = await supabase
      .from("clock_sessions")
      .insert({
        user_id: userId,
        clock_in_time: new Date().toISOString(),
        status: "active"
      })
      .select()
      .single();

    if (error) {
      console.error("Clock in error:", error);
      return createErrorResponse("Failed to clock in", 500);
    }

    return createSuccessResponse("Clocked in successfully", {
      session: newSession
    });

  } catch (error) {
    console.error("Clock in error:", error);
    return createErrorResponse("Failed to clock in", 500);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authResult = await getUserFromRequest(request);
    if (!authResult.success) {
      return createErrorResponse(authResult.message, 401);
    }

    const supabase = createClient();
    const userId = authResult.user.id;

    // Find active session
    const { data: activeSession, error: findError } = await supabase
      .from("clock_sessions")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active")
      .single();

    if (findError || !activeSession) {
      return createErrorResponse("No active clock session found", 400);
    }

    // Clock out
    const { data: updatedSession, error: updateError } = await supabase
      .from("clock_sessions")
      .update({
        clock_out_time: new Date().toISOString(),
        status: "completed"
      })
      .eq("id", activeSession.id)
      .select()
      .single();

    if (updateError) {
      console.error("Clock out error:", updateError);
      return createErrorResponse("Failed to clock out", 500);
    }

    return createSuccessResponse("Clocked out successfully", {
      session: updatedSession
    });

  } catch (error) {
    console.error("Clock out error:", error);
    return createErrorResponse("Failed to clock out", 500);
  }
}