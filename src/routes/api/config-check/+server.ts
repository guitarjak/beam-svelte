import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

export const GET: RequestHandler = async () => {
  return json({
    publicBaseUrl: publicEnv.PUBLIC_BASE_URL || '(not set)',
    beamEnvironment: privateEnv.BEAM_ENVIRONMENT || '(not set)',
    publicBeamEnvironment: publicEnv.PUBLIC_BEAM_ENVIRONMENT || '(not set)',
    publicBeamMerchantId: publicEnv.PUBLIC_BEAM_MERCHANT_ID || '(not set)',
    hasBeamApiKey: !!privateEnv.BEAM_API_KEY,
    hasBeamMerchantId: !!privateEnv.BEAM_MERCHANT_ID,
    timestamp: new Date().toISOString()
  });
};
