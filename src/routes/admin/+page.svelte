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
  .admin-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem 1rem;
  }

  .admin-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
    padding-bottom: 1rem;
    border-bottom: 2px solid #e5e7eb;
  }

  h1 {
    margin: 0;
    font-size: 2rem;
    color: #111827;
  }

  .btn-logout {
    padding: 0.5rem 1rem;
    background: #ef4444;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-logout:hover {
    background: #dc2626;
  }

  .admin-content {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 1.5rem;
  }

  .section-header {
    margin-bottom: 1.5rem;
  }

  h2 {
    margin: 0 0 1rem 0;
    font-size: 1.5rem;
    color: #111827;
  }

  .info-box {
    background: #fef3c7;
    border: 1px solid #fbbf24;
    padding: 0.75rem;
    border-radius: 4px;
    font-size: 0.875rem;
    color: #92400e;
  }

  code {
    background: #fde68a;
    padding: 0.125rem 0.25rem;
    border-radius: 2px;
    font-family: 'Courier New', monospace;
    font-size: 0.875em;
  }

  .products-table {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  thead {
    background: #f3f4f6;
  }

  th {
    text-align: left;
    padding: 0.75rem;
    font-weight: 600;
    color: #374151;
    border-bottom: 2px solid #e5e7eb;
  }

  td {
    padding: 0.75rem;
    border-bottom: 1px solid #e5e7eb;
  }

  tbody tr:hover {
    background: #f9fafb;
  }

  .mono {
    font-family: 'Courier New', monospace;
    font-size: 0.875rem;
    color: #6b7280;
  }

  .status-badge {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 600;
    background: #fee2e2;
    color: #991b1b;
  }

  .status-badge.active {
    background: #d1fae5;
    color: #065f46;
  }

  .btn-view {
    display: inline-block;
    padding: 0.375rem 0.75rem;
    background: #3b82f6;
    color: white;
    text-decoration: none;
    border-radius: 4px;
    font-size: 0.875rem;
    font-weight: 500;
  }

  .btn-view:hover {
    background: #2563eb;
  }

  .no-products {
    text-align: center;
    color: #6b7280;
    padding: 2rem;
  }

  @media (max-width: 768px) {
    .admin-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 1rem;
    }

    table {
      font-size: 0.875rem;
    }

    th, td {
      padding: 0.5rem;
    }
  }
</style>
