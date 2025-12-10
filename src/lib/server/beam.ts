import { BEAM_MERCHANT_ID, BEAM_API_KEY, BEAM_ENVIRONMENT } from '$env/static/private';

// Beam API base URLs
const PROD_BASE = 'https://api.beamcheckout.com/api/v1';
const PLAYGROUND_BASE = 'https://playground.api.beamcheckout.com/api/v1';

const envName = (BEAM_ENVIRONMENT || '').toLowerCase();
const isPlayground = envName === 'playground';
const configuredBase = isPlayground ? PLAYGROUND_BASE : PROD_BASE;

// Log the environment on startup
console.log(
  `[Beam] Using ${envName || 'production'} environment (base: ${configuredBase}, merchant: ${BEAM_MERCHANT_ID})`
);

// ============================================================================
// TYPES
// ============================================================================

/**
 * Payment method types supported by Beam
 */
export type PaymentMethodType = 'CARD' | 'QR_PROMPT_PAY';

/**
 * Charge status from Beam
 */
export type ChargeStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED';

/**
 * Action required after creating a charge
 */
export type ChargeAction = 'NONE' | 'REDIRECT' | 'ENCODED_IMAGE';

/**
 * Card payment details for CARD payment method
 */
export interface CardPaymentMethod {
  paymentMethodType: 'CARD';
  card: {
    pan: string; // Full card number
    cardHolderName: string;
    expiryMonth: number;
    expiryYear: number;
    securityCode: string; // CVV
  };
}

/**
 * PromptPay payment details for QR_PROMPT_PAY payment method
 */
export interface PromptPayPaymentMethod {
  paymentMethodType: 'QR_PROMPT_PAY';
  qrPromptPay?: {
    expiresAt?: string; // ISO 8601 timestamp
  };
}

/**
 * Payment method union type
 */
export type PaymentMethod = CardPaymentMethod | PromptPayPaymentMethod;

/**
 * Customer information (optional)
 */
export interface Customer {
  email?: string;
  primaryPhone?: {
    countryCode: string;
    number: string;
  };
}

/**
 * Request to create a charge with Beam
 */
export interface BeamChargeRequest {
  amount: number; // In satang (smallest unit): 10000 = 100.00 THB
  currency: 'THB';
  paymentMethod: PaymentMethod;
  referenceId?: string; // Your internal reference ID
  returnUrl?: string; // URL to redirect after payment (required for CARD)
  customer?: Customer;
}

/**
 * Redirect action response
 */
export interface RedirectAction {
  redirectUrl: string;
}

/**
 * Encoded image action response (for QR codes)
 */
export interface EncodedImageAction {
  imageBase64Encoded: string;
  rawData: string;
  expiry: string; // ISO 8601 timestamp
}

/**
 * Response from creating a charge
 */
export interface BeamChargeResponse {
  chargeId: string;
  actionRequired: ChargeAction;
  paymentMethodType: PaymentMethodType;
  redirect?: RedirectAction;
  encodedImage?: EncodedImageAction;
  // Fields from GET charge (status)
  status?: ChargeStatus;
  amount?: number;
  currency?: string;
  failureCode?: string;
  createdAt?: string;
  updatedAt?: string;
  transactionTime?: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create Basic Auth header for Beam API
 */
function getAuthHeader(): string {
  const credentials = `${BEAM_MERCHANT_ID}:${BEAM_API_KEY}`;
  const encoded = Buffer.from(credentials).toString('base64');
  return `Basic ${encoded}`;
}

/**
 * Make a request to Beam API
 */
async function beamRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  async function doRequest(baseUrl: string, allowFallback: boolean): Promise<T> {
    const url = `${baseUrl}${endpoint}`;

    console.log(`[Beam] ${options.method || 'GET'} ${url}`);
    console.log(`[Beam] Merchant ID: ${BEAM_MERCHANT_ID}`);

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: getAuthHeader(),
          ...options.headers
        }
      });

      console.log(`[Beam] Response status: ${response.status} ${response.statusText}`);

      let data: any = null;
      try {
        data = await response.json();
      } catch {
        // Swallow JSON errors so we can surface a clearer message below
      }

      if (!response.ok) {
        const errorMessage =
          data?.error?.errorMessage || data?.message || 'Beam API request failed';

        // Auto-fallback: if we accidentally hit production with playground keys, retry on playground host
        const isInvalidCreds = data?.error?.errorCode === 'INVALID_CREDENTIALS_ERROR';
        if (
          allowFallback &&
          baseUrl === PROD_BASE &&
          isInvalidCreds &&
          envName !== 'production'
        ) {
          console.warn('[Beam] Invalid credentials on production host; retrying on playground.');
          return doRequest(PLAYGROUND_BASE, false);
        }

        console.error(`[Beam] Error response:`, data);
        throw new Error(`Beam API Error (${response.status}): ${errorMessage}`);
      }

      console.log(`[Beam] Success!`);
      return data as T;
    } catch (error) {
      if (error instanceof Error && error.message.includes('fetch failed')) {
        console.error(`[Beam] Network error - cannot connect to ${url}`);
        console.error(`[Beam] This could be:`);
        console.error(`  - Network/firewall blocking the request`);
        console.error(`  - Invalid API endpoint URL`);
        console.error(`  - Beam API is down`);
        throw new Error(
          `Cannot connect to Beam API at ${url}. Check your network connection and API endpoint.`
        );
      }
      throw error;
    }
  }

  return doRequest(configuredBase, true);
}

/**
 * Create a charge with Beam
 * @param request - Charge creation request
 * @returns Charge response with chargeId and next actions
 */
export async function createCharge(
  request: BeamChargeRequest
): Promise<BeamChargeResponse> {
  return beamRequest<BeamChargeResponse>('/charges', {
    method: 'POST',
    body: JSON.stringify(request)
  });
}

/**
 * Get charge status from Beam
 * @param chargeId - The charge ID to query
 * @returns Charge details including status
 */
export async function getCharge(chargeId: string): Promise<BeamChargeResponse> {
  return beamRequest<BeamChargeResponse>(`/charges/${chargeId}`, {
    method: 'GET'
  });
}
