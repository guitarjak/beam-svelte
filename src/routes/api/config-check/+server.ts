import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

export const GET: RequestHandler = async () => {
  const beamEnvironment = privateEnv.BEAM_ENVIRONMENT || '(not set)';
  const publicBeamEnvironment = publicEnv.PUBLIC_BEAM_ENVIRONMENT || '(not set)';
  const privateMerchantId = privateEnv.BEAM_MERCHANT_ID || '';
  const publicMerchantId = publicEnv.PUBLIC_BEAM_MERCHANT_ID || '';

  return json({
    publicBaseUrl: publicEnv.PUBLIC_BASE_URL || '(not set)',
    beamEnvironment,
    publicBeamEnvironment,
    publicBeamMerchantId: publicMerchantId || '(not set)',
    hasBeamApiKey: !!privateEnv.BEAM_API_KEY,
    hasBeamMerchantId: !!privateMerchantId,
    checks: {
      environmentMatches: beamEnvironment === publicBeamEnvironment,
      merchantIdMatches: !!privateMerchantId && privateMerchantId === publicMerchantId,
      hasPublishableKey: !!publicEnv.PUBLIC_BEAM_PUBLISHABLE_KEY
    },
    timestamp: new Date().toISOString()
  });
};
