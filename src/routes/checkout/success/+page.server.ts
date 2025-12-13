import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getCharge } from '$lib/server/beam';
import { verifySessionToken, getClientIp } from '$lib/server/security';

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

    // Payment verified as successful
    return {
      referenceId,
      chargeId,
      verified: true
    };
  } catch (err) {
    console.error('[Success] Failed to verify charge:', err instanceof Error ? err.message : 'Unknown');
    error(500, 'Unable to verify payment status. Please contact support.');
  }
};
