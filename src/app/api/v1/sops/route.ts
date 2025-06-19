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
import { validateRequestBody, createSopSchema } from "@/utils/validation";
import { logSensitiveAction, SENSITIVE_ACTIONS } from "@/utils/audit-log";

export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext(request);

    if (!authContext.user) {
      return createUnauthorizedResponse();
    }

    const { searchParams } = new URL(request.url);
    const departmentId = searchParams.get("department_id");
    const status = searchParams.get("status");
    const tags = searchParams.get("tags")?.split(",");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

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
        created_by_user:users!sops_created_by_fkey(full_name),
        updated_by_user:users!sops_updated_by_fkey(full_name),
        department:departments(name)
      `,
      )
      .range(offset, offset + limit - 1)
      .order("updated_at", { ascending: false });

    // Apply role-based filtering
    if (!hasRole(authContext.user.role, ["God", "Admin"])) {
      if (hasRole(authContext.user.role, ["Manager"])) {
        // Managers can see department SOPs and public ones
        if (authContext.user.department_id) {
          query = query.or(
            `department_id.eq.${authContext.user.department_id},department_id.is.null`,
          );
        }
      } else {
        // Users can see active SOPs in their department and public ones
        query = query.eq("status", "active");
        if (authContext.user.department_id) {
          query = query.or(
            `department_id.eq.${authContext.user.department_id},department_id.is.null`,
          );
        }
      }
    }

    // Apply additional filters
    if (departmentId) {
      query = query.eq("department_id", departmentId);
    }
    if (status) {
      query = query.eq("status", status);
    }
    if (tags && tags.length > 0) {
      query = query.overlaps("tags", tags);
    }

    const { data, error } = await query;

    if (error) {
      console.error("SOPs fetch error:", error);
      return createErrorResponse("Failed to fetch SOPs");
    }

    return createSuccessResponse({ sops: data });
  } catch (error) {
    console.error("SOPs GET error:", error);
    return createErrorResponse("Internal server error");
  }
}

export async function POST(request: NextRequest) {
  try {
    const authContext = await getAuthContext(request);

    if (!authContext.user) {
      return createUnauthorizedResponse();
    }

    // Only Admin, Manager, and God can create SOPs
    if (!hasRole(authContext.user.role, ["God", "Admin", "Manager"])) {
      return createForbiddenResponse("Insufficient permissions to create SOPs");
    }

    const body = await request.json();
    const validation = validateRequestBody(createSopSchema, body);

    if (!validation.success) {
      return createBadRequestResponse(validation.error);
    }

    const sopData = validation.data;

    // Managers can only create SOPs for their department
    if (authContext.user.role === "Manager") {
      if (
        sopData.department_id &&
        sopData.department_id !== authContext.user.department_id
      ) {
        return createForbiddenResponse(
          "Can only create SOPs for your department",
        );
      }
      if (!sopData.department_id) {
        sopData.department_id = authContext.user.department_id;
      }
    }

    const { data: newSop, error } = await authContext.supabase
      .from("sops")
      .insert({
        ...sopData,
        created_by: authContext.user.id,
        status: "draft",
        version: 1,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("SOP creation error:", error);
      return createErrorResponse("Failed to create SOP");
    }

    // Log SOP creation
    await logSensitiveAction(
      authContext,
      SENSITIVE_ACTIONS.SOP_CREATION,
      {
        tableName: "sops",
        recordId: newSop.id,
        newValues: sopData,
        metadata: { action: "sop_created" },
      },
      request,
    );

    return createSuccessResponse({ sop: newSop }, 201);
  } catch (error) {
    console.error("SOPs POST error:", error);
    return createErrorResponse("Internal server error");
  }
}
