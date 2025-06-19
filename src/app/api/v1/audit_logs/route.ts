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
import { auditLogQuerySchema, validateQueryParams } from "@/utils/validation";

// GET /api/v1/audit_logs - List audit logs (Admin/God only)
export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext(request);
    const { user, supabase } = authContext;

    if (!user) {
      return createUnauthorizedResponse("Authentication required");
    }

    // Only Admin and God can access audit logs
    if (!hasRole(user.role, ["Admin", "God"])) {
      return createForbiddenResponse(
        "Insufficient permissions to access audit logs",
      );
    }

    // Parse query parameters
    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams.entries());
    const validation = validateQueryParams(auditLogQuerySchema, queryParams);

    if (!validation.success) {
      return createBadRequestResponse(validation.error);
    }

    const {
      table_name,
      action,
      user_id,
      record_id,
      start_date,
      end_date,
      limit = 100,
      offset = 0,
    } = validation.data;

    // Build query
    let query = supabase
      .from("audit_logs")
      .select(
        `
        *,
        users(
          id,
          full_name,
          email
        )
      `,
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (table_name) {
      query = query.eq("table_name", table_name);
    }
    if (action) {
      query = query.eq("action", action);
    }
    if (user_id) {
      query = query.eq("user_id", user_id);
    }
    if (record_id) {
      query = query.eq("record_id", record_id);
    }
    if (start_date) {
      query = query.gte("created_at", start_date);
    }
    if (end_date) {
      query = query.lte("created_at", end_date);
    }

    const { data: auditLogs, error } = await query;

    if (error) {
      console.error("Database error:", error);
      return createErrorResponse("Failed to fetch audit logs");
    }

    // Get total count for pagination
    let countQuery = supabase
      .from("audit_logs")
      .select("*", { count: "exact", head: true });

    // Apply same filters to count query
    if (table_name) {
      countQuery = countQuery.eq("table_name", table_name);
    }
    if (action) {
      countQuery = countQuery.eq("action", action);
    }
    if (user_id) {
      countQuery = countQuery.eq("user_id", user_id);
    }
    if (record_id) {
      countQuery = countQuery.eq("record_id", record_id);
    }
    if (start_date) {
      countQuery = countQuery.gte("created_at", start_date);
    }
    if (end_date) {
      countQuery = countQuery.lte("created_at", end_date);
    }

    const { count, error: countError } = await countQuery;

    if (countError) {
      console.error("Count error:", countError);
    }

    return createSuccessResponse({
      audit_logs: auditLogs,
      pagination: {
        total: count || 0,
        limit,
        offset,
        has_more: (count || 0) > offset + limit,
      },
    });
  } catch (error) {
    console.error("Audit logs GET error:", error);
    return createErrorResponse("Internal server error");
  }
}
