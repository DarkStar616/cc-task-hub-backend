import { createClient } from "../../supabase/server";
import { NextRequest } from "next/server";
import { Database } from "@/types/supabase";

type UserRole = "God" | "Admin" | "Manager" | "User" | "Guest";

export interface AuthContext {
  user: {
    id: string;
    email: string;
    role: UserRole;
    department_id: string | null;
  } | null;
  supabase: ReturnType<typeof createClient>;
}

export async function getAuthContext(
  request?: NextRequest,
): Promise<AuthContext> {
  const supabase = await createClient();

  try {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.user) {
      return { user: null, supabase };
    }

    // Get user details with role information
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select(
        `
        id,
        email,
        department_id,
        roles!inner(
          name
        )
      `,
      )
      .eq("id", session.user.id)
      .single();

    if (userError || !userData) {
      return { user: null, supabase };
    }

    return {
      user: {
        id: userData.id,
        email: userData.email || "",
        role: ((userData.roles as any)?.name as UserRole) || "Guest",
        department_id: userData.department_id,
      },
      supabase,
    };
  } catch (error) {
    console.error("Auth context error:", error);
    return { user: null, supabase };
  }
}

export function hasRole(
  userRole: UserRole,
  requiredRoles: UserRole[],
): boolean {
  const roleHierarchy: Record<UserRole, number> = {
    God: 5,
    Admin: 4,
    Manager: 3,
    User: 2,
    Guest: 1,
  };

  const userLevel = roleHierarchy[userRole] || 0;
  const requiredLevel = Math.min(
    ...requiredRoles.map((role) => roleHierarchy[role] || 0),
  );

  return userLevel >= requiredLevel;
}

export function canManageUser(
  currentUserRole: UserRole,
  targetUserRole: UserRole,
): boolean {
  const roleHierarchy: Record<UserRole, number> = {
    God: 5,
    Admin: 4,
    Manager: 3,
    User: 2,
    Guest: 1,
  };

  return roleHierarchy[currentUserRole] > roleHierarchy[targetUserRole];
}

export function createUnauthorizedResponse(message: string = "Unauthorized") {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

export function createForbiddenResponse(message: string = "Forbidden") {
  return new Response(JSON.stringify({ error: message }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}

export function createBadRequestResponse(message: string = "Bad Request") {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });
}

export function createNotFoundResponse(message: string = "Not Found") {
  return new Response(JSON.stringify({ error: message }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}

export function createSuccessResponse(data: any, status: number = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function createErrorResponse(message: string, status: number = 500) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
