import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  // Handle API routes with JSON error responses
  if (req.nextUrl.pathname.startsWith('/api/')) {
    try {
      const supabase = createMiddlewareClient({ req, res });
      const {
        data: { session },
      } = await supabase.auth.getSession();

      // Add session info to headers for API routes
      if (session) {
        res.headers.set('x-user-id', session.user.id);
        res.headers.set('x-user-email', session.user.email || '');
      }

      return res;
    } catch (error) {
      console.error('Middleware error for API route:', error);
      return new Response(
        JSON.stringify({ error: "Internal server error" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }

  // Handle non-API routes
  try {
    const supabase = createMiddlewareClient({ req, res });
    const {
      data: { session },
    } = await supabase.auth.getSession();

    // If user is signed in and the current path is / redirect the user to /dashboard
    if (session && req.nextUrl.pathname === "/") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    // If user is not signed in and the current path is /dashboard redirect the user to /
    if (!session && req.nextUrl.pathname === "/dashboard") {
      return NextResponse.redirect(new URL("/", req.url));
    }

    return res;
  } catch (error) {
    console.error('Middleware error:', error);
    return res;
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};