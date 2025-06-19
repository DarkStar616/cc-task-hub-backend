import { updateSession } from "./supabase/middleware";
import { type NextRequest, NextResponse } from "next/server";
import {
  checkRateLimit,
  createRateLimitResponse,
} from "./src/utils/rate-limiter";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Apply rate limiting to API routes
  if (pathname.startsWith("/api/")) {
    // Skip rate limiting for health checks and internal routes
    if (
      pathname === "/api/health" ||
      pathname.startsWith("/api/auth/callback")
    ) {
      return await updateSession(request);
    }

    // Check rate limit for API endpoints
    const rateLimitResult = await checkRateLimit(request, pathname);

    if (!rateLimitResult.allowed) {
      return createRateLimitResponse(rateLimitResult);
    }

    // Continue with session update and add rate limit headers
    const response = await updateSession(request);

    if (response) {
      response.headers.set(
        "X-RateLimit-Limit",
        rateLimitResult.limit.toString(),
      );
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
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images - .svg, .png, .jpg, .jpeg, .gif, .webp
     * - api routes
     * - tempo routes
     */
    "/((?!_next/static|_next/image|favicon.ico|api|tempobook|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
