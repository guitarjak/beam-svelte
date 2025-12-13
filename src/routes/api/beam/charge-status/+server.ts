import { json } from '@sveltejs/kit';
import { getCharge } from '$lib/server/beam';
import type { RequestHandler } from './$types';
import { isRateLimited, verifySessionToken, getClientIp } from '$lib/server/security';

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
    const charge = await getCharge(chargeId);

    // SECURITY: Only return minimal status info, no amounts to unauthorized callers
    return json({
      chargeId,
      status: charge.status,
      successUrl
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
