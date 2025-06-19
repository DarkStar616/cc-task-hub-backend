import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Database } from "./database.types.ts";

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
  supabase: ReturnType<typeof createClient<Database>>,
  entry: AuditLogEntry,
): Promise<void> {
  try {
    const auditData = {
      table_name: entry.table_name,
      record_id: entry.record_id,
      action: entry.action,
      old_values: entry.old_values || null,
      new_values: entry.new_values || null,
      user_id: entry.user_id || null,
      ip_address: entry.ip_address || null,
      user_agent: entry.user_agent || null,
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("audit_logs").insert(auditData);

    if (error) {
      console.error("Failed to log audit entry:", error);
    }
  } catch (error) {
    console.error("Audit logging error:", error);
  }
}

export async function logAuditAction(
  supabase: ReturnType<typeof createClient<Database>>,
  entry: AuditLogEntry,
): Promise<void> {
  return logAuditEntry(supabase, entry);
}

export async function logSystemAction(
  supabase: ReturnType<typeof createClient<Database>>,
  action: string,
  tableName: string,
  recordId: string,
  metadata?: Record<string, any>,
): Promise<void> {
  await logAuditEntry(supabase, {
    table_name: tableName,
    record_id: recordId,
    action: "UPDATE",
    new_values: {
      _system_action: action,
      _metadata: metadata,
      _timestamp: new Date().toISOString(),
    },
    user_id: "system",
  });
}
