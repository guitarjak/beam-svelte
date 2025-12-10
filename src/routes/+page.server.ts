import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

// Redirect homepage to admin dashboard
export const load: PageServerLoad = () => {
  redirect(307, '/admin');
};
