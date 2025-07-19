
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase environment variables');
    if (req.nextUrl.pathname.startsWith('/api/')) {
      return new Response(
        JSON.stringify({ error: "Configuration error" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
    return res;
  }

  try {
    const supabase = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          getAll() {
            return req.cookies.getAll().map(({ name, value }) => ({
              name,
              value,
            }))
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              req.cookies.set(name, value)
              res.cookies.set(name, value, options)
            })
          },
        },
      }
    )

    // For API routes, add session info to headers if available
    if (req.nextUrl.pathname.startsWith('/api/')) {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        
        if (session && !error) {
          res.headers.set('x-user-id', session.user.id);
          res.headers.set('x-user-email', session.user.email || '');
        }
      } catch (error) {
        console.error('Auth session error in middleware:', error);
      }
      
      return res;
    }

    // For non-API routes, handle redirects
    const { data: { session } } = await supabase.auth.getSession()

    // If user is signed in and the current path is / redirect to /dashboard
    if (session && req.nextUrl.pathname === "/") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    // If user is not signed in and the current path is /dashboard redirect to /
    if (!session && req.nextUrl.pathname === "/dashboard") {
      return NextResponse.redirect(new URL("/", req.url));
    }

    return res;
  } catch (error) {
    console.error('Middleware error:', error);
    
    // For API routes, return JSON error
    if (req.nextUrl.pathname.startsWith('/api/')) {
      return new Response(
        JSON.stringify({ error: "Internal server error" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
    
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
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
