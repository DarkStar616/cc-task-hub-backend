import { NextRequest } from "next/server";
import {
  getAuthContext,
  hasRole,
  createUnauthorizedResponse,
  createForbiddenResponse,
  createBadRequestResponse,
  createSuccessResponse,
  createErrorResponse,
  canManageUser,
} from "@/utils/auth";
import {
  validateRequestBody,
  createUserSchema,
  updateUserSchema,
} from "@/utils/validation";
import { logSensitiveAction, SENSITIVE_ACTIONS } from "@/utils/audit-log";

export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext(request);

    if (!authContext.user) {
      return createUnauthorizedResponse();
    }

    const { searchParams } = new URL(request.url);
    const departmentId = searchParams.get("department_id");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    let query = authContext.supabase
      .from("users")
      .select(
        `
        id,
        email,
        full_name,
        phone,
        department_id,
        role_id,
        status,
        hire_date,
        created_at,
        updated_at,
        departments(name),
        roles(name)
      `,
      )
      .range(offset, offset + limit - 1);

    // Apply filters based on role
    if (!hasRole(authContext.user.role, ["God", "Admin"])) {
      if (
        hasRole(authContext.user.role, ["Manager"]) &&
        authContext.user.department_id
      ) {
        query = query.eq("department_id", authContext.user.department_id);
      } else {
        // Regular users can only see their own profile
        query = query.eq("id", authContext.user.id);
      }
    }

    if (
      departmentId &&
      hasRole(authContext.user.role, ["God", "Admin", "Manager"])
    ) {
      query = query.eq("department_id", departmentId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Users fetch error:", error);
      return createErrorResponse("Failed to fetch users");
    }

    return createSuccessResponse({ users: data });
  } catch (error) {
    console.error("Users GET error:", error);
    return createErrorResponse("Internal server error");
  }
}

export async function POST(request: NextRequest) {
  try {
    const authContext = await getAuthContext(request);

    if (!authContext.user) {
      return createUnauthorizedResponse();
    }

    // Only God, Admin, and Manager can create users
    if (!hasRole(authContext.user.role, ["God", "Admin", "Manager"])) {
      return createForbiddenResponse(
        "Insufficient permissions to create users",
      );
    }

    const body = await request.json();
    const validation = validateRequestBody(createUserSchema, body);

    if (!validation.success) {
      return createBadRequestResponse(validation.error);
    }

    const userData = validation.data;

    // Check if user is trying to assign a role they can't manage
    if (userData.role_id) {
      const { data: targetRole } = await authContext.supabase
        .from("roles")
        .select("name")
        .eq("id", userData.role_id)
        .single();

      if (
        targetRole &&
        !canManageUser(authContext.user.role, targetRole.name as any)
      ) {
        return createForbiddenResponse(
          "Cannot assign role higher than your own",
        );
      }
    }

    // Managers can only create users in their department
    if (authContext.user.role === "Manager") {
      if (
        userData.department_id &&
        userData.department_id !== authContext.user.department_id
      ) {
        return createForbiddenResponse(
          "Can only create users in your department",
        );
      }
      userData.department_id = authContext.user.department_id;
    }

    const { data: newUser, error } = await authContext.supabase
      .from("users")
      .insert({
        ...userData,
        token_identifier: crypto.randomUUID(),
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("User creation error:", error);
      return createErrorResponse("Failed to create user");
    }

    // Log the user creation
    await logSensitiveAction(
      authContext,
      SENSITIVE_ACTIONS.USER_ROLE_CHANGE,
      {
        tableName: "users",
        recordId: newUser.id,
        newValues: userData,
        metadata: { action: "user_created" },
      },
      request,
    );

    return createSuccessResponse({ user: newUser }, 201);
  } catch (error) {
    console.error("Users POST error:", error);
    return createErrorResponse("Internal server error");
  }
}
