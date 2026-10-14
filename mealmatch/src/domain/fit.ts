import { ALLERGENS, CONDITIONS, DIETS, GOALS, labelOf } from './catalog';
import { excludedIngredientHits, matchesCondition, matchesDiet, matchesGoal, recipeAllergens } from './classify';
import type { Recipe, UserPreferences } from './types';

export type FitStatus = 'good' | 'warn' | 'bad';

export interface FitItem {
  status: FitStatus;
  text: string;
}

export interface FitReport {
  /** Overall verdict: 'bad' if anything conflicts with a hard constraint. */
  status: FitStatus;
  headline: string;
  items: FitItem[];
}

/**
 * Explains, line by line, how a recipe lines up with the user's profile.
 * Diets, allergies, exclusions and conditions are hard constraints; goals are nice-to-haves.
 */
export function fitReport(recipe: Recipe, prefs: UserPreferences): FitReport {
  const items: FitItem[] = [];

  for (const d of prefs.diets) {
    items.push(
      matchesDiet(recipe, d)
        ? { status: 'good', text: `${labelOf(DIETS, d)} – fits your diet` }
        : { status: 'bad', text: `Not ${labelOf(DIETS, d).toLowerCase()}` },
    );
  }

  const allergens = recipeAllergens(recipe);
  const hits = prefs.allergens.filter((a) => allergens.includes(a));
  for (const a of hits) items.push({ status: 'bad', text: `Contains ${labelOf(ALLERGENS, a).toLowerCase()} – you avoid this` });
  if (prefs.allergens.length && !hits.length) items.push({ status: 'good', text: 'Free from your allergens' });

  for (const name of excludedIngredientHits(recipe, prefs.excludedIngredients)) {
    items.push({ status: 'bad', text: `Contains ${name} – on your avoid list` });
  }

  for (const c of prefs.conditions) {
    items.push(
      matchesCondition(recipe, c)
        ? { status: 'good', text: `Within the ${labelOf(CONDITIONS, c).toLowerCase()} limits` }
        : { status: 'bad', text: `Outside the ${labelOf(CONDITIONS, c).toLowerCase()} limits` },
    );
  }

  for (const g of prefs.goals) {
    items.push(
      matchesGoal(recipe, g)
        ? { status: 'good', text: `Meets your goal: ${labelOf(GOALS, g)}` }
        : { status: 'warn', text: `Doesn't meet your goal: ${labelOf(GOALS, g)}` },
    );
  }

  const status: FitStatus = items.some((i) => i.status === 'bad')
    ? 'bad'
    : items.some((i) => i.status === 'warn')
      ? 'warn'
      : 'good';
  const headline = !items.length
    ? 'Set your preferences in Profile to see how recipes fit you.'
    : status === 'good'
      ? 'Great match for you'
      : status === 'warn'
        ? 'Fits your needs, but not every goal'
        : 'Not a good fit for your profile';
  return { status, headline, items };
}
