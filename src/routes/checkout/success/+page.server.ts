import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getCharge } from '$lib/server/beam';
import {
  verifySessionToken,
  getClientIp,
  isWebhookSent,
  isCAPISent,
  markWebhookSent,
  markCAPISent,
  generateEventId
} from '$lib/server/security';
import { getProductBySlug } from '$lib/server/products';
import { sendN8NWebhook } from '$lib/server/n8n-webhook';
import { sendFacebookCAPIEvent } from '$lib/server/facebook-capi';
import { env } from '$env/dynamic/private';

// SECURITY: Server-side success page validation
// Only show success if charge status is SUCCEEDED per Beam API
export const load: PageServerLoad = async ({ url, cookies, request }) => {
  console.log('[Success] Page load started');
  const clientIp = getClientIp(request);
  const referenceId = url.searchParams.get('ref');
  let chargeId = url.searchParams.get('chargeId');
  const token = url.searchParams.get('token') || cookies.get('beam_session') || '';

  console.log('[Success] Parameters:', { referenceId, chargeId, hasToken: !!token, clientIp });

  // Require reference ID
  if (!referenceId) {
    console.error('[Success] Missing referenceId');
    redirect(303, '/');
  }

  // If chargeId is missing, try to get it from session token or cookie
  if (!chargeId) {
    console.log('[Success] chargeId missing from URL, checking session token and cookies');

    // Try session token first
    if (token) {
      const sessionMarker = verifySessionToken(token, clientIp);
      if (sessionMarker?.chargeId) {
        chargeId = sessionMarker.chargeId;
        console.log('[Success] Retrieved chargeId from session token:', chargeId);
      }
    }

    // If still missing, try cookie (for serverless environments like Vercel)
    if (!chargeId) {
      const chargeIdFromCookie = cookies.get('beam_charge_id');
      if (chargeIdFromCookie) {
        chargeId = chargeIdFromCookie;
        console.log('[Success] Retrieved chargeId from cookie:', chargeId);
      }
    }
  }

  // Still no chargeId? Redirect to home
  if (!chargeId) {
    console.error('[Success] chargeId not found in URL, session, or cookies');
    redirect(303, '/');
  }

  // SECURITY: Verify session token to ensure this user initiated the charge
  console.log('[Success] Verifying session token');
  const sessionMarker = verifySessionToken(token, clientIp);
  console.log('[Success] Session marker:', sessionMarker ? 'valid' : 'invalid');

  if (!sessionMarker || sessionMarker.referenceId !== referenceId) {
    console.error('[Success] Token verification failed:', {
      hasMarker: !!sessionMarker,
      markerRef: sessionMarker?.referenceId,
      urlRef: referenceId
    });
    // Unauthorized access to success page
    error(403, 'Unauthorized access to payment confirmation');
  }

  // Extract product slug from referenceId as fallback (format: pp_SLUG_timestamp_random or order_SLUG_timestamp_random)
  const extractSlugFromRef = (ref: string): string | undefined => {
    const parts = ref.split('_');
    // Format: pp_website1wun_timestamp_random or order_website1wun_timestamp_random
    return parts.length >= 2 ? parts[1] : undefined;
  };

  const productSlug = sessionMarker.productSlug || extractSlugFromRef(referenceId);

  if (!productSlug) {
    console.error('[Success] Cannot determine product slug from session or referenceId:', referenceId);
    error(500, 'Unable to identify product. Please contact support.');
  }

  // Get product data first (needed for display even if charge verification fails)
  console.log('[Success] Looking up product for slug:', productSlug);
  const product = getProductBySlug(productSlug);
  if (!product) {
    console.error('[Success] Product not found for slug:', productSlug);
    error(500, 'Product not found. Please contact support.');
  }
  console.log('[Success] Product found:', product.name);

  // SECURITY: Verify charge status with Beam before showing success
  console.log('[Success] Fetching charge from Beam:', chargeId);
  let charge;
  try {
    charge = await getCharge(chargeId);
    console.log('[Success] Charge status:', charge.status);
  } catch (err) {
    console.error('[Success] Failed to fetch charge from Beam:', err);
    console.error('[Success] Error type:', typeof err);
    console.error('[Success] Error details:', JSON.stringify(err, Object.getOwnPropertyNames(err)));
    error(500, 'Unable to verify payment status. Please contact support.');
  }

  // Check charge status (redirect to failed page if not successful)
  if (charge.status !== 'SUCCEEDED') {
    // Payment not successful - redirect to failed page
    console.error('[Success] Payment not successful:', {
      status: charge.status,
      failureCode: charge.failureCode,
      chargeId: chargeId
    });
    const reason = charge.status === 'PENDING' ? 'pending' : 'failed';
    redirect(303, `/checkout/failed?reason=${reason}&chargeId=${chargeId}`);
  }

  console.log('[Success] Charge verified successfully');

  try {

    // Generate deterministic event_id for deduplication
    const eventId = generateEventId(referenceId);

    // Send n8n webhook (if configured and not already sent)
    if (product.webhookUrl && !isWebhookSent(sessionMarker)) {
      try {
        await sendN8NWebhook(product.webhookUrl, {
          event: 'payment.succeeded',
          timestamp: new Date().toISOString(),
          product: {
            slug: product.slug,
            name: product.name,
            price: product.price,
            currency: product.currency
          },
          customer: {
            email: charge.customer?.email
          },
          transaction: {
            chargeId,
            referenceId,
            amount: product.price,
            currency: product.currency
          }
        });
        markWebhookSent(token);
      } catch (err) {
        console.error('[Webhook] Failed:', err);
        // Continue - don't fail page load
      }
    }

    // Send Facebook CAPI Purchase event (if configured and not already sent)
    if (env.FB_PIXEL_ID && env.FB_CAPI_ACCESS_TOKEN && !isCAPISent(sessionMarker)) {
      try {
        await sendFacebookCAPIEvent({
          eventName: 'Purchase',
          eventTime: Math.floor(Date.now() / 1000),
          eventId: eventId,
          eventSourceUrl: url.toString(),
          userData: {
            em: charge.customer?.email || '',
            client_ip_address: clientIp,
            client_user_agent: request.headers.get('user-agent') || ''
          },
          customData: {
            value: product.price / 100, // Convert satang to THB
            currency: product.currency,
            content_name: product.name,
            content_ids: [product.slug]
          }
        });
        markCAPISent(token);
      } catch (err) {
        console.error('[CAPI] Failed:', err);
        // Continue - don't fail page load
      }
    }

    return {
      referenceId,
      chargeId,
      verified: true,
      eventId, // For browser Pixel deduplication
      product: {
        // For browser Pixel tracking
        name: product.name,
        price: product.price,
        currency: product.currency,
        slug: product.slug,
        logoUrl: product.logoUrl,
        successMessage: product.successMessage || {
          title: 'Payment Successful!',
          description: 'Thank you for your purchase. You will receive a confirmation email shortly.',
          nextSteps: ['Check your email for order confirmation']
        }
      }
    };
  } catch (err) {
    console.error('[Success] Failed during webhook/CAPI:', err);
    console.error('[Success] Error type:', typeof err);
    console.error('[Success] Error details:', JSON.stringify(err, Object.getOwnPropertyNames(err)));

    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('[Success] Final error message:', errorMessage);

    error(500, 'Payment succeeded but notification failed. Please contact support with your order reference.');
  }
};
