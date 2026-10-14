import type { Recipe } from '@/domain/types';

/** An external provider of recipes, already mapped into MealMatch's `Recipe` model. */
export interface RecipeSource {
  /** Stable id, also used as the id prefix of its recipes and as the cache key. */
  id: string;
  name: string;
  url: string;
  fetchAll(signal?: AbortSignal): Promise<Recipe[]>;
}

export async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`${new URL(url).host} responded ${res.status}`);
  return (await res.json()) as T;
}
