import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

// Beam API configuration (server-side only - keys never exposed)
const BEAM_MERCHANT_ID = env.BEAM_MERCHANT_ID || '';
const BEAM_API_KEY = env.BEAM_API_KEY || '';
const BEAM_ENVIRONMENT = (env.BEAM_ENVIRONMENT || 'production').toLowerCase();
const BEAM_BASE = BEAM_ENVIRONMENT === 'playground'
  ? 'https://playground.api.beamcheckout.com'
  : 'https://api.beamcheckout.com';

/**
 * Server-side card tokenization endpoint
 * This keeps your API keys secure by never exposing them to the client
 */
export const POST: RequestHandler = async ({ request }) => {
  try {
    // Parse card data from request
    const body = await request.json();
    const { pan, expiryMonth, expiryYear, cardHolderName } = body;

    // Validate required fields
    if (!pan || !expiryMonth || !expiryYear) {
      return json(
        { error: { errorMessage: 'Missing required card fields' } },
        { status: 400 }
      );
    }

    // Validate API credentials
    if (!BEAM_MERCHANT_ID || !BEAM_API_KEY) {
      console.error('[Tokenize] Beam credentials not configured');
      return json(
        { error: { errorMessage: 'Payment system not configured' } },
        { status: 500 }
      );
    }

    // Create Basic Auth header (server-side only)
    const credentials = `${BEAM_MERCHANT_ID}:${BEAM_API_KEY}`;
    // Use Buffer (Node.js environment)
    const encodedCredentials = Buffer.from(credentials, 'utf-8').toString('base64');

    // Call Beam's tokenization API from server
    const tokenEndpoint = `${BEAM_BASE}/client/v1/card-tokens`;
    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${encodedCredentials}`
      },
      body: JSON.stringify({
        pan,
        expiryMonth: parseInt(expiryMonth.toString()),
        expiryYear: parseInt(expiryYear.toString()),
        cardHolderName: cardHolderName || undefined
      })
    });

    // Parse response
    const data = await response.json();

    if (!response.ok) {
      console.error('[Tokenize] Beam API error:', data);
      return json(
        {
          error: {
            errorCode: data?.error?.errorCode || 'TOKENIZATION_ERROR',
            errorMessage: data?.error?.errorMessage || 'Card tokenization failed'
          }
        },
        { status: response.status }
      );
    }

    // Log success (no sensitive data)
    console.log('[Tokenize] Card tokenized successfully');

    // Return token to client
    return json({ id: data.id });
  } catch (error) {
    console.error('[Tokenize] Unexpected error:', error);
    return json(
      {
        error: {
          errorCode: 'INTERNAL_ERROR',
          errorMessage: 'An unexpected error occurred'
        }
      },
      { status: 500 }
    );
  }
};
