import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

/**
 * Test endpoint to verify Beam integration
 * GET /test/beam
 */
export const GET: RequestHandler = async () => {
  const BEAM_MERCHANT_ID = privateEnv.BEAM_MERCHANT_ID || '';
  const BEAM_API_KEY = privateEnv.BEAM_API_KEY || '';
  const BEAM_ENVIRONMENT = privateEnv.BEAM_ENVIRONMENT || 'production';
  const PUBLIC_BASE_URL = publicEnv.PUBLIC_BASE_URL || '';

  // Check if environment variables are configured
  const isConfigured =
    BEAM_MERCHANT_ID !== 'your-merchant-id-here' &&
    BEAM_API_KEY !== 'your-api-key-here' &&
    BEAM_MERCHANT_ID &&
    BEAM_API_KEY;

  const apiBase =
    (BEAM_ENVIRONMENT || '').toLowerCase() === 'playground'
      ? 'https://playground.api.beamcheckout.com/api/v1'
      : 'https://api.beamcheckout.com/api/v1';
  const fallbackNotice =
    (BEAM_ENVIRONMENT || '').toLowerCase() === 'production'
      ? 'Production only. Set BEAM_ENVIRONMENT=playground to switch.'
      : 'Will auto-retry on playground if prod host rejects credentials.';

  return json({
    message: 'Beam utility is wired ✓',
    status: 'ready',
    environment: BEAM_ENVIRONMENT || 'production',
    config: {
      merchantIdSet: !!BEAM_MERCHANT_ID && BEAM_MERCHANT_ID !== 'your-merchant-id-here',
      apiKeySet: !!BEAM_API_KEY && BEAM_API_KEY !== 'your-api-key-here',
      baseUrlSet: !!PUBLIC_BASE_URL,
      environmentSet: !!BEAM_ENVIRONMENT,
      fullyConfigured: isConfigured
    },
    endpoints: {
      createCharge: `${apiBase}/charges (POST)`,
      getCharge: `${apiBase}/charges/{chargeId} (GET)`
    },
    fallbackNotice,
    publicBaseUrl: PUBLIC_BASE_URL,
    note: isConfigured
      ? `All environment variables are configured! Using ${BEAM_ENVIRONMENT || 'production'} environment.`
      : 'Please set BEAM_MERCHANT_ID and BEAM_API_KEY in your .env file'
  });
};
