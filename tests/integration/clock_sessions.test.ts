import { jest } from "@jest/globals";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/v1/clock_sessions/route";
import * as authUtils from "@/utils/auth";

// Mock the auth utilities
jest.mock("@/utils/auth");
const mockAuthUtils = authUtils as jest.Mocked<typeof authUtils>;

describe("/api/v1/clock_sessions", () => {
  let mockRequest: NextRequest;
  let mockAuthContext: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      url: "http://localhost:3000/api/v1/clock_sessions",
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
          in: jest.fn().mockReturnThis(),
          is: jest.fn().mockReturnThis(),
          gte: jest.fn().mockReturnThis(),
          lte: jest.fn().mockReturnThis(),
          range: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          insert: jest.fn().mockReturnThis(),
          update: jest.fn().mockReturnThis(),
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

  describe("GET /api/v1/clock_sessions", () => {
    it("should return clock sessions for authenticated admin", async () => {
      const mockSessions = [
        {
          id: "session-1",
          user_id: "user-1",
          task_id: "task-1",
          clock_in: "2024-01-01T09:00:00Z",
          clock_out: "2024-01-01T17:00:00Z",
          total_duration: "8 hours",
          status: "completed",
          location: "Office",
          notes: "Regular work day",
          user: { full_name: "John Doe" },
          task: { title: "Complete project" },
        },
      ];

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
      };
      mockQuery.order.mockResolvedValue({ data: mockSessions, error: null });

      mockAuthContext.supabase.from.mockReturnValue(mockQuery);

      const response = await GET(mockRequest);

      expect(mockAuthUtils.getAuthContext).toHaveBeenCalledWith(mockRequest);
      expect(mockAuthContext.supabase.from).toHaveBeenCalledWith(
        "clock_sessions",
      );
      expect(mockAuthUtils.createSuccessResponse).toHaveBeenCalledWith({
        clock_sessions: mockSessions,
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

    it("should filter sessions for managers by department", async () => {
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

      // Mock department users query
      const mockDeptUsersQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          data: [{ id: "user-1" }, { id: "user-2" }],
          error: null,
        }),
      };

      const mockSessionsQuery = {
        select: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
      };
      mockSessionsQuery.order.mockResolvedValue({ data: [], error: null });

      mockAuthContext.supabase.from
        .mockReturnValueOnce(mockDeptUsersQuery)
        .mockReturnValueOnce(mockSessionsQuery);

      await GET(mockRequest);

      expect(mockDeptUsersQuery.eq).toHaveBeenCalledWith(
        "department_id",
        "dept-456",
      );
      expect(mockSessionsQuery.in).toHaveBeenCalledWith("user_id", [
        "user-1",
        "user-2",
      ]);
    });

    it("should filter sessions for regular users to own sessions only", async () => {
      const userContext = {
        ...mockAuthContext,
        user: {
          ...mockAuthContext.user,
          role: "User",
          id: "user-456",
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
        in: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
      };
      mockQuery.order.mockResolvedValue({ data: [], error: null });

      mockAuthContext.supabase.from.mockReturnValue(mockQuery);

      await GET(mockRequest);

      expect(mockQuery.eq).toHaveBeenCalledWith("user_id", "user-456");
    });

    it("should apply query filters", async () => {
      mockRequest.url =
        "http://localhost:3000/api/v1/clock_sessions?user_id=user-123&status=active&start_date=2024-01-01&end_date=2024-01-31";

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
      };
      mockQuery.order.mockResolvedValue({ data: [], error: null });

      mockAuthContext.supabase.from.mockReturnValue(mockQuery);

      await GET(mockRequest);

      expect(mockQuery.eq).toHaveBeenCalledWith("user_id", "user-123");
      expect(mockQuery.eq).toHaveBeenCalledWith("status", "active");
      expect(mockQuery.gte).toHaveBeenCalledWith("clock_in", "2024-01-01");
      expect(mockQuery.lte).toHaveBeenCalledWith("clock_in", "2024-01-31");
    });

    it("should handle pagination parameters", async () => {
      mockRequest.url =
        "http://localhost:3000/api/v1/clock_sessions?limit=50&offset=100";

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
      };
      mockQuery.order.mockResolvedValue({ data: [], error: null });

      mockAuthContext.supabase.from.mockReturnValue(mockQuery);

      await GET(mockRequest);

      expect(mockQuery.range).toHaveBeenCalledWith(100, 149);
    });

    it("should handle database errors", async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
      };
      mockQuery.order.mockResolvedValue({
        data: null,
        error: { message: "Database error" },
      });

      mockAuthContext.supabase.from.mockReturnValue(mockQuery);

      const response = await GET(mockRequest);

      expect(mockAuthUtils.createErrorResponse).toHaveBeenCalledWith(
        "Failed to fetch clock sessions",
      );
    });
  });

  describe("POST /api/v1/clock_sessions (Clock In)", () => {
    it("should clock in successfully", async () => {
      const clockInData = {
        task_id: "task-123",
        location: "Office",
        notes: "Starting work",
      };

      const createdSession = {
        id: "session-new",
        user_id: "user-123",
        task_id: "task-123",
        location: "Office",
        notes: "Starting work",
        clock_in: expect.any(String),
        status: "active",
        created_at: expect.any(String),
      };

      mockRequest.json = jest.fn().mockResolvedValue(clockInData);

      // Mock validation
      jest.doMock("@/utils/validation", () => ({
        validateRequestBody: jest.fn().mockReturnValue({
          success: true,
          data: clockInData,
        }),
      }));

      // Mock active session check (no active session)
      const mockActiveSessionQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: null }),
      };

      // Mock task validation
      const mockTaskQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { assigned_to: "user-123", department_id: "dept-123" },
          error: null,
        }),
      };

      // Mock insert
      const mockInsertQuery = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest
          .fn()
          .mockResolvedValue({ data: createdSession, error: null }),
      };

      mockAuthContext.supabase.from
        .mockReturnValueOnce(mockActiveSessionQuery)
        .mockReturnValueOnce(mockTaskQuery)
        .mockReturnValueOnce(mockInsertQuery);

      const response = await POST(mockRequest);

      expect(mockRequest.json).toHaveBeenCalled();
      expect(mockAuthUtils.createSuccessResponse).toHaveBeenCalledWith(
        { clock_session: createdSession },
        201,
      );
    });

    it("should clock in without task successfully", async () => {
      const clockInData = {
        location: "Office",
        notes: "General work",
      };

      const createdSession = {
        id: "session-new",
        user_id: "user-123",
        task_id: null,
        location: "Office",
        notes: "General work",
        clock_in: expect.any(String),
        status: "active",
        created_at: expect.any(String),
      };

      mockRequest.json = jest.fn().mockResolvedValue(clockInData);

      // Mock validation
      jest.doMock("@/utils/validation", () => ({
        validateRequestBody: jest.fn().mockReturnValue({
          success: true,
          data: clockInData,
        }),
      }));

      // Mock active session check (no active session)
      const mockActiveSessionQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: null }),
      };

      // Mock insert
      const mockInsertQuery = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest
          .fn()
          .mockResolvedValue({ data: createdSession, error: null }),
      };

      mockAuthContext.supabase.from
        .mockReturnValueOnce(mockActiveSessionQuery)
        .mockReturnValueOnce(mockInsertQuery);

      const response = await POST(mockRequest);

      expect(mockRequest.json).toHaveBeenCalled();
      expect(mockAuthUtils.createSuccessResponse).toHaveBeenCalledWith(
        { clock_session: createdSession },
        201,
      );
    });

    it("should prevent clocking in when already active", async () => {
      const clockInData = {
        location: "Office",
      };

      mockRequest.json = jest.fn().mockResolvedValue(clockInData);

      // Mock validation
      jest.doMock("@/utils/validation", () => ({
        validateRequestBody: jest.fn().mockReturnValue({
          success: true,
          data: clockInData,
        }),
      }));

      // Mock active session check (has active session)
      const mockActiveSessionQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: "active-session" },
          error: null,
        }),
      };

      mockAuthContext.supabase.from.mockReturnValue(mockActiveSessionQuery);

      const response = await POST(mockRequest);

      expect(mockAuthUtils.createBadRequestResponse).toHaveBeenCalledWith(
        "User already has an active clock session",
      );
    });

    it("should validate task assignment permissions", async () => {
      const clockInData = {
        task_id: "task-123",
      };

      mockRequest.json = jest.fn().mockResolvedValue(clockInData);

      // Mock validation
      jest.doMock("@/utils/validation", () => ({
        validateRequestBody: jest.fn().mockReturnValue({
          success: true,
          data: clockInData,
        }),
      }));

      // Mock active session check (no active session)
      const mockActiveSessionQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: null }),
      };

      // Mock task validation (task not assigned to user)
      const mockTaskQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { assigned_to: "other-user", department_id: "dept-123" },
          error: null,
        }),
      };

      mockAuthContext.supabase.from
        .mockReturnValueOnce(mockActiveSessionQuery)
        .mockReturnValueOnce(mockTaskQuery);

      const response = await POST(mockRequest);

      expect(mockAuthUtils.createForbiddenResponse).toHaveBeenCalledWith(
        "Task is not assigned to you",
      );
    });

    it("should validate task exists", async () => {
      const clockInData = {
        task_id: "nonexistent-task",
      };

      mockRequest.json = jest.fn().mockResolvedValue(clockInData);

      // Mock validation
      jest.doMock("@/utils/validation", () => ({
        validateRequestBody: jest.fn().mockReturnValue({
          success: true,
          data: clockInData,
        }),
      }));

      // Mock active session check (no active session)
      const mockActiveSessionQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: null }),
      };

      // Mock task validation (task not found)
      const mockTaskQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { message: "Task not found" },
        }),
      };

      mockAuthContext.supabase.from
        .mockReturnValueOnce(mockActiveSessionQuery)
        .mockReturnValueOnce(mockTaskQuery);

      const response = await POST(mockRequest);

      expect(mockAuthUtils.createBadRequestResponse).toHaveBeenCalledWith(
        "Task not found",
      );
    });

    it("should prevent managers from clocking in for tasks in other departments", async () => {
      const managerContext = {
        ...mockAuthContext,
        user: {
          ...mockAuthContext.user,
          role: "Manager",
          department_id: "dept-456",
        },
      };

      mockAuthUtils.getAuthContext.mockResolvedValue(managerContext);

      const clockInData = {
        task_id: "task-123",
      };

      mockRequest.json = jest.fn().mockResolvedValue(clockInData);

      // Mock validation
      jest.doMock("@/utils/validation", () => ({
        validateRequestBody: jest.fn().mockReturnValue({
          success: true,
          data: clockInData,
        }),
      }));

      // Mock active session check (no active session)
      const mockActiveSessionQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: null }),
      };

      // Mock task validation (task in different department)
      const mockTaskQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { assigned_to: "user-456", department_id: "dept-different" },
          error: null,
        }),
      };

      mockAuthContext.supabase.from
        .mockReturnValueOnce(mockActiveSessionQuery)
        .mockReturnValueOnce(mockTaskQuery);

      const response = await POST(mockRequest);

      expect(mockAuthUtils.createForbiddenResponse).toHaveBeenCalledWith(
        "Task is not in your department",
      );
    });

    it("should handle validation errors", async () => {
      const invalidClockInData = {
        task_id: "invalid-uuid",
        location: "", // Empty location might be invalid
        notes: "x".repeat(1001), // Too long notes
      };

      mockRequest.json = jest.fn().mockResolvedValue(invalidClockInData);

      // Mock validation failure
      jest.doMock("@/utils/validation", () => ({
        validateRequestBody: jest.fn().mockReturnValue({
          success: false,
          error: "Invalid task ID format, Notes too long",
        }),
      }));

      const response = await POST(mockRequest);

      expect(mockAuthUtils.createBadRequestResponse).toHaveBeenCalled();
    });

    it("should handle database errors during insert", async () => {
      const clockInData = {
        location: "Office",
      };

      mockRequest.json = jest.fn().mockResolvedValue(clockInData);

      // Mock validation
      jest.doMock("@/utils/validation", () => ({
        validateRequestBody: jest.fn().mockReturnValue({
          success: true,
          data: clockInData,
        }),
      }));

      // Mock active session check (no active session)
      const mockActiveSessionQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: null }),
      };

      // Mock insert failure
      const mockInsertQuery = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { message: "Database error" },
        }),
      };

      mockAuthContext.supabase.from
        .mockReturnValueOnce(mockActiveSessionQuery)
        .mockReturnValueOnce(mockInsertQuery);

      const response = await POST(mockRequest);

      expect(mockAuthUtils.createErrorResponse).toHaveBeenCalledWith(
        "Failed to clock in",
      );
    });

    it("should handle JSON parsing errors", async () => {
      mockRequest.json = jest.fn().mockRejectedValue(new Error("Invalid JSON"));

      const response = await POST(mockRequest);

      expect(mockAuthUtils.createBadRequestResponse).toHaveBeenCalledWith(
        "Invalid request body",
      );
    });
  });

  describe("Clock Out Functionality", () => {
    it("should handle clock out requests in POST endpoint", async () => {
      const clockOutData = {
        action: "clock_out",
        notes: "Finished work for the day",
      };

      const updatedSession = {
        id: "session-active",
        user_id: "user-123",
        clock_in: "2024-01-01T09:00:00Z",
        clock_out: "2024-01-01T17:00:00Z",
        total_duration: "8 hours",
        status: "completed",
        notes: "Finished work for the day",
      };

      mockRequest.json = jest.fn().mockResolvedValue(clockOutData);

      // Mock validation
      jest.doMock("@/utils/validation", () => ({
        validateRequestBody: jest.fn().mockReturnValue({
          success: true,
          data: clockOutData,
        }),
      }));

      // Mock active session check (has active session)
      const mockActiveSessionQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: "session-active", clock_in: "2024-01-01T09:00:00Z" },
          error: null,
        }),
      };

      // Mock update
      const mockUpdateQuery = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest
          .fn()
          .mockResolvedValue({ data: updatedSession, error: null }),
      };

      mockAuthContext.supabase.from
        .mockReturnValueOnce(mockActiveSessionQuery)
        .mockReturnValueOnce(mockUpdateQuery);

      const response = await POST(mockRequest);

      expect(mockAuthUtils.createSuccessResponse).toHaveBeenCalledWith({
        clock_session: updatedSession,
      });
    });

    it("should prevent clock out when no active session", async () => {
      const clockOutData = {
        action: "clock_out",
      };

      mockRequest.json = jest.fn().mockResolvedValue(clockOutData);

      // Mock validation
      jest.doMock("@/utils/validation", () => ({
        validateRequestBody: jest.fn().mockReturnValue({
          success: true,
          data: clockOutData,
        }),
      }));

      // Mock active session check (no active session)
      const mockActiveSessionQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: null }),
      };

      mockAuthContext.supabase.from.mockReturnValue(mockActiveSessionQuery);

      const response = await POST(mockRequest);

      expect(mockAuthUtils.createBadRequestResponse).toHaveBeenCalledWith(
        "No active clock session found",
      );
    });
  });

  describe("Authorization Tests", () => {
    it("should reject requests from unauthenticated users", async () => {
      mockAuthUtils.getAuthContext.mockResolvedValue({
        user: null,
        supabase: mockAuthContext.supabase,
      });

      const response = await POST(mockRequest);

      expect(mockAuthUtils.createUnauthorizedResponse).toHaveBeenCalled();
    });

    it("should allow all authenticated users to clock in/out", async () => {
      const guestContext = {
        ...mockAuthContext,
        user: {
          ...mockAuthContext.user,
          role: "Guest",
        },
      };

      mockAuthUtils.getAuthContext.mockResolvedValue(guestContext);

      const clockInData = {
        location: "Office",
      };

      mockRequest.json = jest.fn().mockResolvedValue(clockInData);

      // Mock validation
      jest.doMock("@/utils/validation", () => ({
        validateRequestBody: jest.fn().mockReturnValue({
          success: true,
          data: clockInData,
        }),
      }));

      // Mock active session check (no active session)
      const mockActiveSessionQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: null }),
      };

      // Mock insert
      const mockInsertQuery = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: "session-new", user_id: "user-123" },
          error: null,
        }),
      };

      mockAuthContext.supabase.from
        .mockReturnValueOnce(mockActiveSessionQuery)
        .mockReturnValueOnce(mockInsertQuery);

      const response = await POST(mockRequest);

      expect(mockAuthUtils.createSuccessResponse).toHaveBeenCalled();
    });
  });
});
