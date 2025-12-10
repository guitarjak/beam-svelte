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

  // Continue with the request
  return resolve(event);
};
