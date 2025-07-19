import {
  validateRequestBody,
  validateQueryParams,
  createUserSchema,
  updateUserSchema,
  createTaskSchema,
  updateTaskSchema,
  createSopSchema,
  updateSopSchema,
  clockInSchema,
  clockOutSchema,
  createReminderSchema,
  updateReminderSchema,
  createFeedbackSchema,
  updateFeedbackSchema,
  analyticsQuerySchema,
  auditLogQuerySchema,
} from "@/utils/validation";

describe("Validation Utilities", () => {
  describe("validateRequestBody", () => {
    it("should validate valid data successfully", () => {
      const validData = {
        email: "test@example.com",
        full_name: "John Doe",
      };

      const result = validateRequestBody(createUserSchema, validData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe("test@example.com");
        expect(result.data.full_name).toBe("John Doe");
      }
    });

    it("should return error for invalid data", () => {
      const invalidData = {
        email: "invalid-email",
        full_name: "",
      };

      const result = validateRequestBody(createUserSchema, invalidData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Invalid email format");
        expect(result.error).toContain("Full name is required");
      }
    });
  });

  describe("validateQueryParams", () => {
    it("should validate and transform query parameters", () => {
      const params = {
        limit: "10",
        offset: "0",
        active: "true",
      };

      const schema = analyticsQuerySchema;
      const result = validateQueryParams(schema, params);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(10);
        expect(result.data.offset).toBe(0);
      }
    });

    it("should handle array parameters", () => {
      const params = {
        tags: ["tag1", "tag2"],
      };

      const result = validateQueryParams(analyticsQuerySchema, params);

      expect(result.success).toBe(true);
    });
  });

  describe("User Schemas", () => {
    describe("createUserSchema", () => {
      it("should validate required fields", () => {
        const validUser = {
          email: "test@example.com",
          full_name: "John Doe",
        };

        const result = validateRequestBody(createUserSchema, validUser);
        expect(result.success).toBe(true);
      });

      it("should reject invalid email", () => {
        const invalidUser = {
          email: "invalid-email",
          full_name: "John Doe",
        };

        const result = validateRequestBody(createUserSchema, invalidUser);
        expect(result.success).toBe(false);
      });

      it("should validate optional fields", () => {
        const userWithOptionals = {
          email: "test@example.com",
          full_name: "John Doe",
          phone: "+1234567890",
          department_id: "123e4567-e89b-12d3-a456-426614174000",
          role_id: "123e4567-e89b-12d3-a456-426614174001",
          emergency_contact: {
            name: "Jane Doe",
            phone: "+1234567891",
            relationship: "Spouse",
          },
        };

        const result = validateRequestBody(createUserSchema, userWithOptionals);
        expect(result.success).toBe(true);
      });
    });

    describe("updateUserSchema", () => {
      it("should allow partial updates", () => {
        const partialUpdate = {
          full_name: "Jane Doe",
        };

        const result = validateRequestBody(updateUserSchema, partialUpdate);
        expect(result.success).toBe(true);
      });
    });
  });

  describe("Task Schemas", () => {
    describe("createTaskSchema", () => {
      it("should validate required title", () => {
        const validTask = {
          title: "Complete project",
        };

        const result = validateRequestBody(createTaskSchema, validTask);
        expect(result.success).toBe(true);
      });

      it("should validate priority enum", () => {
        const taskWithPriority = {
          title: "Complete project",
          priority: "high",
        };

        const result = validateRequestBody(createTaskSchema, taskWithPriority);
        expect(result.success).toBe(true);
      });

      it("should reject invalid priority", () => {
        const taskWithInvalidPriority = {
          title: "Complete project",
          priority: "invalid",
        };

        const result = validateRequestBody(
          createTaskSchema,
          taskWithInvalidPriority,
        );
        expect(result.success).toBe(false);
      });
    });

    describe("updateTaskSchema", () => {
      it("should accept overdue status", () => {
        const taskWithOverdueStatus = {
          title: "Update task",
          status: "overdue",
        };

        const result = validateRequestBody(updateTaskSchema, taskWithOverdueStatus);
        expect(result.success).toBe(true);
      });

      it("should reject invalid status", () => {
        const taskWithInvalidStatus = {
          title: "Update task",
          status: "invalid-status",
        };

        const result = validateRequestBody(updateTaskSchema, taskWithInvalidStatus);
        expect(result.success).toBe(false);
      });
    });
  });

  describe("SOP Schemas", () => {
    describe("createSopSchema", () => {
      it("should validate required fields", () => {
        const validSop = {
          title: "Safety Procedure",
          content: "Detailed safety instructions...",
        };

        const result = validateRequestBody(createSopSchema, validSop);
        expect(result.success).toBe(true);
      });

      it("should validate tags array", () => {
        const sopWithTags = {
          title: "Safety Procedure",
          content: "Detailed safety instructions...",
          tags: ["safety", "procedure", "important"],
        };

        const result = validateRequestBody(createSopSchema, sopWithTags);
        expect(result.success).toBe(true);
      });
    });
  });

  describe("Clock Session Schemas", () => {
    describe("clockInSchema", () => {
      it("should validate optional fields", () => {
        const clockInData = {
          task_id: "123e4567-e89b-12d3-a456-426614174000",
          location: "Office",
          notes: "Starting work on project",
        };

        const result = validateRequestBody(clockInSchema, clockInData);
        expect(result.success).toBe(true);
      });

      it("should allow empty object", () => {
        const result = validateRequestBody(clockInSchema, {});
        expect(result.success).toBe(true);
      });
    });
  });

  describe("Reminder Schemas", () => {
    describe("createReminderSchema", () => {
      it("should validate required fields", () => {
        const validReminder = {
          title: "Meeting Reminder",
          scheduled_for: "2024-01-01T10:00:00Z",
        };

        const result = validateRequestBody(createReminderSchema, validReminder);
        expect(result.success).toBe(true);
      });

      it("should validate datetime format", () => {
        const invalidReminder = {
          title: "Meeting Reminder",
          scheduled_for: "invalid-date",
        };

        const result = validateRequestBody(
          createReminderSchema,
          invalidReminder,
        );
        expect(result.success).toBe(false);
      });
    });
  });

  describe("Feedback Schemas", () => {
    describe("createFeedbackSchema", () => {
      it("should validate required fields", () => {
        const validFeedback = {
          subject: "Bug Report",
          content: "Found an issue with the login form",
        };

        const result = validateRequestBody(createFeedbackSchema, validFeedback);
        expect(result.success).toBe(true);
      });

      it("should validate rating range", () => {
        const feedbackWithRating = {
          subject: "Great Feature",
          content: "Love the new dashboard",
          rating: 5,
        };

        const result = validateRequestBody(
          createFeedbackSchema,
          feedbackWithRating,
        );
        expect(result.success).toBe(true);
      });

      it("should reject invalid rating", () => {
        const feedbackWithInvalidRating = {
          subject: "Great Feature",
          content: "Love the new dashboard",
          rating: 6,
        };

        const result = validateRequestBody(
          createFeedbackSchema,
          feedbackWithInvalidRating,
        );
        expect(result.success).toBe(false);
      });
    });
  });

  describe("Analytics Query Schema", () => {
    it("should validate analytics query parameters", () => {
      const validQuery = {
        metric_type: "task_completion",
        department_id: "123e4567-e89b-12d3-a456-426614174000",
        period_start: "2024-01-01T00:00:00Z",
        period_end: "2024-01-31T23:59:59Z",
        limit: 100,
        offset: 0,
      };

      const result = validateRequestBody(analyticsQuerySchema, validQuery);
      expect(result.success).toBe(true);
    });
  });

  describe("Audit Log Query Schema", () => {
    it("should validate audit log query parameters", () => {
      const validQuery = {
        table_name: "users",
        action: "UPDATE",
        user_id: "123e4567-e89b-12d3-a456-426614174000",
        start_date: "2024-01-01T00:00:00Z",
        end_date: "2024-01-31T23:59:59Z",
      };

      const result = validateRequestBody(auditLogQuerySchema, validQuery);
      expect(result.success).toBe(true);
    });

    it("should validate action enum", () => {
      const invalidQuery = {
        action: "INVALID_ACTION",
      };

      const result = validateRequestBody(auditLogQuerySchema, invalidQuery);
      expect(result.success).toBe(false);
    });
  });
});
