import { fetchJson } from './http';
import type {
  Product,
  ProductSummary,
  Recipe,
  RecipeSummary,
  SearchResponse,
} from './types';

export async function searchRecipes(
  query: string,
  page_number: number = 1,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({
    query,
    page_number: String(page_number),
  });

  return fetchJson<SearchResponse<RecipeSummary>>(`/api/search/recipe?${params}`, {
    signal,
  });
}

export async function getRecipeDetails(
  recipeId: string,
  signal?: AbortSignal,
) {
  return fetchJson<Recipe>(`/api/recipes/${recipeId}`, { signal });
}

export async function searchProducts(
  query: string,
  page_number: number = 1,
  sort?: string,
  country?: string,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({
    query,
    page_number: String(page_number),
  });

  if (sort) {
    params.set('sort', sort);
  }

  // Sent even when empty: the backend reads an absent param as "use the
  // default country" and an empty one as "search everywhere".
  if (country !== undefined) {
    params.set('country', country);
  }

  return fetchJson<SearchResponse<ProductSummary>>(
    `/api/search/products?${params}`,
    { signal },
  );
}

export async function getProductDetails(
  productId: string,
  signal?: AbortSignal,
) {
  return fetchJson<Product>(`/api/products/${productId}`, { signal });
}

export async function getCountries(signal?: AbortSignal) {
  return fetchJson<{ value: string; label: string }[]>('/api/countries', {
    signal,
  });
}
