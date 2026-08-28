import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/register'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path)) || pathname.startsWith('/_next')) {
    return NextResponse.next();
  }

  const hasAccessToken = request.cookies.has('learnai_access_token');
  if (!hasAccessToken) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/courses/:path*',
    '/assessments/:path*',
    '/results/:path*',
    '/progress/:path*',
    '/recommendations/:path*',
    '/ai-assistant/:path*',
    '/instructor/:path*',
    '/admin/:path*',
  ],
};
