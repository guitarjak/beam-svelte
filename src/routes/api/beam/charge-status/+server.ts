import { json } from '@sveltejs/kit';
import { getCharge } from '$lib/server/beam';
import type { RequestHandler } from './$types';

// Simple status polling endpoint for PromptPay
export const GET: RequestHandler = async ({ url }) => {
  const chargeId = url.searchParams.get('chargeId');
  const successUrl = url.searchParams.get('successUrl') || undefined;

  if (!chargeId) {
    return json({ error: 'Missing chargeId' }, { status: 400 });
  }

  try {
    const charge = await getCharge(chargeId);
    return json({
      chargeId,
      status: charge.status,
      amount: charge.amount,
      currency: charge.currency,
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
