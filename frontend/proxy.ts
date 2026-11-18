import { NextResponse, type NextRequest } from 'next/server';

/**
 * Next 16 renamed the `middleware` convention to `proxy`.
 *
 * This only checks whether a session cookie is *present* — it deliberately does
 * not verify the JWT, because the signing secret belongs to the API and should
 * not be duplicated here. Real authorisation happens on every API call; this is
 * just to avoid flashing an empty dashboard at a logged-out visitor.
 */
const COOKIE_NAME = 'pulsecheck_token'; // must match COOKIE_NAME in backend/.env

export default function proxy(request: NextRequest) {
  const hasSession = request.cookies.has(COOKIE_NAME);
  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname === '/login' || pathname === '/register';

  if (!hasSession && !isAuthRoute) {
    const target = new URL('/login', request.url);
    if (pathname !== '/') target.searchParams.set('next', pathname);
    return NextResponse.redirect(target);
  }

  if (hasSession && isAuthRoute) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/login', '/register', '/dashboard/:path*', '/monitors/:path*'],
};
