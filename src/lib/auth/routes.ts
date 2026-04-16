const PUBLIC_PREFIXES = ['/login', '/api/auth', '/auth'] as const;

export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
