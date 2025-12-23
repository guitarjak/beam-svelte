<script lang="ts">
  import { page } from '$app/stores';

  $: reason = $page.url.searchParams.get('reason') || 'unknown';
  $: chargeId = $page.url.searchParams.get('chargeId') || '';
</script>

<div class="error-container">
  <div class="error-card">
    <!-- Error Icon -->
    <div class="error-icon-wrapper">
      <div class="error-icon">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      </div>
    </div>

    <h1>Payment {reason === 'pending' ? 'Pending' : 'Failed'}</h1>

    {#if reason === 'pending'}
      <p class="error-description">
        Your payment is still being processed. This may take a few moments.
      </p>
      <p class="error-hint">
        Please wait a moment and refresh this page, or check your email for confirmation.
      </p>
    {:else}
      <p class="error-description">
        We were unable to process your payment. This could be due to:
      </p>
      <ul class="reason-list">
        <li>Insufficient funds</li>
        <li>Card declined by bank</li>
        <li>Incorrect card details</li>
        <li>Payment limit exceeded</li>
      </ul>
    {/if}

    {#if chargeId}
      <div class="charge-info">
        <p class="info-label">Transaction Reference</p>
        <p class="info-value">{chargeId}</p>
      </div>
    {/if}

    <div class="actions">
      <a href="/" class="btn btn-primary">Try Again</a>
      <a href="mailto:guitar@deadsimpleproductivity.com" class="btn btn-secondary">Contact Support</a>
    </div>
  </div>
</div>

<style>
  .error-container {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #fef2f2 0%, #fefefe 100%);
    padding: 2rem 1rem;
  }

  .error-card {
    background: white;
    border-radius: 16px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05), 0 10px 15px -3px rgba(0, 0, 0, 0.1);
    padding: 3rem 2rem;
    max-width: 600px;
    width: 100%;
    text-align: center;
  }

  .error-icon-wrapper {
    display: flex;
    justify-content: center;
    margin-bottom: 1.5rem;
  }

  .error-icon {
    width: 70px;
    height: 70px;
    color: #ef4444;
  }

  .error-icon svg {
    width: 100%;
    height: 100%;
    filter: drop-shadow(0 4px 8px rgba(239, 68, 68, 0.3));
  }

  h1 {
    font-size: 2rem;
    font-weight: 800;
    color: #1e293b;
    margin: 0 0 1rem;
  }

  .error-description {
    font-size: 1.0625rem;
    color: #64748b;
    margin: 0 0 1rem;
    line-height: 1.6;
  }

  .error-hint {
    font-size: 0.9375rem;
    color: #94a3b8;
    margin: 0 0 2rem;
  }

  .reason-list {
    text-align: left;
    margin: 1.5rem auto 2rem;
    padding-left: 1.5rem;
    max-width: 400px;
    color: #64748b;
  }

  .reason-list li {
    margin: 0.5rem 0;
  }

  .charge-info {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 1rem;
    margin: 2rem 0;
  }

  .info-label {
    font-size: 0.75rem;
    color: #64748b;
    margin: 0 0 0.5rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .info-value {
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 0.875rem;
    color: #1e293b;
    margin: 0;
    word-break: break-all;
  }

  .actions {
    display: flex;
    gap: 1rem;
    margin-top: 2rem;
    flex-wrap: wrap;
    justify-content: center;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 1rem 2rem;
    font-size: 1rem;
    font-weight: 600;
    text-decoration: none;
    border-radius: 10px;
    transition: all 0.2s ease;
    min-height: 48px;
  }

  .btn-primary {
    background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
    color: white;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }

  .btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 12px rgba(0, 0, 0, 0.15);
  }

  .btn-secondary {
    background: white;
    color: #1e293b;
    border: 1.5px solid #e2e8f0;
  }

  .btn-secondary:hover {
    border-color: #cbd5e1;
    background: #f8fafc;
  }
</style>
