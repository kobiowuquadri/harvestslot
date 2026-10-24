import { NextResponse, type NextRequest } from 'next/server';

/**
 * Soft redirect for signed-out visitors. This only checks that a session cookie is present — the
 * API validates the session on every request, so this is a convenience, not an access control.
 */
export function proxy(request: NextRequest) {
  if (!request.cookies.has('hs_session')) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/app/:path*',
    '/farmer/:path*',
    '/processor/:path*',
    '/transport/:path*',
    '/coop/:path*',
    '/admin/:path*',
    '/bookings/:path*',
    '/offers/:path*',
    '/invoices/:path*',
    '/disputes/:path*',
    '/notifications/:path*',
    '/settings/:path*',
    '/organisation/:path*',
    '/reports/:path*',
  ],
};
