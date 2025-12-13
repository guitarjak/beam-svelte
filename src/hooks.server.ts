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

  // SECURITY: Add Content Security Policy headers
  // Restrict script sources, API connections, and frame sources
  const cspDirectives = [
    // Script sources: self + inline (for SvelteKit hydration)
    // TODO: Remove 'unsafe-inline' by extracting inline scripts to separate files
    "script-src 'self' 'unsafe-inline' https://fonts.googleapis.com",

    // API connections: self + Beam payment API
    "connect-src 'self' https://api.beamcheckout.com https://playground.api.beamcheckout.com",

    // Styles: self + inline + Google Fonts
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",

    // Fonts: self + Google Fonts
    "font-src 'self' https://fonts.gstatic.com",

    // Images: self + data URIs (for QR codes)
    "img-src 'self' data:",

    // Frames: none (no iframes needed)
    "frame-src 'none'",

    // Base URI: self only
    "base-uri 'self'",

    // Form actions: self only
    "form-action 'self'",

    // Default fallback: self only
    "default-src 'self'"
  ];

  response.headers.set('Content-Security-Policy', cspDirectives.join('; '));

  // SECURITY: Additional security headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  return response;
};
