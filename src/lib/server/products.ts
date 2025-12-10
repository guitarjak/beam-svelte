import productsData from '$lib/products.json';

// Product type matching the JSON structure
export type Product = {
  slug: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  active: boolean;
  successUrl?: string; // Optional per-product success redirect
};

// Load all products from JSON
const products: Product[] = productsData as Product[];

/**
 * Get all products
 * @returns Array of all products
 */
export function getAllProducts(): Product[] {
  return products;
}

/**
 * Get a single product by its slug
 * @param slug - The product slug to search for
 * @returns The product if found, undefined otherwise
 */
export function getProductBySlug(slug: string): Product | undefined {
  return products.find((product) => product.slug === slug);
}
