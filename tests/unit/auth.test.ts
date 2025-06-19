import { jest } from "@jest/globals";
import {
  hasRole,
  canManageUser,
  getAuthContext,
  createUnauthorizedResponse,
  createForbiddenResponse,
  createBadRequestResponse,
  createNotFoundResponse,
  createSuccessResponse,
  createErrorResponse,
} from "@/utils/auth";
import { createClient } from "../../../supabase/server";

// Mock the createClient function
jest.mock("../../../supabase/server", () => ({
  createClient: jest.fn(),
}));

const mockCreateClient = createClient as jest.MockedFunction<
  typeof createClient
>;

describe("Auth Utilities", () => {
  describe("hasRole", () => {
    it("should return true when user has required role", () => {
      expect(hasRole("Admin", ["Admin", "Manager"])).toBe(true);
      expect(hasRole("God", ["Admin"])).toBe(true);
      expect(hasRole("Manager", ["Manager", "User"])).toBe(true);
    });

    it("should return false when user does not have required role", () => {
      expect(hasRole("User", ["Admin", "Manager"])).toBe(false);
      expect(hasRole("Guest", ["User"])).toBe(false);
    });

    it("should handle role hierarchy correctly", () => {
      expect(hasRole("God", ["Admin", "Manager", "User", "Guest"])).toBe(true);
      expect(hasRole("Admin", ["Manager", "User", "Guest"])).toBe(true);
      expect(hasRole("Manager", ["User", "Guest"])).toBe(true);
      expect(hasRole("User", ["Guest"])).toBe(true);
    });

    it("should return false for invalid roles", () => {
      expect(hasRole("InvalidRole" as any, ["Admin"])).toBe(false);
    });
  });

  describe("canManageUser", () => {
    it("should allow higher roles to manage lower roles", () => {
      expect(canManageUser("God", "Admin")).toBe(true);
      expect(canManageUser("Admin", "Manager")).toBe(true);
      expect(canManageUser("Manager", "User")).toBe(true);
      expect(canManageUser("User", "Guest")).toBe(true);
    });

    it("should not allow lower roles to manage higher roles", () => {
      expect(canManageUser("Admin", "God")).toBe(false);
      expect(canManageUser("Manager", "Admin")).toBe(false);
      expect(canManageUser("User", "Manager")).toBe(false);
      expect(canManageUser("Guest", "User")).toBe(false);
    });

    it("should not allow same roles to manage each other", () => {
      expect(canManageUser("Admin", "Admin")).toBe(false);
      expect(canManageUser("Manager", "Manager")).toBe(false);
      expect(canManageUser("User", "User")).toBe(false);
    });
  });

  describe("getAuthContext", () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it("should return null user when no session exists", async () => {
      const mockSupabase = {
        ...global.mockSupabaseClient,
        auth: {
          getSession: jest.fn().mockResolvedValue({
            data: { session: null },
            error: null,
          }),
        },
      };

      mockCreateClient.mockResolvedValue(mockSupabase as any);

      const result = await getAuthContext();

      expect(result.user).toBeNull();
      expect(result.supabase).toBeDefined();
    });

    it("should return user context when valid session exists", async () => {
      const mockSession = {
        user: { id: "user-123", email: "test@example.com" },
      };

      const mockUserData = {
        id: "user-123",
        email: "test@example.com",
        department_id: "dept-123",
        roles: { name: "Admin" },
      };

      const mockSupabase = {
        ...global.mockSupabaseClient,
        auth: {
          getSession: jest.fn().mockResolvedValue({
            data: { session: mockSession },
            error: null,
          }),
        },
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: mockUserData,
          error: null,
        }),
      });

      mockCreateClient.mockResolvedValue(mockSupabase as any);

      const result = await getAuthContext();

      expect(result.user).toEqual({
        id: "user-123",
        email: "test@example.com",
        role: "Admin",
        department_id: "dept-123",
      });
    });

    it("should handle database errors gracefully", async () => {
      const mockSession = {
        user: { id: "user-123", email: "test@example.com" },
      };

      const mockSupabase = {
        ...global.mockSupabaseClient,
        auth: {
          getSession: jest.fn().mockResolvedValue({
            data: { session: mockSession },
            error: null,
          }),
        },
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { message: "User not found" },
        }),
      });

      mockCreateClient.mockResolvedValue(mockSupabase as any);

      const result = await getAuthContext();

      expect(result.user).toBeNull();
    });
  });

  describe("Response Helpers", () => {
    it("should create unauthorized response", () => {
      const response = createUnauthorizedResponse("Custom message");
      expect(response.status).toBe(401);
    });

    it("should create forbidden response", () => {
      const response = createForbiddenResponse("Custom message");
      expect(response.status).toBe(403);
    });

    it("should create bad request response", () => {
      const response = createBadRequestResponse("Custom message");
      expect(response.status).toBe(400);
    });

    it("should create not found response", () => {
      const response = createNotFoundResponse("Custom message");
      expect(response.status).toBe(404);
    });

    it("should create success response", () => {
      const data = { message: "Success" };
      const response = createSuccessResponse(data, 201);
      expect(response.status).toBe(201);
    });

    it("should create error response", () => {
      const response = createErrorResponse("Server error", 500);
      expect(response.status).toBe(500);
    });
  });
});
