<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';
  import { onDestroy, onMount } from 'svelte';
  import { env as publicEnv } from '$env/dynamic/public';
  import { trackInitiateCheckout } from '$lib/facebook-pixel';

  // Receive product data from +page.server.ts
  export let data: PageData;
  export let form: ActionData;

  // Beam public credentials (safe for browser)
  const BEAM_MERCHANT_ID = publicEnv.PUBLIC_BEAM_MERCHANT_ID || 'dsp'; // Read from environment
  const BEAM_PUBLISHABLE_KEY = publicEnv.PUBLIC_BEAM_PUBLISHABLE_KEY || '';
  const BEAM_ENVIRONMENT = publicEnv.PUBLIC_BEAM_ENVIRONMENT || 'production';
  const BEAM_CLIENT_BASE = BEAM_ENVIRONMENT === 'playground'
    ? 'https://playground.api.beamcheckout.com'
    : 'https://api.beamcheckout.com';

  // UI state
  let selectedMethod: 'promptpay' | 'card' = 'card';
  let email = '';
  let fullName = '';
  let cardNumber = '';
  let expiryDate = '';
  let emailError = false;
  let fullNameError = false;
  let isLoading = false;
  let isPromptPayLoading = false;
  let promptPayError = '';
  let promptPayResult: { chargeId: string; qrBase64: string; expiry: string } | null = null;
  let polling = false;
  let pollingError = '';
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let mounted = false;
  let isCheckingStatus = false;           // Prevents concurrent checks
  let lastStatusCheck = 0;                // Timestamp for debouncing
  const STATUS_CHECK_DEBOUNCE = 2000;     // Min 2s between checks

  // Reactive statement to determine if card error should be shown
  $: showCardError = form?.error && selectedMethod === 'card';

  onMount(() => {
    mounted = true;

    // Track Facebook Pixel InitiateCheckout event
    if (publicEnv.PUBLIC_FB_PIXEL_ID) {
      trackInitiateCheckout({
        value: data.product.price / 100, // Convert satang to THB
        currency: data.product.currency,
        content_name: data.product.name,
        content_ids: [data.product.slug]
      });
    }

    // Page Visibility API - auto-check when user returns
    function handleVisibilityChange() {
      if (!document.hidden && polling && promptPayResult) {
        console.log('[Visibility] Page visible, checking payment');
        checkPaymentStatus();
      }
    }

    // Handle bfcache restoration (mobile browser back/forward)
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted && polling && promptPayResult) {
        console.log('[BFCache] Page restored, checking payment');
        checkPaymentStatus();
      }
    }

    // Attach event listeners
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handlePageShow);

    // Cleanup
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
    };
  });

  // Helper: validate email format
  function isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // Helper: format price in THB from satang
  function formatPriceTHB(satang: number) {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB'
    }).format(satang / 100);
  }

  // Helper: format card number with spaces (1234 5678 1234 5678)
  function formatCardNumber(value: string) {
    // Remove all non-digit characters
    const digitsOnly = value.replace(/\D/g, '');
    // Limit to 16 digits
    const limited = digitsOnly.slice(0, 16);
    // Add space every 4 digits
    const formatted = limited.match(/.{1,4}/g)?.join(' ') || limited;
    return formatted;
  }

  // Handle card number input
  function handleCardNumberInput(event: Event) {
    const input = event.target as HTMLInputElement;
    const formatted = formatCardNumber(input.value);
    cardNumber = formatted;
    input.value = formatted;
  }

  // Helper: format expiry date (MM / YY)
  function formatExpiryDate(value: string) {
    // Remove all non-digit characters
    const digitsOnly = value.replace(/\D/g, '');
    // Limit to 4 digits (MMYY)
    const limited = digitsOnly.slice(0, 4);

    if (limited.length >= 3) {
      // Format as MM / YY
      return `${limited.slice(0, 2)} / ${limited.slice(2)}`;
    } else if (limited.length >= 1) {
      // Just MM so far
      return limited;
    }
    return limited;
  }

  // Handle expiry date input
  function handleExpiryInput(event: Event) {
    const input = event.target as HTMLInputElement;
    const formatted = formatExpiryDate(input.value);
    expiryDate = formatted;
    input.value = formatted;

    // Extract MM and YY for hidden fields
    const digitsOnly = formatted.replace(/\D/g, '');
    if (digitsOnly.length >= 2) {
      const monthInput = document.getElementById('expiryMonth') as HTMLInputElement;
      if (monthInput) monthInput.value = digitsOnly.slice(0, 2);

      if (digitsOnly.length === 4) {
        const yearInput = document.getElementById('expiryYear') as HTMLInputElement;
        if (yearInput) yearInput.value = digitsOnly.slice(2, 4);
      }
    }
  }

  // Tokenize card directly with Beam's client API (PCI-compliant)
  // Card data sent DIRECTLY to Beam using publishable key
  // Server NEVER sees the PAN or expiry date!
  async function tokenizeCard(cardData: {
    pan: string;
    expiryMonth: number;
    expiryYear: number;
    cardHolderName?: string;
  }): Promise<{ id: string }> {
    // Create Basic Auth header: base64(merchantId:publishableKey)
    const credentials = `${BEAM_MERCHANT_ID}:${BEAM_PUBLISHABLE_KEY}`;
    const encodedCredentials = btoa(credentials);

    // Call Beam's client tokenization API directly
    const response = await fetch(`${BEAM_CLIENT_BASE}/client/v1/card-tokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${encodedCredentials}`
      },
      body: JSON.stringify({
        pan: cardData.pan,
        expiryMonth: cardData.expiryMonth,
        expiryYear: cardData.expiryYear,
        cardHolderName: cardData.cardHolderName
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const errorMessage = errorData?.error?.errorMessage || 'Card tokenization failed';
      throw new Error(errorMessage);
    }

    const result = await response.json();
    return result;
  }

  function selectMethod(method: 'promptpay' | 'card') {
    selectedMethod = method;
    // Clear any server-side form errors when switching payment methods
    if (form?.error) {
      form = null;
    }
    if (method !== 'promptpay') {
      resetPromptPayState();
    }
  }

  function resetPromptPayState() {
    promptPayError = '';
    pollingError = '';
    promptPayResult = null;
    stopPolling();
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    polling = false;
  }

  // Poll Beam charge status until success/failure/expiry
  async function pollStatus(chargeId: string, expiryIso: string) {
    stopPolling();
    polling = true;
    pollTimer = setInterval(async () => {
      if (Date.now() > new Date(expiryIso).getTime()) {
        pollingError = 'QR expired, please try again.';
        stopPolling();
        return;
      }
      try {
        const res = await fetch(
          `/api/beam/charge-status?chargeId=${encodeURIComponent(
            chargeId
          )}&successUrl=${encodeURIComponent(data.successUrl ?? '')}`
        );
        const statusData = await res.json();
        if (!res.ok) {
          throw new Error(statusData?.error || 'Status check failed');
        }

        if (statusData.status === 'SUCCEEDED') {
          stopPolling();
          window.location.href = statusData.successUrl ?? '/checkout/success';
        } else if (statusData.status === 'FAILED' || statusData.status === 'CANCELLED') {
          pollingError = 'Payment failed. Please try again.';
          stopPolling();
        }
      } catch (err) {
        pollingError =
          err instanceof Error ? err.message : 'Could not check status. Please wait or retry.';
      }
    }, 3000);
  }

  // Manual status check (triggered by button or visibility change)
  async function checkPaymentStatus() {
    if (!promptPayResult) return;
    if (isCheckingStatus) return; // Mutex lock

    // Debounce: prevent rapid successive checks
    const now = Date.now();
    if (now - lastStatusCheck < STATUS_CHECK_DEBOUNCE) {
      return;
    }

    // Check QR expiry
    if (Date.now() > new Date(promptPayResult.expiry).getTime()) {
      pollingError = 'QR expired, please try again.';
      stopPolling();
      return;
    }

    isCheckingStatus = true;
    lastStatusCheck = now;

    try {
      const res = await fetch(
        `/api/beam/charge-status?chargeId=${encodeURIComponent(
          promptPayResult.chargeId
        )}&successUrl=${encodeURIComponent(data.successUrl ?? '')}`
      );
      const statusData = await res.json();

      if (!res.ok) {
        throw new Error(statusData?.error || 'Status check failed');
      }

      if (statusData.status === 'SUCCEEDED') {
        stopPolling();
        window.location.href = statusData.successUrl ?? '/checkout/success';
      } else if (statusData.status === 'FAILED' || statusData.status === 'CANCELLED') {
        pollingError = 'Payment failed. Please try again.';
        stopPolling();
      }
    } catch (err) {
      console.error('[Status] Check failed:', err);
      pollingError = err instanceof Error ? err.message : 'Could not check status. Please wait or retry.';
    } finally {
      isCheckingStatus = false;
    }
  }

  onDestroy(() => {
    stopPolling();
  });
</script>


<!-- Premium checkout page with asymmetric 7-5 grid and trust signals -->
<div class="checkout-container">
  <!-- Left side: Product showcase (60% - 7 columns) -->
  <div class="product-showcase">
    <div class="showcase-content">
      <!-- Brand Logo -->
      {#if data.product.logoUrl}
        <div class="brand-logo-container">
          <img src={data.product.logoUrl} alt="Brand Logo" class="brand-logo" />
        </div>
      {/if}

      <!-- Product details -->
      <div class="product-details">
        <!-- Product hero section -->
        <div class="product-hero">
          <div class="product-image-wrapper">
            <div class="gradient-orb orb-1"></div>
            <div class="gradient-orb orb-2"></div>
            <div class="gradient-orb orb-3"></div>

            {#if data.product.imageUrl}
              <!-- Product image -->
              <div class="product-image-container">
                <img
                  src={data.product.imageUrl}
                  alt={data.product.name}
                  class="product-image"
                />
              </div>
            {:else}
              <!-- Default icon -->
              <div class="product-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
            {/if}
          </div>
        </div>

        <h1 class="product-name">{data.product.name}</h1>
        <p class="product-description">{data.product.description}</p>

        <!-- Price display -->
        <div class="price-container">
          <span class="price-label">Total</span>
          <span class="price-value">{formatPriceTHB(data.product.price)}</span>
        </div>
      </div>
    </div>
  </div>

  <!-- Right side: Checkout form (40% - 5 columns) -->
  <div class="checkout-form-section">
    <div class="form-content">
      <!-- Contact information -->
      <div class="form-section">
        <h2 class="section-title">Contact information</h2>
        <div class="input-group">
          <label for="fullName" class="input-label">Full name</label>
          <input
            type="text"
            id="fullName"
            bind:value={fullName}
            on:input={() => fullNameError = false}
            placeholder="John Doe"
            class="form-input"
            class:input-error={fullNameError}
          />
          {#if fullNameError}
            <span class="error-hint">Please enter your full name</span>
          {/if}
        </div>

        <div class="input-group">
          <label for="email" class="input-label">Email address</label>
          <input
            type="email"
            id="email"
            bind:value={email}
            on:input={() => emailError = false}
            placeholder="you@example.com"
            class="form-input"
            class:input-error={emailError}
          />
          <span class="input-hint">Receipt will be sent to this address</span>
          {#if emailError}
            <span class="error-hint">
              {#if !email || email.trim() === ''}
                Please enter your email address
              {:else}
                Please enter a valid email address
              {/if}
            </span>
          {/if}
        </div>
      </div>

      <!-- Payment method -->
      <div class="form-section">
        <h2 class="section-title">Payment method</h2>

        <!-- Payment options -->
        <div class="payment-methods">
          <!-- PromptPay -->
          <button
            type="button"
            on:click={() => selectMethod('promptpay')}
            class="payment-option"
            class:selected={selectedMethod === 'promptpay'}
          >
            <div class="radio-button">
              <div class="radio-dot"></div>
            </div>
            <div class="payment-icon promptpay">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <rect width="24" height="24" rx="4" fill="#1e3a8a"/>
                <path d="M8 12h8M12 8v8" stroke="white" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </div>
            <span class="payment-label">PromptPay QR</span>
          </button>

          <!-- Card -->
          <button
            type="button"
            on:click={() => selectMethod('card')}
            class="payment-option"
            class:selected={selectedMethod === 'card'}
          >
            <div class="radio-button">
              <div class="radio-dot"></div>
            </div>
            <div class="payment-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <rect x="2" y="6" width="20" height="12" rx="2" stroke-width="2"/>
                <path d="M2 10h20" stroke-width="2"/>
              </svg>
            </div>
            <span class="payment-label">Credit / Debit Card</span>
            <div class="card-logos">
              <div class="visa-logo">VISA</div>
              <div class="mastercard-logo">
                <div class="mc-circle red"></div>
                <div class="mc-circle orange"></div>
              </div>
            </div>
          </button>
        </div>

        <!-- Payment method specific content -->
        {#key selectedMethod}
        {#if selectedMethod === 'card'}
          <!-- Card form -->
          <div class="payment-form">
            {#if showCardError}
              <div class="error-message">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                </svg>
                {form?.error}
              </div>
            {/if}

            <form
              method="POST"
              action="?/payWithCard"
              class="card-form"
              autocomplete="off"
              on:submit|preventDefault={async (event) => {
                // PREVENT DOUBLE SUBMIT: Return immediately if already loading
                if (isLoading) return;

                // Validate full name and email
                if (!fullName || fullName.trim() === '') {
                  fullNameError = true;
                  return;
                }
                if (!email || email.trim() === '' || !isValidEmail(email)) {
                  emailError = true;
                  return;
                }

                isLoading = true;
                try {
                  const formElement = event.currentTarget as HTMLFormElement;
                  const formData = new FormData(formElement);

                  // SECURITY: Extract card data from form
                  const cardNumberRaw = formData.get('cardNumber')?.toString() || '';
                  const pan = cardNumberRaw.replace(/\s/g, ''); // Remove spaces
                  const expiryMonth = parseInt(formData.get('expiryMonth')?.toString() || '0');
                  const expiryYear = parseInt(formData.get('expiryYear')?.toString() || '0');
                  const cardHolderName = formData.get('cardHolderName')?.toString() || '';
                  const securityCode = formData.get('securityCode')?.toString() || '';

                  // Basic validation
                  if (!pan || !expiryMonth || !expiryYear || !cardHolderName || !securityCode) {
                    throw new Error('All card fields are required');
                  }

                  // SECURITY: Tokenize PAN/expiry with Beam (never touches our server)
                  const tokenResponse = await tokenizeCard({
                    pan,
                    expiryMonth,
                    expiryYear,
                    cardHolderName
                  });

                  // SECURITY: Clear card form fields immediately after tokenization
                  formElement.reset();
                  cardNumber = '';
                  expiryDate = '';

                  // SECURITY: Send only token + CVV + email + fullName to server
                  // NOTE: Due to Beam API design, CVV cannot be included in token
                  // and must be sent separately when creating the charge
                  const tokenizedFormData = new FormData();
                  tokenizedFormData.set('cardToken', tokenResponse.id);
                  tokenizedFormData.set('securityCode', securityCode); // Required by Beam API
                  tokenizedFormData.set('email', email);
                  tokenizedFormData.set('fullName', fullName);

                  // Submit the form with token
                  const response = await fetch('?/payWithCard', {
                    method: 'POST',
                    body: tokenizedFormData
                  });

                  // Handle redirect responses (3DS)
                  if (response.redirected) {
                    window.location.href = response.url;
                    return;
                  }

                  // Parse the response
                  const contentType = response.headers.get('content-type');
                  if (contentType && contentType.includes('application/json')) {
                    const result = await response.json();
                    if (result.type === 'redirect') {
                      window.location.href = result.location;
                    } else {
                      // Update the page with the response
                      window.location.reload();
                    }
                  } else {
                    // If not JSON, it's likely an HTML redirect or success page
                    window.location.reload();
                  }
                } catch (error) {
                  console.error('Card payment error:', error);
                  // Display error to user
                  form = {
                    error: error instanceof Error ? error.message : 'Payment failed. Please try again.'
                  };
                } finally {
                  isLoading = false;
                }
              }}
            >
              <div class="input-group">
                <label for="cardInfo" class="input-label">Card information</label>
                <input
                  class="form-input"
                  type="text"
                  inputmode="numeric"
                  id="cardNumber"
                  name="cardNumber"
                  placeholder="1234 1234 1234 1234"
                  maxlength="19"
                  autocomplete="off"
                  readonly
                  on:focus={(e) => e.currentTarget.removeAttribute('readonly')}
                  on:input={handleCardNumberInput}
                  bind:value={cardNumber}
                  required
                  disabled={isLoading}
                />
                <div class="card-expiry-cvc-grid">
                  <input
                    class="form-input"
                    type="text"
                    inputmode="numeric"
                    id="expiryDisplay"
                    placeholder="MM / YY"
                    maxlength="7"
                    autocomplete="off"
                    readonly
                    on:focus={(e) => e.currentTarget.removeAttribute('readonly')}
                    on:input={handleExpiryInput}
                    bind:value={expiryDate}
                    required
                    disabled={isLoading}
                  />
                  <input
                    class="form-input"
                    type="text"
                    inputmode="numeric"
                    id="securityCode"
                    name="securityCode"
                    placeholder="CVC"
                    maxlength="4"
                    autocomplete="off"
                    readonly
                    on:focus={(e) => e.currentTarget.removeAttribute('readonly')}
                    required
                    disabled={isLoading}
                  />
                </div>
                <input
                  type="hidden"
                  id="expiryMonth"
                  name="expiryMonth"
                  value=""
                />
                <input
                  type="hidden"
                  id="expiryYear"
                  name="expiryYear"
                  value=""
                />
              </div>

              <div class="input-group">
                <label for="cardHolderName" class="input-label">Cardholder name</label>
                <input
                  class="form-input"
                  type="text"
                  id="cardHolderName"
                  name="cardHolderName"
                  placeholder="Full name on card"
                  autocomplete="off"
                  readonly
                  on:focus={(e) => e.currentTarget.removeAttribute('readonly')}
                  required
                  disabled={isLoading}
                />
              </div>

              <button
                type="submit"
                class="cta-button primary"
                disabled={isLoading}
              >
                {isLoading ? 'Processing...' : `Pay ${formatPriceTHB(data.product.price)}`}
              </button>
            </form>
          </div>
        {:else if selectedMethod === 'promptpay'}
          <!-- PromptPay flow -->
          <div class="payment-form">
            {#if promptPayError}
              <div class="error-message">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                </svg>
                {promptPayError}
              </div>
            {/if}

            <!-- PromptPay instructions -->
            {#if !promptPayResult}
              <div class="promptpay-instructions">
                <div class="promptpay-info">
                  <p class="info-text">PromptPay is supported by bank apps and payment apps such as KBank, SCB, Bangkok Bank, Krungthai Bank and Krungsri.</p>
                </div>
                <div class="promptpay-step">
                  <svg class="step-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <rect x="5" y="4" width="14" height="17" rx="2" stroke-width="2"/>
                    <path d="M9 9h6M9 13h6" stroke-width="2" stroke-linecap="round"/>
                    <path d="M12 4v3" stroke-width="2" stroke-linecap="round"/>
                  </svg>
                  <p class="step-text">You will be shown a QR code to scan using your mobile banking app.</p>
                </div>
              </div>
            {:else}
              <!-- Guidance shown AFTER QR is generated -->
              <div class="payment-guidance">
                <div class="guidance-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                </div>
                <p class="guidance-text-th">หลังจากชำระเงินในแอปธนาคาร กรุณากลับมาที่หน้านี้ เราจะตรวจสอบการชำระเงินของคุณอัตโนมัติ</p>
                <p class="guidance-text-en">After paying in your banking app, return here. We'll check your payment automatically.</p>
              </div>
            {/if}

            {#if promptPayResult}
              <div class="qr-container">
                <div class="qr-wrapper">
                  <img
                    src={`data:image/png;base64,${promptPayResult.qrBase64}`}
                    alt="PromptPay QR"
                    class="qr-code"
                  />
                </div>
                <p class="qr-instructions">Scan this QR code with your mobile banking app</p>
                <p class="qr-expiry">
                  Expires at {new Date(promptPayResult.expiry).toLocaleString()}
                </p>

                <!-- Manual status check button -->
                {#if polling}
                  <button
                    type="button"
                    on:click={checkPaymentStatus}
                    class="check-status-button"
                    disabled={isCheckingStatus}
                  >
                    {#if isCheckingStatus}
                      <div class="button-spinner"></div>
                      <span>กำลังตรวจสอบ...</span>
                    {:else}
                      <svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                      </svg>
                      <span>ตรวจสอบสถานะการชำระเงิน</span>
                    {/if}
                  </button>
                {/if}

                <div class="qr-status">
                  {#if pollingError}
                    <span class="status-error">{pollingError}</span>
                  {:else if polling}
                    <div class="status-loading">
                      <div class="spinner"></div>
                      <span>Waiting for payment...</span>
                    </div>
                  {:else}
                    <span class="status-success">Payment successful!</span>
                  {/if}
                </div>
              </div>

              <form
                method="POST"
                action="?/payWithPromptPay"
                use:enhance={() => {
                  // PREVENT DOUBLE SUBMIT: Return immediately if already loading
                  if (isPromptPayLoading) {
                    return async () => {};
                  }

                  // Validate full name and email
                  if (!fullName || fullName.trim() === '') {
                    fullNameError = true;
                    return async () => {};
                  }
                  if (!email || email.trim() === '' || !isValidEmail(email)) {
                    emailError = true;
                    return async () => {};
                  }
                  isPromptPayLoading = true;
                  resetPromptPayState();
                  return async ({ result, update }) => {
                    isPromptPayLoading = false;
                    if (result.type === 'success' && result.data?.promptPay) {
                      promptPayResult = result.data.promptPay;
                      pollStatus(result.data.promptPay.chargeId, result.data.promptPay.expiry);
                    } else if (result.type === 'failure') {
                      promptPayError =
                        (result.data as ActionData)?.error ||
                        'Could not start PromptPay. Please try again.';
                      await update();
                    } else {
                      await update();
                    }
                  };
                }}
              >
                <input type="hidden" name="email" bind:value={email} />
                <input type="hidden" name="fullName" bind:value={fullName} />
                <button
                  type="submit"
                  class="cta-button secondary"
                  disabled={isPromptPayLoading}
                >
                  {isPromptPayLoading ? 'Refreshing...' : 'Generate new QR'}
                </button>
              </form>
            {:else}
              <form
                method="POST"
                action="?/payWithPromptPay"
                use:enhance={() => {
                  // PREVENT DOUBLE SUBMIT: Return immediately if already loading
                  if (isPromptPayLoading) {
                    return async () => {};
                  }

                  // Validate full name and email
                  if (!fullName || fullName.trim() === '') {
                    fullNameError = true;
                    return async () => {};
                  }
                  if (!email || email.trim() === '' || !isValidEmail(email)) {
                    emailError = true;
                    return async () => {};
                  }
                  isPromptPayLoading = true;
                  resetPromptPayState();
                  return async ({ result, update }) => {
                    isPromptPayLoading = false;
                    if (result.type === 'success' && result.data?.promptPay) {
                      promptPayResult = result.data.promptPay;
                      pollStatus(result.data.promptPay.chargeId, result.data.promptPay.expiry);
                    } else if (result.type === 'failure') {
                      promptPayError =
                        (result.data as ActionData)?.error ||
                        'Could not start PromptPay. Please try again.';
                      await update();
                    } else {
                      await update();
                    }
                  };
                }}
              >
                <input type="hidden" name="email" bind:value={email} />
                <input type="hidden" name="fullName" bind:value={fullName} />
                <button
                  type="submit"
                  class="cta-button primary"
                  disabled={isPromptPayLoading}
                >
                  {isPromptPayLoading ? 'Generating QR...' : `Generate PromptPay QR`}
                </button>
              </form>
            {/if}
          </div>
        {/if}
        {/key}

        <!-- Powered by Beam badge -->
        <div class="stripe-badge" style="margin-top: 1rem;">
          <span>Powered by <a href="https://beamcheckout.com/th" target="_blank" rel="noopener noreferrer" class="beam-link"><strong>Beam</strong></a> | <a href="https://beamcheckout.com/tncs" target="_blank" rel="noopener noreferrer" class="beam-link">Terms</a> · <a href="https://beamcheckout.com/privacy" target="_blank" rel="noopener noreferrer" class="beam-link">Privacy</a></span>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  /* CSS Variables */
  :root {
    --font-display: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    --font-body: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;

    /* Sophisticated slate color palette */
    --slate-50: #f8fafc;
    --slate-100: #f1f5f9;
    --slate-200: #e2e8f0;
    --slate-300: #cbd5e1;
    --slate-400: #94a3b8;
    --slate-500: #64748b;
    --slate-600: #475569;
    --slate-700: #334155;
    --slate-800: #1e293b;
    --slate-900: #0f172a;
    --slate-950: #020617;

    /* Accent colors */
    --accent-primary: #2563eb;
    --accent-success: #10b981;
    --accent-warning: #f59e0b;
    --accent-error: #ef4444;

    /* Shadows */
    --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
    --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
    --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);
    --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1);
  }

  :global(body) {
    margin: 0;
    font-family: var(--font-body);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  /* ========================================
     MOBILE BASE STYLES (320px+)
     ======================================== */

  /* Main container - mobile vertical stack */
  .checkout-container {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    background: linear-gradient(135deg, var(--slate-50) 0%, #fefefe 100%);
    overflow: visible;
  }

  /* Product showcase - mobile */
  .product-showcase {
    background: linear-gradient(165deg, var(--slate-900) 0%, var(--slate-800) 50%, var(--slate-900) 100%);
    padding: 3rem 2.5rem 2rem;
    position: relative;
    overflow: visible;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: auto;
  }

  .product-showcase::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background:
      radial-gradient(circle at 20% 30%, rgba(59, 130, 246, 0.08) 0%, transparent 50%),
      radial-gradient(circle at 80% 70%, rgba(168, 85, 247, 0.06) 0%, transparent 50%);
    pointer-events: none;
  }

  .showcase-content {
    max-width: 600px;
    width: 100%;
    margin: 0 auto;
    position: relative;
    z-index: 1;
    animation: fadeInUp 0.6s ease-out;
  }

  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Brand logo - showcase section - mobile */
  .brand-logo-container {
    display: flex;
    justify-content: center;
    margin-bottom: 2.5rem;
    padding-bottom: 2.5rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .brand-logo {
    max-width: 160px;
    max-height: 50px;
    width: auto;
    height: auto;
    object-fit: contain;
  }

  /* Product hero with gradient orbs - mobile */
  .product-hero {
    margin-bottom: 2rem;
  }

  .product-image-wrapper {
    width: 180px;
    height: 180px;
    margin: 0 auto;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .gradient-orb {
    position: absolute;
    border-radius: 50%;
    filter: blur(30px);
    opacity: 0;
    will-change: opacity, transform;
  }

  .orb-1 {
    width: 140px;
    height: 140px;
    background: linear-gradient(135deg, #3b82f6, #8b5cf6);
    top: -10px;
    left: -10px;
    animation: float1 10s ease-in-out infinite, fadeInOrb 0.5s ease-out forwards;
  }

  .orb-2 {
    width: 120px;
    height: 120px;
    background: linear-gradient(135deg, #ec4899, #f43f5e);
    bottom: -5px;
    right: -5px;
    animation: float2 12s ease-in-out infinite, fadeInOrb 0.5s ease-out forwards;
  }

  .orb-3 {
    width: 130px;
    height: 130px;
    background: linear-gradient(135deg, #06b6d4, #3b82f6);
    top: 50%;
    left: 50%;
    animation: floatCentered3 14s ease-in-out infinite, fadeInOrb 0.5s ease-out forwards;
  }

  @keyframes float1 {
    0%, 100% {
      transform: translateY(0) scale(1);
    }
    50% {
      transform: translateY(-20px) scale(1.08);
    }
  }

  @keyframes float2 {
    0%, 100% {
      transform: translateY(-10px) scale(1.02);
    }
    50% {
      transform: translateY(8px) scale(0.98);
    }
  }

  @keyframes floatCentered3 {
    0%, 100% {
      transform: translate(-50%, -50%) translateY(5px) scale(1.03);
    }
    50% {
      transform: translate(-50%, -50%) translateY(-12px) scale(0.97);
    }
  }

  @keyframes float {
    0%, 100% {
      transform: translateY(0) scale(1);
    }
    50% {
      transform: translateY(-15px) scale(1.05);
    }
  }

  @keyframes floatCentered {
    0%, 100% {
      transform: translate(-50%, -50%) translateY(0) scale(1);
    }
    50% {
      transform: translate(-50%, -50%) translateY(-15px) scale(1.05);
    }
  }

  @keyframes fadeInOrb {
    from {
      opacity: 0;
    }
    to {
      opacity: 0.5;
    }
  }

  .product-icon {
    width: 120px;
    height: 120px;
    background: var(--slate-800);
    border: 2px solid var(--slate-700);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    z-index: 2;
    box-shadow: 0 15px 30px -8px rgb(0 0 0 / 0.5);
  }

  .product-icon svg {
    width: 60px;
    height: 60px;
    color: var(--slate-200);
    filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.3));
  }

  /* Product image container - mobile */
  .product-image-container {
    width: 180px;
    height: 180px;
    border-radius: 0.75rem;
    overflow: hidden;
    position: relative;
    z-index: 2;
    box-shadow: 0 15px 30px -8px rgb(0 0 0 / 0.5);
    background: var(--slate-800);
    border: 2px solid var(--slate-700);
  }

  .product-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
    display: block;
  }

  /* Product details - mobile */
  .product-details {
    color: white;
  }

  .product-name {
    font-family: var(--font-display);
    font-size: 1.75rem;
    font-weight: 800;
    line-height: 1.2;
    margin: 0 0 0.75rem;
    color: white;
    letter-spacing: -0.02em;
  }

  .product-description {
    font-size: 0.9375rem;
    line-height: 1.6;
    color: var(--slate-300);
    margin: 0 0 1.5rem;
  }

  /* Price container - mobile */
  .price-container {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1.5rem 0 0;
    border-top: 1px solid var(--slate-700);
  }

  .price-label {
    font-size: 0.8125rem;
    color: var(--slate-400);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-weight: 600;
  }

  .price-value {
    font-family: var(--font-display);
    font-size: 2rem;
    font-weight: 800;
    color: white;
    letter-spacing: -0.03em;
  }

  /* Checkout form section - mobile */
  .checkout-form-section {
    display: flex;
    flex-direction: column;
    background: white;
    position: relative;
    min-height: auto;
    overflow: visible;
  }

  .form-content {
    flex: 1;
    padding: 2rem 1.25rem;
    max-width: 100%;
    margin: 0 auto;
    width: 100%;
  }

  /* Stripe badge - mobile */
  .stripe-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    margin-bottom: 2rem;
    font-size: 0.75rem;
    color: var(--slate-500);
    text-align: center;
  }

  .lock-icon {
    width: 1rem;
    height: 1rem;
    color: var(--slate-500);
    flex-shrink: 0;
  }

  .stripe-badge strong {
    font-weight: 600;
    color: var(--slate-700);
  }

  .beam-link {
    color: #08154d;
    text-decoration: none;
    transition: opacity 0.2s ease;
  }

  .beam-link strong {
    color: #08154d;
  }

  .beam-link:hover {
    opacity: 0.7;
  }

  /* Form sections - mobile */
  .form-section {
    margin-bottom: 2rem;
  }

  .section-title {
    font-family: var(--font-display);
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--slate-900);
    margin: 0 0 1rem;
    letter-spacing: -0.02em;
  }

  /* Input groups - mobile */
  .input-group {
    margin-bottom: 1.25rem;
  }

  /* Custom spacing for cardholder name */
  .card-form > .input-group:last-of-type {
    margin-top: -0.75rem;
    margin-bottom: 1rem;
  }

  .input-label {
    display: block;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--slate-700);
    margin-bottom: 0.5rem;
    letter-spacing: -0.01em;
  }

  /* Form inputs - mobile with touch targets */
  .form-input {
    width: 100%;
    padding: 0.75rem;
    font-size: 0.9375rem;
    font-family: var(--font-body);
    color: var(--slate-900);
    background: white;
    border: 1.5px solid var(--slate-300);
    border-radius: 0.5rem;
    transition: all 0.2s ease;
    box-sizing: border-box;
    min-height: 40px;
  }

  .form-input::placeholder {
    color: var(--slate-400);
  }

  .form-input:focus {
    outline: none;
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }

  .form-input:disabled {
    background: var(--slate-50);
    cursor: not-allowed;
    opacity: 0.6;
  }

  .form-input:read-only {
    cursor: text;
    background: white;
    opacity: 1;
  }

  .input-hint {
    display: block;
    font-size: 0.8125rem;
    color: var(--slate-500);
    margin-top: 0.375rem;
  }

  .input-error {
    border-color: var(--accent-error) !important;
    box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1) !important;
  }

  .error-hint {
    display: block;
    font-size: 0.8125rem;
    color: var(--accent-error);
    margin-top: 0.375rem;
    font-weight: 500;
  }

  /* Payment methods - mobile */
  .payment-methods {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }

  .payment-option {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.8rem;
    background: white;
    border: 1.5px solid var(--slate-300);
    border-radius: 0.75rem;
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: var(--font-body);
    width: 100%;
    text-align: left;
    min-height: 45px;
  }

  .payment-option:hover {
    border-color: var(--slate-400);
    box-shadow: var(--shadow-sm);
  }

  .payment-option.selected {
    border-color: var(--accent-primary);
    background: rgba(37, 99, 235, 0.03);
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }

  .radio-button {
    width: 1.25rem;
    height: 1.25rem;
    border: 2px solid var(--slate-400);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: all 0.2s ease;
  }

  .payment-option.selected .radio-button {
    border-color: var(--accent-primary);
    background: var(--accent-primary);
  }

  .radio-dot {
    width: 0.5rem;
    height: 0.5rem;
    background: white;
    border-radius: 50%;
    opacity: 0;
    transform: scale(0);
    transition: all 0.2s ease;
  }

  .payment-option.selected .radio-dot {
    opacity: 1;
    transform: scale(1);
  }

  .payment-icon {
    width: 1.875rem;
    height: 1.875rem;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .payment-icon svg {
    width: 100%;
    height: 100%;
    color: var(--slate-600);
  }

  .payment-icon.promptpay svg {
    border-radius: 0.375rem;
  }

  .payment-label {
    flex: 1;
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--slate-800);
  }

  .card-logos {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .visa-logo {
    padding: 0.25rem 0.5rem;
    background: #1434cb;
    color: white;
    font-size: 0.75rem;
    font-weight: 700;
    border-radius: 0.25rem;
  }

  .mastercard-logo {
    display: flex;
    position: relative;
    width: 2rem;
    height: 1.25rem;
  }

  .mc-circle {
    width: 1rem;
    height: 1rem;
    border-radius: 50%;
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
  }

  .mc-circle.red {
    background: #eb001b;
    left: 0;
  }

  .mc-circle.orange {
    background: #f79e1b;
    left: 0.5rem;
  }

  /* Error message */
  .error-message {
    display: flex;
    gap: 0.75rem;
    padding: 1rem;
    background: rgba(239, 68, 68, 0.05);
    border: 1px solid rgba(239, 68, 68, 0.2);
    border-radius: 0.75rem;
    margin-bottom: 1.5rem;
    color: var(--accent-error);
    font-size: 0.875rem;
    line-height: 1.6;
  }

  .error-message svg {
    width: 1.25rem;
    height: 1.25rem;
    flex-shrink: 0;
    margin-top: 0.125rem;
  }

  /* Payment forms */
  .payment-form {
    animation: slideDown 0.3s ease-out;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .card-form {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .card-expiry-cvc-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
    margin-top: -1px;
  }

  .card-expiry-cvc-grid input:first-child {
    border-right: none;
    border-top-left-radius: 0;
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
    border-bottom-left-radius: 0.5rem;
  }

  .card-expiry-cvc-grid input:last-child {
    border-top-left-radius: 0;
    border-top-right-radius: 0;
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0.5rem;
  }

  .input-group > .form-input:first-of-type {
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  }

  .card-details-grid {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr;
    gap: 0.75rem;
  }

  /* CTA Buttons - mobile with touch targets */
  .cta-button {
    width: 100%;
    padding: 1rem 1.5rem;
    font-family: var(--font-body);
    font-size: 1rem;
    font-weight: 600;
    border: none;
    border-radius: 0.75rem;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    letter-spacing: -0.01em;
    min-height: 48px;
  }

  .cta-button.primary {
    background: linear-gradient(135deg, var(--slate-900) 0%, var(--slate-800) 100%);
    color: white;
    box-shadow: var(--shadow-md);
  }

  .cta-button.primary:hover:not(:disabled) {
    background: linear-gradient(135deg, var(--slate-800) 0%, var(--slate-700) 100%);
    box-shadow: var(--shadow-lg);
    transform: translateY(-1px);
  }

  .cta-button.primary:active:not(:disabled) {
    transform: translateY(0);
    box-shadow: var(--shadow-sm);
  }

  .cta-button.secondary {
    background: white;
    color: var(--slate-900);
    border: 1.5px solid var(--slate-300);
  }

  .cta-button.secondary:hover:not(:disabled) {
    border-color: var(--slate-400);
    background: var(--slate-50);
  }

  .cta-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* PromptPay instructions - mobile */
  .promptpay-instructions {
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
    margin-bottom: 1.5rem;
    padding: 1rem;
    background: var(--slate-50);
    border: 1px solid var(--slate-200);
    border-radius: 0.75rem;
  }

  .promptpay-info {
    margin: 0;
  }

  .info-text {
    font-size: 0.875rem;
    line-height: 1.6;
    color: var(--slate-600);
    margin: 0;
  }

  .promptpay-step {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding-top: 0.875rem;
    border-top: 1px solid var(--slate-200);
  }

  .step-icon {
    width: 1.75rem;
    height: 1.75rem;
    color: var(--slate-500);
    flex-shrink: 0;
  }

  .step-text {
    font-size: 0.875rem;
    line-height: 1.6;
    color: var(--slate-600);
    margin: 0.125rem 0 0 0;
  }

  /* QR Code display - mobile */
  .qr-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.875rem;
    padding: 1.5rem;
    background: var(--slate-50);
    border: 1px solid var(--slate-200);
    border-radius: 1rem;
    margin-bottom: 1.5rem;
  }

  .qr-wrapper {
    padding: 1rem;
    background: white;
    border-radius: 0.75rem;
    box-shadow: var(--shadow-md);
  }

  .qr-code {
    width: 200px;
    height: 200px;
    display: block;
  }

  .qr-instructions {
    font-size: 0.875rem;
    color: var(--slate-700);
    text-align: center;
    font-weight: 500;
    margin: 0;
  }

  .qr-expiry {
    font-size: 0.8125rem;
    color: var(--slate-500);
    margin: 0;
  }

  .qr-status {
    width: 100%;
    padding: 0.75rem;
    text-align: center;
    font-size: 0.875rem;
    font-weight: 500;
  }

  .status-error {
    color: var(--accent-error);
  }

  .status-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    color: var(--slate-600);
  }

  .spinner {
    width: 1rem;
    height: 1rem;
    border: 2px solid var(--slate-300);
    border-top-color: var(--slate-600);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .status-success {
    color: var(--accent-success);
  }

  /* Security notice */
  .security-notice {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 1rem;
    margin-top: 1.5rem;
    font-size: 0.8125rem;
    color: var(--slate-600);
    text-align: center;
  }

  .security-notice svg {
    width: 1rem;
    height: 1rem;
    color: var(--accent-success);
    flex-shrink: 0;
  }

  /* Security badges - mobile stack */
  .security-badges-checkout {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-top: 1.5rem;
  }

  .badge-checkout {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 1rem;
    background: var(--slate-50);
    border: 1px solid var(--slate-200);
    border-radius: 0.75rem;
    transition: all 0.3s ease;
  }

  .badge-checkout:hover {
    background: var(--slate-100);
    border-color: var(--slate-300);
    transform: translateY(-1px);
    box-shadow: var(--shadow-sm);
  }

  .badge-checkout svg {
    width: 1.5rem;
    height: 1.5rem;
    color: var(--accent-success);
    flex-shrink: 0;
    margin-top: 0.125rem;
  }

  .badge-checkout .badge-title {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--slate-900);
    line-height: 1.3;
    margin-bottom: 0.125rem;
  }

  .badge-checkout .badge-subtitle {
    font-size: 0.75rem;
    color: var(--slate-500);
    line-height: 1.3;
  }

  /* Footer - mobile */
  .checkout-footer {
    padding: 1.25rem;
    border-top: 1px solid var(--slate-200);
  }

  .footer-links {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 0.5rem;
    font-size: 0.8125rem;
  }

  .footer-links a {
    color: var(--slate-600);
    text-decoration: none;
    transition: color 0.2s ease;
  }

  .footer-links a:hover {
    color: var(--slate-900);
  }

  .divider {
    color: var(--slate-300);
  }

  /* Payment guidance message (shown after QR generation) */
  .payment-guidance {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem;
    margin-bottom: 1rem;
    background: rgba(37, 99, 235, 0.05);
    border: 1px solid rgba(37, 99, 235, 0.2);
    border-radius: 0.75rem;
  }

  .guidance-icon {
    width: 2rem;
    height: 2rem;
    color: var(--accent-primary);
  }

  .guidance-icon svg {
    width: 100%;
    height: 100%;
  }

  .guidance-text-th {
    font-size: 0.9375rem;
    line-height: 1.6;
    color: var(--slate-700);
    text-align: center;
    margin: 0;
    font-weight: 500;
  }

  .guidance-text-en {
    font-size: 0.8125rem;
    line-height: 1.5;
    color: var(--slate-500);
    text-align: center;
    margin: 0;
  }

  /* Manual check status button */
  .check-status-button {
    width: 100%;
    padding: 0.875rem 1.25rem;
    background: white;
    color: var(--slate-700);
    border: 1.5px solid var(--slate-300);
    border-radius: 0.625rem;
    font-size: 0.9375rem;
    font-weight: 600;
    font-family: var(--font-body);
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
    min-height: 44px;
  }

  .check-status-button:hover:not(:disabled) {
    border-color: var(--accent-primary);
    background: rgba(37, 99, 235, 0.03);
    color: var(--accent-primary);
  }

  .check-status-button:active:not(:disabled) {
    transform: scale(0.98);
  }

  .check-status-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .check-icon {
    width: 1.25rem;
    height: 1.25rem;
    flex-shrink: 0;
  }

  .button-spinner {
    width: 1rem;
    height: 1rem;
    border: 2px solid var(--slate-300);
    border-top-color: var(--slate-600);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    flex-shrink: 0;
  }

  /* ========================================
     TABLET BREAKPOINT (md: 768px+)
     ======================================== */

  @media (min-width: 768px) {
    .product-showcase {
      padding: 3rem 2rem;
    }

    .brand-logo {
      max-width: 200px;
      max-height: 60px;
    }

    .product-image-wrapper {
      width: 220px;
      height: 220px;
    }

    .product-icon {
      width: 150px;
      height: 150px;
    }

    .product-icon svg {
      width: 75px;
      height: 75px;
    }

    .product-image-container {
      width: 220px;
      height: 220px;
    }

    .product-name {
      font-size: 2.25rem;
      margin-bottom: 1rem;
    }

    .product-description {
      font-size: 1.0625rem;
    }

    .price-container {
      gap: 0.75rem;
      padding-top: 2rem;
    }

    .price-value {
      font-size: 2.75rem;
    }

    .form-content {
      padding: 2.5rem 2rem;
      max-width: 540px;
    }

    .section-title {
      font-size: 1.5rem;
      margin-bottom: 1.25rem;
    }

    .qr-code {
      width: 220px;
      height: 220px;
    }

    .qr-instructions {
      font-size: 0.9375rem;
    }

    .security-badges-checkout {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
    }

    .card-details-grid {
      grid-template-columns: 1fr 1fr 1fr;
    }

    .checkout-footer {
      padding: 1.5rem 2rem;
    }

    .check-status-button {
      padding: 1rem 1.5rem;
    }
  }

  /* ========================================
     DESKTOP BREAKPOINT (lg: 1024px+)
     ======================================== */

  @media (min-width: 1024px) {
    /* Switch to side-by-side grid layout */
    .checkout-container {
      display: grid;
      grid-template-columns: 3fr 2fr;
      height: 100vh;
      overflow: hidden;
    }

    .product-showcase {
      padding: 4rem 3rem;
      height: 100vh;
      overflow-y: auto;
      overflow-x: hidden;
    }

    .showcase-content {
      max-width: 600px;
    }

    .brand-logo {
      max-width: 240px;
      max-height: 70px;
    }

    .product-hero {
      margin-bottom: 3rem;
    }

    .product-image-wrapper {
      width: 260px;
      height: 260px;
    }

    .gradient-orb {
      filter: blur(45px);
    }

    .orb-1 {
      animation: float1 10s ease-in-out infinite, fadeInOrbDesktop 0.5s ease-out forwards;
    }

    .orb-2 {
      animation: float2 12s ease-in-out infinite, fadeInOrbDesktop 0.5s ease-out forwards;
    }

    .orb-3 {
      animation: floatCentered3 14s ease-in-out infinite, fadeInOrbDesktop 0.5s ease-out forwards;
    }

    @keyframes fadeInOrbDesktop {
      from {
        opacity: 0;
      }
      to {
        opacity: 0.6;
      }
    }

    .orb-1 {
      width: 200px;
      height: 200px;
      top: -15px;
      left: -15px;
    }

    .orb-2 {
      width: 165px;
      height: 165px;
      bottom: -10px;
      right: -10px;
    }

    .orb-3 {
      width: 185px;
      height: 185px;
    }

    .product-icon {
      width: 170px;
      height: 170px;
      border: 3px solid var(--slate-700);
      box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.5);
    }

    .product-icon svg {
      width: 85px;
      height: 85px;
    }

    .product-image-container {
      width: 260px;
      height: 260px;
      border-radius: 1rem;
      border: 3px solid var(--slate-700);
      box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.5);
    }

    .product-name {
      font-size: 2.5rem;
    }

    .product-description {
      font-size: 1.125rem;
      line-height: 1.7;
      margin-bottom: 2rem;
    }

    .price-value {
      font-size: 3.25rem;
    }

    .checkout-form-section {
      height: 100vh;
      overflow-y: auto;
      overflow-x: hidden;
    }

    .form-content {
      padding: 3.5rem 2.5rem;
      max-width: 520px;
    }

    .stripe-badge {
      margin-bottom: 2.5rem;
      font-size: 0.8125rem;
    }

    .lock-icon {
      width: 1.125rem;
      height: 1.125rem;
    }

    .form-section {
      margin-bottom: 2.5rem;
    }

    .payment-option {
      gap: 1rem;
      padding: 1rem 1.25rem;
    }

    .payment-icon {
      width: 2rem;
      height: 2rem;
    }

    .promptpay-instructions {
      gap: 1rem;
      padding: 1.25rem;
    }

    .promptpay-step {
      padding-top: 1rem;
    }

    .step-icon {
      width: 2rem;
      height: 2rem;
    }

    .qr-container {
      gap: 1rem;
      padding: 2rem;
    }

    .qr-code {
      width: 240px;
      height: 240px;
    }

    .checkout-footer {
      padding: 1.5rem 2.5rem;
    }

    .footer-links {
      gap: 0.75rem;
    }
  }

  /* ========================================
     LARGE DESKTOP BREAKPOINT (xl: 1280px+)
     ======================================== */

  @media (min-width: 1280px) {
    .product-showcase {
      padding: 4rem 5rem;
    }

    .product-image-wrapper {
      width: 280px;
      height: 280px;
    }

    .gradient-orb {
      filter: blur(50px);
    }

    .orb-1 {
      width: 220px;
      height: 220px;
      top: -20px;
      left: -20px;
    }

    .orb-2 {
      width: 180px;
      height: 180px;
    }

    .orb-3 {
      width: 200px;
      height: 200px;
    }

    .product-icon {
      width: 180px;
      height: 180px;
    }

    .product-icon svg {
      width: 90px;
      height: 90px;
    }

    .product-image-container {
      width: 280px;
      height: 280px;
    }

    .product-name {
      font-size: 2.75rem;
    }

    .price-value {
      font-size: 3.5rem;
    }

    .form-content {
      padding: 4rem 3rem;
    }
  }

  /* ========================================
     ACCESSIBILITY
     ======================================== */

  @media (prefers-reduced-motion: reduce) {
    .gradient-orb,
    .showcase-content {
      animation: none;
    }

    .gradient-orb {
      opacity: 0.5;
    }

    .payment-form {
      animation: none;
    }
  }
</style>
