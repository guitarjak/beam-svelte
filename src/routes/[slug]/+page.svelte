<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';
  import { onDestroy } from 'svelte';

  // Receive product data from +page.server.ts
  export let data: PageData;
  export let form: ActionData;

  // Track which payment method is selected
  let showCardForm = false;
  let showPromptPayForm = false;
  let isLoading = false;
  let isPromptPayLoading = false;
  let promptPayError = '';
  let promptPayResult: { chargeId: string; qrBase64: string; expiry: string } | null = null;
  let polling = false;
  let pollingError = '';
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  // Helper function to format price (satang to THB)
  function formatPrice(satang: number, currency: string): string {
    const thb = satang / 100;
    return `${thb.toLocaleString('th-TH')} ${currency}`;
  }

  // Show card form
  function selectCardPayment() {
    showCardForm = true;
    showPromptPayForm = false;
  }

  // Show PromptPay form
  function selectPromptPayPayment() {
    showPromptPayForm = true;
    showCardForm = false;
    promptPayError = '';
    pollingError = '';
    promptPayResult = null;
    stopPolling();
  }

  // Reset to initial state
  function resetPaymentMethod() {
    showCardForm = false;
    showPromptPayForm = false;
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

  async function pollStatus(chargeId: string, expiryIso: string) {
    stopPolling();
    polling = true;
    pollTimer = setInterval(async () => {
      // Stop if expired
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
        // Keep polling; do not stop on transient errors
      }
    }, 3000);
  }

  onDestroy(() => {
    stopPolling();
  });
</script>

<div class="container">
  <div class="product-card">
    <h1 class="product-title">{data.product.name}</h1>

    <p class="product-description">{data.product.description}</p>

    <div class="price-section">
      <span class="price">{formatPrice(data.product.price, data.product.currency)}</span>
    </div>

    <!-- Payment method selection -->
    {#if !showCardForm && !showPromptPayForm}
      <div class="payment-buttons">
        <button type="button" class="btn btn-card" on:click={selectCardPayment}>
          Pay with Card
        </button>
        <button type="button" class="btn btn-promptpay" on:click={selectPromptPayPayment}>
          Pay with PromptPay
        </button>
      </div>
    {/if}

    <!-- Card payment form -->
    {#if showCardForm}
      <div class="payment-form">
        <h3>Card Payment</h3>

        {#if form?.error}
          <div class="error-message">
            {form.error}
          </div>
        {/if}

        <form
          method="POST"
          action="?/payWithCard"
          use:enhance={() => {
            isLoading = true;
            return async ({ update }) => {
              isLoading = false;
              await update();
            };
          }}
        >
          <div class="form-group">
            <label for="cardHolderName">Cardholder Name</label>
            <input
              type="text"
              id="cardHolderName"
              name="cardHolderName"
              placeholder="JOHN DOE"
              required
              disabled={isLoading}
            />
          </div>

          <div class="form-group">
            <label for="cardNumber">Card Number</label>
            <input
              type="text"
              id="cardNumber"
              name="cardNumber"
              placeholder="4111 1111 1111 1111"
              maxlength="19"
              required
              disabled={isLoading}
            />
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="expiryMonth">Expiry Month</label>
              <input
                type="number"
                id="expiryMonth"
                name="expiryMonth"
                placeholder="12"
                min="1"
                max="12"
                required
                disabled={isLoading}
              />
            </div>

            <div class="form-group">
              <label for="expiryYear">Expiry Year</label>
              <input
                type="number"
                id="expiryYear"
                name="expiryYear"
                placeholder="26"
                min="24"
                max="99"
                required
                disabled={isLoading}
              />
            </div>

            <div class="form-group">
              <label for="securityCode">CVC</label>
              <input
                type="text"
                id="securityCode"
                name="securityCode"
                placeholder="123"
                maxlength="4"
                required
                disabled={isLoading}
              />
            </div>
          </div>

          <div class="form-actions">
            <button type="button" class="btn btn-secondary" on:click={resetPaymentMethod} disabled={isLoading}>
              Cancel
            </button>
            <button type="submit" class="btn btn-card" disabled={isLoading}>
              {isLoading ? 'Processing...' : `Pay ${formatPrice(data.product.price, data.product.currency)}`}
            </button>
          </div>
        </form>
      </div>
    {/if}

    <!-- PromptPay form (placeholder for now) -->
    {#if showPromptPayForm}
      <div class="payment-form">
        <h3>PromptPay Payment</h3>

        {#if promptPayError || form?.error}
          <div class="error-message">
            {promptPayError || form?.error}
          </div>
        {/if}

        {#if promptPayResult}
          <div class="qr-box">
            <img
              src={`data:image/png;base64,${promptPayResult.qrBase64}`}
              alt="PromptPay QR"
              class="qr-image"
            />
            <p class="instruction">Scan this PromptPay QR with your banking app.</p>
            <p class="instruction small">Expires at {new Date(promptPayResult.expiry).toLocaleString()}</p>
          </div>

          {#if pollingError}
            <div class="error-message">{pollingError}</div>
          {/if}

          <div class="form-actions">
            <button type="button" class="btn btn-secondary" on:click={resetPaymentMethod}>
              Back
            </button>
          </div>
        {:else}
          <form
            method="POST"
            action="?/payWithPromptPay"
            use:enhance={() => {
              isPromptPayLoading = true;
              promptPayError = '';
              pollingError = '';
              promptPayResult = null;

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
            <p class="instruction">We will generate a PromptPay QR for you to scan.</p>
            <div class="form-actions">
              <button type="button" class="btn btn-secondary" on:click={resetPaymentMethod} disabled={isPromptPayLoading}>
                Back
              </button>
              <button type="submit" class="btn btn-promptpay" disabled={isPromptPayLoading}>
                {isPromptPayLoading ? 'Generating QR...' : 'Pay with PromptPay'}
              </button>
            </div>
          </form>
        {/if}
      </div>
    {/if}

    <a href="/" class="back-link">← Back to products</a>
  </div>
</div>

<style>
  .container {
    max-width: 600px;
    margin: 0 auto;
    padding: 2rem 1rem;
  }

  .product-card {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 2rem;
    text-align: center;
  }

  .product-title {
    font-size: 2rem;
    font-weight: bold;
    margin: 0 0 1rem 0;
    color: #111827;
  }

  .product-description {
    font-size: 1.125rem;
    color: #6b7280;
    margin: 0 0 2rem 0;
    line-height: 1.6;
  }

  .price-section {
    margin: 2rem 0;
  }

  .price {
    font-size: 2.5rem;
    font-weight: bold;
    color: #059669;
  }

  .payment-buttons {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin: 2rem 0;
  }

  /* Side-by-side buttons on desktop */
  @media (min-width: 640px) {
    .payment-buttons {
      flex-direction: row;
    }
  }

  .btn {
    flex: 1;
    padding: 1rem 2rem;
    font-size: 1.125rem;
    font-weight: 600;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .btn-card {
    background: #3b82f6;
    color: white;
  }

  .btn-card:hover {
    background: #2563eb;
  }

  .btn-promptpay {
    background: #10b981;
    color: white;
  }

  .btn-promptpay:hover {
    background: #059669;
  }

  .back-link {
    display: inline-block;
    margin-top: 2rem;
    color: #6b7280;
    text-decoration: none;
    font-size: 0.875rem;
  }

  .back-link:hover {
    color: #111827;
    text-decoration: underline;
  }

  /* Payment form styles */
  .payment-form {
    text-align: left;
    margin: 2rem 0;
    padding: 1.5rem;
    background: #f9fafb;
    border-radius: 8px;
  }

  .payment-form h3 {
    margin: 0 0 1.5rem 0;
    font-size: 1.5rem;
    color: #111827;
    text-align: center;
  }

  .error-message {
    background: #fee2e2;
    border: 1px solid #ef4444;
    color: #991b1b;
    padding: 0.75rem;
    border-radius: 4px;
    margin-bottom: 1rem;
    text-align: center;
  }

  .form-group {
    margin-bottom: 1rem;
    flex: 1;
  }

  .form-group label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 500;
    color: #374151;
    font-size: 0.875rem;
  }

  .form-group input {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    font-size: 1rem;
    box-sizing: border-box;
  }

  .form-group input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .form-group input:disabled {
    background: #f3f4f6;
    cursor: not-allowed;
  }

  .form-row {
    display: flex;
    gap: 1rem;
  }

  .form-actions {
    display: flex;
    gap: 1rem;
    margin-top: 1.5rem;
  }

  .btn-secondary {
    flex: 1;
    padding: 0.75rem 1.5rem;
    background: #6b7280;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-secondary:hover {
    background: #4b5563;
  }

  .btn-secondary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }

  @media (max-width: 640px) {
    .form-row {
      flex-direction: column;
    }

    .form-actions {
      flex-direction: column;
    }
  }

  .qr-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    margin: 1rem 0 0.5rem 0;
  }

  .qr-image {
    width: 240px;
    height: 240px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    background: white;
  }

  .instruction {
    text-align: center;
    color: #374151;
  }

  .instruction.small {
    font-size: 0.9rem;
    color: #6b7280;
  }
</style>
