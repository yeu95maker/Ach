import { matchesGoal, recipeGoals } from './classify';
import { labelOf, GOALS } from './catalog';
import type { Recipe, SwipeEvent, UserPreferences } from './types';

export interface ScoredRecipe {
  recipe: Recipe;
  score: number;
  /** Short human-readable reasons, e.g. "High Protein" or "Because you liked Thai". */
  reasons: string[];
}

/**
 * Local, explainable recommender. It ranks recipes by
 *  1. how many of the user's goals they meet, and
 *  2. similarity to recipes the user saved or rated highly (cuisine, meal type, goals),
 *     minus a little for cuisines they keep skipping.
 *
 * It is intentionally a pure function of (candidates, preferences, history) so
 * it can later be replaced by a server-side model without touching the UI.
 */
export function rankRecipes(
  candidates: Recipe[],
  prefs: UserPreferences,
  history: SwipeEvent[],
  allRecipes: Recipe[],
  ratings: Record<string, number> = {},
): ScoredRecipe[] {
  const byId = new Map(allRecipes.map((r) => [r.id, r]));
  // Star ratings count as strong signals: 4–5 stars like a save, 1–2 stars like a skip.
  const likedIds = [
    ...history.filter((h) => h.action === 'save').map((h) => h.recipeId),
    ...Object.keys(ratings).filter((id) => ratings[id] >= 4),
  ];
  const skippedIds = [
    ...history.filter((h) => h.action === 'skip').map((h) => h.recipeId),
    ...Object.keys(ratings).filter((id) => ratings[id] <= 2),
  ];
  const liked = likedIds.map((id) => byId.get(id)).filter(Boolean) as Recipe[];
  const skipped = skippedIds.map((id) => byId.get(id)).filter(Boolean) as Recipe[];

  const cuisineLikes = countBy(liked.map((r) => r.cuisine));
  const cuisineSkips = countBy(skipped.map((r) => r.cuisine));
  const mealLikes = countBy(liked.flatMap((r) => r.mealTypes));
  const goalLikes = countBy(liked.flatMap(recipeGoals));

  return candidates
    .map((recipe) => {
      let score = 0;
      const reasons: string[] = [];

      for (const g of prefs.goals) {
        if (matchesGoal(recipe, g)) {
          score += 3;
          reasons.push(labelOf(GOALS, g));
        }
      }

      const cLike = cuisineLikes.get(recipe.cuisine) ?? 0;
      if (cLike) {
        score += Math.min(cLike, 3) * 1.5;
        reasons.push(`Because you liked ${recipe.cuisine}`);
      }
      score -= Math.min(cuisineSkips.get(recipe.cuisine) ?? 0, 3) * 0.5;
      for (const m of recipe.mealTypes) score += Math.min(mealLikes.get(m) ?? 0, 3) * 0.3;
      for (const g of recipeGoals(recipe)) score += Math.min(goalLikes.get(g) ?? 0, 3) * 0.3;

      return { recipe, score, reasons };
    })
    .sort((a, b) => b.score - a.score || a.recipe.id.localeCompare(b.recipe.id));
}

function countBy(values: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return m;
}
