import * as Sentry from "@sentry/nextjs";
import { NextRequest } from "next/server";

// Performance monitoring utilities
export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: Map<string, number[]> = new Map();

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  startTimer(operation: string): () => void {
    const startTime = Date.now();

    return () => {
      const duration = Date.now() - startTime;
      this.recordMetric(operation, duration);

      // Log slow operations
      if (duration > 5000) {
        // 5 seconds
        Sentry.addBreadcrumb({
          message: `Slow operation detected: ${operation}`,
          level: "warning",
          data: { duration, operation },
        });
      }

      // Send to Sentry as a transaction
      Sentry.withScope((scope) => {
        scope.setTag("operation", operation);
        scope.setContext("performance", {
          duration,
          operation,
          timestamp: new Date().toISOString(),
        });

        if (duration > 10000) {
          // 10 seconds - critical
          Sentry.captureMessage(
            `Critical slow operation: ${operation}`,
            "error",
          );
        } else if (duration > 5000) {
          // 5 seconds - warning
          Sentry.captureMessage(`Slow operation: ${operation}`, "warning");
        }
      });
    };
  }

  recordMetric(operation: string, value: number): void {
    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, []);
    }

    const values = this.metrics.get(operation)!;
    values.push(value);

    // Keep only last 100 measurements
    if (values.length > 100) {
      values.shift();
    }
  }

  getAverageMetric(operation: string): number {
    const values = this.metrics.get(operation);
    if (!values || values.length === 0) return 0;

    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  getMetricPercentile(operation: string, percentile: number): number {
    const values = this.metrics.get(operation);
    if (!values || values.length === 0) return 0;

    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }
}

// Error tracking utilities
export function captureApiError(
  error: Error,
  context: {
    endpoint: string;
    method: string;
    userId?: string;
    requestId?: string;
    statusCode?: number;
  },
): void {
  Sentry.withScope((scope) => {
    scope.setTag("api.endpoint", context.endpoint);
    scope.setTag("api.method", context.method);
    scope.setTag(
      "api.status_code",
      context.statusCode?.toString() || "unknown",
    );

    if (context.userId) {
      scope.setUser({ id: context.userId });
    }

    scope.setContext("api_request", {
      endpoint: context.endpoint,
      method: context.method,
      requestId: context.requestId,
      timestamp: new Date().toISOString(),
    });

    scope.setLevel("error");
    Sentry.captureException(error);
  });
}

export function captureBusinessLogicError(
  error: Error,
  context: {
    operation: string;
    userId?: string;
    entityId?: string;
    entityType?: string;
    metadata?: Record<string, any>;
  },
): void {
  Sentry.withScope((scope) => {
    scope.setTag("business_logic.operation", context.operation);

    if (context.entityType) {
      scope.setTag("business_logic.entity_type", context.entityType);
    }

    if (context.userId) {
      scope.setUser({ id: context.userId });
    }

    scope.setContext("business_logic", {
      operation: context.operation,
      entityId: context.entityId,
      entityType: context.entityType,
      metadata: context.metadata,
      timestamp: new Date().toISOString(),
    });

    scope.setLevel("error");
    Sentry.captureException(error);
  });
}

// Database monitoring
export function monitorDatabaseQuery<T>(
  queryName: string,
  queryFn: () => Promise<T>,
): Promise<T> {
  const monitor = PerformanceMonitor.getInstance();
  const endTimer = monitor.startTimer(`db_query:${queryName}`);

  return queryFn()
    .then((result) => {
      endTimer();
      return result;
    })
    .catch((error) => {
      endTimer();

      Sentry.withScope((scope) => {
        scope.setTag("database.query", queryName);
        scope.setContext("database_error", {
          query: queryName,
          timestamp: new Date().toISOString(),
        });
        scope.setLevel("error");
        Sentry.captureException(error);
      });

      throw error;
    });
}

// API endpoint monitoring wrapper
export function monitorApiEndpoint(
  endpoint: string,
  method: string,
  handler: (req: NextRequest) => Promise<Response>,
) {
  return async (req: NextRequest): Promise<Response> => {
    const monitor = PerformanceMonitor.getInstance();
    const endTimer = monitor.startTimer(`api:${method}:${endpoint}`);
    const requestId = crypto.randomUUID();

    // Add request context to Sentry
    Sentry.withScope((scope) => {
      scope.setTag("api.endpoint", endpoint);
      scope.setTag("api.method", method);
      scope.setContext("request", {
        id: requestId,
        endpoint,
        method,
        timestamp: new Date().toISOString(),
      });
    });

    try {
      const response = await handler(req);
      endTimer();

      // Log successful requests with slow response times
      const duration = monitor.getAverageMetric(`api:${method}:${endpoint}`);
      if (duration > 3000) {
        // 3 seconds
        Sentry.addBreadcrumb({
          message: `Slow API response: ${method} ${endpoint}`,
          level: "warning",
          data: { duration, endpoint, method, statusCode: response.status },
        });
      }

      return response;
    } catch (error) {
      endTimer();

      captureApiError(error as Error, {
        endpoint,
        method,
        requestId,
        statusCode: 500,
      });

      throw error;
    }
  };
}

// Health check monitoring
export function recordHealthMetric(
  service: string,
  status: "healthy" | "unhealthy" | "degraded",
  responseTime?: number,
  metadata?: Record<string, any>,
): void {
  Sentry.addBreadcrumb({
    message: `Health check: ${service}`,
    level: status === "healthy" ? "info" : "warning",
    data: {
      service,
      status,
      responseTime,
      metadata,
      timestamp: new Date().toISOString(),
    },
  });

  if (status !== "healthy") {
    Sentry.withScope((scope) => {
      scope.setTag("health_check.service", service);
      scope.setTag("health_check.status", status);
      scope.setContext("health_check", {
        service,
        status,
        responseTime,
        metadata,
        timestamp: new Date().toISOString(),
      });

      const level = status === "unhealthy" ? "error" : "warning";
      scope.setLevel(level);

      Sentry.captureMessage(`Service health check failed: ${service}`, level);
    });
  }
}

// Rate limit monitoring
export function recordRateLimitViolation(
  endpoint: string,
  clientId: string,
  limit: number,
  currentCount: number,
): void {
  Sentry.withScope((scope) => {
    scope.setTag("rate_limit.endpoint", endpoint);
    scope.setTag(
      "rate_limit.client_type",
      clientId.startsWith("user:") ? "user" : "ip",
    );
    scope.setContext("rate_limit", {
      endpoint,
      clientId: clientId.startsWith("user:") ? clientId : "ip_masked",
      limit,
      currentCount,
      timestamp: new Date().toISOString(),
    });

    scope.setLevel("warning");
    Sentry.captureMessage(`Rate limit exceeded: ${endpoint}`, "warning");
  });
}

// Export performance metrics for analytics
export function getPerformanceMetrics(): Record<string, any> {
  const monitor = PerformanceMonitor.getInstance();
  const metrics: Record<string, any> = {};

  // Get common API endpoints metrics
  const endpoints = [
    "api:GET:/api/v1/users",
    "api:POST:/api/v1/users",
    "api:GET:/api/v1/tasks",
    "api:POST:/api/v1/tasks",
    "api:POST:/api/v1/file-upload",
    "api:POST:/api/v1/notifications",
  ];

  endpoints.forEach((endpoint) => {
    metrics[endpoint] = {
      average: monitor.getAverageMetric(endpoint),
      p95: monitor.getMetricPercentile(endpoint, 95),
      p99: monitor.getMetricPercentile(endpoint, 99),
    };
  });

  return metrics;
}
