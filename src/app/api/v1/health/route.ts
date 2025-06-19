import { NextRequest } from "next/server";
import { createClient } from "../../../../../supabase/server";
import { createSuccessResponse, createErrorResponse } from "@/utils/auth";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Test database connection
    const { data, error } = await supabase
      .from("users")
      .select("count")
      .limit(1);

    if (error) {
      return createErrorResponse("Database connection failed", 503);
    }

    // Test auth service
    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession();

    const healthStatus = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      services: {
        database: "healthy",
        auth: authError ? "degraded" : "healthy",
      },
      version: "1.0.0",
    };

    return createSuccessResponse(healthStatus);
  } catch (error) {
    console.error("Health check error:", error);
    return createErrorResponse("Health check failed", 503);
  }
}
