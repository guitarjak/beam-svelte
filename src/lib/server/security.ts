import { env } from '$env/dynamic/private';

// Simple in-memory rate limiting (use Redis in production)
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Rate limiting: track requests per IP/key within a time window
 * @param key - Unique identifier (IP, reference, etc.)
 * @param maxRequests - Maximum requests allowed
 * @param windowMs - Time window in milliseconds
 * @returns true if rate limit exceeded
 */
export function isRateLimited(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  if (entry.count >= maxRequests) {
    return true;
  }

  entry.count++;
  return false;
}

/**
 * Clean up expired rate limit entries (call periodically)
 */
export function cleanupRateLimits(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}

// Cleanup every 5 minutes
setInterval(cleanupRateLimits, 5 * 60 * 1000);

// Session markers: tie charge references to sessions
interface SessionMarker {
  referenceId: string;
  chargeId?: string;
  timestamp: number;
  ip: string;
}

const sessionStore = new Map<string, SessionMarker>();

/**
 * Create a signed session token for charge verification
 * @param referenceId - Order reference ID
 * @param ip - Client IP address
 * @param chargeId - Optional charge ID
 * @returns Signed token
 */
export function createSessionToken(referenceId: string, ip: string, chargeId?: string): string {
  const marker: SessionMarker = {
    referenceId,
    chargeId,
    timestamp: Date.now(),
    ip
  };

  // Create a simple signed token (use proper JWT in production)
  const payload = Buffer.from(JSON.stringify(marker)).toString('base64');
  const secret = env.SESSION_SECRET || 'change-this-in-production';
  const signature = createHmac(payload, secret);

  const token = `${payload}.${signature}`;
  sessionStore.set(token, marker);

  return token;
}

/**
 * Verify and retrieve session marker
 * @param token - Session token to verify
 * @param ip - Client IP (must match)
 * @returns Session marker if valid, null otherwise
 */
export function verifySessionToken(token: string, ip: string): SessionMarker | null {
  if (!token || !token.includes('.')) return null;

  const [payload, signature] = token.split('.');
  const secret = env.SESSION_SECRET || 'change-this-in-production';
  const expectedSignature = createHmac(payload, secret);

  if (signature !== expectedSignature) {
    return null;
  }

  const marker = sessionStore.get(token);
  if (!marker) return null;

  // Verify IP matches
  if (marker.ip !== ip) return null;

  // Verify not expired (1 hour TTL)
  const now = Date.now();
  if (now - marker.timestamp > 60 * 60 * 1000) {
    sessionStore.delete(token);
    return null;
  }

  return marker;
}

/**
 * Update session marker with charge ID
 */
export function updateSessionToken(token: string, chargeId: string): void {
  const marker = sessionStore.get(token);
  if (marker) {
    marker.chargeId = chargeId;
  }
}

/**
 * Simple HMAC signing
 */
function createHmac(data: string, secret: string): string {
  // Use Web Crypto API for HMAC
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(data);

  // Simplified: in production use proper crypto.subtle.sign
  // For now, use a simple hash
  let hash = 0;
  const combined = secret + data;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Get client IP from request
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return request.headers.get('x-real-ip') || 'unknown';
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 255;
}

/**
 * Sanitize and validate card token
 */
export function isValidCardToken(token: string): boolean {
  if (!token || typeof token !== 'string') return false;
  // Beam tokens are typically alphanumeric with underscores/hyphens
  return /^[a-zA-Z0-9_-]{10,100}$/.test(token);
}

/**
 * Validate CVV format (3-4 digits)
 */
export function isValidCvv(cvv: string): boolean {
  if (!cvv || typeof cvv !== 'string') return false;
  return /^[0-9]{3,4}$/.test(cvv);
}
