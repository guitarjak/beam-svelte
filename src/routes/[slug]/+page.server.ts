import { error, fail, redirect } from '@sveltejs/kit';
import { getProductBySlug } from '$lib/server/products';
import { createCharge } from '$lib/server/beam';
import { env as publicEnv } from '$env/dynamic/public';
import { env } from '$env/dynamic/private';
import type { PageServerLoad, Actions } from './$types';

const PUBLIC_BASE_URL = publicEnv.PUBLIC_BASE_URL || '';

// SECURITY: URL allowlist for redirect protection
// Only allow redirects to these domains (prevents open redirect vulnerability)
// Load allowed hosts from environment variable (comma-separated list)
const ALLOWED_REDIRECT_HOSTS = (env.ALLOWED_REDIRECT_HOSTS || 'localhost,127.0.0.1')
  .split(',')
  .map(host => host.trim())
  .filter(host => host.length > 0);

/**
 * Validates and builds a safe success URL with allowlist protection
 * Falls back to internal success page if URL is not on allowlist
 */
function buildSuccessUrl(base: string | undefined, extraParams: Record<string, string | undefined>) {
  const target = base && base.trim().length ? base : '/checkout/success';

  // Parse the target URL
  let url: URL;
  try {
    url = target.startsWith('http')
      ? new URL(target)
      : new URL(target.startsWith('/') ? target : `/${target}`, PUBLIC_BASE_URL);
  } catch {
    // Invalid URL format - use safe fallback
    console.warn('[Security] Invalid URL format, using safe fallback:', target);
    url = new URL('/checkout/success', PUBLIC_BASE_URL);
  }

  // SECURITY: Validate against allowlist
  if (!ALLOWED_REDIRECT_HOSTS.includes(url.hostname)) {
    console.warn('[Security] Blocked redirect to untrusted host:', url.hostname);
    // Use safe internal success page
    url = new URL('/checkout/success', PUBLIC_BASE_URL);
  }

  // Add extra parameters
  Object.entries(extraParams).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });

  return url.toString();
}

// Load product data based on the slug from the URL
export const load: PageServerLoad = ({ params }) => {
  // Get the slug from the URL (e.g., /product-1 → slug is "product-1")
  const { slug } = params;

  // Try to find the product
  const product = getProductBySlug(slug);

  // If product doesn't exist, throw 404
  if (!product) {
    error(404, 'Product not found');
  }

  // If product is not active, throw 404
  if (!product.active) {
    error(404, 'Product not available');
  }

  // Return the product to the page
  return {
    product,
    successUrl: buildSuccessUrl(product.successUrl, {})
  };
};

// Form actions
export const actions = {
  // Handle card payment with tokenized card
  // SECURITY NOTE: Due to Beam API design, CVV must pass through server (not included in token)
  // CVV is held in memory only, never logged or stored, and sent directly to Beam
  payWithCard: async ({ request, params }) => {
    const { slug } = params;

    // Get the product
    const product = getProductBySlug(slug);
    if (!product || !product.active) {
      return fail(404, { error: 'Product not found or not available' });
    }

    // Get form data
    const formData = await request.formData();
    const cardToken = formData.get('cardToken')?.toString() || '';
    const securityCode = formData.get('securityCode')?.toString() || '';

    // SECURITY: Basic validation only - token and CVV are required
    // Do NOT log or process CVV beyond validation
    if (!cardToken || !securityCode) {
      return fail(400, { error: 'Card token and security code are required.' });
    }

    // Generate a unique reference ID
    const referenceId = `order_${slug}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const successUrl = product.successUrl || '/checkout/success';

    // SECURITY: Only log non-sensitive transaction metadata (no card data, no CVV)
    console.log(`[Payment] Processing tokenized card payment: ref=${referenceId}`);

    try {
      // Create charge with Beam using the token
      // SECURITY: securityCode is passed directly to Beam, never logged or stored
      const charge = await createCharge({
        amount: product.price, // Already in satang
        currency: 'THB',
        paymentMethod: {
          paymentMethodType: 'CARD_TOKEN',
          cardToken: {
            cardTokenId: cardToken,
            securityCode: securityCode // Required by Beam API (held in memory only)
          }
        },
        referenceId,
        returnUrl: buildSuccessUrl(successUrl, { ref: referenceId })
      });

      // Handle the response based on actionRequired
      if (charge.actionRequired === 'REDIRECT' && charge.redirect?.redirectUrl) {
        // Redirect to 3DS authentication page
        redirect(303, charge.redirect.redirectUrl);
      } else if (charge.actionRequired === 'NONE') {
        // Payment completed immediately (rare for cards)
        redirect(
          303,
          buildSuccessUrl(successUrl, { ref: referenceId, chargeId: charge.chargeId })
        );
      } else {
        // Unexpected response
        return fail(500, {
          error: 'Unexpected payment response. Please try again or contact support.'
        });
      }
    } catch (err) {
      // Allow SvelteKit redirects to bubble through (they are Errors with status/location)
      const maybeRedirect = err as { status?: number; location?: string };
      if (
        maybeRedirect &&
        typeof maybeRedirect === 'object' &&
        typeof maybeRedirect.status === 'number' &&
        typeof maybeRedirect.location === 'string' &&
        maybeRedirect.status >= 300 &&
        maybeRedirect.status < 400
      ) {
        throw err;
      }
      // SECURITY: Log error without exposing sensitive details
      console.error('[Payment] Card payment failed:', err instanceof Error ? err.message : 'Unknown error');
      return fail(500, {
        error: 'Payment failed. Please try again or contact support.'
      });
    }
  },

  // Handle PromptPay payment (returns QR image + chargeId)
  payWithPromptPay: async ({ params }) => {
    const { slug } = params;

    // Get the product
    const product = getProductBySlug(slug);
    if (!product || !product.active) {
      return fail(404, { error: 'Product not found or not available' });
    }

    // Generate a unique reference ID
    const referenceId = `pp_${slug}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const successUrl = product.successUrl || '/checkout/success';

    // Set QR expiry 10 minutes from now
    const expiryDate = new Date(Date.now() + 10 * 60 * 1000);
    const expiryIso = expiryDate.toISOString();

    try {
      const charge = await createCharge({
        amount: product.price,
        currency: product.currency as 'THB',
        paymentMethod: {
          paymentMethodType: 'QR_PROMPT_PAY',
          qrPromptPay: {
            expiresAt: expiryIso
          }
        },
        referenceId,
        returnUrl: buildSuccessUrl(successUrl, {})
      });

      if (charge.actionRequired !== 'ENCODED_IMAGE' || !charge.encodedImage?.imageBase64Encoded) {
        return fail(500, {
          error: 'Unexpected response from Beam. Please try again or use another method.'
        });
      }

      return {
        promptPay: {
          chargeId: charge.chargeId,
          qrBase64: charge.encodedImage.imageBase64Encoded,
          expiry: charge.encodedImage.expiry || expiryIso
        }
      };
    } catch (err) {
      console.error('PromptPay error:', err instanceof Error ? err.message : 'Unknown error');
      return fail(500, {
        error:
          err instanceof Error
            ? `Payment failed: ${err.message}`
            : 'Payment failed. Please try again.'
      });
    }
  }
} satisfies Actions;
