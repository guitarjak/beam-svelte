<script lang="ts">
  import type { ActionData } from './$types';

  // Receive any error messages from the form action
  export let form: ActionData;
</script>

<div class="login-container">
  <div class="login-card">
    <h1>Admin Login</h1>

    {#if form?.error}
      <div class="error-message">
        {form.error}
      </div>
    {/if}

    <form method="POST">
      <div class="form-group">
        <label for="username">Username</label>
        <input
          type="text"
          id="username"
          name="username"
          required
          autocomplete="username"
        />
      </div>

      <div class="form-group">
        <label for="password">Password</label>
        <input
          type="password"
          id="password"
          name="password"
          required
          autocomplete="current-password"
        />
      </div>

      <button type="submit" class="btn-submit">
        Log In
      </button>
    </form>

    <a href="/" class="back-link">← Back to home</a>
  </div>
</div>

<style>
  .login-container {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f3f4f6;
    padding: 1rem;
  }

  .login-card {
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    padding: 2rem;
    width: 100%;
    max-width: 400px;
  }

  h1 {
    margin: 0 0 1.5rem 0;
    font-size: 1.75rem;
    text-align: center;
    color: #111827;
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
  }

  label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 500;
    color: #374151;
  }

  input {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    font-size: 1rem;
    box-sizing: border-box;
  }

  input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .btn-submit {
    width: 100%;
    padding: 0.75rem;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    margin-top: 0.5rem;
  }

  .btn-submit:hover {
    background: #2563eb;
  }

  .back-link {
    display: block;
    text-align: center;
    margin-top: 1rem;
    color: #6b7280;
    text-decoration: none;
    font-size: 0.875rem;
  }

  .back-link:hover {
    color: #111827;
    text-decoration: underline;
  }
</style>
