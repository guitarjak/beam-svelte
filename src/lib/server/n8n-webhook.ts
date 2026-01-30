/**
 * N8N Webhook Sender
 * Sends webhook notifications to n8n workflows with retry logic
 */

import type { Cookies } from '@sveltejs/kit';
import { getProductBySlug } from '$lib/server/products';

export interface N8NWebhookPayload {
  event: 'payment.succeeded';
  timestamp: string;
  product: {
    slug: string;
    name: string;
    price: number;
    currency: string;
  };
  customer: {
    email?: string;
    fullName?: string;
  };
  transaction: {
    chargeId: string;
    referenceId: string;
    amount: number;
    currency: string;
  };
}

/**
 * Send webhook to n8n with retry logic
 * @param url - n8n webhook URL
 * @param payload - Webhook payload data
 * @returns Promise<boolean> - true if successful, false otherwise
 */
export async function sendN8NWebhook(url: string, payload: N8NWebhookPayload): Promise<boolean> {
  const maxRetries = 3;
  const timeoutMs = 10000; // 10 seconds
  const retryDelays = [1000, 3000, 9000]; // Exponential backoff: 1s, 3s, 9s

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`[N8N Webhook] Attempt ${attempt + 1}/${maxRetries} to ${url}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Beam-Checkout/1.0'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        console.log(`[N8N Webhook] Successfully sent to ${url}`);
        return true;
      }

      // Log non-200 responses but retry
      const errorText = await response.text().catch(() => 'Unable to read response');
      console.error(
        `[N8N Webhook] Attempt ${attempt + 1} failed with status ${response.status}: ${errorText}`
      );
    } catch (err) {
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          console.error(`[N8N Webhook] Attempt ${attempt + 1} timed out after ${timeoutMs}ms`);
        } else {
          console.error(`[N8N Webhook] Attempt ${attempt + 1} failed: ${err.message}`);
        }
      } else {
        console.error(`[N8N Webhook] Attempt ${attempt + 1} failed with unknown error`);
      }
    }

    // Wait before retry (except on last attempt)
    if (attempt < maxRetries - 1) {
      const delay = retryDelays[attempt];
      console.log(`[N8N Webhook] Retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  console.error(`[N8N Webhook] All ${maxRetries} attempts failed for ${url}`);
  return false;
}

export interface TriggerWebhookParams {
  chargeId: string;
  referenceId: string;
  productSlug: string;
  customerEmail?: string;
  customerFullName?: string;
}

/**
 * Trigger webhook if not already sent (with cookie-based deduplication)
 * @param params - Webhook parameters
 * @param cookies - SvelteKit cookies object
 * @returns Promise<boolean> - true if webhook was sent, false if skipped or failed
 */
export async function triggerWebhookIfNeeded(
  params: TriggerWebhookParams,
  cookies: Cookies
): Promise<boolean> {
  const { chargeId, referenceId, productSlug, customerEmail, customerFullName } = params;
  const cookieName = `beam_webhook_sent_${chargeId}`;

  // Check cookie-based deduplication
  if (cookies.get(cookieName) === 'true') {
    console.log('[Webhook] Already sent for chargeId (cookie):', chargeId);
    return false;
  }

  // Look up product
  const product = getProductBySlug(productSlug);
  if (!product) {
    console.error('[Webhook] Product not found for slug:', productSlug);
    return false;
  }

  // Check if product has webhook URL configured
  if (!product.webhookUrl) {
    console.log('[Webhook] No webhook URL configured for product:', productSlug);
    return false;
  }

  try {
    console.log('[Webhook] Sending webhook to:', product.webhookUrl);
    const success = await sendN8NWebhook(product.webhookUrl, {
      event: 'payment.succeeded',
      timestamp: new Date().toISOString(),
      product: {
        slug: product.slug,
        name: product.name,
        price: product.price,
        currency: product.currency
      },
      customer: {
        email: customerEmail,
        fullName: customerFullName
      },
      transaction: {
        chargeId,
        referenceId,
        amount: product.price,
        currency: product.currency
      }
    });

    if (success) {
      // Set deduplication cookie (24 hour TTL)
      cookies.set(cookieName, 'true', {
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 // 24 hours
      });
      console.log('[Webhook] Sent successfully, dedup cookie set');
      return true;
    }

    return false;
  } catch (err) {
    console.error('[Webhook] Failed:', err);
    return false;
  }
}
