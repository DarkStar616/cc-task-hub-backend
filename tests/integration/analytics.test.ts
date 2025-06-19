import { NextRequest } from "next/server";
import { GET } from "@/app/api/v1/analytics/route";
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
}));

// Mock validation utilities
jest.mock("@/utils/validation", () => ({
  validateQueryParams: jest.fn(),
  analyticsQuerySchema: {},
}));

const mockGetAuthContext = getAuthContext as jest.MockedFunction<
  typeof getAuthContext
>;

describe("/api/v1/analytics", () => {
  const mockSupabase = {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        gte: jest.fn(() => ({
          lte: jest.fn(() => ({
            eq: jest.fn(() => ({ data: [], error: null })),
          })),
        })),
        eq: jest.fn(() => ({ data: [], error: null })),
      })),
    })),
  };

  const mockAdminUser = {
    id: "admin-1",
    role: "Admin",
    department_id: "dept-1",
  };

  const mockGodUser = {
    id: "god-1",
    role: "God",
    department_id: null,
  };

  const mockRegularUser = {
    id: "user-1",
    role: "User",
    department_id: "dept-1",
  };

  const mockAuthContext = {
    user: mockAdminUser,
    supabase: mockSupabase,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAuthContext.mockResolvedValue(mockAuthContext);
  });

  describe("GET /api/v1/analytics", () => {
    const { validateQueryParams } = require("@/utils/validation");
    const { hasRole } = require("@/utils/auth");

    it("should return 401 when user is not authenticated", async () => {
      mockGetAuthContext.mockResolvedValue({
        user: null,
        supabase: mockSupabase,
      });

      const request = new NextRequest("http://localhost/api/v1/analytics");
      const response = await GET(request);

      expect(response.status).toBe(401);
    });

    it("should return 403 when user is not Admin or God", async () => {
      hasRole.mockReturnValue(false);
      mockGetAuthContext.mockResolvedValue({
        user: mockRegularUser,
        supabase: mockSupabase,
      });

      const request = new NextRequest("http://localhost/api/v1/analytics");
      const response = await GET(request);

      expect(response.status).toBe(403);
    });

    it("should return 400 for invalid query parameters", async () => {
      hasRole.mockReturnValue(true);
      validateQueryParams.mockReturnValue({
        success: false,
        error: "Invalid query parameters",
      });

      const request = new NextRequest(
        "http://localhost/api/v1/analytics?invalid=param",
      );
      const response = await GET(request);

      expect(response.status).toBe(400);
    });

    it("should return dashboard overview when no metric_type is specified", async () => {
      hasRole.mockReturnValue(true);
      validateQueryParams.mockReturnValue({
        success: true,
        data: { limit: 100, offset: 0 },
      });

      // Mock data for dashboard analytics
      const mockTasks = [
        { id: "1", status: "completed", created_at: "2024-01-01" },
        { id: "2", status: "pending", created_at: "2024-01-02" },
        { id: "3", status: "in_progress", created_at: "2024-01-03" },
      ];
      const mockUsers = [
        { id: "1", status: "active" },
        { id: "2", status: "active" },
      ];
      const mockClockSessions = [
        {
          id: "1",
          clock_in_time: "2024-01-01T09:00:00Z",
          clock_out_time: "2024-01-01T17:00:00Z",
        },
      ];

      mockSupabase.from.mockImplementation((table) => {
        const mockQuery = {
          select: jest.fn(() => ({
            gte: jest.fn(() => ({
              lte: jest.fn(() => ({
                eq: jest.fn(() => {
                  if (table === "tasks")
                    return { data: mockTasks, error: null };
                  if (table === "users")
                    return { data: mockUsers, error: null };
                  if (table === "clock_sessions")
                    return { data: mockClockSessions, error: null };
                  return { data: [], error: null };
                }),
              })),
            })),
          })),
        };
        return mockQuery;
      });

      const request = new NextRequest("http://localhost/api/v1/analytics");
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.analytics.overview).toBeDefined();
      expect(data.analytics.overview.total_tasks).toBe(3);
      expect(data.analytics.overview.completed_tasks).toBe(1);
      expect(data.analytics.overview.pending_tasks).toBe(1);
      expect(data.analytics.overview.in_progress_tasks).toBe(1);
    });

    it("should return task completion analytics", async () => {
      hasRole.mockReturnValue(true);
      validateQueryParams.mockReturnValue({
        success: true,
        data: {
          metric_type: "task_completion",
          limit: 100,
          offset: 0,
        },
      });

      const mockCompletedTasks = [
        { id: "1", status: "completed", completed_at: "2024-01-01" },
        { id: "2", status: "completed", completed_at: "2024-01-02" },
      ];

      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({ data: mockCompletedTasks, error: null })),
        })),
      });

      const request = new NextRequest(
        "http://localhost/api/v1/analytics?metric_type=task_completion",
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.analytics.total_completed).toBe(2);
      expect(data.analytics.tasks).toEqual(mockCompletedTasks);
    });

    it("should return user productivity analytics", async () => {
      hasRole.mockReturnValue(true);
      validateQueryParams.mockReturnValue({
        success: true,
        data: {
          metric_type: "user_productivity",
          limit: 100,
          offset: 0,
        },
      });

      const mockTasks = [
        {
          id: "1",
          assigned_to: "user-1",
          status: "completed",
          users: {
            id: "user-1",
            full_name: "John Doe",
            email: "john@example.com",
          },
        },
        {
          id: "2",
          assigned_to: "user-1",
          status: "pending",
          users: {
            id: "user-1",
            full_name: "John Doe",
            email: "john@example.com",
          },
        },
      ];

      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({ data: mockTasks, error: null })),
      });

      const request = new NextRequest(
        "http://localhost/api/v1/analytics?metric_type=user_productivity",
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.analytics.user_productivity).toBeDefined();
      expect(Array.isArray(data.analytics.user_productivity)).toBe(true);
    });

    it("should return department performance analytics", async () => {
      hasRole.mockReturnValue(true);
      validateQueryParams.mockReturnValue({
        success: true,
        data: {
          metric_type: "department_performance",
          limit: 100,
          offset: 0,
        },
      });

      const mockTasks = [
        {
          id: "1",
          department_id: "dept-1",
          status: "completed",
          departments: { id: "dept-1", name: "Engineering" },
        },
        {
          id: "2",
          department_id: "dept-1",
          status: "pending",
          departments: { id: "dept-1", name: "Engineering" },
        },
      ];

      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({ data: mockTasks, error: null })),
      });

      const request = new NextRequest(
        "http://localhost/api/v1/analytics?metric_type=department_performance",
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.analytics.department_performance).toBeDefined();
      expect(Array.isArray(data.analytics.department_performance)).toBe(true);
    });

    it("should return clock session analytics", async () => {
      hasRole.mockReturnValue(true);
      validateQueryParams.mockReturnValue({
        success: true,
        data: {
          metric_type: "clock_sessions",
          limit: 100,
          offset: 0,
        },
      });

      const mockSessions = [
        {
          id: "1",
          user_id: "user-1",
          clock_in_time: "2024-01-01T09:00:00Z",
          clock_out_time: "2024-01-01T17:00:00Z",
          users: {
            id: "user-1",
            full_name: "John Doe",
            email: "john@example.com",
          },
        },
      ];

      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({ data: mockSessions, error: null })),
      });

      const request = new NextRequest(
        "http://localhost/api/v1/analytics?metric_type=clock_sessions",
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.analytics.total_sessions).toBe(1);
      expect(data.analytics.total_hours).toBeGreaterThan(0);
      expect(data.analytics.sessions).toEqual(mockSessions);
    });

    it("should return feedback trends analytics", async () => {
      hasRole.mockReturnValue(true);
      validateQueryParams.mockReturnValue({
        success: true,
        data: {
          metric_type: "feedback_trends",
          limit: 100,
          offset: 0,
        },
      });

      const mockFeedback = [
        {
          id: "1",
          type: "suggestion",
          priority: "high",
          status: "open",
          rating: 4,
          created_at: "2024-01-01",
        },
        {
          id: "2",
          type: "complaint",
          priority: "medium",
          status: "resolved",
          rating: 3,
          created_at: "2024-01-02",
        },
      ];

      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({ data: mockFeedback, error: null })),
      });

      const request = new NextRequest(
        "http://localhost/api/v1/analytics?metric_type=feedback_trends",
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.analytics.total_feedback).toBe(2);
      expect(data.analytics.by_type).toBeDefined();
      expect(data.analytics.by_priority).toBeDefined();
      expect(data.analytics.by_status).toBeDefined();
      expect(data.analytics.average_rating).toBe(3.5);
    });

    it("should return 400 for invalid metric type", async () => {
      hasRole.mockReturnValue(true);
      validateQueryParams.mockReturnValue({
        success: true,
        data: {
          metric_type: "invalid_metric",
          limit: 100,
          offset: 0,
        },
      });

      const request = new NextRequest(
        "http://localhost/api/v1/analytics?metric_type=invalid_metric",
      );
      const response = await GET(request);

      expect(response.status).toBe(400);
    });

    it("should apply department filter correctly", async () => {
      hasRole.mockReturnValue(true);
      validateQueryParams.mockReturnValue({
        success: true,
        data: {
          metric_type: "task_completion",
          department_id: "dept-1",
          limit: 100,
          offset: 0,
        },
      });

      const request = new NextRequest(
        "http://localhost/api/v1/analytics?metric_type=task_completion&department_id=dept-1",
      );
      await GET(request);

      expect(mockSupabase.from).toHaveBeenCalledWith("tasks");
    });

    it("should apply user filter correctly", async () => {
      hasRole.mockReturnValue(true);
      validateQueryParams.mockReturnValue({
        success: true,
        data: {
          metric_type: "user_productivity",
          user_id: "user-1",
          limit: 100,
          offset: 0,
        },
      });

      const request = new NextRequest(
        "http://localhost/api/v1/analytics?metric_type=user_productivity&user_id=user-1",
      );
      await GET(request);

      expect(mockSupabase.from).toHaveBeenCalledWith("tasks");
    });

    it("should apply date range filters correctly", async () => {
      hasRole.mockReturnValue(true);
      validateQueryParams.mockReturnValue({
        success: true,
        data: {
          metric_type: "task_completion",
          period_start: "2024-01-01",
          period_end: "2024-12-31",
          limit: 100,
          offset: 0,
        },
      });

      const request = new NextRequest(
        "http://localhost/api/v1/analytics?metric_type=task_completion&period_start=2024-01-01&period_end=2024-12-31",
      );
      await GET(request);

      expect(mockSupabase.from).toHaveBeenCalledWith("tasks");
    });

    it("should handle database errors gracefully", async () => {
      hasRole.mockReturnValue(true);
      validateQueryParams.mockReturnValue({
        success: true,
        data: {
          metric_type: "task_completion",
          limit: 100,
          offset: 0,
        },
      });

      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            data: null,
            error: { message: "Database error" },
          })),
        })),
      });

      const request = new NextRequest(
        "http://localhost/api/v1/analytics?metric_type=task_completion",
      );
      const response = await GET(request);

      expect(response.status).toBe(500);
    });
  });

  describe("Role-based access control", () => {
    const { hasRole } = require("@/utils/auth");
    const { validateQueryParams } = require("@/utils/validation");

    it("should allow Admin role to access analytics", async () => {
      hasRole.mockReturnValue(true);
      validateQueryParams.mockReturnValue({
        success: true,
        data: { limit: 100, offset: 0 },
      });

      const request = new NextRequest("http://localhost/api/v1/analytics");
      const response = await GET(request);

      expect(response.status).toBe(200);
    });

    it("should allow God role to access analytics", async () => {
      hasRole.mockReturnValue(true);
      mockGetAuthContext.mockResolvedValue({
        user: mockGodUser,
        supabase: mockSupabase,
      });

      validateQueryParams.mockReturnValue({
        success: true,
        data: { limit: 100, offset: 0 },
      });

      const request = new NextRequest("http://localhost/api/v1/analytics");
      const response = await GET(request);

      expect(response.status).toBe(200);
    });

    it("should deny access to Manager role", async () => {
      hasRole.mockReturnValue(false);
      const mockManagerUser = {
        id: "manager-1",
        role: "Manager",
        department_id: "dept-1",
      };
      mockGetAuthContext.mockResolvedValue({
        user: mockManagerUser,
        supabase: mockSupabase,
      });

      const request = new NextRequest("http://localhost/api/v1/analytics");
      const response = await GET(request);

      expect(response.status).toBe(403);
    });

    it("should deny access to User role", async () => {
      hasRole.mockReturnValue(false);
      mockGetAuthContext.mockResolvedValue({
        user: mockRegularUser,
        supabase: mockSupabase,
      });

      const request = new NextRequest("http://localhost/api/v1/analytics");
      const response = await GET(request);

      expect(response.status).toBe(403);
    });
  });

  describe("Analytics helper functions", () => {
    const { hasRole } = require("@/utils/auth");
    const { validateQueryParams } = require("@/utils/validation");

    beforeEach(() => {
      hasRole.mockReturnValue(true);
    });

    it("should calculate dashboard analytics correctly with empty data", async () => {
      validateQueryParams.mockReturnValue({
        success: true,
        data: { limit: 100, offset: 0 },
      });

      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({
          gte: jest.fn(() => ({
            lte: jest.fn(() => ({
              eq: jest.fn(() => ({ data: [], error: null })),
            })),
          })),
        })),
      });

      const request = new NextRequest("http://localhost/api/v1/analytics");
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.analytics.overview.total_tasks).toBe(0);
      expect(data.analytics.overview.total_users).toBe(0);
      expect(data.analytics.overview.total_hours_worked).toBe(0);
    });

    it("should handle feedback trends with no ratings", async () => {
      validateQueryParams.mockReturnValue({
        success: true,
        data: {
          metric_type: "feedback_trends",
          limit: 100,
          offset: 0,
        },
      });

      const mockFeedback = [
        {
          id: "1",
          type: "suggestion",
          priority: "high",
          status: "open",
          rating: null,
        },
      ];

      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({ data: mockFeedback, error: null })),
      });

      const request = new NextRequest(
        "http://localhost/api/v1/analytics?metric_type=feedback_trends",
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.analytics.average_rating).toBe(0);
    });
  });

  describe("Edge cases and error handling", () => {
    const { hasRole } = require("@/utils/auth");
    const { validateQueryParams } = require("@/utils/validation");

    beforeEach(() => {
      hasRole.mockReturnValue(true);
    });

    it("should handle database connection errors", async () => {
      validateQueryParams.mockReturnValue({
        success: true,
        data: { limit: 100, offset: 0 },
      });

      mockSupabase.from.mockImplementation(() => {
        throw new Error("Database connection failed");
      });

      const request = new NextRequest("http://localhost/api/v1/analytics");
      const response = await GET(request);

      expect(response.status).toBe(500);
    });

    it("should handle malformed query parameters", async () => {
      validateQueryParams.mockReturnValue({
        success: false,
        error: "Invalid query parameters",
      });

      const request = new NextRequest(
        "http://localhost/api/v1/analytics?limit=invalid",
      );
      const response = await GET(request);

      expect(response.status).toBe(400);
    });

    it("should handle null/undefined data from database", async () => {
      validateQueryParams.mockReturnValue({
        success: true,
        data: {
          metric_type: "task_completion",
          limit: 100,
          offset: 0,
        },
      });

      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({ data: null, error: null })),
        })),
      });

      const request = new NextRequest(
        "http://localhost/api/v1/analytics?metric_type=task_completion",
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.analytics.total_completed).toBe(0);
    });
  });
});
