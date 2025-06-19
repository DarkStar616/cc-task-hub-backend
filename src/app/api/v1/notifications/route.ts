import { NextRequest } from "next/server";
import {
  getAuthContext,
  hasRole,
  createUnauthorizedResponse,
  createForbiddenResponse,
  createBadRequestResponse,
  createSuccessResponse,
  createErrorResponse,
} from "@/utils/auth";
import { validateRequestBody } from "@/utils/validation";
import {
  sendNotificationSchema,
  SendNotificationRequest,
} from "@/utils/validation";
import {
  notificationService,
  RateLimiter,
  resolveRecipients,
  canNotifyRecipients,
  NotificationResult,
} from "@/utils/notification-service";
import { logSensitiveAction, SENSITIVE_ACTIONS } from "@/utils/audit-log";

/**
 * POST /api/v1/notifications
 * Send notifications via WhatsApp, Email, or SMS
 *
 * Requires authentication and appropriate role permissions.
 * Supports rate limiting and comprehensive audit logging.
 */
export async function POST(request: NextRequest) {
  try {
    // Get authentication context
    const authContext = await getAuthContext(request);

    if (!authContext.user) {
      return createUnauthorizedResponse("Authentication required");
    }

    // Check if user has permission to send notifications
    if (!hasRole(authContext.user.role, ["User", "Manager", "Admin", "God"])) {
      return createForbiddenResponse(
        "Insufficient permissions to send notifications",
      );
    }

    // Rate limiting checks
    const userRateLimit = RateLimiter.checkUserLimit(authContext.user.id);
    if (!userRateLimit.allowed) {
      return createErrorResponse(
        `Rate limit exceeded. Try again after ${new Date(userRateLimit.resetTime!).toISOString()}`,
        429,
      );
    }

    const endpointRateLimit = RateLimiter.checkEndpointLimit();
    if (!endpointRateLimit.allowed) {
      return createErrorResponse(
        "Service temporarily unavailable due to high load. Please try again later.",
        503,
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validation = validateRequestBody(sendNotificationSchema, body);

    if (!validation.success) {
      return createBadRequestResponse(`Validation error: ${validation.error}`);
    }

    const notificationRequest: SendNotificationRequest = validation.data;

    // Check permissions for recipients
    const permissionCheck = await canNotifyRecipients(
      authContext,
      notificationRequest.recipients,
    );

    if (!permissionCheck.allowed) {
      return createForbiddenResponse(
        permissionCheck.reason || "Cannot notify specified recipients",
      );
    }

    // Resolve recipients to actual contact information
    const resolvedRecipients = await resolveRecipients(
      authContext,
      notificationRequest.recipients,
    );

    if (resolvedRecipients.length === 0) {
      return createBadRequestResponse("No valid recipients found");
    }

    // Send notifications to all recipients
    const results: NotificationResult[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (const recipient of resolvedRecipients) {
      // Validate recipient has required contact method
      const hasContactMethod =
        (notificationRequest.type === "whatsapp" && recipient.phone) ||
        (notificationRequest.type === "email" && recipient.email) ||
        (notificationRequest.type === "sms" && recipient.phone);

      if (!hasContactMethod) {
        const result: NotificationResult = {
          success: false,
          provider: notificationRequest.type,
          error: `Recipient missing required contact method for ${notificationRequest.type}`,
          delivery_status: "failed",
        };
        results.push(result);
        failureCount++;
        continue;
      }

      // Send notification
      const result = await notificationService.sendNotification(
        authContext,
        notificationRequest.type,
        {
          recipient,
          message: notificationRequest.message,
          priority: notificationRequest.priority,
          metadata: {
            ...notificationRequest.metadata,
            sender_id: authContext.user.id,
            sender_role: authContext.user.role,
            request_id: crypto.randomUUID(),
          },
        },
        request,
      );

      results.push(result);

      if (result.success) {
        successCount++;
      } else {
        failureCount++;
      }
    }

    // Log the notification batch as a sensitive action
    await logSensitiveAction(
      authContext,
      "notification_batch_sent" as any,
      {
        tableName: "notifications",
        recordId: crypto.randomUUID(),
        newValues: {
          type: notificationRequest.type,
          recipient_count: resolvedRecipients.length,
          success_count: successCount,
          failure_count: failureCount,
          message_preview: notificationRequest.message.body.substring(0, 100),
        },
        metadata: {
          results: results.map((r) => ({
            success: r.success,
            provider: r.provider,
            message_id: r.message_id,
            error: r.error,
          })),
        },
      },
      request,
    );

    // Prepare response
    const response = {
      success: successCount > 0,
      message: `Sent ${successCount} notifications successfully, ${failureCount} failed`,
      summary: {
        total: resolvedRecipients.length,
        successful: successCount,
        failed: failureCount,
        type: notificationRequest.type,
      },
      results: results.map((result) => ({
        success: result.success,
        provider: result.provider,
        message_id: result.message_id,
        delivery_status: result.delivery_status,
        error: result.error,
        // Don't expose sensitive metadata in response
      })),
      rate_limit: {
        user_remaining: Math.max(0, 50 - (userRateLimit as any).count || 0),
        reset_time: userRateLimit.resetTime,
      },
    };

    // Return appropriate status code
    if (successCount === 0) {
      return createErrorResponse("All notifications failed to send", 500);
    } else if (failureCount > 0) {
      return createSuccessResponse(response, 207); // Multi-status
    } else {
      return createSuccessResponse(response, 200);
    }
  } catch (error) {
    console.error("Notification endpoint error:", error);

    // Log the error
    try {
      const authContext = await getAuthContext(request);
      await logSensitiveAction(
        authContext,
        "notification_error" as any,
        {
          tableName: "notifications",
          recordId: crypto.randomUUID(),
          newValues: {
            error: error instanceof Error ? error.message : "Unknown error",
            stack: error instanceof Error ? error.stack : undefined,
          },
        },
        request,
      );
    } catch (logError) {
      console.error("Failed to log notification error:", logError);
    }

    return createErrorResponse(
      "Internal server error while processing notification request",
      500,
    );
  }
}

/**
 * GET /api/v1/notifications
 * Get notification status and configuration info
 */
export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext(request);

    if (!authContext.user) {
      return createUnauthorizedResponse("Authentication required");
    }

    // Only allow managers and above to view notification status
    if (!hasRole(authContext.user.role, ["Manager", "Admin", "God"])) {
      return createForbiddenResponse("Insufficient permissions");
    }

    // Get provider status
    const providers = {
      whatsapp: {
        available:
          notificationService.getProvider("whatsapp")?.validateConfig() ||
          false,
        mock_mode:
          process.env.NODE_ENV === "development" ||
          process.env.WHATSAPP_MOCK_MODE === "true",
      },
      email: {
        available:
          notificationService.getProvider("email")?.validateConfig() || false,
        mock_mode:
          process.env.NODE_ENV === "development" ||
          process.env.EMAIL_MOCK_MODE === "true",
      },
      sms: {
        available:
          notificationService.getProvider("sms")?.validateConfig() || false,
        mock_mode:
          process.env.NODE_ENV === "development" ||
          process.env.SMS_MOCK_MODE === "true",
      },
    };

    // Get rate limit info
    const userRateLimit = RateLimiter.checkUserLimit(authContext.user.id);
    const endpointRateLimit = RateLimiter.checkEndpointLimit();

    const response = {
      providers,
      rate_limits: {
        per_user_per_hour: 50,
        per_user_per_day: 200,
        per_endpoint_per_minute: 100,
        user_status: {
          allowed: userRateLimit.allowed,
          reset_time: userRateLimit.resetTime,
        },
        endpoint_status: {
          allowed: endpointRateLimit.allowed,
          reset_time: endpointRateLimit.resetTime,
        },
      },
      supported_types: ["whatsapp", "email", "sms"],
      user_permissions: {
        role: authContext.user.role,
        can_notify_department: hasRole(authContext.user.role, [
          "Manager",
          "Admin",
          "God",
        ]),
        can_notify_all: hasRole(authContext.user.role, ["Admin", "God"]),
      },
    };

    return createSuccessResponse(response);
  } catch (error) {
    console.error("Notification status endpoint error:", error);
    return createErrorResponse("Internal server error", 500);
  }
}
