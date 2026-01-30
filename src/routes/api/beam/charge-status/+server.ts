import { json } from '@sveltejs/kit';
import { getCharge } from '$lib/server/beam';
import type { RequestHandler } from './$types';
import { isRateLimited, verifySessionToken, getClientIp, extractSlugFromRef } from '$lib/server/security';
import { triggerWebhookIfNeeded } from '$lib/server/n8n-webhook';
import { triggerCAPIIfNeeded } from '$lib/server/facebook-capi';

// SECURITY: Protected charge status endpoint
// Requires valid session token to prevent unauthorized status queries
export const GET: RequestHandler = async ({ url, cookies, request }) => {
  const clientIp = getClientIp(request);
  const chargeId = url.searchParams.get('chargeId');
  const successUrl = url.searchParams.get('successUrl') || undefined;

  // SECURITY: Rate limiting - max 30 status checks per IP per minute
  if (isRateLimited(`status:${clientIp}`, 30, 60 * 1000)) {
    return json({ error: 'Too many requests' }, { status: 429 });
  }

  if (!chargeId) {
    return json({ error: 'Missing chargeId' }, { status: 400 });
  }

  // SECURITY: Verify session token from cookie or query param
  const sessionToken = cookies.get('beam_session') || url.searchParams.get('token') || '';
  const sessionMarker = verifySessionToken(sessionToken, clientIp);

  if (!sessionMarker) {
    // SECURITY: Unauthorized - don't expose charge data
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Additional rate limiting per reference ID
  if (isRateLimited(`status:ref:${sessionMarker.referenceId}`, 50, 60 * 1000)) {
    return json({ error: 'Too many requests for this transaction' }, { status: 429 });
  }

  try {
    // Add retry logic to handle Beam API race condition
    // Mirrors the proven retry logic from /checkout/success/+page.server.ts
    const MAX_RETRIES = 3;
    const RETRY_DELAYS = [2000, 3000, 4000]; // 2s, 3s, 4s

    console.log('[Status] Fetching charge:', chargeId);
    let charge = await getCharge(chargeId);
    console.log('[Status] Initial status:', charge.status);

    // Retry if PENDING (handles race condition where payment succeeded but Beam hasn't updated yet)
    let retryCount = 0;
    while (charge.status === 'PENDING' && retryCount < MAX_RETRIES) {
      const delay = RETRY_DELAYS[retryCount];
      console.log(`[Status] PENDING, retrying in ${delay}ms (${retryCount + 1}/${MAX_RETRIES})`);

      await new Promise(resolve => setTimeout(resolve, delay));
      charge = await getCharge(chargeId);
      console.log(`[Status] After retry ${retryCount + 1}:`, charge.status);
      retryCount++;
    }

    // Build proper success URL with query parameters for tracking
    let finalSuccessUrl = successUrl || '/checkout/success';

    // Add query parameters if status is SUCCEEDED
    if (charge.status === 'SUCCEEDED') {
      // Extract product slug and trigger webhook/CAPI
      const productSlug = sessionMarker.productSlug || extractSlugFromRef(sessionMarker.referenceId);

      if (productSlug) {
        // Build event source URL for CAPI
        const origin = request.headers.get('origin') || url.origin;
        const eventSourceUrl = `${origin}/checkout/success?ref=${sessionMarker.referenceId}&chargeId=${chargeId}`;

        // Trigger webhook (with deduplication)
        await triggerWebhookIfNeeded({
          chargeId,
          referenceId: sessionMarker.referenceId,
          productSlug,
          customerEmail: sessionMarker.email,
          customerFullName: sessionMarker.fullName
        }, cookies);

        // Trigger CAPI (with deduplication, only if fbclid exists)
        await triggerCAPIIfNeeded({
          chargeId,
          referenceId: sessionMarker.referenceId,
          productSlug,
          customerEmail: sessionMarker.email,
          fbclid: sessionMarker.fbclid,
          clientIp,
          userAgent: request.headers.get('user-agent'),
          eventSourceUrl
        }, cookies);
      } else {
        console.warn('[Status] Could not extract product slug from referenceId:', sessionMarker.referenceId);
      }

      const urlParams = new URLSearchParams({
        ref: sessionMarker.referenceId,
        chargeId: chargeId
      });

      // Add token if not in cookie (for mobile/cross-domain)
      const hasTokenCookie = cookies.get('beam_session');
      if (!hasTokenCookie) {
        urlParams.set('token', sessionToken);
      }

      finalSuccessUrl = `${finalSuccessUrl}?${urlParams.toString()}`;
    }

    // SECURITY: Only return minimal status info, no amounts to unauthorized callers
    return json({
      chargeId,
      status: charge.status,
      successUrl: finalSuccessUrl
    });
  } catch (err) {
    return json(
      {
        error:
          err instanceof Error ? err.message : 'Unable to fetch charge status right now. Please retry.'
      },
      { status: 500 }
    );
  }
};
