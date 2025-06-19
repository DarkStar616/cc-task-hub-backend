import { jest } from "@jest/globals";
import {
  logAuditEntry,
  logUserAction,
  logSensitiveAction,
  SENSITIVE_ACTIONS,
} from "@/utils/audit-log";
import { AuthContext } from "@/utils/auth";

describe("Audit Log Utilities", () => {
  let mockAuthContext: AuthContext;
  let mockRequest: Request;

  beforeEach(() => {
    jest.clearAllMocks();

    mockAuthContext = {
      user: {
        id: "user-123",
        email: "test@example.com",
        role: "Admin",
        department_id: "dept-123",
      },
      supabase: {
        ...global.mockSupabaseClient,
        from: jest.fn(() => ({
          insert: jest.fn().mockResolvedValue({ error: null }),
        })),
      } as any,
    };

    mockRequest = {
      headers: {
        get: jest.fn((header: string) => {
          const headers: Record<string, string> = {
            "x-forwarded-for": "192.168.1.1",
            "user-agent": "Mozilla/5.0 Test Browser",
          };
          return headers[header] || null;
        }),
      },
    } as any;
  });

  describe("logAuditEntry", () => {
    it("should log audit entry successfully", async () => {
      const auditEntry = {
        table_name: "users",
        record_id: "record-123",
        action: "UPDATE" as const,
        old_values: { name: "Old Name" },
        new_values: { name: "New Name" },
      };

      await logAuditEntry(mockAuthContext, auditEntry, mockRequest);

      expect(mockAuthContext.supabase.from).toHaveBeenCalledWith("audit_logs");
      const insertCall = (mockAuthContext.supabase.from as jest.Mock).mock
        .results[0].value.insert;
      expect(insertCall).toHaveBeenCalledWith(
        expect.objectContaining({
          table_name: "users",
          record_id: "record-123",
          action: "UPDATE",
          old_values: { name: "Old Name" },
          new_values: { name: "New Name" },
          user_id: "user-123",
          ip_address: "192.168.1.1",
          user_agent: "Mozilla/5.0 Test Browser",
        }),
      );
    });

    it("should handle missing request headers", async () => {
      const auditEntry = {
        table_name: "users",
        record_id: "record-123",
        action: "INSERT" as const,
      };

      await logAuditEntry(mockAuthContext, auditEntry);

      const insertCall = (mockAuthContext.supabase.from as jest.Mock).mock
        .results[0].value.insert;
      expect(insertCall).toHaveBeenCalledWith(
        expect.objectContaining({
          ip_address: null,
          user_agent: null,
        }),
      );
    });

    it("should handle database errors gracefully", async () => {
      const mockSupabaseWithError = {
        ...mockAuthContext.supabase,
        from: jest.fn(() => ({
          insert: jest
            .fn()
            .mockResolvedValue({ error: { message: "Database error" } }),
        })),
      };

      const contextWithError = {
        ...mockAuthContext,
        supabase: mockSupabaseWithError,
      };

      const auditEntry = {
        table_name: "users",
        record_id: "record-123",
        action: "DELETE" as const,
      };

      // Should not throw error
      await expect(
        logAuditEntry(contextWithError, auditEntry),
      ).resolves.not.toThrow();
    });

    it("should handle null user context", async () => {
      const contextWithoutUser = {
        ...mockAuthContext,
        user: null,
      };

      const auditEntry = {
        table_name: "users",
        record_id: "record-123",
        action: "UPDATE" as const,
      };

      await logAuditEntry(contextWithoutUser, auditEntry);

      const insertCall = (mockAuthContext.supabase.from as jest.Mock).mock
        .results[0].value.insert;
      expect(insertCall).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: null,
        }),
      );
    });
  });

  describe("logUserAction", () => {
    it("should log user action with correct parameters", async () => {
      await logUserAction(
        mockAuthContext,
        "UPDATE",
        "users",
        "user-456",
        { old_name: "Old" },
        { new_name: "New" },
        mockRequest,
      );

      expect(mockAuthContext.supabase.from).toHaveBeenCalledWith("audit_logs");
      const insertCall = (mockAuthContext.supabase.from as jest.Mock).mock
        .results[0].value.insert;
      expect(insertCall).toHaveBeenCalledWith(
        expect.objectContaining({
          table_name: "users",
          record_id: "user-456",
          action: "UPDATE",
          old_values: { old_name: "Old" },
          new_values: { new_name: "New" },
        }),
      );
    });
  });

  describe("logSensitiveAction", () => {
    it("should log sensitive action with metadata", async () => {
      const details = {
        tableName: "users",
        recordId: "user-789",
        oldValues: { role: "User" },
        newValues: { role: "Admin" },
        metadata: { reason: "Promotion" },
      };

      await logSensitiveAction(
        mockAuthContext,
        SENSITIVE_ACTIONS.USER_ROLE_CHANGE,
        details,
        mockRequest,
      );

      const insertCall = (mockAuthContext.supabase.from as jest.Mock).mock
        .results[0].value.insert;
      expect(insertCall).toHaveBeenCalledWith(
        expect.objectContaining({
          table_name: "users",
          record_id: "user-789",
          action: "UPDATE",
          old_values: { role: "User" },
          new_values: expect.objectContaining({
            role: "Admin",
            _sensitive_action: SENSITIVE_ACTIONS.USER_ROLE_CHANGE,
            _metadata: { reason: "Promotion" },
          }),
        }),
      );
    });

    it("should handle all sensitive action types", async () => {
      const sensitiveActions = Object.values(SENSITIVE_ACTIONS);

      for (const action of sensitiveActions) {
        const details = {
          tableName: "test_table",
          recordId: "test-record",
          newValues: { test: "value" },
        };

        await logSensitiveAction(mockAuthContext, action, details);

        const insertCall = (mockAuthContext.supabase.from as jest.Mock).mock
          .results[0].value.insert;
        expect(insertCall).toHaveBeenCalledWith(
          expect.objectContaining({
            new_values: expect.objectContaining({
              _sensitive_action: action,
            }),
          }),
        );

        jest.clearAllMocks();
      }
    });
  });

  describe("SENSITIVE_ACTIONS constants", () => {
    it("should have all expected sensitive actions", () => {
      const expectedActions = [
        "user_role_change",
        "user_department_change",
        "task_assignment",
        "task_completion",
        "sop_creation",
        "sop_update",
        "clock_in",
        "clock_out",
        "feedback_creation",
      ];

      const actualActions = Object.values(SENSITIVE_ACTIONS);

      expectedActions.forEach((action) => {
        expect(actualActions).toContain(action);
      });
    });

    it("should have consistent action naming", () => {
      const actions = Object.values(SENSITIVE_ACTIONS);

      actions.forEach((action) => {
        expect(action).toMatch(/^[a-z_]+$/);
        expect(action).not.toContain(" ");
        expect(action).not.toContain("-");
      });
    });
  });
});
