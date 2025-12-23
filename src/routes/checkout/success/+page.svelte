<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import type { PageData } from './$types';
  import { trackPurchase } from '$lib/facebook-pixel';
  import { env as publicEnv } from '$env/dynamic/public';

  // Get data from server load function
  export let data: PageData;

  // Get query parameters
  $: referenceId = $page.url.searchParams.get('ref');
  $: chargeId = $page.url.searchParams.get('chargeId');

  // Track Facebook Pixel Purchase event on mount
  onMount(() => {
    if (publicEnv.PUBLIC_FB_PIXEL_ID && data.eventId && data.product) {
      trackPurchase({
        value: data.product.price / 100, // Convert satang to THB
        currency: data.product.currency,
        content_name: data.product.name,
        content_ids: [data.product.slug],
        eventId: data.eventId // CRITICAL - matches CAPI event_id for deduplication
      });
    }
  });
</script>

<div class="success-container">
  <div class="success-card">
    <!-- Success Icon Animation -->
    <div class="success-icon-wrapper">
      <div class="success-icon">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </div>
    </div>

    <!-- Custom Success Message -->
    <h1>{data.product?.successMessage?.title || 'Payment Successful!'}</h1>

    <p class="success-description">
      {data.product?.successMessage?.description || 'Thank you for your purchase. Your payment has been processed successfully.'}
    </p>

    <!-- Next Steps Section -->
    {#if data.product?.successMessage?.nextSteps && data.product.successMessage.nextSteps.length > 0}
      <div class="next-steps">
        <h2 class="next-steps-title">What's Next?</h2>
        <ul class="next-steps-list">
          {#each data.product.successMessage.nextSteps as step, index}
            <li class="step-item">
              <div class="step-number">{index + 1}</div>
              <span class="step-text">{step}</span>
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    <!-- Order Details -->
    <div class="order-details">
      {#if referenceId}
        <div class="order-info">
          <p class="info-label">Order Reference</p>
          <p class="info-value">{referenceId}</p>
        </div>
      {/if}

      {#if chargeId}
        <div class="order-info">
          <p class="info-label">Transaction ID</p>
          <p class="info-value">{chargeId}</p>
        </div>
      {/if}
    </div>

    <!-- Actions -->
    <div class="actions">
      <a href="/" class="btn btn-primary">
        <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
        Back to Home
      </a>
    </div>

    <p class="help-text">
      ต้องการความช่วยเหลือ?<br> ติดต่อผมได้ที่ <a href="mailto:guitar@deadsimpleproductivity.com" class="email-link">Email</a> นี้เลยค้าบ
    </p>
  </div>
</div>

<style>
  /* CSS Variables */
  :root {
    --success-green: #10b981;
    --success-green-light: #d1fae5;
    --success-green-dark: #059669;
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
    --blue-500: #3b82f6;
    --blue-600: #2563eb;
  }

  :global(body) {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  /* ========================================
     MOBILE BASE STYLES (320px+)
     ======================================== */

  .success-container {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, var(--slate-50) 0%, #fefefe 100%);
    padding: 1.5rem 1rem;
    animation: fadeIn 0.4s ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .success-card {
    background: white;
    border-radius: 16px;
    box-shadow:
      0 4px 6px rgba(0, 0, 0, 0.05),
      0 10px 15px -3px rgba(0, 0, 0, 0.1);
    padding: 2rem 1.5rem;
    max-width: 600px;
    width: 100%;
    text-align: center;
    animation: slideUp 0.5s ease-out;
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Success Icon with Animation */
  .success-icon-wrapper {
    display: flex;
    justify-content: center;
    margin-bottom: 1.5rem;
  }

  .success-icon {
    width: 70px;
    height: 70px;
    color: var(--success-green);
    animation: scaleIn 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) 0.2s both;
  }

  @keyframes scaleIn {
    from {
      transform: scale(0);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }

  .success-icon svg {
    width: 100%;
    height: 100%;
    filter: drop-shadow(0 4px 8px rgba(16, 185, 129, 0.3));
  }

  /* Product Logo */
  .product-logo {
    display: flex;
    justify-content: center;
    margin-bottom: 1.5rem;
  }

  .product-logo img {
    max-width: 160px;
    max-height: 50px;
    width: auto;
    height: auto;
    object-fit: contain;
  }

  /* Title */
  h1 {
    font-size: 1.75rem;
    font-weight: 800;
    color: var(--slate-900);
    margin: 0 0 1rem 0;
    line-height: 1.2;
    letter-spacing: -0.02em;
  }

  /* Description */
  .success-description {
    font-size: 1rem;
    color: var(--slate-600);
    margin: 0 0 2rem 0;
    line-height: 1.6;
  }

  /* Next Steps Section */
  .next-steps {
    background: var(--slate-50);
    border: 1px solid var(--slate-200);
    border-radius: 12px;
    padding: 1.5rem;
    margin-bottom: 2rem;
    text-align: left;
  }

  .next-steps-title {
    font-size: 1.125rem;
    font-weight: 700;
    color: var(--slate-900);
    margin: 0 0 1rem 0;
    text-align: center;
  }

  .next-steps-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .step-item {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    padding: 0.875rem 0;
    border-bottom: 1px solid var(--slate-200);
  }

  .step-item:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  .step-item:first-child {
    padding-top: 0;
  }

  .step-number {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    background: var(--success-green);
    color: white;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.875rem;
    font-weight: 700;
    box-shadow: 0 2px 4px rgba(16, 185, 129, 0.3);
  }

  .step-text {
    flex: 1;
    font-size: 0.9375rem;
    color: var(--slate-700);
    line-height: 1.6;
    padding-top: 0.25rem;
  }

  /* Order Details */
  .order-details {
    display: grid;
    gap: 0.875rem;
    margin-bottom: 1.5rem;
  }

  .order-info {
    background: var(--slate-50);
    border: 1px solid var(--slate-200);
    border-radius: 8px;
    padding: 1rem;
  }

  .info-label {
    font-size: 0.75rem;
    color: var(--slate-500);
    margin: 0 0 0.5rem 0;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .info-value {
    font-family: 'SF Mono', 'Monaco', 'Courier New', monospace;
    font-size: 0.8125rem;
    color: var(--slate-900);
    margin: 0;
    word-wrap: break-word;
    overflow-wrap: break-word;
    background: white;
    padding: 0.5rem;
    border-radius: 4px;
    border: 1px solid var(--slate-200);
  }

  /* Actions */
  .actions {
    margin: 2rem 0 1.5rem;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 1rem 2rem;
    font-size: 1rem;
    font-weight: 600;
    text-decoration: none;
    border-radius: 10px;
    transition: all 0.2s ease;
    min-height: 48px;
    cursor: pointer;
  }

  .btn-primary {
    background: linear-gradient(135deg, var(--slate-900) 0%, var(--slate-800) 100%);
    color: white;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }

  .btn-primary:hover {
    background: linear-gradient(135deg, var(--slate-800) 0%, var(--slate-700) 100%);
    transform: translateY(-2px);
    box-shadow: 0 8px 12px rgba(0, 0, 0, 0.15);
  }

  .btn-primary:active {
    transform: translateY(0);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .btn-icon {
    width: 1.25rem;
    height: 1.25rem;
    stroke-width: 2;
  }

  /* Help Text */
  .help-text {
    font-size: 0.8125rem;
    color: var(--slate-500);
    margin: 0;
    line-height: 1.5;
  }

  .email-link {
    color: var(--slate-700);
    text-decoration: underline;
    font-weight: 600;
    transition: color 0.2s ease;
  }

  .email-link:hover {
    color: var(--slate-900);
  }

  /* ========================================
     TABLET BREAKPOINT (md: 768px+)
     ======================================== */

  @media (min-width: 768px) {
    .success-container {
      padding: 2rem 1rem;
    }

    .success-card {
      padding: 3rem 2.5rem;
    }

    .success-icon {
      width: 90px;
      height: 90px;
    }

    .product-logo img {
      max-width: 200px;
      max-height: 60px;
    }

    h1 {
      font-size: 2.25rem;
      margin-bottom: 1.25rem;
    }

    .success-description {
      font-size: 1.125rem;
      margin-bottom: 2.5rem;
    }

    .next-steps {
      padding: 2rem;
    }

    .next-steps-title {
      font-size: 1.25rem;
      margin-bottom: 1.5rem;
    }

    .step-item {
      gap: 1.25rem;
      padding: 1rem 0;
    }

    .step-number {
      width: 32px;
      height: 32px;
      font-size: 1rem;
    }

    .step-text {
      font-size: 1rem;
    }

    .order-details {
      grid-template-columns: repeat(2, 1fr);
      gap: 1rem;
    }

    .info-label {
      font-size: 0.8125rem;
    }

    .info-value {
      font-size: 0.875rem;
    }

    .btn {
      padding: 1.125rem 2.5rem;
      font-size: 1.0625rem;
    }

    .help-text {
      font-size: 0.875rem;
    }
  }

  /* ========================================
     DESKTOP BREAKPOINT (lg: 1024px+)
     ======================================== */

  @media (min-width: 1024px) {
    .success-card {
      padding: 3.5rem 3rem;
    }

    h1 {
      font-size: 2.5rem;
    }

    .success-description {
      font-size: 1.25rem;
    }

    .next-steps-title {
      font-size: 1.375rem;
    }
  }

  /* ========================================
     ACCESSIBILITY
     ======================================== */

  @media (prefers-reduced-motion: reduce) {
    .success-container,
    .success-card,
    .success-icon {
      animation: none;
    }

    .btn {
      transition: none;
    }
  }
</style>
