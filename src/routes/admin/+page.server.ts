import { getAllProducts } from '$lib/server/products';
import type { PageServerLoad, Actions } from './$types';
import { redirect } from '@sveltejs/kit';

// Load all products for the admin dashboard
export const load: PageServerLoad = () => {
  const products = getAllProducts();

  return {
    products
  };
};

// Handle logout action
export const actions = {
  logout: async ({ cookies }) => {
    // Delete the session cookie
    cookies.delete('admin_session', { path: '/' });

    // Redirect to home page
    redirect(303, '/');
  }
} satisfies Actions;
