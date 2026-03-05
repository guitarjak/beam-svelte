import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPaymentStatusFromNocoDb, isNocoDbConfigured } from '$lib/server/nocodb';
import { getClientIp, isRateLimited, verifySessionToken } from '$lib/server/security';

export const GET: RequestHandler = async ({ url, cookies, request }) => {
  const clientIp = getClientIp(request);
  const chargeId = url.searchParams.get('chargeId');
  const successUrl = url.searchParams.get('successUrl') || '/checkout/success';

  if (isRateLimited(`noco-status:${clientIp}`, 30, 60 * 1000)) {
    return json({ error: 'Too many requests' }, { status: 429 });
  }

  if (!chargeId) {
    return json({ error: 'Missing chargeId' }, { status: 400 });
  }

  if (!isNocoDbConfigured()) {
    return json({ error: 'NocoDB is not configured on server' }, { status: 500 });
  }

  const sessionToken = cookies.get('beam_session') || url.searchParams.get('token') || '';
  const sessionMarker = verifySessionToken(sessionToken, clientIp);
  if (!sessionMarker) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const chargeIdFromToken = sessionMarker.chargeId;
  const chargeIdFromCookie = cookies.get('beam_charge_id');
  if (chargeIdFromToken && chargeIdFromToken !== chargeId) {
    return json({ error: 'Unauthorized chargeId' }, { status: 403 });
  }
  if (!chargeIdFromToken && chargeIdFromCookie && chargeIdFromCookie !== chargeId) {
    return json({ error: 'Unauthorized chargeId' }, { status: 403 });
  }

  try {
    const status = await getPaymentStatusFromNocoDb(chargeId);

    let finalSuccessUrl = successUrl;
    if (status === 'SUCCEEDED') {
      const urlParams = new URLSearchParams({
        ref: sessionMarker.referenceId,
        chargeId
      });

      if (!cookies.get('beam_session')) {
        urlParams.set('token', sessionToken);
      }

      finalSuccessUrl = `${successUrl}?${urlParams.toString()}`;
    }

    return json({
      chargeId,
      status,
      successUrl: finalSuccessUrl
    });
  } catch (err) {
    return json(
      {
        error: err instanceof Error ? err.message : 'Unable to fetch payment status'
      },
      { status: 500 }
    );
  }
};
