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
  const clientIp = getClientIp(request);
  const referenceId = url.searchParams.get('ref');
  const chargeId = url.searchParams.get('chargeId');
  const token = url.searchParams.get('token') || cookies.get('beam_session') || '';

  // Require reference ID and charge ID
  if (!referenceId || !chargeId) {
    // Missing required params - redirect to home
    redirect(303, '/');
  }

  // SECURITY: Verify session token to ensure this user initiated the charge
  const sessionMarker = verifySessionToken(token, clientIp);
  if (!sessionMarker || sessionMarker.referenceId !== referenceId) {
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
  const product = getProductBySlug(productSlug);
  if (!product) {
    console.error('[Success] Product not found for slug:', productSlug);
    error(500, 'Product not found. Please contact support.');
  }

  try {
    // SECURITY: Verify charge status with Beam before showing success
    const charge = await getCharge(chargeId);

    if (charge.status !== 'SUCCEEDED') {
      // Payment not successful - redirect to error or retry page
      if (charge.status === 'PENDING') {
        // Still pending - show waiting page or redirect
        error(400, 'Payment is still pending. Please wait.');
      } else {
        // Failed or cancelled
        error(400, 'Payment was not successful. Please try again.');
      }
    }

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
    console.error('[Success] Failed to verify charge:', err instanceof Error ? err.message : 'Unknown');
    error(500, 'Unable to verify payment status. Please contact support.');
  }
};
