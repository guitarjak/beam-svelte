import { redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit';

// This runs on every request
export const handle: Handle = async ({ event, resolve }) => {
  const { url, cookies } = event;

  // Check if the request is for an admin route
  if (url.pathname.startsWith('/admin')) {
    // Allow access to the login page without authentication
    if (url.pathname === '/admin/login') {
      return resolve(event);
    }

    // For all other admin routes, check for the session cookie
    const adminSession = cookies.get('admin_session');

    if (!adminSession || adminSession !== '1') {
      // No valid session, redirect to login
      redirect(303, '/admin/login');
    }
  }

  // Resolve the request
  const response = await resolve(event);

  // SECURITY: Content Security Policy - balanced for SvelteKit compatibility
  // Note: SvelteKit requires unsafe-inline for both scripts and styles
  // - Scripts: Required for hydration data injection
  // - Styles: Required for component transitions and dynamic styles
  // See: https://github.com/sveltejs/kit/issues/5215
  const cspDirectives = [
    // Script sources: self + unsafe-inline (required for SvelteKit hydration)
    "script-src 'self' 'unsafe-inline'",

    // API connections: self + Beam payment API only
    "connect-src 'self' https://api.beamcheckout.com https://playground.api.beamcheckout.com",

    // Styles: self + unsafe-inline + Google Fonts
    // unsafe-inline required for SvelteKit component transitions/dynamic styles
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",

    // Fonts: self + Google Fonts CDN
    "font-src 'self' https://fonts.gstatic.com",

    // Images: self + data URIs (for QR codes)
    "img-src 'self' data:",

    // Frames: none
    "frame-src 'none'",

    // Base URI: self only (prevents base tag injection)
    "base-uri 'self'",

    // Form actions: self only (prevents form hijacking)
    "form-action 'self'",

    // Object/embed: none (no Flash, etc)
    "object-src 'none'",

    // Upgrade insecure requests in production
    // "upgrade-insecure-requests",

    // Default fallback: self only
    "default-src 'self'"
  ];

  response.headers.set('Content-Security-Policy', cspDirectives.join('; '));

  // SECURITY: Additional security headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions Policy (limit browser features)
  response.headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  return response;
};
