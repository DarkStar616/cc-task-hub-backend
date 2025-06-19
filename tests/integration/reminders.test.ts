import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/v1/reminders/route";
import {
  GET as GET_BY_ID,
  PUT,
  DELETE,
} from "@/app/api/v1/reminders/[id]/route";
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
  createReminderSchema: {},
  updateReminderSchema: {},
}));

const mockGetAuthContext = getAuthContext as jest.MockedFunction<
  typeof getAuthContext
>;

describe("/api/v1/reminders", () => {
  const mockSupabase = {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        range: jest.fn(() => ({
          order: jest.fn(() => ({
            eq: jest.fn(() => ({
              in: jest.fn(() => ({ data: [], error: null })),
            })),
            in: jest.fn(() => ({ data: [], error: null })),
          })),
        })),
        eq: jest.fn(() => ({
          single: jest.fn(() => ({ data: null, error: { code: "PGRST116" } })),
        })),
      })),
      insert: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn(() => ({
            data: { id: "1", title: "Test Reminder" },
            error: null,
          })),
        })),
      })),
      update: jest.fn(() => ({
        eq: jest.fn(() => ({
          select: jest.fn(() => ({
            single: jest.fn(() => ({
              data: { id: "1", title: "Updated Reminder" },
              error: null,
            })),
          })),
        })),
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

  describe("GET /api/v1/reminders", () => {
    it("should return 401 when user is not authenticated", async () => {
      mockGetAuthContext.mockResolvedValue({
        user: null,
        supabase: mockSupabase,
      });

      const request = new NextRequest("http://localhost/api/v1/reminders");
      const response = await GET(request);

      expect(response.status).toBe(401);
    });

    it("should fetch reminders for authenticated user", async () => {
      const mockReminders = [
        { id: "1", title: "Test Reminder 1", user_id: "user-1" },
        { id: "2", title: "Test Reminder 2", user_id: "user-1" },
      ];

      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({
          range: jest.fn(() => ({
            order: jest.fn(() => ({
              eq: jest.fn(() => ({ data: mockReminders, error: null })),
            })),
          })),
        })),
      });

      const request = new NextRequest("http://localhost/api/v1/reminders");
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.reminders).toEqual(mockReminders);
    });

    it("should apply query filters correctly", async () => {
      const request = new NextRequest(
        "http://localhost/api/v1/reminders?status=pending&reminder_type=task&limit=10",
      );
      await GET(request);

      expect(mockSupabase.from).toHaveBeenCalledWith("reminders");
    });

    it("should handle database errors gracefully", async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({
          range: jest.fn(() => ({
            order: jest.fn(() => ({
              eq: jest.fn(() => ({
                data: null,
                error: { message: "Database error" },
              })),
            })),
          })),
        })),
      });

      const request = new NextRequest("http://localhost/api/v1/reminders");
      const response = await GET(request);

      expect(response.status).toBe(500);
    });
  });

  describe("POST /api/v1/reminders", () => {
    const { validateRequestBody } = require("@/utils/validation");

    it("should return 401 when user is not authenticated", async () => {
      mockGetAuthContext.mockResolvedValue({
        user: null,
        supabase: mockSupabase,
      });

      const request = new NextRequest("http://localhost/api/v1/reminders", {
        method: "POST",
        body: JSON.stringify({ title: "Test Reminder" }),
      });
      const response = await POST(request);

      expect(response.status).toBe(401);
    });

    it("should return 400 for invalid request body", async () => {
      validateRequestBody.mockReturnValue({
        success: false,
        error: "Invalid data",
      });

      const request = new NextRequest("http://localhost/api/v1/reminders", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
    });

    it("should create reminder successfully", async () => {
      validateRequestBody.mockReturnValue({
        success: true,
        data: {
          title: "Test Reminder",
          message: "Test message",
          reminder_type: "task",
          scheduled_for: new Date().toISOString(),
        },
      });

      const request = new NextRequest("http://localhost/api/v1/reminders", {
        method: "POST",
        body: JSON.stringify({
          title: "Test Reminder",
          message: "Test message",
          reminder_type: "task",
          scheduled_for: new Date().toISOString(),
        }),
      });
      const response = await POST(request);

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.reminder.title).toBe("Test Reminder");
    });

    it("should validate task permissions when task_id is provided", async () => {
      validateRequestBody.mockReturnValue({
        success: true,
        data: {
          title: "Test Reminder",
          task_id: "task-1",
          reminder_type: "task",
          scheduled_for: new Date().toISOString(),
        },
      });

      // Mock task not found
      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() => ({ data: null, error: null })),
          })),
        })),
        insert: jest.fn(),
      });

      const request = new NextRequest("http://localhost/api/v1/reminders", {
        method: "POST",
        body: JSON.stringify({
          title: "Test Reminder",
          task_id: "task-1",
          reminder_type: "task",
          scheduled_for: new Date().toISOString(),
        }),
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
    });
  });

  describe("GET /api/v1/reminders/[id]", () => {
    it("should return 401 when user is not authenticated", async () => {
      mockGetAuthContext.mockResolvedValue({
        user: null,
        supabase: mockSupabase,
      });

      const request = new NextRequest("http://localhost/api/v1/reminders/1");
      const response = await GET_BY_ID(request, { params: { id: "1" } });

      expect(response.status).toBe(401);
    });

    it("should return 404 when reminder is not found", async () => {
      const request = new NextRequest("http://localhost/api/v1/reminders/999");
      const response = await GET_BY_ID(request, { params: { id: "999" } });

      expect(response.status).toBe(404);
    });

    it("should return reminder when found and user has permission", async () => {
      const mockReminder = {
        id: "1",
        title: "Test Reminder",
        user_id: "user-1",
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() => ({ data: mockReminder, error: null })),
          })),
        })),
      });

      const request = new NextRequest("http://localhost/api/v1/reminders/1");
      const response = await GET_BY_ID(request, { params: { id: "1" } });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.reminder).toEqual(mockReminder);
    });
  });

  describe("PUT /api/v1/reminders/[id]", () => {
    const { validateRequestBody } = require("@/utils/validation");

    it("should return 401 when user is not authenticated", async () => {
      mockGetAuthContext.mockResolvedValue({
        user: null,
        supabase: mockSupabase,
      });

      const request = new NextRequest("http://localhost/api/v1/reminders/1", {
        method: "PUT",
        body: JSON.stringify({ title: "Updated Reminder" }),
      });
      const response = await PUT(request, { params: { id: "1" } });

      expect(response.status).toBe(401);
    });

    it("should return 404 when reminder is not found", async () => {
      validateRequestBody.mockReturnValue({
        success: true,
        data: { title: "Updated Reminder" },
      });

      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() => ({
              data: null,
              error: { code: "PGRST116" },
            })),
          })),
        })),
      });

      const request = new NextRequest("http://localhost/api/v1/reminders/999", {
        method: "PUT",
        body: JSON.stringify({ title: "Updated Reminder" }),
      });
      const response = await PUT(request, { params: { id: "999" } });

      expect(response.status).toBe(404);
    });

    it("should update reminder successfully when user owns it", async () => {
      validateRequestBody.mockReturnValue({
        success: true,
        data: { title: "Updated Reminder" },
      });

      const mockCurrentReminder = {
        id: "1",
        title: "Original Reminder",
        user_id: "user-1",
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() => ({ data: mockCurrentReminder, error: null })),
          })),
        })),
        update: jest.fn(() => ({
          eq: jest.fn(() => ({
            select: jest.fn(() => ({
              single: jest.fn(() => ({
                data: { ...mockCurrentReminder, title: "Updated Reminder" },
                error: null,
              })),
            })),
          })),
        })),
      });

      const request = new NextRequest("http://localhost/api/v1/reminders/1", {
        method: "PUT",
        body: JSON.stringify({ title: "Updated Reminder" }),
      });
      const response = await PUT(request, { params: { id: "1" } });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.reminder.title).toBe("Updated Reminder");
    });
  });

  describe("DELETE /api/v1/reminders/[id]", () => {
    it("should return 401 when user is not authenticated", async () => {
      mockGetAuthContext.mockResolvedValue({
        user: null,
        supabase: mockSupabase,
      });

      const request = new NextRequest("http://localhost/api/v1/reminders/1", {
        method: "DELETE",
      });
      const response = await DELETE(request, { params: { id: "1" } });

      expect(response.status).toBe(401);
    });

    it("should return 404 when reminder is not found", async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() => ({
              data: null,
              error: { code: "PGRST116" },
            })),
          })),
        })),
      });

      const request = new NextRequest("http://localhost/api/v1/reminders/999", {
        method: "DELETE",
      });
      const response = await DELETE(request, { params: { id: "999" } });

      expect(response.status).toBe(404);
    });

    it("should soft delete reminder successfully when user owns it", async () => {
      const mockCurrentReminder = {
        id: "1",
        title: "Test Reminder",
        user_id: "user-1",
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() => ({ data: mockCurrentReminder, error: null })),
          })),
        })),
        update: jest.fn(() => ({
          eq: jest.fn(() => ({ error: null })),
        })),
      });

      const request = new NextRequest("http://localhost/api/v1/reminders/1", {
        method: "DELETE",
      });
      const response = await DELETE(request, { params: { id: "1" } });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.message).toBe("Reminder deleted successfully");
    });
  });

  describe("Role-based access control", () => {
    const { hasRole } = require("@/utils/auth");

    it("should allow God role to see all reminders", async () => {
      hasRole.mockReturnValue(true);
      mockAuthContext.user.role = "God";

      const request = new NextRequest("http://localhost/api/v1/reminders");
      await GET(request);

      expect(mockSupabase.from).toHaveBeenCalledWith("reminders");
    });

    it("should allow Admin role to see all reminders", async () => {
      hasRole.mockReturnValue(true);
      mockAuthContext.user.role = "Admin";

      const request = new NextRequest("http://localhost/api/v1/reminders");
      await GET(request);

      expect(mockSupabase.from).toHaveBeenCalledWith("reminders");
    });

    it("should restrict Manager role to department reminders", async () => {
      hasRole.mockImplementation((role, roles) => {
        if (roles.includes("God") || roles.includes("Admin")) return false;
        if (roles.includes("Manager")) return true;
        return false;
      });

      mockAuthContext.user.role = "Manager";

      const request = new NextRequest("http://localhost/api/v1/reminders");
      await GET(request);

      expect(mockSupabase.from).toHaveBeenCalledWith("reminders");
    });

    it("should restrict User role to own reminders only", async () => {
      hasRole.mockReturnValue(false);
      mockAuthContext.user.role = "User";

      const request = new NextRequest("http://localhost/api/v1/reminders");
      await GET(request);

      expect(mockSupabase.from).toHaveBeenCalledWith("reminders");
    });
  });

  describe("Edge cases and error handling", () => {
    it("should handle malformed JSON in POST request", async () => {
      const request = new NextRequest("http://localhost/api/v1/reminders", {
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

      const request = new NextRequest("http://localhost/api/v1/reminders");
      const response = await GET(request);

      expect(response.status).toBe(500);
    });

    it("should handle invalid reminder ID format", async () => {
      const request = new NextRequest(
        "http://localhost/api/v1/reminders/invalid-id",
      );
      const response = await GET_BY_ID(request, {
        params: { id: "invalid-id" },
      });

      expect(response.status).toBe(404);
    });
  });
});
