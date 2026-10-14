import { config } from '@/config';
import { inferIngredientFlags } from '@/domain/ingredientFlags';
import type { Ingredient, IngredientFlag, MealType, Recipe } from '@/domain/types';

import { splitSteps } from './text';
import { fetchJson, type RecipeSource } from './types';

/** Raw shape returned by TheMealDB (only the fields we use). */
export interface MealDbMeal {
  idMeal: string;
  strMeal: string;
  strCategory?: string | null;
  strArea?: string | null;
  strCountry?: string | null;
  strInstructions?: string | null;
  strMealThumb?: string | null;
  strTags?: string | null;
  strSource?: string | null;
  [key: string]: string | null | undefined;
}

const CATEGORY_MEALS: Record<string, MealType[]> = {
  Breakfast: ['breakfast'],
  Dessert: ['dessert'],
  Starter: ['lunch', 'snack'],
  Side: ['lunch', 'dinner'],
};

const CATEGORY_EMOJI: Record<string, string> = {
  Beef: '🥩',
  Breakfast: '🍳',
  Chicken: '🍗',
  Dessert: '🍰',
  Goat: '🍖',
  Lamb: '🍖',
  Miscellaneous: '🍽️',
  Pasta: '🍝',
  Pork: '🥓',
  Seafood: '🦐',
  Side: '🥗',
  Starter: '🥟',
  Vegan: '🥦',
  Vegetarian: '🥕',
};

/**
 * TheMealDB sometimes leaves the main protein out of the ingredient list
 * (e.g. a "Pork" category belly recipe with only the marinade listed), so the
 * category and title are used as extra, conservative evidence.
 */
const CATEGORY_FLAGS: Record<string, IngredientFlag[]> = {
  Beef: ['meat'],
  Lamb: ['meat'],
  Goat: ['meat'],
  Pork: ['pork'],
  Chicken: ['poultry'],
  Seafood: ['fish', 'shellfish'],
};

/** TheMealDB mixes adjectives ("British") and country names ("France"); show adjectives. */
const COUNTRY_TO_CUISINE: Record<string, string> = {
  'United States': 'American',
  France: 'French',
  Norway: 'Norwegian',
  India: 'Indian',
  Netherlands: 'Dutch',
  Argentina: 'Argentinian',
  Venezuela: 'Venezuelan',
  Slovakia: 'Slovak',
  Brazil: 'Brazilian',
  Unknown: 'International',
};

export function mapMealDbMeal(m: MealDbMeal): Recipe | null {
  const ingredients: Ingredient[] = [];
  for (let i = 1; i <= 20; i++) {
    const name = (m[`strIngredient${i}`] ?? '').trim();
    if (!name) continue;
    const amount = (m[`strMeasure${i}`] ?? '').trim();
    ingredients.push({ name: name.toLowerCase(), amount: amount || undefined, flags: inferIngredientFlags(name) });
  }
  const steps = splitSteps(m.strInstructions ?? '');
  if (!m.strMeal || !ingredients.length || !steps.length) return null;

  const area = (m.strArea || m.strCountry || 'International').trim();
  const cuisine = COUNTRY_TO_CUISINE[area] ?? area;
  const category = m.strCategory ?? 'Miscellaneous';
  const flags = [...new Set([...(CATEGORY_FLAGS[category] ?? []), ...inferIngredientFlags(m.strMeal)])];
  return {
    id: `mealdb-${m.idMeal}`,
    name: m.strMeal.trim(),
    subtitle: `${cuisine} · ${category}`,
    description: '',
    imageUrl: m.strMealThumb || undefined,
    emoji: CATEGORY_EMOJI[category] ?? '🍽️',
    tint: '#EFE9E1',
    cuisine,
    mealTypes: CATEGORY_MEALS[category] ?? ['lunch', 'dinner'],
    ingredients,
    steps,
    flags: flags.length ? flags : undefined,
    source: 'api',
    attribution: {
      provider: 'TheMealDB',
      providerUrl: 'https://www.themealdb.com',
      originalUrl: m.strSource || undefined,
    },
  };
}

/** Downloads TheMealDB's whole catalogue by first letter (26 small requests). */
export class TheMealDbSource implements RecipeSource {
  id = 'mealdb';
  name = 'TheMealDB';
  url = 'https://www.themealdb.com';

  constructor(private readonly apiKey = config.mealDbApiKey) {}

  async fetchAll(signal?: AbortSignal): Promise<Recipe[]> {
    const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
    const results = await Promise.allSettled(
      letters.map((l) =>
        fetchJson<{ meals: MealDbMeal[] | null }>(
          `https://www.themealdb.com/api/json/v1/${encodeURIComponent(this.apiKey)}/search.php?f=${l}`,
          signal,
        ),
      ),
    );
    const ok = results.filter((r): r is PromiseFulfilledResult<{ meals: MealDbMeal[] | null }> => r.status === 'fulfilled');
    if (!ok.length) throw (results[0] as PromiseRejectedResult).reason;
    return ok.flatMap((r) => r.value.meals ?? []).map(mapMealDbMeal).filter((r): r is Recipe => r !== null);
  }
}
