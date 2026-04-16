import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from '@/lib/auth.config';
import { isPublicRoute } from '@/lib/auth/routes';

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (isPublicRoute(pathname)) return NextResponse.next();

  if (!req.auth) {
    const loginUrl = new URL('/login', req.nextUrl.origin);
    if (pathname !== '/') loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
