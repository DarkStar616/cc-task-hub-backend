import { AuthContext } from "./auth";
import { logAuditEntry, SENSITIVE_ACTIONS } from "./audit-log";

export interface NotificationProvider {
  name: string;
  send: (payload: NotificationPayload) => Promise<NotificationResult>;
  validateConfig: () => boolean;
}

export interface NotificationPayload {
  recipient: {
    user_id?: string;
    phone?: string;
    email?: string;
    name?: string;
  };
  message: {
    subject?: string;
    body: string;
    template_id?: string;
    variables?: Record<string, string>;
  };
  priority?: "low" | "normal" | "high" | "urgent";
  metadata?: Record<string, any>;
}

export interface NotificationResult {
  success: boolean;
  provider: string;
  message_id?: string;
  error?: string;
  delivery_status?: "sent" | "delivered" | "failed" | "pending";
  cost?: number;
  metadata?: Record<string, any>;
}

// Rate limiting store (in production, use Redis or database)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

// Rate limiting configuration
const RATE_LIMITS = {
  PER_USER_PER_HOUR: 50,
  PER_USER_PER_DAY: 200,
  PER_ENDPOINT_PER_MINUTE: 100,
} as const;

export class RateLimiter {
  static checkUserLimit(userId: string): {
    allowed: boolean;
    resetTime?: number;
  } {
    const hourKey = `user:${userId}:hour:${Math.floor(Date.now() / (60 * 60 * 1000))}`;
    const dayKey = `user:${userId}:day:${Math.floor(Date.now() / (24 * 60 * 60 * 1000))}`;

    const hourLimit = rateLimitStore.get(hourKey) || {
      count: 0,
      resetTime: Date.now() + 60 * 60 * 1000,
    };
    const dayLimit = rateLimitStore.get(dayKey) || {
      count: 0,
      resetTime: Date.now() + 24 * 60 * 60 * 1000,
    };

    if (hourLimit.count >= RATE_LIMITS.PER_USER_PER_HOUR) {
      return { allowed: false, resetTime: hourLimit.resetTime };
    }

    if (dayLimit.count >= RATE_LIMITS.PER_USER_PER_DAY) {
      return { allowed: false, resetTime: dayLimit.resetTime };
    }

    // Increment counters
    rateLimitStore.set(hourKey, { ...hourLimit, count: hourLimit.count + 1 });
    rateLimitStore.set(dayKey, { ...dayLimit, count: dayLimit.count + 1 });

    return { allowed: true };
  }

  static checkEndpointLimit(): { allowed: boolean; resetTime?: number } {
    const key = `endpoint:notifications:${Math.floor(Date.now() / (60 * 1000))}`;
    const limit = rateLimitStore.get(key) || {
      count: 0,
      resetTime: Date.now() + 60 * 1000,
    };

    if (limit.count >= RATE_LIMITS.PER_ENDPOINT_PER_MINUTE) {
      return { allowed: false, resetTime: limit.resetTime };
    }

    rateLimitStore.set(key, { ...limit, count: limit.count + 1 });
    return { allowed: true };
  }

  // Clean up expired entries (call periodically)
  static cleanup(): void {
    const now = Date.now();
    for (const [key, value] of rateLimitStore.entries()) {
      if (value.resetTime < now) {
        rateLimitStore.delete(key);
      }
    }
  }
}

// WhatsApp Provider Implementation
export class WhatsAppProvider implements NotificationProvider {
  name = "whatsapp";
  private apiKey: string;
  private baseUrl: string;
  private mockMode: boolean;

  constructor() {
    this.apiKey = process.env.WHATSAPP_API_KEY || "";
    this.baseUrl =
      process.env.WHATSAPP_API_URL || "https://api.whatsapp.com/v1";
    this.mockMode =
      process.env.NODE_ENV === "development" ||
      process.env.WHATSAPP_MOCK_MODE === "true";
  }

  validateConfig(): boolean {
    if (this.mockMode) return true;
    return !!this.apiKey && !!this.baseUrl;
  }

  async send(payload: NotificationPayload): Promise<NotificationResult> {
    try {
      // Mock mode for development/testing
      if (this.mockMode) {
        console.log("[MOCK] WhatsApp notification:", {
          to: payload.recipient.phone,
          message: payload.message.body,
          priority: payload.priority,
        });

        return {
          success: true,
          provider: this.name,
          message_id: `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          delivery_status: "sent",
          metadata: { mock: true },
        };
      }

      // Validate phone number
      if (!payload.recipient.phone) {
        throw new Error("Phone number is required for WhatsApp notifications");
      }

      // Format phone number (remove non-digits, ensure country code)
      const phone = this.formatPhoneNumber(payload.recipient.phone);

      // Prepare WhatsApp API request
      const requestBody = {
        to: phone,
        type: "text",
        text: {
          body: payload.message.body,
        },
        ...(payload.priority === "urgent" && { priority: "high" }),
      };

      const response = await fetch(`${this.baseUrl}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(
          `WhatsApp API error: ${responseData.error?.message || "Unknown error"}`,
        );
      }

      return {
        success: true,
        provider: this.name,
        message_id: responseData.messages?.[0]?.id,
        delivery_status: "sent",
        metadata: {
          whatsapp_message_id: responseData.messages?.[0]?.id,
          phone: phone,
        },
      };
    } catch (error) {
      return {
        success: false,
        provider: this.name,
        error: error instanceof Error ? error.message : "Unknown error",
        delivery_status: "failed",
      };
    }
  }

  private formatPhoneNumber(phone: string): string {
    // Remove all non-digit characters
    const digits = phone.replace(/\D/g, "");

    // If it doesn't start with country code, assume US (+1)
    if (digits.length === 10) {
      return `1${digits}`;
    }

    return digits;
  }
}

// Email Provider (Placeholder)
export class EmailProvider implements NotificationProvider {
  name = "email";
  private apiKey: string;
  private mockMode: boolean;

  constructor() {
    this.apiKey = process.env.EMAIL_API_KEY || "";
    this.mockMode =
      process.env.NODE_ENV === "development" ||
      process.env.EMAIL_MOCK_MODE === "true";
  }

  validateConfig(): boolean {
    if (this.mockMode) return true;
    return !!this.apiKey;
  }

  async send(payload: NotificationPayload): Promise<NotificationResult> {
    try {
      if (this.mockMode) {
        console.log("[MOCK] Email notification:", {
          to: payload.recipient.email,
          subject: payload.message.subject,
          body: payload.message.body,
        });

        return {
          success: true,
          provider: this.name,
          message_id: `mock_email_${Date.now()}`,
          delivery_status: "sent",
          metadata: { mock: true },
        };
      }

      // TODO: Implement actual email provider (SendGrid, AWS SES, etc.)
      throw new Error("Email provider not yet implemented");
    } catch (error) {
      return {
        success: false,
        provider: this.name,
        error: error instanceof Error ? error.message : "Unknown error",
        delivery_status: "failed",
      };
    }
  }
}

// SMS Provider (Placeholder)
export class SMSProvider implements NotificationProvider {
  name = "sms";
  private apiKey: string;
  private mockMode: boolean;

  constructor() {
    this.apiKey = process.env.SMS_API_KEY || "";
    this.mockMode =
      process.env.NODE_ENV === "development" ||
      process.env.SMS_MOCK_MODE === "true";
  }

  validateConfig(): boolean {
    if (this.mockMode) return true;
    return !!this.apiKey;
  }

  async send(payload: NotificationPayload): Promise<NotificationResult> {
    try {
      if (this.mockMode) {
        console.log("[MOCK] SMS notification:", {
          to: payload.recipient.phone,
          message: payload.message.body,
        });

        return {
          success: true,
          provider: this.name,
          message_id: `mock_sms_${Date.now()}`,
          delivery_status: "sent",
          metadata: { mock: true },
        };
      }

      // TODO: Implement actual SMS provider (Twilio, AWS SNS, etc.)
      throw new Error("SMS provider not yet implemented");
    } catch (error) {
      return {
        success: false,
        provider: this.name,
        error: error instanceof Error ? error.message : "Unknown error",
        delivery_status: "failed",
      };
    }
  }
}

// Notification Service
export class NotificationService {
  private providers: Map<string, NotificationProvider> = new Map();

  constructor() {
    this.providers.set("whatsapp", new WhatsAppProvider());
    this.providers.set("email", new EmailProvider());
    this.providers.set("sms", new SMSProvider());
  }

  getProvider(type: string): NotificationProvider | undefined {
    return this.providers.get(type);
  }

  async sendNotification(
    authContext: AuthContext,
    type: string,
    payload: NotificationPayload,
    request?: Request,
  ): Promise<NotificationResult> {
    const provider = this.getProvider(type);

    if (!provider) {
      const result: NotificationResult = {
        success: false,
        provider: type,
        error: `Unsupported notification type: ${type}`,
        delivery_status: "failed",
      };

      await this.logNotificationAttempt(authContext, payload, result, request);
      return result;
    }

    if (!provider.validateConfig()) {
      const result: NotificationResult = {
        success: false,
        provider: type,
        error: `${type} provider not properly configured`,
        delivery_status: "failed",
      };

      await this.logNotificationAttempt(authContext, payload, result, request);
      return result;
    }

    const result = await provider.send(payload);
    await this.logNotificationAttempt(authContext, payload, result, request);

    return result;
  }

  private async logNotificationAttempt(
    authContext: AuthContext,
    payload: NotificationPayload,
    result: NotificationResult,
    request?: Request,
  ): Promise<void> {
    try {
      await logAuditEntry(
        authContext,
        {
          table_name: "notifications",
          record_id: result.message_id || `failed_${Date.now()}`,
          action: "INSERT",
          new_values: {
            provider: result.provider,
            recipient: payload.recipient,
            message: payload.message,
            success: result.success,
            error: result.error,
            delivery_status: result.delivery_status,
            message_id: result.message_id,
            cost: result.cost,
            metadata: {
              ...payload.metadata,
              ...result.metadata,
            },
            _sensitive_action: "notification_sent",
          },
        },
        request,
      );
    } catch (error) {
      console.error("Failed to log notification attempt:", error);
    }
  }
}

// Singleton instance
export const notificationService = new NotificationService();

// Utility functions for recipient resolution
export async function resolveRecipients(
  authContext: AuthContext,
  recipients: Array<{
    user_id?: string;
    phone?: string;
    email?: string;
    department_id?: string;
  }>,
): Promise<
  Array<{
    user_id?: string;
    phone?: string;
    email?: string;
    name?: string;
  }>
> {
  const { supabase } = authContext;
  const resolvedRecipients: Array<{
    user_id?: string;
    phone?: string;
    email?: string;
    name?: string;
  }> = [];

  for (const recipient of recipients) {
    if (recipient.user_id) {
      // Resolve user by ID
      const { data: user } = await supabase
        .from("users")
        .select("id, email, phone, full_name")
        .eq("id", recipient.user_id)
        .single();

      if (user) {
        resolvedRecipients.push({
          user_id: user.id,
          phone: user.phone || undefined,
          email: user.email || undefined,
          name: user.full_name || undefined,
        });
      }
    } else if (recipient.department_id) {
      // Resolve all users in department
      const { data: users } = await supabase
        .from("users")
        .select("id, email, phone, full_name")
        .eq("department_id", recipient.department_id);

      if (users) {
        for (const user of users) {
          resolvedRecipients.push({
            user_id: user.id,
            phone: user.phone || undefined,
            email: user.email || undefined,
            name: user.full_name || undefined,
          });
        }
      }
    } else {
      // Direct phone/email
      resolvedRecipients.push({
        phone: recipient.phone,
        email: recipient.email,
      });
    }
  }

  return resolvedRecipients;
}

// Permission checking for notifications
export async function canNotifyRecipients(
  authContext: AuthContext,
  recipients: Array<{
    user_id?: string;
    phone?: string;
    email?: string;
    department_id?: string;
  }>,
): Promise<{ allowed: boolean; reason?: string }> {
  const { user } = authContext;

  if (!user) {
    return { allowed: false, reason: "User not authenticated" };
  }

  // God role can notify anyone
  if (user.role === "God") {
    return { allowed: true };
  }

  // Admin can notify anyone
  if (user.role === "Admin") {
    return { allowed: true };
  }

  // Manager can notify users in their department
  if (user.role === "Manager") {
    for (const recipient of recipients) {
      if (
        recipient.department_id &&
        recipient.department_id !== user.department_id
      ) {
        return {
          allowed: false,
          reason: "Cannot notify users outside your department",
        };
      }

      if (recipient.user_id) {
        // Check if user is in same department
        const { data: targetUser } = await authContext.supabase
          .from("users")
          .select("department_id")
          .eq("id", recipient.user_id)
          .single();

        if (targetUser && targetUser.department_id !== user.department_id) {
          return {
            allowed: false,
            reason: "Cannot notify users outside your department",
          };
        }
      }
    }
    return { allowed: true };
  }

  // Regular users can only notify themselves
  if (user.role === "User") {
    for (const recipient of recipients) {
      if (recipient.user_id && recipient.user_id !== user.id) {
        return {
          allowed: false,
          reason: "Can only send notifications to yourself",
        };
      }
      if (recipient.department_id) {
        return {
          allowed: false,
          reason: "Cannot send department-wide notifications",
        };
      }
    }
    return { allowed: true };
  }

  return { allowed: false, reason: "Insufficient permissions" };
}
