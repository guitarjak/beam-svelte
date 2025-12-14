<script lang="ts">
  import type { PageData } from './$types';

  // Receive product data from +page.server.ts
  export let data: PageData;

  // Helper function to format price (satang to THB)
  function formatPrice(satang: number, currency: string): string {
    const thb = satang / 100;
    return `${thb.toLocaleString('th-TH')} ${currency}`;
  }
</script>

<div class="admin-container">
  <div class="admin-header">
    <h1>Admin Dashboard</h1>
    <form method="POST" action="?/logout">
      <button type="submit" class="btn-logout">
        Logout
      </button>
    </form>
  </div>

  <div class="admin-content">
    <div class="section-header">
      <h2>Products</h2>
      <div class="info-box">
        <strong>Note:</strong> To edit products, change
        <code>src/lib/products.json</code> and redeploy.
      </div>
    </div>

    {#if data.products.length > 0}
      <div class="products-table">
        <table>
          <thead>
            <tr>
              <th>Slug</th>
              <th>Name</th>
              <th>Price</th>
              <th>Currency</th>
              <th>Active</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each data.products as product}
              <tr>
                <td class="mono">{product.slug}</td>
                <td><strong>{product.name}</strong></td>
                <td>{formatPrice(product.price, product.currency)}</td>
                <td>{product.currency}</td>
                <td>
                  <span class="status-badge" class:active={product.active}>
                    {product.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>
                  <a href="/{product.slug}" target="_blank" class="btn-view">
                    View Page
                  </a>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      <p class="no-products">No products found.</p>
    {/if}
  </div>
</div>

<style>
  /* ========================================
     MOBILE BASE STYLES (320px+)
     ======================================== */

  .admin-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 1.5rem 1rem;
  }

  /* Header - mobile stack layout */
  .admin-header {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    align-items: stretch;
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 2px solid #e5e7eb;
  }

  h1 {
    margin: 0;
    font-size: 1.5rem;
    color: #111827;
  }

  /* Logout button - mobile full width with touch target */
  .btn-logout {
    padding: 0.75rem 1rem;
    background: #ef4444;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    min-height: 44px;
    width: 100%;
  }

  .btn-logout:hover {
    background: #dc2626;
  }

  .admin-content {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 1rem;
  }

  .section-header {
    margin-bottom: 1.25rem;
  }

  h2 {
    margin: 0 0 1rem 0;
    font-size: 1.25rem;
    color: #111827;
  }

  .info-box {
    background: #fef3c7;
    border: 1px solid #fbbf24;
    padding: 0.75rem;
    border-radius: 4px;
    font-size: 0.8125rem;
    color: #92400e;
    line-height: 1.5;
  }

  code {
    background: #fde68a;
    padding: 0.125rem 0.25rem;
    border-radius: 2px;
    font-family: 'Courier New', monospace;
    font-size: 0.875em;
  }

  /* Table - mobile horizontal scroll */
  .products-table {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    min-width: 600px;
    font-size: 0.8125rem;
  }

  thead {
    background: #f3f4f6;
  }

  th {
    text-align: left;
    padding: 0.625rem 0.5rem;
    font-weight: 600;
    color: #374151;
    border-bottom: 2px solid #e5e7eb;
    white-space: nowrap;
  }

  td {
    padding: 0.625rem 0.5rem;
    border-bottom: 1px solid #e5e7eb;
    white-space: nowrap;
  }

  tbody tr:hover {
    background: #f9fafb;
  }

  .mono {
    font-family: 'Courier New', monospace;
    font-size: 0.8125rem;
    color: #6b7280;
  }

  .status-badge {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    border-radius: 12px;
    font-size: 0.6875rem;
    font-weight: 600;
    background: #fee2e2;
    color: #991b1b;
  }

  .status-badge.active {
    background: #d1fae5;
    color: #065f46;
  }

  /* View button - mobile with touch target */
  .btn-view {
    display: inline-block;
    padding: 0.5rem 0.75rem;
    background: #3b82f6;
    color: white;
    text-decoration: none;
    border-radius: 4px;
    font-size: 0.8125rem;
    font-weight: 500;
    min-height: 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .btn-view:hover {
    background: #2563eb;
  }

  .no-products {
    text-align: center;
    color: #6b7280;
    padding: 2rem;
    font-size: 0.875rem;
  }

  /* ========================================
     TABLET BREAKPOINT (md: 768px+)
     ======================================== */

  @media (min-width: 768px) {
    .admin-container {
      padding: 2rem 1.5rem;
    }

    .admin-header {
      flex-direction: row;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
    }

    h1 {
      font-size: 2rem;
    }

    h2 {
      font-size: 1.5rem;
    }

    .btn-logout {
      width: auto;
      padding: 0.5rem 1rem;
    }

    .admin-content {
      padding: 1.5rem;
    }

    .info-box {
      font-size: 0.875rem;
    }

    table {
      font-size: 1rem;
    }

    th, td {
      padding: 0.75rem;
    }

    .mono {
      font-size: 0.875rem;
    }

    .status-badge {
      font-size: 0.75rem;
    }

    .btn-view {
      font-size: 0.875rem;
      padding: 0.375rem 0.75rem;
    }

    .no-products {
      font-size: 1rem;
    }
  }
</style>
