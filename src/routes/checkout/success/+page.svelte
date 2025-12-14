<script lang="ts">
  import { page } from '$app/stores';

  // Get query parameters
  $: referenceId = $page.url.searchParams.get('ref');
  $: chargeId = $page.url.searchParams.get('chargeId');
</script>

<div class="success-container">
  <div class="success-card">
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

    <h1>Payment Successful!</h1>

    <p class="success-message">
      Thank you for your purchase. Your payment has been processed successfully.
    </p>

    {#if referenceId}
      <div class="order-info">
        <p class="info-label">Order Reference:</p>
        <p class="info-value">{referenceId}</p>
      </div>
    {/if}

    {#if chargeId}
      <div class="order-info">
        <p class="info-label">Transaction ID:</p>
        <p class="info-value">{chargeId}</p>
      </div>
    {/if}

    <div class="actions">
      <a href="/" class="btn btn-primary">
        Back to Products
      </a>
    </div>

    <p class="help-text">
      You will receive a confirmation email shortly with your order details.
    </p>
  </div>
</div>

<style>
  /* ========================================
     MOBILE BASE STYLES (320px+)
     ======================================== */

  .success-container {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f3f4f6;
    padding: 1.5rem 1rem;
  }

  .success-card {
    background: white;
    border-radius: 12px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    padding: 2rem 1.5rem;
    max-width: 500px;
    width: 100%;
    text-align: center;
  }

  /* Success icon - mobile */
  .success-icon {
    width: 60px;
    height: 60px;
    margin: 0 auto 1.5rem;
    color: #10b981;
  }

  .success-icon svg {
    width: 100%;
    height: 100%;
  }

  h1 {
    font-size: 1.5rem;
    font-weight: bold;
    color: #111827;
    margin: 0 0 0.875rem 0;
  }

  .success-message {
    font-size: 1rem;
    color: #6b7280;
    margin: 0 0 1.5rem 0;
    line-height: 1.6;
  }

  .order-info {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1rem;
  }

  .info-label {
    font-size: 0.8125rem;
    color: #6b7280;
    margin: 0 0 0.5rem 0;
    font-weight: 500;
  }

  .info-value {
    font-family: 'Courier New', monospace;
    font-size: 0.8125rem;
    color: #111827;
    margin: 0;
    word-break: break-all;
  }

  .actions {
    margin: 1.5rem 0 1.25rem;
  }

  /* Button with touch target */
  .btn {
    display: inline-block;
    padding: 0.875rem 1.75rem;
    font-size: 1rem;
    font-weight: 600;
    text-decoration: none;
    border-radius: 8px;
    transition: all 0.2s;
    min-height: 48px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .btn-primary {
    background: #3b82f6;
    color: white;
  }

  .btn-primary:hover {
    background: #2563eb;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
  }

  .help-text {
    font-size: 0.8125rem;
    color: #9ca3af;
    margin: 0;
    line-height: 1.5;
  }

  /* ========================================
     TABLET BREAKPOINT (md: 768px+)
     ======================================== */

  @media (min-width: 768px) {
    .success-container {
      padding: 2rem 1rem;
    }

    .success-card {
      padding: 3rem 2rem;
    }

    .success-icon {
      width: 80px;
      height: 80px;
      margin-bottom: 2rem;
    }

    h1 {
      font-size: 2rem;
      margin-bottom: 1rem;
    }

    .success-message {
      font-size: 1.125rem;
      margin-bottom: 2rem;
    }

    .info-label {
      font-size: 0.875rem;
    }

    .info-value {
      font-size: 0.875rem;
    }

    .actions {
      margin: 2rem 0 1.5rem;
    }

    .btn {
      padding: 1rem 2rem;
      font-size: 1.125rem;
    }

    .help-text {
      font-size: 0.875rem;
    }
  }
</style>
