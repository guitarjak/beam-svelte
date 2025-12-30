import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getCharge } from '$lib/server/beam';

// RECOVERY: Check if payment has succeeded since initial check
// If chargeId is provided and status is now SUCCEEDED, redirect to success page
export const load: PageServerLoad = async ({ url, cookies }) => {
  const reason = url.searchParams.get('reason');
  const chargeId = url.searchParams.get('chargeId');

  console.log('[Failed] Page load:', { reason, chargeId });

  // If this is a pending payment with a chargeId, check current status
  // This handles cases where payment succeeded after initial check
  if (reason === 'pending' && chargeId) {
    try {
      console.log('[Failed] Checking charge status for pending payment:', chargeId);
      const charge = await getCharge(chargeId);
      console.log('[Failed] Current charge status:', charge.status);

      // If payment has succeeded, redirect to success page
      if (charge.status === 'SUCCEEDED') {
        console.log('[Failed] Payment now succeeded, redirecting to success page');

        // Get session token and referenceId from cookies
        const token = cookies.get('beam_session');
        const ref = charge.referenceId;

        if (ref) {
          redirect(303, `/checkout/success?ref=${ref}&chargeId=${chargeId}${token ? `&token=${token}` : ''}`);
        }
      }
    } catch (err) {
      console.error('[Failed] Error checking charge status:', err);
      // Continue to show failed page if we can't verify
    }
  }

  return {
    reason,
    chargeId
  };
};
