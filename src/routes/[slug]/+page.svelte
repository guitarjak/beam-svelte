<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';
  import { onDestroy, onMount } from 'svelte';

  // Receive product data from +page.server.ts
  export let data: PageData;
  export let form: ActionData;

  // UI state
  let selectedMethod: 'promptpay' | 'card' = 'card';
  let email = '';
  let isLoading = false;
  let isPromptPayLoading = false;
  let promptPayError = '';
  let promptPayResult: { chargeId: string; qrBase64: string; expiry: string } | null = null;
  let polling = false;
  let pollingError = '';
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let mounted = false;

  onMount(() => {
    mounted = true;
  });

  // Helper: format price in THB from satang
  function formatPriceTHB(satang: number) {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB'
    }).format(satang / 100);
  }

  function selectMethod(method: 'promptpay' | 'card') {
    selectedMethod = method;
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

  onDestroy(() => {
    stopPolling();
  });
</script>

<svelte:head>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
</svelte:head>

<!-- Premium checkout page with asymmetric 7-5 grid and trust signals -->
<div class="checkout-container">
  <!-- Left side: Product showcase (60% - 7 columns) -->
  <div class="product-showcase">
    <div class="showcase-content">
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
      <!-- Powered by Stripe badge -->
      <div class="stripe-badge">
        <svg class="lock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" stroke-width="2"/>
          <path d="M7 11V7a5 5 0 0110 0v4" stroke-width="2"/>
        </svg>
        <span>Secure checkout powered by <strong>Stripe</strong></span>
      </div>

      <!-- Contact information -->
      <div class="form-section">
        <h2 class="section-title">Contact information</h2>
        <div class="input-group">
          <label for="email" class="input-label">Email address</label>
          <input
            type="email"
            id="email"
            bind:value={email}
            placeholder="you@example.com"
            class="form-input"
          />
          <span class="input-hint">Receipt will be sent to this address</span>
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
        {#if selectedMethod === 'card'}
          <!-- Card form -->
          <div class="payment-form">
            {#if form?.error}
              <div class="error-message">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                </svg>
                {form.error}
              </div>
            {/if}

            <form
              method="POST"
              action="?/payWithCard"
              class="card-form"
              autocomplete="new-password"
              use:enhance={() => {
                isLoading = true;
                return async ({ update }) => {
                  isLoading = false;
                  await update();
                };
              }}
            >
              <div class="input-group">
                <label for="cardHolderName" class="input-label">Cardholder name</label>
                <input
                  class="form-input"
                  type="text"
                  id="cardHolderName"
                  name="cardHolderName"
                  placeholder="JOHN DOE"
                  autocomplete="off"
                  readonly
                  on:focus={(e) => e.currentTarget.removeAttribute('readonly')}
                  required
                  disabled={isLoading}
                />
              </div>

              <div class="input-group">
                <label for="cardNumber" class="input-label">Card number</label>
                <input
                  class="form-input"
                  type="text"
                  id="cardNumber"
                  name="cardNumber"
                  placeholder="4111 1111 1111 1111"
                  maxlength="19"
                  autocomplete="off"
                  readonly
                  on:focus={(e) => e.currentTarget.removeAttribute('readonly')}
                  required
                  disabled={isLoading}
                />
              </div>

              <div class="card-details-grid">
                <div class="input-group">
                  <label for="expiryMonth" class="input-label">MM</label>
                  <input
                    class="form-input"
                    type="text"
                    inputmode="numeric"
                    id="expiryMonth"
                    name="expiryMonth"
                    placeholder="12"
                    maxlength="2"
                    autocomplete="off"
                    readonly
                    on:focus={(e) => e.currentTarget.removeAttribute('readonly')}
                    required
                    disabled={isLoading}
                  />
                </div>
                <div class="input-group">
                  <label for="expiryYear" class="input-label">YY</label>
                  <input
                    class="form-input"
                    type="text"
                    inputmode="numeric"
                    id="expiryYear"
                    name="expiryYear"
                    placeholder="26"
                    maxlength="2"
                    autocomplete="off"
                    readonly
                    on:focus={(e) => e.currentTarget.removeAttribute('readonly')}
                    required
                    disabled={isLoading}
                  />
                </div>
                <div class="input-group">
                  <label for="securityCode" class="input-label">CVC</label>
                  <input
                    class="form-input"
                    type="text"
                    inputmode="numeric"
                    id="securityCode"
                    name="securityCode"
                    placeholder="123"
                    maxlength="4"
                    autocomplete="off"
                    readonly
                    on:focus={(e) => e.currentTarget.removeAttribute('readonly')}
                    required
                    disabled={isLoading}
                  />
                </div>
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
            {#if promptPayError || (form?.error && selectedMethod === 'promptpay')}
              <div class="error-message">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                </svg>
                {promptPayError || form?.error}
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

        <!-- Security notice -->
        <div class="security-notice">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/>
          </svg>
          <span>Your payment information is encrypted and secure</span>
        </div>

        <!-- Security badges -->
        <div class="security-badges-checkout">
          <div class="badge-checkout">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3zm-1 14.93h2V19h-2v-2.07zM13 14h-2V6h2v8z"/>
            </svg>
            <div>
              <div class="badge-title">SSL Encrypted</div>
              <div class="badge-subtitle">Secure 256-bit</div>
            </div>
          </div>
          <div class="badge-checkout">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
            <div>
              <div class="badge-title">GDPR Compliant</div>
              <div class="badge-subtitle">EU protected</div>
            </div>
          </div>
          <div class="badge-checkout">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M9 11.75c-.69 0-1.25.56-1.25 1.25s.56 1.25 1.25 1.25 1.25-.56 1.25-1.25-.56-1.25-1.25-1.25zm6 0c-.69 0-1.25.56-1.25 1.25s.56 1.25 1.25 1.25 1.25-.56 1.25-1.25-.56-1.25-1.25-1.25zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8 0-.29.02-.58.05-.86 2.36-1.05 4.23-2.98 5.21-5.37C11.07 8.33 14.05 10 17.42 10c.78 0 1.53-.09 2.25-.26.21.71.33 1.47.33 2.26 0 4.41-3.59 8-8 8z"/>
            </svg>
            <div>
              <div class="badge-title">Money Back</div>
              <div class="badge-subtitle">30-day guarantee</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="checkout-footer">
      <div class="footer-links">
        <a href="#">Terms</a>
        <span class="divider">·</span>
        <a href="#">Privacy</a>
        <span class="divider">·</span>
        <a href="#">Support</a>
      </div>
    </div>
  </div>
</div>

<style>
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

  /* Main container with asymmetric 7-5 grid (60/40 split) */
  .checkout-container {
    display: grid;
    grid-template-columns: 3fr 2fr;
    height: 100vh;
    background: linear-gradient(135deg, var(--slate-50) 0%, #fefefe 100%);
    overflow: hidden;
  }

  /* Left side: Product showcase (60%) */
  .product-showcase {
    background: linear-gradient(165deg, var(--slate-900) 0%, var(--slate-800) 50%, var(--slate-900) 100%);
    padding: 4rem 5rem;
    position: relative;
    overflow-y: auto;
    overflow-x: hidden;
    display: flex;
    align-items: center;
    height: 100vh;
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

  /* Trust badge */
  .trust-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: rgba(16, 185, 129, 0.1);
    border: 1px solid rgba(16, 185, 129, 0.3);
    border-radius: 2rem;
    color: var(--accent-success);
    font-size: 0.875rem;
    font-weight: 500;
    margin-bottom: 3rem;
    opacity: 0;
    transition: all 0.4s ease-out;
  }

  .trust-badge.mounted {
    opacity: 1;
    animation: slideInLeft 0.6s ease-out;
  }

  @keyframes slideInLeft {
    from {
      opacity: 0;
      transform: translateX(-30px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  .shield-icon {
    width: 1.25rem;
    height: 1.25rem;
  }

  /* Product hero with gradient orbs */
  .product-hero {
    margin-bottom: 3rem;
  }

  .product-image-wrapper {
    width: 280px;
    height: 280px;
    margin: 0 auto;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .gradient-orb {
    position: absolute;
    border-radius: 50%;
    filter: blur(50px);
    opacity: 0.6;
    animation: float 8s ease-in-out infinite;
  }

  .orb-1 {
    width: 220px;
    height: 220px;
    background: linear-gradient(135deg, #3b82f6, #8b5cf6);
    top: -20px;
    left: -20px;
    animation-delay: 0s;
  }

  .orb-2 {
    width: 180px;
    height: 180px;
    background: linear-gradient(135deg, #ec4899, #f43f5e);
    bottom: -10px;
    right: -10px;
    animation-delay: 1s;
  }

  .orb-3 {
    width: 200px;
    height: 200px;
    background: linear-gradient(135deg, #06b6d4, #3b82f6);
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    animation-delay: 2s;
  }

  @keyframes float {
    0%, 100% {
      transform: translateY(0) scale(1);
    }
    50% {
      transform: translateY(-20px) scale(1.05);
    }
  }

  .product-icon {
    width: 180px;
    height: 180px;
    background: var(--slate-800);
    border: 3px solid var(--slate-700);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    z-index: 2;
    box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.5);
  }

  .product-icon svg {
    width: 90px;
    height: 90px;
    color: var(--slate-200);
    filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.3));
  }

  /* Product image container and styling */
  .product-image-container {
    width: 280px;
    height: 280px;
    border-radius: 1rem;
    overflow: hidden;
    position: relative;
    z-index: 2;
    box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.5);
    background: var(--slate-800);
    border: 3px solid var(--slate-700);
  }

  .product-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
    display: block;
  }

  /* Product details */
  .product-details {
    color: white;
  }

  .rating-container {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }

  .stars {
    display: flex;
    gap: 0.25rem;
  }

  .star {
    width: 1.25rem;
    height: 1.25rem;
    color: #fbbf24;
    opacity: 0;
    animation: starPop 0.4s ease-out forwards;
  }

  .star.mounted {
    animation: starPop 0.4s ease-out forwards;
  }

  @keyframes starPop {
    0% {
      opacity: 0;
      transform: scale(0.3) rotate(-45deg);
    }
    50% {
      transform: scale(1.1) rotate(5deg);
    }
    100% {
      opacity: 1;
      transform: scale(1) rotate(0deg);
    }
  }

  .rating-text {
    font-size: 0.9375rem;
    color: var(--slate-300);
    font-weight: 500;
  }

  .product-name {
    font-family: var(--font-display);
    font-size: 2.75rem;
    font-weight: 800;
    line-height: 1.2;
    margin: 0 0 1rem;
    color: white;
    letter-spacing: -0.02em;
  }

  .product-description {
    font-size: 1.125rem;
    line-height: 1.7;
    color: var(--slate-300);
    margin: 0 0 2rem;
  }

  /* Features list with checkmarks */
  .features-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-bottom: 3rem;
  }

  .feature-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 1rem;
    color: var(--slate-200);
    opacity: 0;
    transform: translateX(-20px);
    transition: all 0.4s ease-out;
  }

  .feature-item.mounted {
    opacity: 1;
    transform: translateX(0);
  }

  .checkmark {
    width: 1.5rem;
    height: 1.5rem;
    color: var(--accent-success);
    flex-shrink: 0;
  }

  /* Price container */
  .price-container {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 2rem 0 0;
    border-top: 1px solid var(--slate-700);
  }

  .price-label {
    font-size: 0.875rem;
    color: var(--slate-400);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-weight: 600;
  }

  .price-value {
    font-family: var(--font-display);
    font-size: 3.5rem;
    font-weight: 800;
    color: white;
    letter-spacing: -0.03em;
  }

  /* Security badges */
  .security-badges {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 1rem;
  }

  .badge {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 0.75rem;
    backdrop-filter: blur(10px);
    transition: all 0.3s ease;
  }

  .badge:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.15);
    transform: translateY(-2px);
  }

  .badge svg {
    width: 2rem;
    height: 2rem;
    color: var(--accent-success);
    flex-shrink: 0;
  }

  .badge-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: white;
    line-height: 1.2;
  }

  .badge-subtitle {
    font-size: 0.75rem;
    color: var(--slate-400);
    line-height: 1.2;
  }

  /* Right side: Checkout form (40%) */
  .checkout-form-section {
    display: flex;
    flex-direction: column;
    background: white;
    position: relative;
    height: 100vh;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .form-content {
    flex: 1;
    padding: 4rem 3rem;
    max-width: 520px;
    margin: 0 auto;
    width: 100%;
    min-height: min-content;
  }

  /* Stripe badge */
  .stripe-badge {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.875rem 1.25rem;
    background: var(--slate-50);
    border: 1px solid var(--slate-200);
    border-radius: 0.75rem;
    margin-bottom: 2.5rem;
    font-size: 0.875rem;
    color: var(--slate-700);
  }

  .lock-icon {
    width: 1.125rem;
    height: 1.125rem;
    color: var(--slate-500);
    flex-shrink: 0;
  }

  .stripe-badge strong {
    font-weight: 700;
    color: #635bff;
  }

  /* Form sections */
  .form-section {
    margin-bottom: 2.5rem;
  }

  .section-title {
    font-family: var(--font-display);
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--slate-900);
    margin: 0 0 1.25rem;
    letter-spacing: -0.02em;
  }

  /* Input groups */
  .input-group {
    margin-bottom: 1.25rem;
  }

  .input-label {
    display: block;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--slate-700);
    margin-bottom: 0.5rem;
    letter-spacing: -0.01em;
  }

  .form-input {
    width: 100%;
    padding: 0.875rem 1rem;
    font-size: 1rem;
    font-family: var(--font-body);
    color: var(--slate-900);
    background: white;
    border: 1.5px solid var(--slate-300);
    border-radius: 0.5rem;
    transition: all 0.2s ease;
    box-sizing: border-box;
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

  /* Payment methods */
  .payment-methods {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }

  .payment-option {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem 1.25rem;
    background: white;
    border: 1.5px solid var(--slate-300);
    border-radius: 0.75rem;
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: var(--font-body);
    width: 100%;
    text-align: left;
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
    width: 2rem;
    height: 2rem;
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

  .payment-icon.gpay {
    background: white;
    border: 1px solid var(--slate-300);
    border-radius: 0.375rem;
  }

  .payment-icon.gpay span {
    font-weight: 700;
    font-size: 1.125rem;
    color: #4285f4;
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

  /* Info notice */
  .info-notice {
    display: flex;
    gap: 0.75rem;
    padding: 1rem;
    background: rgba(37, 99, 235, 0.05);
    border: 1px solid rgba(37, 99, 235, 0.2);
    border-radius: 0.75rem;
    margin-bottom: 1.5rem;
  }

  .info-icon {
    width: 1.25rem;
    height: 1.25rem;
    color: var(--accent-primary);
    flex-shrink: 0;
    margin-top: 0.125rem;
  }

  .info-notice p {
    margin: 0;
    font-size: 0.875rem;
    line-height: 1.6;
    color: var(--slate-700);
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

  .card-details-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 0.75rem;
  }

  /* CTA Buttons */
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

  .cta-button.gpay-button {
    background: #000;
    color: white;
    padding: 1.25rem 1.5rem;
  }

  .cta-button.gpay-button:hover:not(:disabled) {
    background: #1a1a1a;
  }

  .cta-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .gpay-logo {
    height: 1.5rem;
    width: auto;
  }

  /* QR Code display */
  .qr-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 2rem;
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
    width: 240px;
    height: 240px;
    display: block;
  }

  .qr-instructions {
    font-size: 0.9375rem;
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

  /* Security badges in checkout form */
  .security-badges-checkout {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
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

  /* Footer */
  .checkout-footer {
    padding: 1.5rem 3rem;
    border-top: 1px solid var(--slate-200);
  }

  .footer-links {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
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

  /* Responsive design - Mobile first */
  @media (max-width: 1024px) {
    .checkout-container {
      grid-template-columns: 1fr;
      height: auto;
      overflow: visible;
    }

    .product-showcase {
      height: auto;
      overflow: visible;
    }

    .checkout-form-section {
      height: auto;
      overflow: visible;
    }

    .product-showcase {
      padding: 3rem 2rem;
    }

    .showcase-content {
      max-width: 100%;
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
    }

    .price-value {
      font-size: 2.75rem;
    }

    .form-content {
      padding: 2.5rem 1.5rem;
    }

    .security-badges-checkout {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 640px) {
    .product-showcase {
      padding: 2rem 1.25rem;
    }

    .product-name {
      font-size: 1.875rem;
    }

    .product-description {
      font-size: 1rem;
    }

    .price-value {
      font-size: 2.25rem;
    }

    .form-content {
      padding: 2rem 1.25rem;
    }

    .section-title {
      font-size: 1.25rem;
    }

    .card-details-grid {
      grid-template-columns: 2fr 1fr 1fr;
    }

    .checkout-footer {
      padding: 1.25rem 1.25rem;
    }

    .security-badges-checkout {
      grid-template-columns: 1fr;
    }
  }
</style>
