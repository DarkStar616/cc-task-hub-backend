import { jest } from "@jest/globals";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/v1/users/route";
import * as authUtils from "@/utils/auth";

// Mock the auth utilities
jest.mock("@/utils/auth");
const mockAuthUtils = authUtils as jest.Mocked<typeof authUtils>;

describe("/api/v1/users", () => {
  let mockRequest: NextRequest;
  let mockAuthContext: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      url: "http://localhost:3000/api/v1/users",
      json: jest.fn(),
    } as any;

    mockAuthContext = {
      user: {
        id: "user-123",
        email: "admin@example.com",
        role: "Admin",
        department_id: "dept-123",
      },
      supabase: {
        ...global.mockSupabaseClient,
        from: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          range: jest.fn().mockReturnThis(),
          insert: jest.fn().mockReturnThis(),
          single: jest.fn(),
        })),
      },
    };

    mockAuthUtils.getAuthContext.mockResolvedValue(mockAuthContext);
    mockAuthUtils.hasRole.mockReturnValue(true);
    mockAuthUtils.canManageUser.mockReturnValue(true);
    mockAuthUtils.createSuccessResponse.mockImplementation(
      (data, status = 200) => new Response(JSON.stringify(data), { status }),
    );
    mockAuthUtils.createUnauthorizedResponse.mockImplementation(
      () =>
        new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
        }),
    );
    mockAuthUtils.createForbiddenResponse.mockImplementation(
      () =>
        new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    );
    mockAuthUtils.createBadRequestResponse.mockImplementation(
      () =>
        new Response(JSON.stringify({ error: "Bad Request" }), { status: 400 }),
    );
    mockAuthUtils.createErrorResponse.mockImplementation(
      () =>
        new Response(JSON.stringify({ error: "Internal Server Error" }), {
          status: 500,
        }),
    );
  });

  describe("GET /api/v1/users", () => {
    it("should return users for authenticated admin", async () => {
      const mockUsers = [
        {
          id: "user-1",
          email: "user1@example.com",
          full_name: "User One",
          departments: { name: "Engineering" },
          roles: { name: "User" },
        },
        {
          id: "user-2",
          email: "user2@example.com",
          full_name: "User Two",
          departments: { name: "Marketing" },
          roles: { name: "Manager" },
        },
      ];

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
      };
      mockQuery.select.mockResolvedValue({ data: mockUsers, error: null });

      mockAuthContext.supabase.from.mockReturnValue(mockQuery);

      const response = await GET(mockRequest);

      expect(mockAuthUtils.getAuthContext).toHaveBeenCalledWith(mockRequest);
      expect(mockAuthContext.supabase.from).toHaveBeenCalledWith("users");
      expect(mockAuthUtils.createSuccessResponse).toHaveBeenCalledWith({
        users: mockUsers,
      });
    });

    it("should return unauthorized for unauthenticated user", async () => {
      mockAuthUtils.getAuthContext.mockResolvedValue({
        user: null,
        supabase: mockAuthContext.supabase,
      });

      const response = await GET(mockRequest);

      expect(mockAuthUtils.createUnauthorizedResponse).toHaveBeenCalled();
    });

    it("should filter users by department for managers", async () => {
      const managerContext = {
        ...mockAuthContext,
        user: {
          ...mockAuthContext.user,
          role: "Manager",
          department_id: "dept-456",
        },
      };

      mockAuthUtils.getAuthContext.mockResolvedValue(managerContext);
      mockAuthUtils.hasRole.mockImplementation((role, allowedRoles) => {
        if (allowedRoles.includes("God") || allowedRoles.includes("Admin")) {
          return false;
        }
        return allowedRoles.includes("Manager");
      });

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
      };
      mockQuery.eq.mockResolvedValue({ data: [], error: null });

      mockAuthContext.supabase.from.mockReturnValue(mockQuery);

      await GET(mockRequest);

      expect(mockQuery.eq).toHaveBeenCalledWith("department_id", "dept-456");
    });

    it("should handle database errors", async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
      };
      mockQuery.select.mockResolvedValue({
        data: null,
        error: { message: "Database error" },
      });

      mockAuthContext.supabase.from.mockReturnValue(mockQuery);

      const response = await GET(mockRequest);

      expect(mockAuthUtils.createErrorResponse).toHaveBeenCalledWith(
        "Failed to fetch users",
      );
    });
  });

  describe("POST /api/v1/users", () => {
    it("should create user for authorized admin", async () => {
      const newUserData = {
        email: "newuser@example.com",
        full_name: "New User",
        department_id: "dept-123",
        role_id: "role-123",
      };

      const createdUser = {
        id: "user-new",
        ...newUserData,
        token_identifier: expect.any(String),
        created_at: expect.any(String),
      };

      mockRequest.json = jest.fn().mockResolvedValue(newUserData);

      // Mock validation
      jest.doMock("@/utils/validation", () => ({
        validateRequestBody: jest.fn().mockReturnValue({
          success: true,
          data: newUserData,
        }),
      }));

      const mockInsertQuery = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: createdUser, error: null }),
      };

      mockAuthContext.supabase.from.mockReturnValue(mockInsertQuery);

      // Mock role check
      const mockRoleQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest
          .fn()
          .mockResolvedValue({ data: { name: "User" }, error: null }),
      };
      mockAuthContext.supabase.from
        .mockReturnValueOnce(mockRoleQuery)
        .mockReturnValueOnce(mockInsertQuery);

      const response = await POST(mockRequest);

      expect(mockRequest.json).toHaveBeenCalled();
      expect(mockAuthUtils.createSuccessResponse).toHaveBeenCalledWith(
        { user: createdUser },
        201,
      );
    });

    it("should reject unauthorized user creation", async () => {
      mockAuthUtils.hasRole.mockReturnValue(false);

      const response = await POST(mockRequest);

      expect(mockAuthUtils.createForbiddenResponse).toHaveBeenCalledWith(
        "Insufficient permissions to create users",
      );
    });

    it("should prevent managers from creating users in other departments", async () => {
      const managerContext = {
        ...mockAuthContext,
        user: {
          ...mockAuthContext.user,
          role: "Manager",
          department_id: "dept-456",
        },
      };

      mockAuthUtils.getAuthContext.mockResolvedValue(managerContext);
      mockAuthUtils.hasRole.mockReturnValue(true);

      const newUserData = {
        email: "newuser@example.com",
        full_name: "New User",
        department_id: "dept-different", // Different department
      };

      mockRequest.json = jest.fn().mockResolvedValue(newUserData);

      // Mock validation
      jest.doMock("@/utils/validation", () => ({
        validateRequestBody: jest.fn().mockReturnValue({
          success: true,
          data: newUserData,
        }),
      }));

      const response = await POST(mockRequest);

      expect(mockAuthUtils.createForbiddenResponse).toHaveBeenCalledWith(
        "Can only create users in your department",
      );
    });

    it("should prevent assigning higher roles", async () => {
      mockAuthUtils.canManageUser.mockReturnValue(false);

      const newUserData = {
        email: "newuser@example.com",
        full_name: "New User",
        role_id: "god-role-id",
      };

      mockRequest.json = jest.fn().mockResolvedValue(newUserData);

      // Mock validation
      jest.doMock("@/utils/validation", () => ({
        validateRequestBody: jest.fn().mockReturnValue({
          success: true,
          data: newUserData,
        }),
      }));

      // Mock role check
      const mockRoleQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest
          .fn()
          .mockResolvedValue({ data: { name: "God" }, error: null }),
      };
      mockAuthContext.supabase.from.mockReturnValue(mockRoleQuery);

      const response = await POST(mockRequest);

      expect(mockAuthUtils.createForbiddenResponse).toHaveBeenCalledWith(
        "Cannot assign role higher than your own",
      );
    });

    it("should handle validation errors", async () => {
      const invalidUserData = {
        email: "invalid-email",
        full_name: "",
      };

      mockRequest.json = jest.fn().mockResolvedValue(invalidUserData);

      // Mock validation failure
      jest.doMock("@/utils/validation", () => ({
        validateRequestBody: jest.fn().mockReturnValue({
          success: false,
          error: "Invalid email format, Full name is required",
        }),
      }));

      const response = await POST(mockRequest);

      expect(mockAuthUtils.createBadRequestResponse).toHaveBeenCalled();
    });
  });
});
