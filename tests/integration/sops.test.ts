import { jest } from "@jest/globals";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/v1/sops/route";
import * as authUtils from "@/utils/auth";

// Mock the auth utilities
jest.mock("@/utils/auth");
const mockAuthUtils = authUtils as jest.Mocked<typeof authUtils>;

describe("/api/v1/sops", () => {
  let mockRequest: NextRequest;
  let mockAuthContext: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      url: "http://localhost:3000/api/v1/sops",
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
          or: jest.fn().mockReturnThis(),
          overlaps: jest.fn().mockReturnThis(),
          range: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          insert: jest.fn().mockReturnThis(),
          single: jest.fn(),
        })),
      },
    };

    mockAuthUtils.getAuthContext.mockResolvedValue(mockAuthContext);
    mockAuthUtils.hasRole.mockReturnValue(true);
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

  describe("GET /api/v1/sops", () => {
    it("should return SOPs for authenticated admin", async () => {
      const mockSOPs = [
        {
          id: "sop-1",
          title: "Safety Procedure",
          description: "Safety guidelines",
          content: "Detailed safety instructions...",
          status: "active",
          tags: ["safety", "procedure"],
          created_by_user: { full_name: "Admin User" },
          updated_by_user: { full_name: "Admin User" },
          department: { name: "Engineering" },
        },
      ];

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
        overlaps: jest.fn().mockReturnThis(),
      };
      mockQuery.order.mockResolvedValue({ data: mockSOPs, error: null });

      mockAuthContext.supabase.from.mockReturnValue(mockQuery);

      const response = await GET(mockRequest);

      expect(mockAuthUtils.getAuthContext).toHaveBeenCalledWith(mockRequest);
      expect(mockAuthContext.supabase.from).toHaveBeenCalledWith("sops");
      expect(mockAuthUtils.createSuccessResponse).toHaveBeenCalledWith({
        sops: mockSOPs,
      });
    });

    it("should filter SOPs for managers", async () => {
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
        order: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
        overlaps: jest.fn().mockReturnThis(),
      };
      mockQuery.order.mockResolvedValue({ data: [], error: null });

      mockAuthContext.supabase.from.mockReturnValue(mockQuery);

      await GET(mockRequest);

      expect(mockQuery.or).toHaveBeenCalledWith(
        "department_id.eq.dept-456,department_id.is.null",
      );
    });

    it("should filter SOPs for regular users", async () => {
      const userContext = {
        ...mockAuthContext,
        user: {
          ...mockAuthContext.user,
          role: "User",
          department_id: "dept-456",
        },
      };

      mockAuthUtils.getAuthContext.mockResolvedValue(userContext);
      mockAuthUtils.hasRole.mockImplementation((role, allowedRoles) => {
        return (
          !allowedRoles.includes("God") &&
          !allowedRoles.includes("Admin") &&
          !allowedRoles.includes("Manager")
        );
      });

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
        overlaps: jest.fn().mockReturnThis(),
      };
      mockQuery.order.mockResolvedValue({ data: [], error: null });

      mockAuthContext.supabase.from.mockReturnValue(mockQuery);

      await GET(mockRequest);

      expect(mockQuery.eq).toHaveBeenCalledWith("status", "active");
      expect(mockQuery.or).toHaveBeenCalledWith(
        "department_id.eq.dept-456,department_id.is.null",
      );
    });

    it("should apply query filters", async () => {
      mockRequest.url =
        "http://localhost:3000/api/v1/sops?status=active&tags=safety,procedure&department_id=dept-123";

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
        overlaps: jest.fn().mockReturnThis(),
      };
      mockQuery.order.mockResolvedValue({ data: [], error: null });

      mockAuthContext.supabase.from.mockReturnValue(mockQuery);

      await GET(mockRequest);

      expect(mockQuery.eq).toHaveBeenCalledWith("department_id", "dept-123");
      expect(mockQuery.eq).toHaveBeenCalledWith("status", "active");
      expect(mockQuery.overlaps).toHaveBeenCalledWith("tags", [
        "safety",
        "procedure",
      ]);
    });
  });

  describe("POST /api/v1/sops", () => {
    it("should create SOP successfully for admin", async () => {
      const newSOPData = {
        title: "New Safety Procedure",
        description: "Updated safety guidelines",
        content: "Detailed safety instructions...",
        department_id: "dept-123",
        tags: ["safety", "new"],
      };

      const createdSOP = {
        id: "sop-new",
        ...newSOPData,
        created_by: "user-123",
        status: "draft",
        version: 1,
        created_at: expect.any(String),
      };

      mockRequest.json = jest.fn().mockResolvedValue(newSOPData);

      // Mock validation
      jest.doMock("@/utils/validation", () => ({
        validateRequestBody: jest.fn().mockReturnValue({
          success: true,
          data: newSOPData,
        }),
      }));

      const mockInsertQuery = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: createdSOP, error: null }),
      };

      mockAuthContext.supabase.from.mockReturnValue(mockInsertQuery);

      const response = await POST(mockRequest);

      expect(mockRequest.json).toHaveBeenCalled();
      expect(mockAuthUtils.createSuccessResponse).toHaveBeenCalledWith(
        { sop: createdSOP },
        201,
      );
    });

    it("should reject unauthorized SOP creation", async () => {
      mockAuthUtils.hasRole.mockReturnValue(false);

      const response = await POST(mockRequest);

      expect(mockAuthUtils.createForbiddenResponse).toHaveBeenCalledWith(
        "Insufficient permissions to create SOPs",
      );
    });

    it("should prevent managers from creating SOPs in other departments", async () => {
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

      const newSOPData = {
        title: "New Safety Procedure",
        content: "Safety instructions...",
        department_id: "dept-different", // Different department
      };

      mockRequest.json = jest.fn().mockResolvedValue(newSOPData);

      // Mock validation
      jest.doMock("@/utils/validation", () => ({
        validateRequestBody: jest.fn().mockReturnValue({
          success: true,
          data: newSOPData,
        }),
      }));

      const response = await POST(mockRequest);

      expect(mockAuthUtils.createForbiddenResponse).toHaveBeenCalledWith(
        "Can only create SOPs for your department",
      );
    });

    it("should auto-assign department for managers", async () => {
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

      const newSOPData = {
        title: "New Safety Procedure",
        content: "Safety instructions...",
        // No department_id specified
      };

      const expectedSOPData = {
        ...newSOPData,
        department_id: "dept-456", // Should be auto-assigned
      };

      const createdSOP = {
        id: "sop-new",
        ...expectedSOPData,
        created_by: "user-123",
        status: "draft",
        version: 1,
        created_at: expect.any(String),
      };

      mockRequest.json = jest.fn().mockResolvedValue(newSOPData);

      // Mock validation
      jest.doMock("@/utils/validation", () => ({
        validateRequestBody: jest.fn().mockReturnValue({
          success: true,
          data: newSOPData,
        }),
      }));

      const mockInsertQuery = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: createdSOP, error: null }),
      };

      mockAuthContext.supabase.from.mockReturnValue(mockInsertQuery);

      const response = await POST(mockRequest);

      expect(mockInsertQuery.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          department_id: "dept-456",
        }),
      );
    });

    it("should handle validation errors", async () => {
      const invalidSOPData = {
        title: "", // Empty title
        content: "", // Empty content
      };

      mockRequest.json = jest.fn().mockResolvedValue(invalidSOPData);

      // Mock validation failure
      jest.doMock("@/utils/validation", () => ({
        validateRequestBody: jest.fn().mockReturnValue({
          success: false,
          error: "Title is required, Content is required",
        }),
      }));

      const response = await POST(mockRequest);

      expect(mockAuthUtils.createBadRequestResponse).toHaveBeenCalled();
    });

    it("should handle database errors", async () => {
      const newSOPData = {
        title: "New Safety Procedure",
        content: "Safety instructions...",
      };

      mockRequest.json = jest.fn().mockResolvedValue(newSOPData);

      // Mock validation
      jest.doMock("@/utils/validation", () => ({
        validateRequestBody: jest.fn().mockReturnValue({
          success: true,
          data: newSOPData,
        }),
      }));

      const mockInsertQuery = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { message: "Database error" },
        }),
      };

      mockAuthContext.supabase.from.mockReturnValue(mockInsertQuery);

      const response = await POST(mockRequest);

      expect(mockAuthUtils.createErrorResponse).toHaveBeenCalledWith(
        "Failed to create SOP",
      );
    });
  });
});
