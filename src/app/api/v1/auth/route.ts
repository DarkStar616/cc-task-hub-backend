
import { NextRequest } from "next/server";
import { createClient } from "../../../../../supabase/server";
import {
  createSuccessResponse,
  createErrorResponse,
  createBadRequestResponse,
} from "@/utils/auth";

// POST /api/v1/auth/login
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, action } = body;

    if (!action) {
      return createBadRequestResponse("Action is required");
    }

    const supabase = await createClient();

    switch (action) {
      case "login":
        if (!email || !password) {
          return createBadRequestResponse("Email and password are required");
        }

        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          return createErrorResponse(error.message, 401);
        }

        // Get user details with role
        const { data: userData, error: userError } = await supabase
          .from("users")
          .select(`
            id,
            email,
            full_name,
            role_id,
            department_id,
            roles!inner(name),
            departments(name)
          `)
          .eq("id", data.user.id)
          .single();

        if (userError) {
          return createErrorResponse("Failed to fetch user details", 500);
        }

        return createSuccessResponse({
          user: {
            id: userData.id,
            email: userData.email,
            full_name: userData.full_name,
            role: (userData.roles as any)?.name,
            department: (userData.departments as any)?.name,
            avatar_url: null,
            created_at: data.user.created_at,
            updated_at: data.user.updated_at,
          },
          session: data.session,
        }, 200, "Login successful");

      case "register":
        if (!email || !password) {
          return createBadRequestResponse("Email and password are required");
        }

        // Validate @cootclub.com email domain
        if (!email.endsWith("@cootclub.com")) {
          return createBadRequestResponse("Email must be from @cootclub.com domain");
        }

        const { data: registerData, error: registerError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: body.full_name || null,
            },
          },
        });

        if (registerError) {
          return createErrorResponse(registerError.message, 400);
        }

        return createSuccessResponse({
          message: "Registration successful. Please check your email for verification.",
          user: registerData.user ? {
            id: registerData.user.id,
            email: registerData.user.email,
            full_name: body.full_name || null,
          } : null,
        }, 201, "Registration successful");

      case "logout":
        const { error: logoutError } = await supabase.auth.signOut();

        if (logoutError) {
          return createErrorResponse(logoutError.message, 500);
        }

        return createSuccessResponse({
          message: "Logout successful"
        }, 200, "Logout successful");

      default:
        return createBadRequestResponse("Invalid action");
    }
  } catch (error) {
    console.error("Auth error:", error);
    return createErrorResponse("Internal server error", 500);
  }
}
