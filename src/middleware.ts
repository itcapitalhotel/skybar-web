import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Edge middleware — blocks sensitive routes in production and adds baseline headers.
 * Auth itself stays client-side (JWT in storage) because the POS uses Bearer tokens.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProd = process.env.NODE_ENV === 'production';

  // Dev-only TCP probe must never be reachable in production builds
  if (isProd && pathname.startsWith('/api/dev')) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }

  // Internal API documentation page — hide from production deployments
  if (isProd && (pathname === '/api-spec' || pathname.startsWith('/api-spec/'))) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  const response = NextResponse.next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return response;
}

export const config = {
  matcher: [
    '/api/dev/:path*',
    '/api-spec',
    '/api-spec/:path*',
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
