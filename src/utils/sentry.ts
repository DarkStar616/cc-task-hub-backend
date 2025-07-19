
import * as Sentry from "@sentry/nextjs";

export function initSentry() {
  if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 0.1,
      environment: process.env.NODE_ENV,
      beforeSend(event) {
        // Filter out sensitive data
        if (event.request?.headers) {
          delete event.request.headers.authorization;
          delete event.request.headers.cookie;
        }
        return event;
      },
    });
  }
}

export function logError(error: Error, context?: Record<string, any>) {
  console.error('Error:', error, context);
  
  if (process.env.NODE_ENV === 'production') {
    Sentry.withScope(scope => {
      if (context) {
        Object.keys(context).forEach(key => {
          scope.setTag(key, context[key]);
        });
      }
      Sentry.captureException(error);
    });
  }
}

export function logCriticalAction(action: string, details: Record<string, any>) {
  console.log(`Critical Action: ${action}`, details);
  
  if (process.env.NODE_ENV === 'production') {
    Sentry.addBreadcrumb({
      message: action,
      category: 'critical-action',
      data: details,
      level: 'info',
    });
  }
}
