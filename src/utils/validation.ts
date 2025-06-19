import { z } from "zod";

// User validation schemas
export const createUserSchema = z.object({
  email: z.string().email("Invalid email format"),
  full_name: z
    .string()
    .min(1, "Full name is required")
    .max(255, "Full name too long"),
  phone: z.string().optional(),
  department_id: z.string().uuid("Invalid department ID").optional(),
  role_id: z.string().uuid("Invalid role ID").optional(),
  hire_date: z.string().datetime().optional(),
  emergency_contact: z
    .object({
      name: z.string().optional(),
      phone: z.string().optional(),
      relationship: z.string().optional(),
    })
    .optional(),
});

export const updateUserSchema = z.object({
  full_name: z.string().min(1).max(255).optional(),
  phone: z.string().optional(),
  department_id: z.string().uuid().optional(),
  role_id: z.string().uuid().optional(),
  emergency_contact: z
    .object({
      name: z.string().optional(),
      phone: z.string().optional(),
      relationship: z.string().optional(),
    })
    .optional(),
  preferences: z.record(z.any()).optional(),
});

// Task validation schemas
export const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required").max(255, "Title too long"),
  description: z.string().optional(),
  assigned_to: z.string().uuid("Invalid user ID").optional(),
  department_id: z.string().uuid("Invalid department ID").optional(),
  sop_id: z.string().uuid("Invalid SOP ID").optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  due_date: z.string().datetime().optional(),
  estimated_duration: z.string().optional(), // PostgreSQL interval format
  attachments: z
    .array(
      z.object({
        name: z.string(),
        url: z.string().url(),
        type: z.string(),
      }),
    )
    .optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  assigned_to: z.string().uuid().optional(),
  department_id: z.string().uuid().optional(),
  sop_id: z.string().uuid().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  status: z
    .enum(["pending", "in_progress", "completed", "cancelled"])
    .optional(),
  due_date: z.string().datetime().optional(),
  estimated_duration: z.string().optional(),
  completion_notes: z.string().optional(),
  attachments: z
    .array(
      z.object({
        name: z.string(),
        url: z.string().url(),
        type: z.string(),
      }),
    )
    .optional(),
});

// SOP validation schemas
export const createSopSchema = z.object({
  title: z.string().min(1, "Title is required").max(255, "Title too long"),
  description: z.string().optional(),
  content: z.string().min(1, "Content is required"),
  department_id: z.string().uuid("Invalid department ID").optional(),
  tags: z.array(z.string()).optional(),
  attachments: z
    .array(
      z.object({
        name: z.string(),
        url: z.string().url(),
        type: z.string(),
      }),
    )
    .optional(),
});

export const updateSopSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  content: z.string().min(1).optional(),
  department_id: z.string().uuid().optional(),
  status: z.enum(["draft", "active", "archived"]).optional(),
  tags: z.array(z.string()).optional(),
  attachments: z
    .array(
      z.object({
        name: z.string(),
        url: z.string().url(),
        type: z.string(),
      }),
    )
    .optional(),
});

// Clock session validation schemas
export const clockInSchema = z.object({
  task_id: z.string().uuid("Invalid task ID").optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
});

export const clockOutSchema = z.object({
  notes: z.string().optional(),
});

// Reminder validation schemas
export const createReminderSchema = z.object({
  title: z.string().min(1, "Title is required").max(255, "Title too long"),
  message: z.string().optional(),
  scheduled_for: z.string().datetime("Invalid datetime format"),
  task_id: z.string().uuid("Invalid task ID").optional(),
  reminder_type: z.enum(["task", "meeting", "deadline", "general"]).optional(),
  repeat_pattern: z.string().optional(), // cron-like pattern
});

export const updateReminderSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  message: z.string().optional(),
  scheduled_for: z.string().datetime().optional(),
  task_id: z.string().uuid().optional(),
  reminder_type: z.enum(["task", "meeting", "deadline", "general"]).optional(),
  repeat_pattern: z.string().optional(),
  status: z.enum(["pending", "sent", "cancelled"]).optional(),
});

// Feedback validation schemas
export const createFeedbackSchema = z.object({
  subject: z
    .string()
    .min(1, "Subject is required")
    .max(255, "Subject too long"),
  content: z.string().min(1, "Content is required"),
  type: z
    .enum(["bug", "feature", "improvement", "complaint", "praise"])
    .optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  task_id: z.string().uuid("Invalid task ID").optional(),
  target_user_id: z.string().uuid("Invalid user ID").optional(),
  rating: z.number().min(1).max(5).optional(),
  attachments: z
    .array(
      z.object({
        name: z.string(),
        url: z.string().url(),
        type: z.string(),
      }),
    )
    .optional(),
});

export const updateFeedbackSchema = z.object({
  subject: z.string().min(1).max(255).optional(),
  content: z.string().min(1).optional(),
  type: z
    .enum(["bug", "feature", "improvement", "complaint", "praise"])
    .optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
  rating: z.number().min(1).max(5).optional(),
  attachments: z
    .array(
      z.object({
        name: z.string(),
        url: z.string().url(),
        type: z.string(),
      }),
    )
    .optional(),
});

// Analytics validation schemas
export const analyticsQuerySchema = z.object({
  metric_type: z.string().optional(),
  department_id: z.string().uuid().optional(),
  user_id: z.string().uuid().optional(),
  task_id: z.string().uuid().optional(),
  period_start: z.string().datetime().optional(),
  period_end: z.string().datetime().optional(),
  limit: z.number().min(1).max(1000).optional(),
  offset: z.number().min(0).optional(),
});

// Audit log validation schemas
export const auditLogQuerySchema = z.object({
  table_name: z.string().optional(),
  action: z.enum(["INSERT", "UPDATE", "DELETE"]).optional(),
  user_id: z.string().uuid().optional(),
  record_id: z.string().uuid().optional(),
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
  limit: z.number().min(1).max(1000).optional(),
  offset: z.number().min(0).optional(),
});

export function validateRequestBody<T>(
  schema: z.ZodSchema<T>,
  body: any,
): { success: true; data: T } | { success: false; error: string } {
  try {
    const result = schema.parse(body);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors
        .map((err) => `${err.path.join(".")}: ${err.message}`)
        .join(", ");
      return { success: false, error: errorMessages };
    }
    return { success: false, error: "Invalid request body" };
  }
}

export function validateQueryParams<T>(
  schema: z.ZodSchema<T>,
  params: Record<string, string | string[]>,
): { success: true; data: T } | { success: false; error: string } {
  try {
    // Convert query params to appropriate types
    const processedParams: Record<string, any> = {};

    for (const [key, value] of Object.entries(params)) {
      if (Array.isArray(value)) {
        processedParams[key] = value;
      } else if (value === "true") {
        processedParams[key] = true;
      } else if (value === "false") {
        processedParams[key] = false;
      } else if (!isNaN(Number(value)) && value !== "") {
        processedParams[key] = Number(value);
      } else {
        processedParams[key] = value;
      }
    }

    const result = schema.parse(processedParams);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors
        .map((err) => `${err.path.join(".")}: ${err.message}`)
        .join(", ");
      return { success: false, error: errorMessages };
    }
    return { success: false, error: "Invalid query parameters" };
  }
}
