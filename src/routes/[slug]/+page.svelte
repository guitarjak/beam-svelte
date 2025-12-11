<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';
  import { onDestroy } from 'svelte';

  // Receive product data from +page.server.ts
  export let data: PageData;
  export let form: ActionData;

  // UI state
  let selectedMethod: 'promptpay' | 'card' | 'googlepay' = 'googlepay';
  let email = '';
  let isLoading = false;
  let isPromptPayLoading = false;
  let promptPayError = '';
  let promptPayResult: { chargeId: string; qrBase64: string; expiry: string } | null = null;
  let polling = false;
  let pollingError = '';
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  // Helper: format price in THB from satang
  function formatPriceTHB(satang: number) {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB'
    }).format(satang / 100);
  }

  function selectMethod(method: 'promptpay' | 'card' | 'googlepay') {
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

<!-- Stripe-style checkout page -->
<div class="min-h-screen flex">
  <!-- Left side: Product showcase (Dark) -->
  <div class="hidden lg:flex lg:w-1/2 bg-black text-white p-12 flex-col items-center justify-center">
    <div class="max-w-md w-full space-y-8">
      <!-- Product icon/logo placeholder -->
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center">
          <svg class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        </div>
      </div>

      <!-- Product details -->
      <div class="space-y-4">
        <p class="text-sm text-gray-400 line-clamp-1">{data.product.name}</p>
        <p class="text-5xl font-bold tracking-tight">{formatPriceTHB(data.product.price)}</p>
        <p class="text-sm text-gray-300 leading-relaxed">{data.product.description}</p>
      </div>

      <!-- Product image/branding -->
      <div class="flex justify-center pt-8">
        <div class="w-64 h-64 rounded-full bg-gradient-to-br from-pink-500 via-purple-600 to-blue-500 flex items-center justify-center">
          <div class="w-60 h-60 rounded-full bg-black flex items-center justify-center">
            <svg class="w-32 h-32 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Right side: Checkout form (White) -->
  <div class="w-full lg:w-1/2 bg-white flex flex-col">
    <div class="flex-1 flex items-center justify-center p-8 lg:p-12">
      <div class="max-w-md w-full space-y-8">
        <!-- Contact information -->
        <div class="space-y-4">
          <h2 class="text-base font-medium text-gray-900">Contact information</h2>
          <div class="space-y-2">
            <label for="email" class="text-sm text-gray-700">Email</label>
            <input
              type="email"
              id="email"
              bind:value={email}
              placeholder="email@example.com"
              class="w-full px-3 py-2.5 border border-gray-300 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>
        </div>

        <!-- Payment method -->
        <div class="space-y-4">
          <h2 class="text-base font-medium text-gray-900">Payment method</h2>

          <!-- Payment options -->
          <div class="space-y-3">
            <!-- PromptPay -->
            <button
              type="button"
              on:click={() => selectMethod('promptpay')}
              class="w-full flex items-center gap-3 px-4 py-3.5 border rounded-md transition-all {selectedMethod === 'promptpay' ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-white hover:border-gray-400'}"
            >
              <div class="flex-shrink-0">
                <div class="w-4 h-4 rounded-full border-2 {selectedMethod === 'promptpay' ? 'border-blue-500 bg-blue-500' : 'border-gray-300'} flex items-center justify-center">
                  {#if selectedMethod === 'promptpay'}
                    <div class="w-2 h-2 rounded-full bg-white"></div>
                  {/if}
                </div>
              </div>
              <div class="flex items-center gap-2">
                <svg class="w-5 h-5 text-gray-700" viewBox="0 0 24 24" fill="currentColor">
                  <rect width="24" height="24" rx="4" fill="#1e3a8a"/>
                  <path d="M8 12h8M12 8v8" stroke="white" stroke-width="2" stroke-linecap="round"/>
                </svg>
                <span class="text-sm font-medium text-gray-900">PromptPay</span>
              </div>
            </button>

            <!-- Card -->
            <button
              type="button"
              on:click={() => selectMethod('card')}
              class="w-full flex items-center justify-between px-4 py-3.5 border rounded-md transition-all {selectedMethod === 'card' ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-white hover:border-gray-400'}"
            >
              <div class="flex items-center gap-3">
                <div class="flex-shrink-0">
                  <div class="w-4 h-4 rounded-full border-2 {selectedMethod === 'card' ? 'border-blue-500 bg-blue-500' : 'border-gray-300'} flex items-center justify-center">
                    {#if selectedMethod === 'card'}
                      <div class="w-2 h-2 rounded-full bg-white"></div>
                    {/if}
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <svg class="w-5 h-5 text-gray-700" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <rect x="2" y="6" width="20" height="12" rx="2" stroke-width="2"/>
                    <path d="M2 10h20" stroke-width="2"/>
                  </svg>
                  <span class="text-sm font-medium text-gray-900">Card</span>
                </div>
              </div>
              <div class="flex items-center gap-1.5">
                <!-- Visa logo -->
                <div class="h-5 px-1.5 bg-blue-600 rounded flex items-center justify-center">
                  <span class="text-white text-xs font-bold">VISA</span>
                </div>
                <!-- Mastercard logo -->
                <div class="flex items-center">
                  <div class="w-4 h-4 rounded-full bg-red-500 opacity-80"></div>
                  <div class="w-4 h-4 rounded-full bg-orange-400 opacity-80 -ml-2"></div>
                </div>
              </div>
            </button>

            <!-- Google Pay -->
            <button
              type="button"
              on:click={() => selectMethod('googlepay')}
              class="w-full px-4 py-3.5 border rounded-md transition-all {selectedMethod === 'googlepay' ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-white hover:border-gray-400'}"
            >
              <div class="flex items-center gap-3">
                <div class="flex-shrink-0">
                  <div class="w-4 h-4 rounded-full border-2 {selectedMethod === 'googlepay' ? 'border-blue-500 bg-blue-500' : 'border-gray-300'} flex items-center justify-center">
                    {#if selectedMethod === 'googlepay'}
                      <div class="w-2 h-2 rounded-full bg-white"></div>
                    {/if}
                  </div>
                </div>
                <div class="flex items-center gap-2.5">
                  <div class="w-5 h-5 rounded-sm bg-white border border-gray-200 flex items-center justify-center">
                    <span class="text-xs font-bold text-blue-600">G</span>
                  </div>
                  <span class="text-sm font-medium text-gray-900">Google Pay</span>
                </div>
              </div>
            </button>
          </div>

          <!-- Payment method specific content -->
          {#if selectedMethod === 'googlepay'}
            <!-- Google Pay notice -->
            <div class="flex gap-3 p-3 bg-gray-50 rounded-md border border-gray-200">
              <svg class="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p class="text-sm text-gray-600">
                Another step will appear after submitting your order to complete your purchase details.
              </p>
            </div>

            <!-- Google Pay button -->
            <button
              type="button"
              class="w-full bg-black hover:bg-gray-900 text-white px-6 py-4 rounded-md flex items-center justify-center gap-2 transition-all shadow-sm hover:shadow"
            >
              <svg class="w-12 h-12" viewBox="0 0 48 20" fill="none">
                <path d="M23.9876 10.2076C23.9876 14.0826 21.0626 16.9326 17.3001 16.9326C13.5376 16.9326 10.6126 14.0826 10.6126 10.2076C10.6126 6.30763 13.5376 3.48263 17.3001 3.48263C21.0626 3.48263 23.9876 6.30763 23.9876 10.2076Z" fill="white"/>
                <path d="M9.7251 10.2076C9.7251 6.70763 12.2626 4.07013 15.6376 3.73263V16.6826C12.2626 16.3451 9.7251 13.7076 9.7251 10.2076Z" fill="#FBBC04"/>
                <path d="M17.3001 3.73263V16.6826C20.6751 16.3451 23.2126 13.7076 23.2126 10.2076C23.2126 6.70763 20.6751 4.07013 17.3001 3.73263Z" fill="#34A853"/>
                <path d="M36.8626 5.12012V15.2951H35.1126V5.12012H36.8626ZM43.3876 12.5326L44.8001 13.5701C44.3126 14.2451 43.2751 15.4826 41.2001 15.4826C38.7876 15.4826 36.9626 13.5201 36.9626 10.9201C36.9626 8.17012 38.8126 6.38262 40.9501 6.38262C43.1126 6.38262 44.3126 8.22012 44.7376 9.38262L45.0251 10.0826L39.0251 12.5826C39.4751 13.4701 40.1626 13.9826 41.2001 13.9826C42.2376 13.9826 42.9376 13.4451 43.3876 12.5326ZM38.6626 10.8201L43.0001 9.05762C42.7876 8.52012 42.1751 8.10762 41.4001 8.10762C40.3876 8.10762 38.7876 8.97012 38.6626 10.8201Z" fill="white"/>
                <path d="M33.0251 6.53262C34.3501 6.53262 35.2001 7.19512 35.6626 7.82012L34.1876 8.83262C33.8876 8.39512 33.4751 8.10762 33.0251 8.10762C32.1751 8.10762 31.3126 8.87012 31.3126 9.92012C31.3126 10.9451 32.1751 11.7326 33.0251 11.7326C33.5751 11.7326 33.9251 11.5076 34.1751 11.2576C34.3626 11.0701 34.4876 10.8076 34.5376 10.4326H33.0251V8.87012H36.2251C36.2751 9.12012 36.3001 9.42012 36.3001 9.74512C36.3001 10.8826 35.9751 11.8951 35.2751 12.5826C34.6126 13.2826 33.7001 13.7326 32.6376 13.7326C30.7251 13.7326 29.1626 12.1951 29.1626 10.2076C29.1626 8.22012 30.7251 6.53262 33.0251 6.53262Z" fill="white"/>
                <path d="M27.5001 9.67012C27.5001 11.7951 25.8626 13.3076 23.9626 13.3076C22.0626 13.3076 20.4251 11.7951 20.4251 9.67012C20.4251 7.52012 22.0626 6.03262 23.9626 6.03262C25.8626 6.03262 27.5001 7.52012 27.5001 9.67012ZM25.7376 9.67012C25.7376 8.37012 24.9001 7.62012 23.9626 7.62012C23.0251 7.62012 22.1876 8.37012 22.1876 9.67012C22.1876 10.9451 23.0251 11.7201 23.9626 11.7201C24.9001 11.7201 25.7376 10.9451 25.7376 9.67012Z" fill="white"/>
              </svg>
            </button>
          {:else if selectedMethod === 'card'}
            <!-- Card form -->
            <div class="space-y-4">
              {#if form?.error}
                <div class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {form.error}
                </div>
              {/if}

              <form
                method="POST"
                action="?/payWithCard"
                class="space-y-4"
                use:enhance={() => {
                  isLoading = true;
                  return async ({ update }) => {
                    isLoading = false;
                    await update();
                  };
                }}
              >
                <div class="space-y-2">
                  <label for="cardHolderName" class="text-sm text-gray-700">Cardholder name</label>
                  <input
                    class="w-full px-3 py-2.5 border border-gray-300 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    type="text"
                    id="cardHolderName"
                    name="cardHolderName"
                    placeholder="JOHN DOE"
                    required
                    disabled={isLoading}
                  />
                </div>

                <div class="space-y-2">
                  <label for="cardNumber" class="text-sm text-gray-700">Card number</label>
                  <input
                    class="w-full px-3 py-2.5 border border-gray-300 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    type="text"
                    id="cardNumber"
                    name="cardNumber"
                    placeholder="4111 1111 1111 1111"
                    maxlength="19"
                    required
                    disabled={isLoading}
                  />
                </div>

                <div class="grid grid-cols-3 gap-3">
                  <div class="space-y-2">
                    <label for="expiryMonth" class="text-sm text-gray-700">MM</label>
                    <input
                      class="w-full px-3 py-2.5 border border-gray-300 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
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
                  <div class="space-y-2">
                    <label for="expiryYear" class="text-sm text-gray-700">YY</label>
                    <input
                      class="w-full px-3 py-2.5 border border-gray-300 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
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
                  <div class="space-y-2">
                    <label for="securityCode" class="text-sm text-gray-700">CVC</label>
                    <input
                      class="w-full px-3 py-2.5 border border-gray-300 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
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

                <button
                  type="submit"
                  class="w-full bg-black hover:bg-gray-900 text-white px-6 py-3.5 rounded-md font-medium shadow-sm hover:shadow transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  disabled={isLoading}
                >
                  {isLoading ? 'Processing…' : `Pay ${formatPriceTHB(data.product.price)}`}
                </button>
              </form>
            </div>
          {:else if selectedMethod === 'promptpay'}
            <!-- PromptPay flow -->
            <div class="space-y-4">
              {#if promptPayError || (form?.error && selectedMethod === 'promptpay')}
                <div class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {promptPayError || form?.error}
                </div>
              {/if}

              {#if promptPayResult}
                <div class="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
                  <div class="flex flex-col items-center gap-3">
                    <div class="rounded-lg bg-white p-3 border border-gray-200">
                      <img
                        src={`data:image/png;base64,${promptPayResult.qrBase64}`}
                        alt="PromptPay QR"
                        class="w-56 h-56 object-contain"
                      />
                    </div>
                    <p class="text-sm text-gray-600">Scan this PromptPay QR with your banking app.</p>
                    <p class="text-xs text-gray-500">
                      Expires at {new Date(promptPayResult.expiry).toLocaleString()}
                    </p>
                  </div>

                  <div class="text-sm text-center">
                    {#if pollingError}
                      <span class="text-red-600">{pollingError}</span>
                    {:else if polling}
                      <span class="text-gray-600">Waiting for payment…</span>
                    {:else}
                      <span class="text-green-600">Payment successful!</span>
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
                    class="w-full bg-black hover:bg-gray-900 text-white px-6 py-3.5 rounded-md font-medium shadow-sm hover:shadow transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                    disabled={isPromptPayLoading}
                  >
                    {isPromptPayLoading ? 'Refreshing QR…' : 'Generate new QR'}
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
                    class="w-full bg-black hover:bg-gray-900 text-white px-6 py-3.5 rounded-md font-medium shadow-sm hover:shadow transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                    disabled={isPromptPayLoading}
                  >
                    {isPromptPayLoading ? 'Generating QR…' : 'Generate PromptPay QR'}
                  </button>
                </form>
              {/if}
            </div>
          {/if}
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="border-t border-gray-200 px-8 lg:px-12 py-6">
      <div class="max-w-md mx-auto flex items-center justify-center gap-4 text-xs text-gray-500">
        <span>Powered by <strong class="font-semibold text-gray-700">stripe</strong></span>
        <span class="text-gray-300">|</span>
        <a href="#" class="hover:text-gray-700 transition">Terms</a>
        <a href="#" class="hover:text-gray-700 transition">Privacy</a>
      </div>
    </div>
  </div>
</div>
