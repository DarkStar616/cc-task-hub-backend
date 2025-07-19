import { NextRequest } from "next/server";
import { createSuccessResponse } from "@/utils/auth";

// OpenAPI 3.0 specification for the Coot Club Task Hub API
const openApiSpec = {
  openapi: "3.0.0",
  info: {
    title: "Coot Club Task Hub API",
    version: "1.0.0",
    description: "RESTful API for hospitality team management application",
    contact: {
      name: "API Support",
      email: "support@cootclub.com",
    },
  },
  servers: [
    {
      url: "/api/v1",
      description: "Production server",
    },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
    schemas: {
      User: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          email: { type: "string", format: "email" },
          full_name: { type: "string" },
          phone: { type: "string", nullable: true },
          department_id: { type: "string", format: "uuid", nullable: true },
          role_id: { type: "string", format: "uuid", nullable: true },
          status: { type: "string", enum: ["active", "inactive", "deleted"] },
          hire_date: { type: "string", format: "date-time", nullable: true },
          emergency_contact: { type: "object", nullable: true },
          preferences: { type: "object", nullable: true },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time", nullable: true },
        },
      },
      Task: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          title: { type: "string" },
          description: { type: "string", nullable: true },
          assigned_to: { type: "string", format: "uuid", nullable: true },
          department_id: { type: "string", format: "uuid", nullable: true },
          sop_id: { type: "string", format: "uuid", nullable: true },
          priority: {
            type: "string",
            enum: ["low", "medium", "high", "urgent"],
          },
          status: {
            type: "string",
            enum: ["pending", "in_progress", "completed", "cancelled", "overdue"],
          },
          due_date: { type: "string", format: "date-time", nullable: true },
          estimated_duration: { type: "string", nullable: true },
          actual_duration: { type: "string", nullable: true },
          completed_at: { type: "string", format: "date-time", nullable: true },
          completion_notes: { type: "string", nullable: true },
          attachments: {
            type: "array",
            items: { type: "object" },
            nullable: true,
          },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time", nullable: true },
        },
      },
      SOP: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          title: { type: "string" },
          description: { type: "string", nullable: true },
          content: { type: "string" },
          department_id: { type: "string", format: "uuid", nullable: true },
          status: { type: "string", enum: ["draft", "active", "archived"] },
          tags: { type: "array", items: { type: "string" }, nullable: true },
          attachments: {
            type: "array",
            items: { type: "object" },
            nullable: true,
          },
          version: { type: "integer" },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time", nullable: true },
        },
      },
      ClockSession: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          user_id: { type: "string", format: "uuid" },
          task_id: { type: "string", format: "uuid", nullable: true },
          clock_in: { type: "string", format: "date-time" },
          clock_out: { type: "string", format: "date-time", nullable: true },
          break_duration: { type: "string", nullable: true },
          total_duration: { type: "string", nullable: true },
          status: {
            type: "string",
            enum: ["active", "completed", "cancelled"],
          },
          location: { type: "string", nullable: true },
          notes: { type: "string", nullable: true },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time", nullable: true },
        },
      },
      Reminder: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          user_id: { type: "string", format: "uuid" },
          task_id: { type: "string", format: "uuid", nullable: true },
          title: { type: "string" },
          message: { type: "string", nullable: true },
          reminder_type: {
            type: "string",
            enum: ["task", "meeting", "deadline", "general"],
          },
          scheduled_for: { type: "string", format: "date-time" },
          repeat_pattern: { type: "string", nullable: true },
          status: { type: "string", enum: ["pending", "sent", "cancelled"] },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time", nullable: true },
        },
      },
      Feedback: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          user_id: { type: "string", format: "uuid" },
          target_user_id: { type: "string", format: "uuid", nullable: true },
          task_id: { type: "string", format: "uuid", nullable: true },
          subject: { type: "string" },
          content: { type: "string" },
          type: {
            type: "string",
            enum: ["bug", "feature", "improvement", "complaint", "praise"],
          },
          priority: {
            type: "string",
            enum: ["low", "medium", "high", "urgent"],
          },
          status: {
            type: "string",
            enum: ["open", "in_progress", "resolved", "closed"],
          },
          rating: { type: "integer", minimum: 1, maximum: 5, nullable: true },
          attachments: {
            type: "array",
            items: { type: "object" },
            nullable: true,
          },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time", nullable: true },
        },
      },
      AuditLog: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          table_name: { type: "string" },
          record_id: { type: "string", format: "uuid" },
          action: { type: "string", enum: ["INSERT", "UPDATE", "DELETE"] },
          old_values: { type: "object", nullable: true },
          new_values: { type: "object", nullable: true },
          user_id: { type: "string", format: "uuid", nullable: true },
          ip_address: { type: "string", nullable: true },
          user_agent: { type: "string", nullable: true },
          created_at: { type: "string", format: "date-time" },
        },
      },
      Error: {
        type: "object",
        properties: {
          error: { type: "string" },
        },
      },
      HealthStatus: {
        type: "object",
        properties: {
          status: { type: "string" },
          timestamp: { type: "string", format: "date-time" },
          services: {
            type: "object",
            properties: {
              database: { type: "string" },
              auth: { type: "string" },
            },
          },
          version: { type: "string" },
        },
      },
    },
  },
  security: [
    {
      BearerAuth: [],
    },
  ],
  paths: {
    "/health": {
      get: {
        summary: "Health check endpoint",
        description:
          "Returns the status of the API, database, and key integrations",
        tags: ["Health"],
        security: [],
        responses: {
          "200": {
            description: "Service is healthy",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HealthStatus" },
              },
            },
          },
          "503": {
            description: "Service unavailable",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },
    "/users": {
      get: {
        summary: "List users",
        description: "Retrieve a list of users with role-based filtering",
        tags: ["Users"],
        parameters: [
          {
            name: "department_id",
            in: "query",
            schema: { type: "string", format: "uuid" },
            description: "Filter by department ID",
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 50 },
            description: "Number of results to return",
          },
          {
            name: "offset",
            in: "query",
            schema: { type: "integer", default: 0 },
            description: "Number of results to skip",
          },
        ],
        responses: {
          "200": {
            description: "List of users",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    users: {
                      type: "array",
                      items: { $ref: "#/components/schemas/User" },
                    },
                  },
                },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
      post: {
        summary: "Create user",
        description: "Create a new user (Admin/Manager only)",
        tags: ["Users"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "full_name"],
                properties: {
                  email: { type: "string", format: "email" },
                  full_name: { type: "string" },
                  phone: { type: "string" },
                  department_id: { type: "string", format: "uuid" },
                  role_id: { type: "string", format: "uuid" },
                  hire_date: { type: "string", format: "date-time" },
                  emergency_contact: { type: "object" },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "User created successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    user: { $ref: "#/components/schemas/User" },
                  },
                },
              },
            },
          },
          "400": {
            description: "Bad request",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
          "403": {
            description: "Forbidden",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },
    "/users/{id}": {
      get: {
        summary: "Get user by ID",
        description: "Retrieve a specific user by ID",
        tags: ["Users"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
            description: "User ID",
          },
        ],
        responses: {
          "200": {
            description: "User details",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    user: { $ref: "#/components/schemas/User" },
                  },
                },
              },
            },
          },
          "404": {
            description: "User not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
      put: {
        summary: "Update user",
        description: "Update user information",
        tags: ["Users"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
            description: "User ID",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  full_name: { type: "string" },
                  phone: { type: "string" },
                  department_id: { type: "string", format: "uuid" },
                  role_id: { type: "string", format: "uuid" },
                  emergency_contact: { type: "object" },
                  preferences: { type: "object" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "User updated successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    user: { $ref: "#/components/schemas/User" },
                  },
                },
              },
            },
          },
        },
      },
      delete: {
        summary: "Delete user",
        description: "Soft delete a user (Admin only)",
        tags: ["Users"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
            description: "User ID",
          },
        ],
        responses: {
          "200": {
            description: "User deleted successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/tasks": {
      get: {
        summary: "List tasks",
        description: "Retrieve a list of tasks with role-based filtering",
        tags: ["Tasks"],
        parameters: [
          {
            name: "department_id",
            in: "query",
            schema: { type: "string", format: "uuid" },
            description: "Filter by department ID",
          },
          {
            name: "assigned_to",
            in: "query",
            schema: { type: "string", format: "uuid" },
            description: "Filter by assigned user ID",
          },
          {
            name: "status",
            in: "query",
            schema: {
              type: "string",
              enum: ["pending", "in_progress", "completed", "cancelled"],
            },
            description: "Filter by task status",
          },
          {
            name: "priority",
            in: "query",
            schema: {
              type: "string",
              enum: ["low", "medium", "high", "urgent"],
            },
            description: "Filter by task priority",
          },
        ],
        responses: {
          "200": {
            description: "List of tasks",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    tasks: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Task" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        summary: "Create task",
        description: "Create a new task",
        tags: ["Tasks"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["title"],
                properties: {
                  title: { type: "string" },
                  description: { type: "string" },
                  assigned_to: { type: "string", format: "uuid" },
                  department_id: { type: "string", format: "uuid" },
                  sop_id: { type: "string", format: "uuid" },
                  priority: {
                    type: "string",
                    enum: ["low", "medium", "high", "urgent"],
                  },
                  due_date: { type: "string", format: "date-time" },
                  estimated_duration: { type: "string" },
                  attachments: { type: "array", items: { type: "object" } },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Task created successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    task: { $ref: "#/components/schemas/Task" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/feedback": {
      get: {
        summary: "List feedback",
        description: "Retrieve feedback with role-based filtering",
        tags: ["Feedback"],
        parameters: [
          {
            name: "user_id",
            in: "query",
            schema: { type: "string", format: "uuid" },
            description: "Filter by user ID",
          },
          {
            name: "task_id",
            in: "query",
            schema: { type: "string", format: "uuid" },
            description: "Filter by task ID",
          },
          {
            name: "period_start",
            in: "query",
            schema: { type: "string", format: "date-time" },
            description: "Filter by start date",
          },
          {
            name: "period_end",
            in: "query",
            schema: { type: "string", format: "date-time" },
            description: "Filter by end date",
          },
        ],
        responses: {
          "200": {
            description: "List of feedback",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    feedback: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Feedback" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        summary: "Create feedback",
        description: "Submit new feedback",
        tags: ["Feedback"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["subject", "content"],
                properties: {
                  subject: { type: "string" },
                  content: { type: "string" },
                  type: {
                    type: "string",
                    enum: [
                      "bug",
                      "feature",
                      "improvement",
                      "complaint",
                      "praise",
                    ],
                  },
                  priority: {
                    type: "string",
                    enum: ["low", "medium", "high", "urgent"],
                  },
                  task_id: { type: "string", format: "uuid" },
                  target_user_id: { type: "string", format: "uuid" },
                  rating: { type: "integer", minimum: 1, maximum: 5 },
                  attachments: { type: "array", items: { type: "object" } },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Feedback created successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    feedback: { $ref: "#/components/schemas/Feedback" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/audit_logs": {
      get: {
        summary: "List audit logs",
        description: "Retrieve audit logs (Admin/God only)",
        tags: ["Audit"],
        parameters: [
          {
            name: "table_name",
            in: "query",
            schema: { type: "string" },
            description: "Filter by table name",
          },
          {
            name: "action",
            in: "query",
            schema: { type: "string", enum: ["INSERT", "UPDATE", "DELETE"] },
            description: "Filter by action type",
          },
          {
            name: "user_id",
            in: "query",
            schema: { type: "string", format: "uuid" },
            description: "Filter by user ID",
          },
          {
            name: "start_date",
            in: "query",
            schema: { type: "string", format: "date-time" },
            description: "Filter by start date",
          },
          {
            name: "end_date",
            in: "query",
            schema: { type: "string", format: "date-time" },
            description: "Filter by end date",
          },
        ],
        responses: {
          "200": {
            description: "List of audit logs",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    audit_logs: {
                      type: "array",
                      items: { $ref: "#/components/schemas/AuditLog" },
                    },
                    pagination: {
                      type: "object",
                      properties: {
                        total: { type: "integer" },
                        limit: { type: "integer" },
                        offset: { type: "integer" },
                        has_more: { type: "boolean" },
                      },
                    },
                  },
                },
              },
            },
          },
          "403": {
            description: "Forbidden - Admin/God only",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },
    "/analytics": {
      get: {
        summary: "Get analytics data",
        description: "Retrieve analytics and metrics (Admin/God only)",
        tags: ["Analytics"],
        parameters: [
          {
            name: "metric_type",
            in: "query",
            schema: {
              type: "string",
              enum: [
                "task_completion",
                "user_productivity",
                "department_performance",
                "clock_sessions",
                "feedback_trends",
              ],
            },
            description: "Type of analytics to retrieve",
          },
          {
            name: "department_id",
            in: "query",
            schema: { type: "string", format: "uuid" },
            description: "Filter by department ID",
          },
          {
            name: "user_id",
            in: "query",
            schema: { type: "string", format: "uuid" },
            description: "Filter by user ID",
          },
          {
            name: "period_start",
            in: "query",
            schema: { type: "string", format: "date-time" },
            description: "Filter by start date",
          },
          {
            name: "period_end",
            in: "query",
            schema: { type: "string", format: "date-time" },
            description: "Filter by end date",
          },
        ],
        responses: {
          "200": {
            description: "Analytics data",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    analytics: { type: "object" },
                  },
                },
              },
            },
          },
          "403": {
            description: "Forbidden - Admin/God only",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },
  },
  tags: [
    {
      name: "Health",
      description: "Health check endpoints",
    },
    {
      name: "Users",
      description: "User management operations",
    },
    {
      name: "Tasks",
      description: "Task management operations",
    },
    {
      name: "SOPs",
      description: "Standard Operating Procedures",
    },
    {
      name: "Clock Sessions",
      description: "Time tracking operations",
    },
    {
      name: "Reminders",
      description: "Reminder management",
    },
    {
      name: "Feedback",
      description: "Feedback and review operations",
    },
    {
      name: "Audit",
      description: "Audit log operations",
    },
    {
      name: "Analytics",
      description: "Analytics and reporting",
    },
  ],
};

export async function GET(request: NextRequest) {
  try {
    return createSuccessResponse(openApiSpec);
  } catch (error) {
    console.error("OpenAPI spec error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to generate OpenAPI specification" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
