import { createClient } from "../../supabase/server";
import { AuthContext } from "./auth";

export interface AuditLogEntry {
  table_name: string;
  record_id: string;
  action: "INSERT" | "UPDATE" | "DELETE";
  old_values?: Record<string, any>;
  new_values?: Record<string, any>;
  user_id?: string;
  ip_address?: string;
  user_agent?: string;
}

export async function logAuditEntry(
  authContext: AuthContext,
  entry: AuditLogEntry,
  request?: Request,
): Promise<void> {
  try {
    const { supabase, user } = authContext;

    // Get IP address and user agent from request if available
    let ip_address: string | undefined;
    let user_agent: string | undefined;

    if (request) {
      ip_address =
        request.headers.get("x-forwarded-for") ||
        request.headers.get("x-real-ip") ||
        undefined;
      user_agent = request.headers.get("user-agent") || undefined;
    }

    const auditData = {
      table_name: entry.table_name,
      record_id: entry.record_id,
      action: entry.action,
      old_values: entry.old_values || null,
      new_values: entry.new_values || null,
      user_id: entry.user_id || user?.id || null,
      ip_address: ip_address || null,
      user_agent: user_agent || null,
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("audit_logs").insert(auditData);

    if (error) {
      console.error("Failed to log audit entry:", error);
      // Don't throw error to avoid breaking the main operation
    }
  } catch (error) {
    console.error("Audit logging error:", error);
    // Don't throw error to avoid breaking the main operation
  }
}

export async function logUserAction(
  authContext: AuthContext,
  action: string,
  tableName: string,
  recordId: string,
  oldValues?: Record<string, any>,
  newValues?: Record<string, any>,
  request?: Request,
): Promise<void> {
  await logAuditEntry(
    authContext,
    {
      table_name: tableName,
      record_id: recordId,
      action: action as "INSERT" | "UPDATE" | "DELETE",
      old_values: oldValues,
      new_values: newValues,
    },
    request,
  );
}

// Sensitive actions that should always be logged
export const SENSITIVE_ACTIONS = {
  USER_ROLE_CHANGE: "user_role_change",
  USER_DEPARTMENT_CHANGE: "user_department_change",
  TASK_ASSIGNMENT: "task_assignment",
  TASK_COMPLETION: "task_completion",
  SOP_CREATION: "sop_creation",
  SOP_UPDATE: "sop_update",
  CLOCK_IN: "clock_in",
  CLOCK_OUT: "clock_out",
  FEEDBACK_CREATION: "feedback_creation",
} as const;

export type SensitiveAction =
  (typeof SENSITIVE_ACTIONS)[keyof typeof SENSITIVE_ACTIONS];

export async function logSensitiveAction(
  authContext: AuthContext,
  action: SensitiveAction,
  details: {
    tableName: string;
    recordId: string;
    oldValues?: Record<string, any>;
    newValues?: Record<string, any>;
    metadata?: Record<string, any>;
  },
  request?: Request,
): Promise<void> {
  const auditEntry: AuditLogEntry = {
    table_name: details.tableName,
    record_id: details.recordId,
    action: "UPDATE", // Most sensitive actions are updates
    old_values: details.oldValues,
    new_values: {
      ...details.newValues,
      _sensitive_action: action,
      _metadata: details.metadata,
    },
  };

  await logAuditEntry(authContext, auditEntry, request);
}
