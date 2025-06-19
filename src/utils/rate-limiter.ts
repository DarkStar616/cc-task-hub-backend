import { NextRequest } from "next/server";
import { logAuditEntry, AuthContext } from "./audit-log";

// Rate limit configuration
interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  keyGenerator?: (req: NextRequest) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

// In-memory store for rate limiting (use Redis in production)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

// Default rate limit configurations
const RATE_LIMIT_CONFIGS: Record<string, RateLimitConfig> = {
  // Authentication endpoints - stricter limits
  "/api/auth/sign-in": {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_AUTH_MAX || "5"),
  },
  "/api/auth/sign-up": {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: parseInt(process.env.RATE_LIMIT_SIGNUP_MAX || "3"),
  },
  "/api/auth/forgot-password": {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: parseInt(process.env.RATE_LIMIT_PASSWORD_RESET_MAX || "3"),
  },

  // File upload endpoints
  "/api/v1/file-upload": {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: parseInt(process.env.RATE_LIMIT_FILE_UPLOAD_MAX || "10"),
  },

  // Notification endpoints
  "/api/v1/notifications": {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: parseInt(process.env.RATE_LIMIT_NOTIFICATIONS_MAX || "20"),
  },

  // General API endpoints
  "/api/v1/users": {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: parseInt(process.env.RATE_LIMIT_USERS_MAX || "30"),
  },
  "/api/v1/tasks": {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: parseInt(process.env.RATE_LIMIT_TASKS_MAX || "50"),
  },
  "/api/v1/sops": {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: parseInt(process.env.RATE_LIMIT_SOPS_MAX || "30"),
  },
  "/api/v1/feedback": {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: parseInt(process.env.RATE_LIMIT_FEEDBACK_MAX || "20"),
  },
  "/api/v1/reminders": {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: parseInt(process.env.RATE_LIMIT_REMINDERS_MAX || "25"),
  },
  "/api/v1/clock_sessions": {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: parseInt(process.env.RATE_LIMIT_CLOCK_MAX || "15"),
  },
  "/api/v1/analytics": {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: parseInt(process.env.RATE_LIMIT_ANALYTICS_MAX || "10"),
  },
  "/api/v1/audit_logs": {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: parseInt(process.env.RATE_LIMIT_AUDIT_MAX || "10"),
  },
};

// Default fallback rate limit
const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: parseInt(process.env.RATE_LIMIT_DEFAULT_MAX || "100"),
};

function getClientIdentifier(req: NextRequest): string {
  // Try to get user ID from auth context first
  const authHeader = req.headers.get("authorization");
  if (authHeader) {
    // Extract user ID from JWT token if possible
    try {
      const token = authHeader.replace("Bearer ", "");
      const payload = JSON.parse(atob(token.split(".")[1]));
      if (payload.sub) {
        return `user:${payload.sub}`;
      }
    } catch (error) {
      // Fallback to IP-based limiting
    }
  }

  // Fallback to IP address
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded
    ? forwarded.split(",")[0]
    : req.headers.get("x-real-ip") || "unknown";
  return `ip:${ip}`;
}

function getRateLimitKey(endpoint: string, clientId: string): string {
  return `ratelimit:${endpoint}:${clientId}`;
}

function cleanupExpiredEntries(): void {
  const now = Date.now();
  for (const [key, value] of rateLimitStore.entries()) {
    if (now > value.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
}

export async function checkRateLimit(
  req: NextRequest,
  endpoint: string,
  authContext?: AuthContext,
): Promise<RateLimitResult> {
  // Clean up expired entries periodically
  if (Math.random() < 0.01) {
    // 1% chance
    cleanupExpiredEntries();
  }

  const config = RATE_LIMIT_CONFIGS[endpoint] || DEFAULT_RATE_LIMIT;
  const clientId = config.keyGenerator
    ? config.keyGenerator(req)
    : getClientIdentifier(req);
  const key = getRateLimitKey(endpoint, clientId);

  const now = Date.now();
  const windowStart = now - config.windowMs;

  let entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetTime) {
    // Create new entry or reset expired entry
    entry = {
      count: 0,
      resetTime: now + config.windowMs,
    };
  }

  const allowed = entry.count < config.maxRequests;

  if (allowed) {
    entry.count++;
    rateLimitStore.set(key, entry);
  } else {
    // Log rate limit violation
    if (authContext) {
      await logAuditEntry(
        authContext,
        {
          table_name: "rate_limits",
          record_id: key,
          action: "INSERT",
          new_values: {
            endpoint,
            client_id: clientId,
            limit_exceeded: true,
            current_count: entry.count,
            max_requests: config.maxRequests,
            window_ms: config.windowMs,
          },
        },
        req,
      );
    }
  }

  return {
    allowed,
    limit: config.maxRequests,
    remaining: Math.max(0, config.maxRequests - entry.count),
    resetTime: entry.resetTime,
    retryAfter: allowed ? undefined : Math.ceil((entry.resetTime - now) / 1000),
  };
}

export function createRateLimitResponse(result: RateLimitResult): Response {
  const headers = new Headers({
    "Content-Type": "application/json",
    "X-RateLimit-Limit": result.limit.toString(),
    "X-RateLimit-Remaining": result.remaining.toString(),
    "X-RateLimit-Reset": new Date(result.resetTime).toISOString(),
  });

  if (result.retryAfter) {
    headers.set("Retry-After", result.retryAfter.toString());
  }

  return new Response(
    JSON.stringify({
      error: "Rate limit exceeded",
      message: `Too many requests. Try again in ${result.retryAfter} seconds.`,
      limit: result.limit,
      remaining: result.remaining,
      resetTime: new Date(result.resetTime).toISOString(),
    }),
    {
      status: 429,
      headers,
    },
  );
}

// Middleware helper to apply rate limiting
export async function withRateLimit(
  req: NextRequest,
  endpoint: string,
  handler: () => Promise<Response>,
  authContext?: AuthContext,
): Promise<Response> {
  const rateLimitResult = await checkRateLimit(req, endpoint, authContext);

  if (!rateLimitResult.allowed) {
    return createRateLimitResponse(rateLimitResult);
  }

  const response = await handler();

  // Add rate limit headers to successful responses
  response.headers.set("X-RateLimit-Limit", rateLimitResult.limit.toString());
  response.headers.set(
    "X-RateLimit-Remaining",
    rateLimitResult.remaining.toString(),
  );
  response.headers.set(
    "X-RateLimit-Reset",
    new Date(rateLimitResult.resetTime).toISOString(),
  );

  return response;
}

// Rate limit configurations for different user roles
export const ROLE_BASED_LIMITS: Record<
  string,
  Partial<Record<string, RateLimitConfig>>
> = {
  God: {
    // God role gets higher limits
    "/api/v1/users": { windowMs: 60 * 1000, maxRequests: 100 },
    "/api/v1/tasks": { windowMs: 60 * 1000, maxRequests: 200 },
  },
  Admin: {
    // Admin role gets higher limits
    "/api/v1/users": { windowMs: 60 * 1000, maxRequests: 75 },
    "/api/v1/tasks": { windowMs: 60 * 1000, maxRequests: 150 },
  },
  Manager: {
    // Manager role gets moderate limits
    "/api/v1/users": { windowMs: 60 * 1000, maxRequests: 50 },
    "/api/v1/tasks": { windowMs: 60 * 1000, maxRequests: 100 },
  },
  // User and Guest use default limits
};

export function getRateLimitConfigForUser(
  endpoint: string,
  userRole?: string,
): RateLimitConfig {
  if (userRole && ROLE_BASED_LIMITS[userRole]?.[endpoint]) {
    return { ...DEFAULT_RATE_LIMIT, ...ROLE_BASED_LIMITS[userRole][endpoint] };
  }
  return RATE_LIMIT_CONFIGS[endpoint] || DEFAULT_RATE_LIMIT;
}
