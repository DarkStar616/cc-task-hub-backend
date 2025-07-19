import { jest } from "@jest/globals";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/v1/tasks/route";
import * as authUtils from "@/utils/auth";

// Mock the auth utilities
jest.mock("@/utils/auth");
const mockAuthUtils = authUtils as jest.Mocked<typeof authUtils>;

describe("/api/v1/tasks", () => {
  let mockRequest: NextRequest;
  let mockAuthContext: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      url: "http://localhost:3000/api/v1/tasks",
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

  describe("GET /api/v1/tasks", () => {
    it("should return tasks for authenticated admin", async () => {
      const mockTasks = [
        {
          id: "task-1",
          title: "Complete project",
          description: "Finish the project by deadline",
          assigned_to: "user-1",
          status: "in_progress",
          priority: "high",
          created_by_user: { full_name: "Admin User" },
          assigned_user: { full_name: "Assigned User" },
          department: { name: "Engineering" },
          sop: { title: "Project SOP" },
        },
      ];

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
      };
      mockQuery.order.mockResolvedValue({ data: mockTasks, error: null });

      mockAuthContext.supabase.from.mockReturnValue(mockQuery);

      const response = await GET(mockRequest);

      expect(mockAuthUtils.getAuthContext).toHaveBeenCalledWith(mockRequest);
      expect(mockAuthContext.supabase.from).toHaveBeenCalledWith("tasks");
      expect(mockAuthUtils.createSuccessResponse).toHaveBeenCalledWith({
        tasks: mockTasks,
      });
    });

    it("should filter tasks for regular users", async () => {
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
          allowedRoles.includes("User") &&
          !allowedRoles.includes("Admin") &&
          !allowedRoles.includes("God")
        );
      });

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
      };
      mockQuery.order.mockResolvedValue({ data: [], error: null });

      mockAuthContext.supabase.from.mockReturnValue(mockQuery);

      await GET(mockRequest);

      expect(mockQuery.or).toHaveBeenCalledWith(
        "assigned_to.eq.user-456,created_by.eq.user-456",
      );
    });

    it("should filter tasks by department for managers", async () => {
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
      };
      mockQuery.order.mockResolvedValue({ data: [], error: null });

      mockAuthContext.supabase.from.mockReturnValue(mockQuery);

      await GET(mockRequest);

      expect(mockQuery.eq).toHaveBeenCalledWith("department_id", "dept-456");
    });

    it("should apply query filters", async () => {
      mockRequest.url =
        "http://localhost:3000/api/v1/tasks?status=completed&priority=high&assigned_to=user-123";

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
      };
      mockQuery.order.mockResolvedValue({ data: [], error: null });

      mockAuthContext.supabase.from.mockReturnValue(mockQuery);

      await GET(mockRequest);

      expect(mockQuery.eq).toHaveBeenCalledWith("assigned_to", "user-123");
      expect(mockQuery.eq).toHaveBeenCalledWith("status", "completed");
      expect(mockQuery.eq).toHaveBeenCalledWith("priority", "high");
    });

    it("should handle overdue status filter", async () => {
      mockRequest.url = "http://localhost:3000/api/v1/tasks?status=overdue";

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
      };
      mockQuery.order.mockResolvedValue({ data: [], error: null });

      mockAuthContext.supabase.from.mockReturnValue(mockQuery);

      await GET(mockRequest);

      expect(mockQuery.eq).toHaveBeenCalledWith("status", "overdue");
    });

    it("should reject invalid status filter", async () => {
      mockRequest.url = "http://localhost:3000/api/v1/tasks?status=invalid-status";

      const response = await GET(mockRequest);

      expect(mockAuthUtils.createBadRequestResponse).toHaveBeenCalledWith(
        "Invalid status parameter"
      );
    });
  });

  describe("POST /api/v1/tasks", () => {
    it("should create task successfully", async () => {
      const newTaskData = {
        title: "New Task",
        description: "Task description",
        assigned_to: "user-456",
        department_id: "dept-123",
        priority: "medium",
      };

      const createdTask = {
        id: "task-new",
        ...newTaskData,
        created_by: "user-123",
        status: "pending",
        created_at: expect.any(String),
      };

      mockRequest.json = jest.fn().mockResolvedValue(newTaskData);

      // Mock validation
      jest.doMock("@/utils/validation", () => ({
        validateRequestBody: jest.fn().mockReturnValue({
          success: true,
          data: newTaskData,
        }),
      }));

      // Mock assigned user check
      const mockUserQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { department_id: "dept-123" },
          error: null,
        }),
      };

      const mockInsertQuery = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: createdTask, error: null }),
      };

      mockAuthContext.supabase.from
        .mockReturnValueOnce(mockUserQuery)
        .mockReturnValueOnce(mockInsertQuery);

      const response = await POST(mockRequest);

      expect(mockRequest.json).toHaveBeenCalled();
      expect(mockAuthUtils.createSuccessResponse).toHaveBeenCalledWith(
        { task: createdTask },
        201,
      );
    });

    it("should prevent managers from creating tasks in other departments", async () => {
      const managerContext = {
        ...mockAuthContext,
        user: {
          ...mockAuthContext.user,
          role: "Manager",
          department_id: "dept-456",
        },
      };

      mockAuthUtils.getAuthContext.mockResolvedValue(managerContext);

      const newTaskData = {
        title: "New Task",
        department_id: "dept-different", // Different department
      };

      mockRequest.json = jest.fn().mockResolvedValue(newTaskData);

      // Mock validation
      jest.doMock("@/utils/validation", () => ({
        validateRequestBody: jest.fn().mockReturnValue({
          success: true,
          data: newTaskData,
        }),
      }));

      const response = await POST(mockRequest);

      expect(mockAuthUtils.createForbiddenResponse).toHaveBeenCalledWith(
        "Can only create tasks in your department",
      );
    });

    it("should prevent assigning tasks to users in other departments", async () => {
      const managerContext = {
        ...mockAuthContext,
        user: {
          ...mockAuthContext.user,
          role: "Manager",
          department_id: "dept-456",
        },
      };

      mockAuthUtils.getAuthContext.mockResolvedValue(managerContext);

      const newTaskData = {
        title: "New Task",
        assigned_to: "user-other-dept",
      };

      mockRequest.json = jest.fn().mockResolvedValue(newTaskData);

      // Mock validation
      jest.doMock("@/utils/validation", () => ({
        validateRequestBody: jest.fn().mockReturnValue({
          success: true,
          data: newTaskData,
        }),
      }));

      // Mock assigned user in different department
      const mockUserQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { department_id: "dept-different" },
          error: null,
        }),
      };

      mockAuthContext.supabase.from.mockReturnValue(mockUserQuery);

      const response = await POST(mockRequest);

      expect(mockAuthUtils.createForbiddenResponse).toHaveBeenCalledWith(
        "Can only assign tasks to users in your department",
      );
    });

    it("should handle validation errors", async () => {
      const invalidTaskData = {
        title: "", // Empty title
        priority: "invalid", // Invalid priority
      };

      mockRequest.json = jest.fn().mockResolvedValue(invalidTaskData);

      // Mock validation failure
      jest.doMock("@/utils/validation", () => ({
        validateRequestBody: jest.fn().mockReturnValue({
          success: false,
          error: "Title is required, Invalid priority",
        }),
      }));

      const response = await POST(mockRequest);

      expect(mockAuthUtils.createBadRequestResponse).toHaveBeenCalled();
    });

    it("should handle database errors", async () => {
      const newTaskData = {
        title: "New Task",
      };

      mockRequest.json = jest.fn().mockResolvedValue(newTaskData);

      // Mock validation
      jest.doMock("@/utils/validation", () => ({
        validateRequestBody: jest.fn().mockReturnValue({
          success: true,
          data: newTaskData,
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
        "Failed to create task",
      );
    });

    it("should create task with overdue status", async () => {
      const overdueTaskData = {
        title: "Overdue Task",
        description: "Task that was overdue from creation",
        status: "overdue",
        priority: "high",
      };

      const createdTask = {
        id: "task-overdue",
        ...overdueTaskData,
        created_by: "user-123",
        created_at: expect.any(String),
      };

      mockRequest.json = jest.fn().mockResolvedValue(overdueTaskData);

      // Mock validation
      jest.doMock("@/utils/validation", () => ({
        validateRequestBody: jest.fn().mockReturnValue({
          success: true,
          data: overdueTaskData,
        }),
      }));

      const mockInsertQuery = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: createdTask, error: null }),
      };

      mockAuthContext.supabase.from.mockReturnValue(mockInsertQuery);

      const response = await POST(mockRequest);

      expect(mockRequest.json).toHaveBeenCalled();
      expect(mockAuthUtils.createSuccessResponse).toHaveBeenCalledWith(
        { task: createdTask },
        201,
      );
    });
  });
});
