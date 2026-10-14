import {
  excludedIngredientHits,
  matchesCondition,
  matchesDiet,
  matchesGoal,
  recipeAllergens,
  totalMinutes,
} from './classify';
import type { Recipe, RecipeFilters, UserPreferences } from './types';

export const EMPTY_FILTERS: RecipeFilters = {
  query: '',
  mealTypes: [],
  diets: [],
  goals: [],
  conditions: [],
  maxTotalMinutes: undefined,
};

export const EMPTY_PREFERENCES: UserPreferences = {
  goals: [],
  diets: [],
  conditions: [],
  allergens: [],
  excludedIngredients: [],
};

/**
 * Hard constraints from the user's profile. A recipe that fails any of these is
 * never shown (diet, allergies, exclusions and health conditions are safety /
 * values constraints, not taste). Profile goals are soft and only affect ranking.
 */
export function passesProfile(recipe: Recipe, prefs: UserPreferences): boolean {
  if (!prefs.diets.every((d) => matchesDiet(recipe, d))) return false;
  const allergens = recipeAllergens(recipe);
  if (prefs.allergens.some((a) => allergens.includes(a))) return false;
  if (excludedIngredientHits(recipe, prefs.excludedIngredients).length) return false;
  if (!prefs.conditions.every((c) => matchesCondition(recipe, c))) return false;
  return true;
}

export function matchesQuery(recipe: Recipe, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    recipe.name,
    recipe.subtitle,
    recipe.cuisine,
    ...recipe.ingredients.map((i) => i.name),
  ]
    .join(' ')
    .toLowerCase();
  return q.split(/\s+/).every((word) => haystack.includes(word));
}

/** Ad-hoc filters chosen on the Filters screen. */
export function passesFilters(recipe: Recipe, f: RecipeFilters): boolean {
  if (!matchesQuery(recipe, f.query)) return false;
  if (f.mealTypes.length && !f.mealTypes.some((m) => recipe.mealTypes.includes(m))) return false;
  if (!f.diets.every((d) => matchesDiet(recipe, d))) return false;
  if (!f.goals.every((g) => matchesGoal(recipe, g))) return false;
  if (!f.conditions.every((c) => matchesCondition(recipe, c))) return false;
  if (f.maxTotalMinutes != null && totalMinutes(recipe) > f.maxTotalMinutes) return false;
  return true;
}

export function filterRecipes(recipes: Recipe[], prefs: UserPreferences, filters: RecipeFilters): Recipe[] {
  return recipes.filter((r) => passesProfile(r, prefs) && passesFilters(r, filters));
}

export function activeFilterCount(f: RecipeFilters): number {
  return (
    (f.query.trim() ? 1 : 0) +
    f.mealTypes.length +
    f.diets.length +
    f.goals.length +
    f.conditions.length +
    (f.maxTotalMinutes != null ? 1 : 0)
  );
}
