/**
 * N8N Webhook Sender
 * Sends webhook notifications to n8n workflows with retry logic
 */

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
