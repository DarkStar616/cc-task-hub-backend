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
import { validateRequestBody, updateSopSchema } from "@/utils/validation";
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

    const sopId = params.id;

    let query = authContext.supabase
      .from("sops")
      .select(
        `
        id,
        title,
        description,
        content,
        department_id,
        status,
        tags,
        attachments,
        version,
        created_at,
        updated_at,
        created_by,
        updated_by,
        created_by_user:users!sops_created_by_fkey(full_name),
        updated_by_user:users!sops_updated_by_fkey(full_name),
        department:departments(name)
      `,
      )
      .eq("id", sopId);

    // Apply role-based filtering
    if (!hasRole(authContext.user.role, ["God", "Admin"])) {
      if (hasRole(authContext.user.role, ["Manager"])) {
        if (authContext.user.department_id) {
          query = query.or(
            `department_id.eq.${authContext.user.department_id},department_id.is.null`,
          );
        }
      } else {
        // Users can only see active SOPs
        query = query.eq("status", "active");
        if (authContext.user.department_id) {
          query = query.or(
            `department_id.eq.${authContext.user.department_id},department_id.is.null`,
          );
        }
      }
    }

    const { data: sop, error } = await query.single();

    if (error || !sop) {
      return createNotFoundResponse("SOP not found");
    }

    return createSuccessResponse({ sop });
  } catch (error) {
    console.error("SOP GET error:", error);
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

    // Only Admin, Manager, and God can update SOPs
    if (!hasRole(authContext.user.role, ["God", "Admin", "Manager"])) {
      return createForbiddenResponse("Insufficient permissions to update SOPs");
    }

    const sopId = params.id;
    const body = await request.json();
    const validation = validateRequestBody(updateSopSchema, body);

    if (!validation.success) {
      return createBadRequestResponse(validation.error);
    }

    const updateData = validation.data;

    // Get current SOP data
    const { data: currentSop, error: fetchError } = await authContext.supabase
      .from("sops")
      .select("*")
      .eq("id", sopId)
      .single();

    if (fetchError || !currentSop) {
      return createNotFoundResponse("SOP not found");
    }

    // Check permissions
    const canUpdate =
      hasRole(authContext.user.role, ["God", "Admin"]) ||
      (hasRole(authContext.user.role, ["Manager"]) &&
        (currentSop.department_id === authContext.user.department_id ||
          !currentSop.department_id));

    if (!canUpdate) {
      return createForbiddenResponse("Cannot update this SOP");
    }

    // Increment version if content changed
    if (updateData.content && updateData.content !== currentSop.content) {
      updateData.version = (currentSop.version || 1) + 1;
    }

    const { data: updatedSop, error } = await authContext.supabase
      .from("sops")
      .update({
        ...updateData,
        updated_by: authContext.user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sopId)
      .select()
      .single();

    if (error) {
      console.error("SOP update error:", error);
      return createErrorResponse("Failed to update SOP");
    }

    // Log SOP update
    await logSensitiveAction(
      authContext,
      SENSITIVE_ACTIONS.SOP_UPDATE,
      {
        tableName: "sops",
        recordId: sopId,
        oldValues: currentSop,
        newValues: updateData,
        metadata: {
          version_changed: updateData.version !== currentSop.version,
          status_changed: updateData.status !== currentSop.status,
        },
      },
      request,
    );

    return createSuccessResponse({ sop: updatedSop });
  } catch (error) {
    console.error("SOP PUT error:", error);
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

    // Only Admin and God can delete SOPs
    if (!hasRole(authContext.user.role, ["God", "Admin"])) {
      return createForbiddenResponse("Insufficient permissions to delete SOPs");
    }

    const sopId = params.id;

    const { data: currentSop, error: fetchError } = await authContext.supabase
      .from("sops")
      .select("*")
      .eq("id", sopId)
      .single();

    if (fetchError || !currentSop) {
      return createNotFoundResponse("SOP not found");
    }

    // Soft delete by archiving
    const { error } = await authContext.supabase
      .from("sops")
      .update({
        status: "archived",
        updated_by: authContext.user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sopId);

    if (error) {
      console.error("SOP deletion error:", error);
      return createErrorResponse("Failed to delete SOP");
    }

    // Log SOP deletion
    await logSensitiveAction(
      authContext,
      SENSITIVE_ACTIONS.SOP_UPDATE,
      {
        tableName: "sops",
        recordId: sopId,
        oldValues: currentSop,
        newValues: { status: "archived" },
        metadata: { action: "sop_archived" },
      },
      request,
    );

    return createSuccessResponse({ message: "SOP archived successfully" });
  } catch (error) {
    console.error("SOP DELETE error:", error);
    return createErrorResponse("Internal server error");
  }
}
