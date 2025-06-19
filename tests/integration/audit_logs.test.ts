import { NextRequest } from "next/server";
import { GET } from "@/app/api/v1/audit_logs/route";
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
  auditLogQuerySchema: {},
}));

const mockGetAuthContext = getAuthContext as jest.MockedFunction<
  typeof getAuthContext
>;

describe("/api/v1/audit_logs", () => {
  const mockSupabase = {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        order: jest.fn(() => ({
          range: jest.fn(() => ({
            eq: jest.fn(() => ({
              gte: jest.fn(() => ({
                lte: jest.fn(() => ({ data: [], error: null })),
              })),
            })),
          })),
        })),
        count: "exact",
        head: true,
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

  describe("GET /api/v1/audit_logs", () => {
    const { validateQueryParams } = require("@/utils/validation");
    const { hasRole } = require("@/utils/auth");

    it("should return 401 when user is not authenticated", async () => {
      mockGetAuthContext.mockResolvedValue({
        user: null,
        supabase: mockSupabase,
      });

      const request = new NextRequest("http://localhost/api/v1/audit_logs");
      const response = await GET(request);

      expect(response.status).toBe(401);
    });

    it("should return 403 when user is not Admin or God", async () => {
      hasRole.mockReturnValue(false);
      mockGetAuthContext.mockResolvedValue({
        user: mockRegularUser,
        supabase: mockSupabase,
      });

      const request = new NextRequest("http://localhost/api/v1/audit_logs");
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
        "http://localhost/api/v1/audit_logs?invalid=param",
      );
      const response = await GET(request);

      expect(response.status).toBe(400);
    });

    it("should fetch audit logs successfully for Admin user", async () => {
      hasRole.mockReturnValue(true);
      validateQueryParams.mockReturnValue({
        success: true,
        data: { limit: 100, offset: 0 },
      });

      const mockAuditLogs = [
        {
          id: "1",
          table_name: "users",
          action: "INSERT",
          user_id: "user-1",
          record_id: "record-1",
          created_at: "2024-01-01T00:00:00Z",
        },
        {
          id: "2",
          table_name: "tasks",
          action: "UPDATE",
          user_id: "user-2",
          record_id: "record-2",
          created_at: "2024-01-02T00:00:00Z",
        },
      ];

      const mockCountQuery = {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            gte: jest.fn(() => ({
              lte: jest.fn(() => ({ count: 2, error: null })),
            })),
          })),
        })),
      };

      mockSupabase.from.mockImplementation((table) => {
        if (table === "audit_logs") {
          return {
            select: jest.fn((columns) => {
              if (columns.includes("count")) {
                return mockCountQuery;
              }
              return {
                order: jest.fn(() => ({
                  range: jest.fn(() => ({ data: mockAuditLogs, error: null })),
                })),
              };
            }),
          };
        }
        return mockSupabase.from();
      });

      const request = new NextRequest("http://localhost/api/v1/audit_logs");
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.audit_logs).toEqual(mockAuditLogs);
      expect(data.pagination).toBeDefined();
      expect(data.pagination.total).toBe(2);
    });

    it("should fetch audit logs successfully for God user", async () => {
      hasRole.mockReturnValue(true);
      mockGetAuthContext.mockResolvedValue({
        user: mockGodUser,
        supabase: mockSupabase,
      });

      validateQueryParams.mockReturnValue({
        success: true,
        data: { limit: 100, offset: 0 },
      });

      const request = new NextRequest("http://localhost/api/v1/audit_logs");
      const response = await GET(request);

      expect(response.status).toBe(200);
    });

    it("should apply query filters correctly", async () => {
      hasRole.mockReturnValue(true);
      validateQueryParams.mockReturnValue({
        success: true,
        data: {
          table_name: "users",
          action: "INSERT",
          user_id: "user-1",
          record_id: "record-1",
          start_date: "2024-01-01",
          end_date: "2024-12-31",
          limit: 50,
          offset: 10,
        },
      });

      const mockFilteredQuery = {
        order: jest.fn(() => ({
          range: jest.fn(() => ({ data: [], error: null })),
        })),
        eq: jest.fn(function (this: any, field: string, value: string) {
          return this;
        }),
        gte: jest.fn(function (this: any, field: string, value: string) {
          return this;
        }),
        lte: jest.fn(function (this: any, field: string, value: string) {
          return this;
        }),
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => mockFilteredQuery),
      });

      const request = new NextRequest(
        "http://localhost/api/v1/audit_logs?table_name=users&action=INSERT&user_id=user-1",
      );
      await GET(request);

      expect(mockSupabase.from).toHaveBeenCalledWith("audit_logs");
    });

    it("should handle database errors gracefully", async () => {
      hasRole.mockReturnValue(true);
      validateQueryParams.mockReturnValue({
        success: true,
        data: { limit: 100, offset: 0 },
      });

      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({
          order: jest.fn(() => ({
            range: jest.fn(() => ({
              data: null,
              error: { message: "Database error" },
            })),
          })),
        })),
      });

      const request = new NextRequest("http://localhost/api/v1/audit_logs");
      const response = await GET(request);

      expect(response.status).toBe(500);
    });

    it("should handle count query errors gracefully", async () => {
      hasRole.mockReturnValue(true);
      validateQueryParams.mockReturnValue({
        success: true,
        data: { limit: 100, offset: 0 },
      });

      const mockAuditLogs = [{ id: "1", table_name: "users" }];
      const mockCountQuery = {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            count: null,
            error: { message: "Count error" },
          })),
        })),
      };

      mockSupabase.from.mockImplementation((table) => {
        if (table === "audit_logs") {
          return {
            select: jest.fn((columns) => {
              if (columns.includes("count")) {
                return mockCountQuery;
              }
              return {
                order: jest.fn(() => ({
                  range: jest.fn(() => ({ data: mockAuditLogs, error: null })),
                })),
              };
            }),
          };
        }
        return mockSupabase.from();
      });

      const request = new NextRequest("http://localhost/api/v1/audit_logs");
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.pagination.total).toBe(0); // Should default to 0 when count fails
    });

    it("should return correct pagination metadata", async () => {
      hasRole.mockReturnValue(true);
      validateQueryParams.mockReturnValue({
        success: true,
        data: { limit: 10, offset: 20 },
      });

      const mockCountQuery = {
        select: jest.fn(() => ({ count: 100, error: null })),
      };

      mockSupabase.from.mockImplementation((table) => {
        if (table === "audit_logs") {
          return {
            select: jest.fn((columns) => {
              if (columns.includes("count")) {
                return mockCountQuery;
              }
              return {
                order: jest.fn(() => ({
                  range: jest.fn(() => ({ data: [], error: null })),
                })),
              };
            }),
          };
        }
        return mockSupabase.from();
      });

      const request = new NextRequest(
        "http://localhost/api/v1/audit_logs?limit=10&offset=20",
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.pagination).toEqual({
        total: 100,
        limit: 10,
        offset: 20,
        has_more: true, // 100 > 20 + 10
      });
    });

    it("should handle pagination edge case when no more records", async () => {
      hasRole.mockReturnValue(true);
      validateQueryParams.mockReturnValue({
        success: true,
        data: { limit: 10, offset: 90 },
      });

      const mockCountQuery = {
        select: jest.fn(() => ({ count: 95, error: null })),
      };

      mockSupabase.from.mockImplementation((table) => {
        if (table === "audit_logs") {
          return {
            select: jest.fn((columns) => {
              if (columns.includes("count")) {
                return mockCountQuery;
              }
              return {
                order: jest.fn(() => ({
                  range: jest.fn(() => ({ data: [], error: null })),
                })),
              };
            }),
          };
        }
        return mockSupabase.from();
      });

      const request = new NextRequest(
        "http://localhost/api/v1/audit_logs?limit=10&offset=90",
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.pagination.has_more).toBe(false); // 95 <= 90 + 10
    });
  });

  describe("Role-based access control", () => {
    const { hasRole } = require("@/utils/auth");
    const { validateQueryParams } = require("@/utils/validation");

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

      const request = new NextRequest("http://localhost/api/v1/audit_logs");
      const response = await GET(request);

      expect(response.status).toBe(403);
    });

    it("should deny access to User role", async () => {
      hasRole.mockReturnValue(false);
      mockGetAuthContext.mockResolvedValue({
        user: mockRegularUser,
        supabase: mockSupabase,
      });

      const request = new NextRequest("http://localhost/api/v1/audit_logs");
      const response = await GET(request);

      expect(response.status).toBe(403);
    });

    it("should allow access to Admin role", async () => {
      hasRole.mockReturnValue(true);
      validateQueryParams.mockReturnValue({
        success: true,
        data: { limit: 100, offset: 0 },
      });

      const request = new NextRequest("http://localhost/api/v1/audit_logs");
      const response = await GET(request);

      expect(response.status).toBe(200);
    });

    it("should allow access to God role", async () => {
      hasRole.mockReturnValue(true);
      mockGetAuthContext.mockResolvedValue({
        user: mockGodUser,
        supabase: mockSupabase,
      });

      validateQueryParams.mockReturnValue({
        success: true,
        data: { limit: 100, offset: 0 },
      });

      const request = new NextRequest("http://localhost/api/v1/audit_logs");
      const response = await GET(request);

      expect(response.status).toBe(200);
    });
  });

  describe("Query parameter validation", () => {
    const { hasRole } = require("@/utils/auth");
    const { validateQueryParams } = require("@/utils/validation");

    beforeEach(() => {
      hasRole.mockReturnValue(true);
    });

    it("should handle missing query parameters", async () => {
      validateQueryParams.mockReturnValue({
        success: true,
        data: { limit: 100, offset: 0 }, // defaults
      });

      const request = new NextRequest("http://localhost/api/v1/audit_logs");
      const response = await GET(request);

      expect(response.status).toBe(200);
    });

    it("should validate date range parameters", async () => {
      validateQueryParams.mockReturnValue({
        success: false,
        error: "Invalid date format",
      });

      const request = new NextRequest(
        "http://localhost/api/v1/audit_logs?start_date=invalid-date",
      );
      const response = await GET(request);

      expect(response.status).toBe(400);
    });

    it("should validate limit and offset parameters", async () => {
      validateQueryParams.mockReturnValue({
        success: false,
        error: "Limit must be a positive integer",
      });

      const request = new NextRequest(
        "http://localhost/api/v1/audit_logs?limit=-1",
      );
      const response = await GET(request);

      expect(response.status).toBe(400);
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

      const request = new NextRequest("http://localhost/api/v1/audit_logs");
      const response = await GET(request);

      expect(response.status).toBe(500);
    });

    it("should handle empty result set", async () => {
      validateQueryParams.mockReturnValue({
        success: true,
        data: { limit: 100, offset: 0 },
      });

      const mockCountQuery = {
        select: jest.fn(() => ({ count: 0, error: null })),
      };

      mockSupabase.from.mockImplementation((table) => {
        if (table === "audit_logs") {
          return {
            select: jest.fn((columns) => {
              if (columns.includes("count")) {
                return mockCountQuery;
              }
              return {
                order: jest.fn(() => ({
                  range: jest.fn(() => ({ data: [], error: null })),
                })),
              };
            }),
          };
        }
        return mockSupabase.from();
      });

      const request = new NextRequest("http://localhost/api/v1/audit_logs");
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.audit_logs).toEqual([]);
      expect(data.pagination.total).toBe(0);
    });

    it("should handle large offset values", async () => {
      validateQueryParams.mockReturnValue({
        success: true,
        data: { limit: 100, offset: 999999 },
      });

      const request = new NextRequest(
        "http://localhost/api/v1/audit_logs?offset=999999",
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
    });
  });
});
