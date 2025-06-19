import { updateSession } from "./supabase/middleware";
import { type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
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
