/**
 * Lightweight client-side cookie helpers.
 *
 * Known simplification (documented in the README): tokens are stored in
 * regular (non-httpOnly) cookies set from client-side JS, rather than
 * httpOnly cookies set by the API's Set-Cookie header. A production system
 * spanning two origins would have the API set httpOnly, SameSite=strict
 * cookies directly. Here it keeps the API a plain JSON REST service (easier
 * to document/test/curl) while still letting `middleware.ts` do a presence
 * check on protected routes.
 */

export function setCookie(name: string, value: string, maxAgeSeconds: number) {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; samesite=lax`;
}

export function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function removeCookie(name: string) {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=; path=/; max-age=0`;
}
