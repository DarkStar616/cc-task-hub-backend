import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function middleware(request: NextRequest) {
  try {
    // Get the auth token from the request
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ||
                 request.cookies.get('sb-access-token')?.value

    // For API routes, validate the token if present
    if (request.nextUrl.pathname.startsWith('/api/v1/')) {
      // Allow health check and OpenAPI docs without auth
      if (request.nextUrl.pathname === '/api/v1/health' || 
          request.nextUrl.pathname === '/api/openapi') {
        return NextResponse.next()
      }

      // For all other API routes, require valid auth
      if (!token) {
        return NextResponse.json({
          success: false,
          message: 'Authentication required',
          error: 'Missing authorization token'
        }, { status: 401 })
      }

      // Validate token with Supabase
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!
      )

      const { data: { user }, error } = await supabase.auth.getUser(token)

      if (error || !user) {
        return NextResponse.json({
          success: false,
          message: 'Invalid authentication token',
          error: 'Token validation failed'
        }, { status: 401 })
      }

      // Add user info to headers for the API route
      const response = NextResponse.next()
      response.headers.set('x-user-id', user.id)
      response.headers.set('x-user-email', user.email || '')
      return response
    }

    return NextResponse.next()
  } catch (error) {
    console.error('Middleware error:', error)
    return NextResponse.json({
      success: false,
      message: 'Authentication middleware error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
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