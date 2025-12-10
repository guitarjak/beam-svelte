import { fail, redirect } from '@sveltejs/kit';
import { ADMIN_USERNAME, ADMIN_PASSWORD } from '$env/static/private';
import type { Actions } from './$types';

// Very simple in-memory throttle to slow brute-force login attempts
const attempts = new Map<string, { count: number; firstAttempt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function isRateLimited(key: string) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry) return false;

  // Reset window if expired
  if (now - entry.firstAttempt > WINDOW_MS) {
    attempts.delete(key);
    return false;
  }

  return entry.count >= MAX_ATTEMPTS;
}

function recordAttempt(key: string) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.firstAttempt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAttempt: now });
  } else {
    attempts.set(key, { count: entry.count + 1, firstAttempt: entry.firstAttempt });
  }
}

// Handle the login form submission
export const actions = {
  default: async ({ request, cookies, getClientAddress }) => {
    const clientIp = getClientAddress();
    const rateKey = `login:${clientIp}`;

    if (isRateLimited(rateKey)) {
      return fail(429, {
        error: 'Too many attempts. Please wait a few minutes before trying again.'
      });
    }

    // Get the form data
    const data = await request.formData();
    const username = data.get('username')?.toString() || '';
    const password = data.get('password')?.toString() || '';

    // Check credentials against environment variables
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      attempts.delete(rateKey); // reset on success
      // Set a secure HTTP-only cookie for the session
      cookies.set('admin_session', '1', {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 60 * 60 * 24 * 7 // 7 days
      });

      // Redirect to admin dashboard
      redirect(303, '/admin');
    }

    recordAttempt(rateKey);

    // If credentials are wrong, return error
    return fail(401, {
      error: 'Invalid username or password'
    });
  }
} satisfies Actions;
