/**
 * Facebook Pixel Browser SDK Wrapper
 * Type-safe wrapper for Meta Pixel tracking events
 */

// Extend window interface for Facebook Pixel
declare global {
  interface Window {
    fbq: (
      action: 'track' | 'trackCustom' | 'init',
      eventName: string,
      params?: Record<string, any>,
      options?: { eventID?: string } // Options parameter for deduplication
    ) => void;
    _fbq: any;
  }
}

/**
 * Initialize Facebook Pixel
 * Should be called once when the app loads
 * @param pixelId - Facebook Pixel ID
 */
export function initFacebookPixel(pixelId: string): void {
  console.log('[Facebook Pixel] initFacebookPixel called with ID:', pixelId);

  if (typeof window === 'undefined') {
    console.log('[Facebook Pixel] Window is undefined (SSR)');
    return;
  }

  // Check if already initialized
  if (window.fbq) {
    console.log('[Facebook Pixel] Already initialized');
    return;
  }

  console.log('[Facebook Pixel] Loading SDK...');

  // Load Facebook Pixel SDK
  (function (f: any, b: any, e: any, v: any, n?: any, t?: any, s?: any) {
    if (f.fbq) return;
    n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = !0;
    n.version = '2.0';
    n.queue = [];
    t = b.createElement(e);
    t.async = !0;
    t.src = v;
    s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');

  // Initialize with Pixel ID
  window.fbq('init', pixelId);

  console.log(`[Facebook Pixel] Initialized with ID: ${pixelId}`);
}

export interface InitiateCheckoutParams {
  value: number;
  currency: string;
  content_name: string;
  content_ids: string[];
}

/**
 * Track InitiateCheckout event
 * Fires when user lands on checkout page
 * @param params - Event parameters
 */
export function trackInitiateCheckout(params: InitiateCheckoutParams): void {
  if (typeof window === 'undefined') {
    console.warn('[Facebook Pixel] Window is undefined (SSR)');
    return;
  }

  if (!window.fbq) {
    console.warn('[Facebook Pixel] Not initialized yet - waiting for SDK to load...');
    // Wait for SDK to load, then retry (max 5 seconds)
    let attempts = 0;
    const checkInterval = setInterval(() => {
      attempts++;
      if (window.fbq) {
        clearInterval(checkInterval);
        console.log('[Facebook Pixel] SDK loaded, tracking InitiateCheckout');
        window.fbq('track', 'InitiateCheckout', {
          value: params.value,
          currency: params.currency,
          content_name: params.content_name,
          content_ids: params.content_ids,
          content_type: 'product'
        });
      } else if (attempts >= 50) {
        // 50 attempts * 100ms = 5 seconds
        clearInterval(checkInterval);
        console.error('[Facebook Pixel] SDK failed to load after 5 seconds - likely blocked by ad blocker or firewall');
      }
    }, 100);
    return;
  }

  console.log('[Facebook Pixel] Tracking InitiateCheckout:', params);

  window.fbq('track', 'InitiateCheckout', {
    value: params.value,
    currency: params.currency,
    content_name: params.content_name,
    content_ids: params.content_ids,
    content_type: 'product'
  });
}

export interface PurchaseParams {
  value: number;
  currency: string;
  content_name: string;
  content_ids: string[];
  eventId: string; // For deduplication with CAPI
}

/**
 * Track Purchase event
 * Fires when payment is successful
 * @param params - Event parameters
 */
export function trackPurchase(params: PurchaseParams): void {
  if (typeof window === 'undefined') {
    console.warn('[Facebook Pixel] Window is undefined (SSR)');
    return;
  }

  if (!window.fbq) {
    console.warn('[Facebook Pixel] Not initialized yet - waiting for SDK to load...');
    // Wait for SDK to load, then retry (max 5 seconds)
    let attempts = 0;
    const checkInterval = setInterval(() => {
      attempts++;
      if (window.fbq) {
        clearInterval(checkInterval);
        console.log('[Facebook Pixel] SDK loaded, tracking Purchase');
        console.log('[Facebook Pixel] Using eventID for deduplication:', params.eventId);
        window.fbq('track', 'Purchase', {
          value: params.value,
          currency: params.currency,
          content_name: params.content_name,
          content_ids: params.content_ids,
          content_type: 'product'
        }, {
          eventID: params.eventId
        });
      } else if (attempts >= 50) {
        clearInterval(checkInterval);
        console.error('[Facebook Pixel] SDK failed to load after 5 seconds - likely blocked by ad blocker or firewall');
      }
    }, 100);
    return;
  }

  console.log('[Facebook Pixel] Tracking Purchase:', params);
  console.log('[Facebook Pixel] Using eventID for deduplication:', params.eventId);

  window.fbq('track', 'Purchase', {
    value: params.value,
    currency: params.currency,
    content_name: params.content_name,
    content_ids: params.content_ids,
    content_type: 'product'
  }, {
    eventID: params.eventId // CRITICAL: Must match CAPI event_id for deduplication
  });
}
