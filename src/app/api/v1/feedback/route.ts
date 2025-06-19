import { NextRequest } from "next/server";
import {
  getAuthContext,
  hasRole,
  createUnauthorizedResponse,
  createBadRequestResponse,
  createSuccessResponse,
  createErrorResponse,
} from "@/utils/auth";
import {
  createFeedbackSchema,
  validateRequestBody,
  validateQueryParams,
  analyticsQuerySchema,
} from "@/utils/validation";
import { logAuditEntry, SENSITIVE_ACTIONS } from "@/utils/audit-log";

// GET /api/v1/feedback - List feedback
export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext(request);
    const { user, supabase } = authContext;

    if (!user) {
      return createUnauthorizedResponse("Authentication required");
    }

    // Parse query parameters
    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams.entries());
    const validation = validateQueryParams(analyticsQuerySchema, queryParams);

    if (!validation.success) {
      return createBadRequestResponse(validation.error);
    }

    const {
      user_id,
      task_id,
      period_start,
      period_end,
      limit = 50,
      offset = 0,
    } = validation.data;

    // Build query
    let query = supabase
      .from("feedback")
      .select(
        `
        *,
        users!feedback_user_id_fkey(
          id,
          full_name,
          email
        ),
        target_users:users!feedback_target_user_id_fkey(
          id,
          full_name,
          email
        ),
        tasks(
          id,
          title
        )
      `,
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (user_id) {
      query = query.eq("user_id", user_id);
    }
    if (task_id) {
      query = query.eq("task_id", task_id);
    }
    if (period_start) {
      query = query.gte("created_at", period_start);
    }
    if (period_end) {
      query = query.lte("created_at", period_end);
    }

    // Non-admin users can only see their own feedback or feedback about them
    if (!hasRole(user.role, ["Admin", "God"])) {
      query = query.or(`user_id.eq.${user.id},target_user_id.eq.${user.id}`);
    }

    const { data: feedback, error } = await query;

    if (error) {
      console.error("Database error:", error);
      return createErrorResponse("Failed to fetch feedback");
    }

    return createSuccessResponse({ feedback });
  } catch (error) {
    console.error("Feedback GET error:", error);
    return createErrorResponse("Internal server error");
  }
}

// POST /api/v1/feedback - Create feedback
export async function POST(request: NextRequest) {
  try {
    const authContext = await getAuthContext(request);
    const { user, supabase } = authContext;

    if (!user) {
      return createUnauthorizedResponse("Authentication required");
    }

    const body = await request.json();
    const validation = validateRequestBody(createFeedbackSchema, body);

    if (!validation.success) {
      return createBadRequestResponse(validation.error);
    }

    const feedbackData = {
      ...validation.data,
      user_id: user.id,
      status: "open",
      created_at: new Date().toISOString(),
    };

    const { data: feedback, error } = await supabase
      .from("feedback")
      .insert(feedbackData)
      .select(
        `
        *,
        users!feedback_user_id_fkey(
          id,
          full_name,
          email
        ),
        target_users:users!feedback_target_user_id_fkey(
          id,
          full_name,
          email
        ),
        tasks(
          id,
          title
        )
      `,
      )
      .single();

    if (error) {
      console.error("Database error:", error);
      return createErrorResponse("Failed to create feedback");
    }

    // Log audit entry
    await logAuditEntry(
      authContext,
      {
        table_name: "feedback",
        record_id: feedback.id,
        action: "INSERT",
        new_values: feedbackData,
      },
      request,
    );

    return createSuccessResponse({ feedback }, 201);
  } catch (error) {
    console.error("Feedback POST error:", error);
    return createErrorResponse("Internal server error");
  }
}
