/**
 * Facebook Conversions API (CAPI) Client
 * Sends server-side events to Facebook for better attribution and iOS14+ privacy
 */

import { env } from '$env/dynamic/private';
import { createHash } from 'crypto';

export interface FacebookPurchaseEvent {
  eventName: 'Purchase';
  eventTime: number; // Unix timestamp in seconds
  eventId: string; // For deduplication with browser Pixel
  eventSourceUrl: string; // URL where event occurred
  userData: {
    em: string; // Email (will be hashed)
    client_ip_address: string;
    client_user_agent: string;
  };
  customData: {
    value: number; // Purchase amount
    currency: string;
    content_name: string; // Product name
    content_ids: string[]; // Product identifiers
  };
}

/**
 * Hash user data with SHA-256 (required by Facebook for PII)
 * @param value - Value to hash
 * @returns SHA-256 hash in hex format
 */
function hashSHA256(value: string): string {
  if (!value) return '';
  return createHash('sha256').update(value.toLowerCase().trim()).digest('hex');
}

/**
 * Send Purchase event to Facebook Conversions API
 * @param event - Purchase event data
 * @returns Promise<boolean> - true if successful, false otherwise
 */
export async function sendFacebookCAPIEvent(event: FacebookPurchaseEvent): Promise<boolean> {
  const pixelId = env.FB_PIXEL_ID;
  const accessToken = env.FB_CAPI_ACCESS_TOKEN;
  const testEventCode = env.FB_TEST_EVENT_CODE; // Optional - for testing

  if (!pixelId || !accessToken) {
    console.error('[Facebook CAPI] Missing FB_PIXEL_ID or FB_CAPI_ACCESS_TOKEN');
    return false;
  }

  try {
    const url = `https://graph.facebook.com/v18.0/${pixelId}/events`;

    // Prepare user data with hashed PII
    const userData = {
      em: hashSHA256(event.userData.em),
      client_ip_address: event.userData.client_ip_address,
      client_user_agent: event.userData.client_user_agent
    };

    // Build request payload
    const payload: any = {
      data: [
        {
          event_name: event.eventName,
          event_time: event.eventTime,
          event_id: event.eventId,
          event_source_url: event.eventSourceUrl,
          action_source: 'website',
          user_data: userData,
          custom_data: event.customData
        }
      ],
      access_token: accessToken
    };

    // Add test event code if in development
    if (testEventCode) {
      payload.test_event_code = testEventCode;
      console.log(`[Facebook CAPI] Using test event code: ${testEventCode}`);
    }

    console.log(`[Facebook CAPI] Sending ${event.eventName} event (ID: ${event.eventId})`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error(
        `[Facebook CAPI] Failed with status ${response.status}:`,
        JSON.stringify(errorData)
      );
      return false;
    }

    const result = await response.json();
    console.log(`[Facebook CAPI] Successfully sent ${event.eventName} event`);

    // Log any warnings or errors from Facebook
    if (result.messages) {
      console.log('[Facebook CAPI] Response messages:', JSON.stringify(result.messages));
    }

    return true;
  } catch (err) {
    if (err instanceof Error) {
      console.error(`[Facebook CAPI] Error: ${err.message}`);
    } else {
      console.error('[Facebook CAPI] Unknown error occurred');
    }
    return false;
  }
}
