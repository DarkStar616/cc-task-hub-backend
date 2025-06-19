import { NextRequest } from "next/server";
import {
  getAuthContext,
  hasRole,
  createUnauthorizedResponse,
  createForbiddenResponse,
  createBadRequestResponse,
  createNotFoundResponse,
  createSuccessResponse,
  createErrorResponse,
} from "@/utils/auth";
import { updateFeedbackSchema, validateRequestBody } from "@/utils/validation";
import { logAuditEntry } from "@/utils/audit-log";

interface RouteParams {
  params: {
    id: string;
  };
}

// GET /api/v1/feedback/[id] - Get feedback by ID
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const authContext = await getAuthContext(request);
    const { user, supabase } = authContext;

    if (!user) {
      return createUnauthorizedResponse("Authentication required");
    }

    const { data: feedback, error } = await supabase
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
      .eq("id", params.id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return createNotFoundResponse("Feedback not found");
      }
      console.error("Database error:", error);
      return createErrorResponse("Failed to fetch feedback");
    }

    // Check permissions - users can only see their own feedback or feedback about them
    if (
      !hasRole(user.role, ["Admin", "God"]) &&
      feedback.user_id !== user.id &&
      feedback.target_user_id !== user.id
    ) {
      return createForbiddenResponse(
        "You can only view your own feedback or feedback about you",
      );
    }

    return createSuccessResponse({ feedback });
  } catch (error) {
    console.error("Feedback GET error:", error);
    return createErrorResponse("Internal server error");
  }
}

// PUT /api/v1/feedback/[id] - Update feedback
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const authContext = await getAuthContext(request);
    const { user, supabase } = authContext;

    if (!user) {
      return createUnauthorizedResponse("Authentication required");
    }

    // Get existing feedback
    const { data: existingFeedback, error: fetchError } = await supabase
      .from("feedback")
      .select("*")
      .eq("id", params.id)
      .single();

    if (fetchError) {
      if (fetchError.code === "PGRST116") {
        return createNotFoundResponse("Feedback not found");
      }
      console.error("Database error:", fetchError);
      return createErrorResponse("Failed to fetch feedback");
    }

    // Check permissions
    const canUpdate =
      hasRole(user.role, ["Admin", "God"]) ||
      existingFeedback.user_id === user.id;

    if (!canUpdate) {
      return createForbiddenResponse("You can only update your own feedback");
    }

    const body = await request.json();
    const validation = validateRequestBody(updateFeedbackSchema, body);

    if (!validation.success) {
      return createBadRequestResponse(validation.error);
    }

    const updateData = {
      ...validation.data,
      updated_at: new Date().toISOString(),
    };

    const { data: feedback, error } = await supabase
      .from("feedback")
      .update(updateData)
      .eq("id", params.id)
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
      return createErrorResponse("Failed to update feedback");
    }

    // Log audit entry
    await logAuditEntry(
      authContext,
      {
        table_name: "feedback",
        record_id: params.id,
        action: "UPDATE",
        old_values: existingFeedback,
        new_values: updateData,
      },
      request,
    );

    return createSuccessResponse({ feedback });
  } catch (error) {
    console.error("Feedback PUT error:", error);
    return createErrorResponse("Internal server error");
  }
}

// DELETE /api/v1/feedback/[id] - Delete feedback
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const authContext = await getAuthContext(request);
    const { user, supabase } = authContext;

    if (!user) {
      return createUnauthorizedResponse("Authentication required");
    }

    // Get existing feedback
    const { data: existingFeedback, error: fetchError } = await supabase
      .from("feedback")
      .select("*")
      .eq("id", params.id)
      .single();

    if (fetchError) {
      if (fetchError.code === "PGRST116") {
        return createNotFoundResponse("Feedback not found");
      }
      console.error("Database error:", fetchError);
      return createErrorResponse("Failed to fetch feedback");
    }

    // Check permissions - only admins or feedback creator can delete
    const canDelete =
      hasRole(user.role, ["Admin", "God"]) ||
      existingFeedback.user_id === user.id;

    if (!canDelete) {
      return createForbiddenResponse("You can only delete your own feedback");
    }

    const { error } = await supabase
      .from("feedback")
      .delete()
      .eq("id", params.id);

    if (error) {
      console.error("Database error:", error);
      return createErrorResponse("Failed to delete feedback");
    }

    // Log audit entry
    await logAuditEntry(
      authContext,
      {
        table_name: "feedback",
        record_id: params.id,
        action: "DELETE",
        old_values: existingFeedback,
      },
      request,
    );

    return createSuccessResponse({ message: "Feedback deleted successfully" });
  } catch (error) {
    console.error("Feedback DELETE error:", error);
    return createErrorResponse("Internal server error");
  }
}
