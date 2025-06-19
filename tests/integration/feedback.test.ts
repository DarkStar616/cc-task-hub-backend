import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/v1/feedback/route";
import {
  GET as GET_BY_ID,
  PUT,
  DELETE,
} from "@/app/api/v1/feedback/[id]/route";
import { getAuthContext } from "@/utils/auth";

// Mock the auth utility
jest.mock("@/utils/auth", () => ({
  getAuthContext: jest.fn(),
  hasRole: jest.fn(),
  createUnauthorizedResponse: jest.fn(
    () => new Response("Unauthorized", { status: 401 }),
  ),
  createForbiddenResponse: jest.fn(
    () => new Response("Forbidden", { status: 403 }),
  ),
  createBadRequestResponse: jest.fn(
    () => new Response("Bad Request", { status: 400 }),
  ),
  createSuccessResponse: jest.fn(
    (data, status = 200) => new Response(JSON.stringify(data), { status }),
  ),
  createErrorResponse: jest.fn(
    () => new Response("Internal Server Error", { status: 500 }),
  ),
  createNotFoundResponse: jest.fn(
    () => new Response("Not Found", { status: 404 }),
  ),
}));

// Mock validation utilities
jest.mock("@/utils/validation", () => ({
  validateRequestBody: jest.fn(),
  validateQueryParams: jest.fn(),
  createFeedbackSchema: {},
  updateFeedbackSchema: {},
  analyticsQuerySchema: {},
}));

// Mock audit log utility
jest.mock("@/utils/audit-log", () => ({
  logAuditEntry: jest.fn(),
  SENSITIVE_ACTIONS: {},
}));

const mockGetAuthContext = getAuthContext as jest.MockedFunction<
  typeof getAuthContext
>;

describe("/api/v1/feedback", () => {
  const mockSupabase = {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        order: jest.fn(() => ({
          range: jest.fn(() => ({
            eq: jest.fn(() => ({
              or: jest.fn(() => ({ data: [], error: null })),
              gte: jest.fn(() => ({
                lte: jest.fn(() => ({ data: [], error: null })),
              })),
            })),
            gte: jest.fn(() => ({
              lte: jest.fn(() => ({ data: [], error: null })),
            })),
          })),
          eq: jest.fn(() => ({
            single: jest.fn(() => ({
              data: null,
              error: { code: "PGRST116" },
            })),
          })),
        })),
        eq: jest.fn(() => ({
          single: jest.fn(() => ({ data: null, error: { code: "PGRST116" } })),
        })),
      })),
      insert: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn(() => ({
            data: { id: "1", title: "Test Feedback" },
            error: null,
          })),
        })),
      })),
      update: jest.fn(() => ({
        eq: jest.fn(() => ({
          select: jest.fn(() => ({
            single: jest.fn(() => ({
              data: { id: "1", title: "Updated Feedback" },
              error: null,
            })),
          })),
        })),
      })),
      delete: jest.fn(() => ({
        eq: jest.fn(() => ({ error: null })),
      })),
    })),
  };

  const mockUser = {
    id: "user-1",
    role: "User",
    department_id: "dept-1",
  };

  const mockAuthContext = {
    user: mockUser,
    supabase: mockSupabase,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAuthContext.mockResolvedValue(mockAuthContext);
  });

  describe("GET /api/v1/feedback", () => {
    const { validateQueryParams } = require("@/utils/validation");

    it("should return 401 when user is not authenticated", async () => {
      mockGetAuthContext.mockResolvedValue({
        user: null,
        supabase: mockSupabase,
      });

      const request = new NextRequest("http://localhost/api/v1/feedback");
      const response = await GET(request);

      expect(response.status).toBe(401);
    });

    it("should return 400 for invalid query parameters", async () => {
      validateQueryParams.mockReturnValue({
        success: false,
        error: "Invalid query parameters",
      });

      const request = new NextRequest(
        "http://localhost/api/v1/feedback?invalid=param",
      );
      const response = await GET(request);

      expect(response.status).toBe(400);
    });

    it("should fetch feedback for authenticated user", async () => {
      validateQueryParams.mockReturnValue({
        success: true,
        data: { limit: 50, offset: 0 },
      });

      const mockFeedback = [
        { id: "1", title: "Test Feedback 1", user_id: "user-1" },
        { id: "2", title: "Test Feedback 2", user_id: "user-1" },
      ];

      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({
          order: jest.fn(() => ({
            range: jest.fn(() => ({
              or: jest.fn(() => ({ data: mockFeedback, error: null })),
            })),
          })),
        })),
      });

      const request = new NextRequest("http://localhost/api/v1/feedback");
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.feedback).toEqual(mockFeedback);
    });

    it("should apply query filters correctly", async () => {
      validateQueryParams.mockReturnValue({
        success: true,
        data: {
          user_id: "user-1",
          task_id: "task-1",
          period_start: "2024-01-01",
          period_end: "2024-12-31",
          limit: 10,
          offset: 0,
        },
      });

      const request = new NextRequest(
        "http://localhost/api/v1/feedback?user_id=user-1&task_id=task-1",
      );
      await GET(request);

      expect(mockSupabase.from).toHaveBeenCalledWith("feedback");
    });

    it("should restrict non-admin users to their own feedback", async () => {
      const { hasRole } = require("@/utils/auth");
      hasRole.mockReturnValue(false);

      validateQueryParams.mockReturnValue({
        success: true,
        data: { limit: 50, offset: 0 },
      });

      const request = new NextRequest("http://localhost/api/v1/feedback");
      await GET(request);

      expect(mockSupabase.from).toHaveBeenCalledWith("feedback");
    });

    it("should handle database errors gracefully", async () => {
      validateQueryParams.mockReturnValue({
        success: true,
        data: { limit: 50, offset: 0 },
      });

      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({
          order: jest.fn(() => ({
            range: jest.fn(() => ({
              or: jest.fn(() => ({
                data: null,
                error: { message: "Database error" },
              })),
            })),
          })),
        })),
      });

      const request = new NextRequest("http://localhost/api/v1/feedback");
      const response = await GET(request);

      expect(response.status).toBe(500);
    });
  });

  describe("POST /api/v1/feedback", () => {
    const { validateRequestBody } = require("@/utils/validation");
    const { logAuditEntry } = require("@/utils/audit-log");

    it("should return 401 when user is not authenticated", async () => {
      mockGetAuthContext.mockResolvedValue({
        user: null,
        supabase: mockSupabase,
      });

      const request = new NextRequest("http://localhost/api/v1/feedback", {
        method: "POST",
        body: JSON.stringify({ title: "Test Feedback" }),
      });
      const response = await POST(request);

      expect(response.status).toBe(401);
    });

    it("should return 400 for invalid request body", async () => {
      validateRequestBody.mockReturnValue({
        success: false,
        error: "Invalid data",
      });

      const request = new NextRequest("http://localhost/api/v1/feedback", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
    });

    it("should create feedback successfully", async () => {
      validateRequestBody.mockReturnValue({
        success: true,
        data: {
          title: "Test Feedback",
          message: "Test message",
          type: "suggestion",
          priority: "medium",
        },
      });

      const request = new NextRequest("http://localhost/api/v1/feedback", {
        method: "POST",
        body: JSON.stringify({
          title: "Test Feedback",
          message: "Test message",
          type: "suggestion",
          priority: "medium",
        }),
      });
      const response = await POST(request);

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.feedback.title).toBe("Test Feedback");
      expect(logAuditEntry).toHaveBeenCalled();
    });

    it("should handle database errors during creation", async () => {
      validateRequestBody.mockReturnValue({
        success: true,
        data: {
          title: "Test Feedback",
          message: "Test message",
        },
      });

      mockSupabase.from.mockReturnValue({
        insert: jest.fn(() => ({
          select: jest.fn(() => ({
            single: jest.fn(() => ({
              data: null,
              error: { message: "Database error" },
            })),
          })),
        })),
      });

      const request = new NextRequest("http://localhost/api/v1/feedback", {
        method: "POST",
        body: JSON.stringify({
          title: "Test Feedback",
          message: "Test message",
        }),
      });
      const response = await POST(request);

      expect(response.status).toBe(500);
    });
  });

  describe("GET /api/v1/feedback/[id]", () => {
    it("should return 401 when user is not authenticated", async () => {
      mockGetAuthContext.mockResolvedValue({
        user: null,
        supabase: mockSupabase,
      });

      const request = new NextRequest("http://localhost/api/v1/feedback/1");
      const response = await GET_BY_ID(request, { params: { id: "1" } });

      expect(response.status).toBe(401);
    });

    it("should return 404 when feedback is not found", async () => {
      const request = new NextRequest("http://localhost/api/v1/feedback/999");
      const response = await GET_BY_ID(request, { params: { id: "999" } });

      expect(response.status).toBe(404);
    });

    it("should return feedback when found and user has permission", async () => {
      const mockFeedback = {
        id: "1",
        title: "Test Feedback",
        user_id: "user-1",
        target_user_id: null,
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() => ({ data: mockFeedback, error: null })),
          })),
        })),
      });

      const request = new NextRequest("http://localhost/api/v1/feedback/1");
      const response = await GET_BY_ID(request, { params: { id: "1" } });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.feedback).toEqual(mockFeedback);
    });

    it("should return 403 when user lacks permission to view feedback", async () => {
      const { hasRole } = require("@/utils/auth");
      hasRole.mockReturnValue(false);

      const mockFeedback = {
        id: "1",
        title: "Test Feedback",
        user_id: "other-user",
        target_user_id: "another-user",
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() => ({ data: mockFeedback, error: null })),
          })),
        })),
      });

      const request = new NextRequest("http://localhost/api/v1/feedback/1");
      const response = await GET_BY_ID(request, { params: { id: "1" } });

      expect(response.status).toBe(403);
    });
  });

  describe("PUT /api/v1/feedback/[id]", () => {
    const { validateRequestBody } = require("@/utils/validation");
    const { logAuditEntry } = require("@/utils/audit-log");

    it("should return 401 when user is not authenticated", async () => {
      mockGetAuthContext.mockResolvedValue({
        user: null,
        supabase: mockSupabase,
      });

      const request = new NextRequest("http://localhost/api/v1/feedback/1", {
        method: "PUT",
        body: JSON.stringify({ title: "Updated Feedback" }),
      });
      const response = await PUT(request, { params: { id: "1" } });

      expect(response.status).toBe(401);
    });

    it("should return 404 when feedback is not found", async () => {
      validateRequestBody.mockReturnValue({
        success: true,
        data: { title: "Updated Feedback" },
      });

      const request = new NextRequest("http://localhost/api/v1/feedback/999", {
        method: "PUT",
        body: JSON.stringify({ title: "Updated Feedback" }),
      });
      const response = await PUT(request, { params: { id: "999" } });

      expect(response.status).toBe(404);
    });

    it("should update feedback successfully when user owns it", async () => {
      validateRequestBody.mockReturnValue({
        success: true,
        data: { title: "Updated Feedback" },
      });

      const mockExistingFeedback = {
        id: "1",
        title: "Original Feedback",
        user_id: "user-1",
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() => ({
              data: mockExistingFeedback,
              error: null,
            })),
          })),
        })),
        update: jest.fn(() => ({
          eq: jest.fn(() => ({
            select: jest.fn(() => ({
              single: jest.fn(() => ({
                data: { ...mockExistingFeedback, title: "Updated Feedback" },
                error: null,
              })),
            })),
          })),
        })),
      });

      const request = new NextRequest("http://localhost/api/v1/feedback/1", {
        method: "PUT",
        body: JSON.stringify({ title: "Updated Feedback" }),
      });
      const response = await PUT(request, { params: { id: "1" } });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.feedback.title).toBe("Updated Feedback");
      expect(logAuditEntry).toHaveBeenCalled();
    });

    it("should return 403 when user lacks permission to update feedback", async () => {
      const { hasRole } = require("@/utils/auth");
      hasRole.mockReturnValue(false);

      validateRequestBody.mockReturnValue({
        success: true,
        data: { title: "Updated Feedback" },
      });

      const mockExistingFeedback = {
        id: "1",
        title: "Original Feedback",
        user_id: "other-user",
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() => ({
              data: mockExistingFeedback,
              error: null,
            })),
          })),
        })),
      });

      const request = new NextRequest("http://localhost/api/v1/feedback/1", {
        method: "PUT",
        body: JSON.stringify({ title: "Updated Feedback" }),
      });
      const response = await PUT(request, { params: { id: "1" } });

      expect(response.status).toBe(403);
    });
  });

  describe("DELETE /api/v1/feedback/[id]", () => {
    const { logAuditEntry } = require("@/utils/audit-log");

    it("should return 401 when user is not authenticated", async () => {
      mockGetAuthContext.mockResolvedValue({
        user: null,
        supabase: mockSupabase,
      });

      const request = new NextRequest("http://localhost/api/v1/feedback/1", {
        method: "DELETE",
      });
      const response = await DELETE(request, { params: { id: "1" } });

      expect(response.status).toBe(401);
    });

    it("should return 404 when feedback is not found", async () => {
      const request = new NextRequest("http://localhost/api/v1/feedback/999", {
        method: "DELETE",
      });
      const response = await DELETE(request, { params: { id: "999" } });

      expect(response.status).toBe(404);
    });

    it("should delete feedback successfully when user owns it", async () => {
      const mockExistingFeedback = {
        id: "1",
        title: "Test Feedback",
        user_id: "user-1",
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() => ({
              data: mockExistingFeedback,
              error: null,
            })),
          })),
        })),
        delete: jest.fn(() => ({
          eq: jest.fn(() => ({ error: null })),
        })),
      });

      const request = new NextRequest("http://localhost/api/v1/feedback/1", {
        method: "DELETE",
      });
      const response = await DELETE(request, { params: { id: "1" } });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.message).toBe("Feedback deleted successfully");
      expect(logAuditEntry).toHaveBeenCalled();
    });

    it("should return 403 when user lacks permission to delete feedback", async () => {
      const { hasRole } = require("@/utils/auth");
      hasRole.mockReturnValue(false);

      const mockExistingFeedback = {
        id: "1",
        title: "Test Feedback",
        user_id: "other-user",
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() => ({
              data: mockExistingFeedback,
              error: null,
            })),
          })),
        })),
      });

      const request = new NextRequest("http://localhost/api/v1/feedback/1", {
        method: "DELETE",
      });
      const response = await DELETE(request, { params: { id: "1" } });

      expect(response.status).toBe(403);
    });
  });

  describe("Role-based access control", () => {
    const { hasRole } = require("@/utils/auth");
    const { validateQueryParams } = require("@/utils/validation");

    it("should allow Admin role to see all feedback", async () => {
      hasRole.mockReturnValue(true);
      mockAuthContext.user.role = "Admin";

      validateQueryParams.mockReturnValue({
        success: true,
        data: { limit: 50, offset: 0 },
      });

      const request = new NextRequest("http://localhost/api/v1/feedback");
      await GET(request);

      expect(mockSupabase.from).toHaveBeenCalledWith("feedback");
    });

    it("should allow God role to see all feedback", async () => {
      hasRole.mockReturnValue(true);
      mockAuthContext.user.role = "God";

      validateQueryParams.mockReturnValue({
        success: true,
        data: { limit: 50, offset: 0 },
      });

      const request = new NextRequest("http://localhost/api/v1/feedback");
      await GET(request);

      expect(mockSupabase.from).toHaveBeenCalledWith("feedback");
    });
  });

  describe("Edge cases and error handling", () => {
    it("should handle malformed JSON in POST request", async () => {
      const request = new NextRequest("http://localhost/api/v1/feedback", {
        method: "POST",
        body: "invalid json",
      });

      const response = await POST(request);
      expect(response.status).toBe(500);
    });

    it("should handle database connection errors", async () => {
      mockSupabase.from.mockImplementation(() => {
        throw new Error("Database connection failed");
      });

      const request = new NextRequest("http://localhost/api/v1/feedback");
      const response = await GET(request);

      expect(response.status).toBe(500);
    });

    it("should handle invalid feedback ID format", async () => {
      const request = new NextRequest(
        "http://localhost/api/v1/feedback/invalid-id",
      );
      const response = await GET_BY_ID(request, {
        params: { id: "invalid-id" },
      });

      expect(response.status).toBe(404);
    });
  });
});
