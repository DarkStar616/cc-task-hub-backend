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
  canManageUser,
} from "@/utils/auth";
import { validateRequestBody, updateUserSchema } from "@/utils/validation";
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

    const userId = params.id;

    // Users can view their own profile, managers can view department users, admins/god can view all
    const canView =
      userId === authContext.user.id ||
      hasRole(authContext.user.role, ["God", "Admin"]) ||
      (hasRole(authContext.user.role, ["Manager"]) &&
        authContext.user.department_id);

    if (!canView) {
      return createForbiddenResponse("Cannot view this user");
    }

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
        emergency_contact,
        preferences,
        created_at,
        updated_at,
        departments(name),
        roles(name)
      `,
      )
      .eq("id", userId);

    // If manager, ensure user is in their department
    if (authContext.user.role === "Manager" && userId !== authContext.user.id) {
      query = query.eq("department_id", authContext.user.department_id);
    }

    const { data: user, error } = await query.single();

    if (error || !user) {
      return createNotFoundResponse("User not found");
    }

    return createSuccessResponse({ user });
  } catch (error) {
    console.error("User GET error:", error);
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

    const userId = params.id;
    const body = await request.json();
    const validation = validateRequestBody(updateUserSchema, body);

    if (!validation.success) {
      return createBadRequestResponse(validation.error);
    }

    const updateData = validation.data;

    // Get current user data for comparison
    const { data: currentUser, error: fetchError } = await authContext.supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();

    if (fetchError || !currentUser) {
      return createNotFoundResponse("User not found");
    }

    // Check permissions
    const canUpdate =
      userId === authContext.user.id || // Own profile
      hasRole(authContext.user.role, ["God", "Admin"]) || // Admin/God
      (hasRole(authContext.user.role, ["Manager"]) &&
        currentUser.department_id === authContext.user.department_id); // Manager in same dept

    if (!canUpdate) {
      return createForbiddenResponse("Cannot update this user");
    }

    // Check role elevation permissions
    if (updateData.role_id && updateData.role_id !== currentUser.role_id) {
      if (!hasRole(authContext.user.role, ["God", "Admin", "Manager"])) {
        return createForbiddenResponse("Cannot change user roles");
      }

      const { data: newRole } = await authContext.supabase
        .from("roles")
        .select("name")
        .eq("id", updateData.role_id)
        .single();

      if (
        newRole &&
        !canManageUser(authContext.user.role, newRole.name as any)
      ) {
        return createForbiddenResponse(
          "Cannot assign role higher than your own",
        );
      }
    }

    // Managers can't change department assignments
    if (
      updateData.department_id &&
      updateData.department_id !== currentUser.department_id &&
      authContext.user.role === "Manager"
    ) {
      return createForbiddenResponse("Cannot change department assignments");
    }

    const { data: updatedUser, error } = await authContext.supabase
      .from("users")
      .update({
        ...updateData,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId)
      .select()
      .single();

    if (error) {
      console.error("User update error:", error);
      return createErrorResponse("Failed to update user");
    }

    // Log sensitive changes
    if (updateData.role_id && updateData.role_id !== currentUser.role_id) {
      await logSensitiveAction(
        authContext,
        SENSITIVE_ACTIONS.USER_ROLE_CHANGE,
        {
          tableName: "users",
          recordId: userId,
          oldValues: { role_id: currentUser.role_id },
          newValues: { role_id: updateData.role_id },
        },
        request,
      );
    }

    if (
      updateData.department_id &&
      updateData.department_id !== currentUser.department_id
    ) {
      await logSensitiveAction(
        authContext,
        SENSITIVE_ACTIONS.USER_DEPARTMENT_CHANGE,
        {
          tableName: "users",
          recordId: userId,
          oldValues: { department_id: currentUser.department_id },
          newValues: { department_id: updateData.department_id },
        },
        request,
      );
    }

    return createSuccessResponse({ user: updatedUser });
  } catch (error) {
    console.error("User PUT error:", error);
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

    // Only God and Admin can delete users
    if (!hasRole(authContext.user.role, ["God", "Admin"])) {
      return createForbiddenResponse(
        "Insufficient permissions to delete users",
      );
    }

    const userId = params.id;

    // Prevent self-deletion
    if (userId === authContext.user.id) {
      return createBadRequestResponse("Cannot delete your own account");
    }

    const { data: userToDelete, error: fetchError } = await authContext.supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();

    if (fetchError || !userToDelete) {
      return createNotFoundResponse("User not found");
    }

    // Soft delete by updating status
    const { error } = await authContext.supabase
      .from("users")
      .update({
        status: "deleted",
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (error) {
      console.error("User deletion error:", error);
      return createErrorResponse("Failed to delete user");
    }

    // Log the deletion
    await logSensitiveAction(
      authContext,
      SENSITIVE_ACTIONS.USER_ROLE_CHANGE,
      {
        tableName: "users",
        recordId: userId,
        oldValues: userToDelete,
        newValues: { status: "deleted" },
        metadata: { action: "user_deleted" },
      },
      request,
    );

    return createSuccessResponse({ message: "User deleted successfully" });
  } catch (error) {
    console.error("User DELETE error:", error);
    return createErrorResponse("Internal server error");
  }
}
