import type {
  Nutrition,
  AllergenId,
  ConditionId,
  DietId,
  GoalId,
  IngredientFlag,
  Recipe,
} from './types';

/**
 * Every tag shown in the app is *derived* from a recipe's ingredients and
 * nutrition instead of being hand-labelled. That keeps sample data, API data
 * and user-created recipes consistent, and means a "Vegan" badge can never
 * contradict the ingredient list.
 */

export function recipeFlags(recipe: Recipe): Set<IngredientFlag> {
  const flags = new Set<IngredientFlag>();
  for (const ing of recipe.ingredients) for (const f of ing.flags ?? []) flags.add(f);
  for (const f of recipe.flags ?? []) flags.add(f);
  return flags;
}

/** Total time in minutes, or undefined when the source doesn't say. */
export const totalMinutes = (r: Recipe): number | undefined =>
  r.prepMinutes == null && r.cookMinutes == null
    ? r.readyInMinutes
    : (r.prepMinutes ?? 0) + (r.cookMinutes ?? 0);

/** Wraps a nutrition rule so recipes without nutrition data never match it. */
const withNutrition =
  (test: (n: Nutrition) => boolean) =>
  (r: Recipe): boolean =>
    r.nutrition != null && test(r.nutrition);

const ANIMAL_FLESH: IngredientFlag[] = ['meat', 'pork', 'poultry', 'fish', 'shellfish'];

const DIET_RULES: Record<DietId, (flags: Set<IngredientFlag>) => boolean> = {
  vegetarian: (f) => !ANIMAL_FLESH.some((x) => f.has(x)),
  vegan: (f) => !ANIMAL_FLESH.some((x) => f.has(x)) && !f.has('dairy') && !f.has('egg') && !f.has('honey'),
  'gluten-free': (f) => !f.has('gluten'),
  'dairy-free': (f) => !f.has('dairy'),
  'nut-free': (f) => !f.has('peanut') && !f.has('tree-nut'),
  'egg-free': (f) => !f.has('egg'),
  // Ingredient-level compatibility only; meat must still come from a certified source.
  halal: (f) => !f.has('pork') && !f.has('alcohol'),
  kosher: (f) =>
    !f.has('pork') &&
    !f.has('shellfish') &&
    !((f.has('meat') || f.has('poultry')) && f.has('dairy')),
};

export function matchesDiet(recipe: Recipe, diet: DietId): boolean {
  return DIET_RULES[diet](recipeFlags(recipe));
}

export function recipeDiets(recipe: Recipe): DietId[] {
  const flags = recipeFlags(recipe);
  return (Object.keys(DIET_RULES) as DietId[]).filter((d) => DIET_RULES[d](flags));
}

/** True when halal/kosher compatibility depends on sourcing certified meat. */
export function needsCertifiedMeat(recipe: Recipe): boolean {
  const f = recipeFlags(recipe);
  return f.has('meat') || f.has('poultry');
}

const GOAL_RULES: Record<GoalId, (r: Recipe) => boolean> = {
  balanced: withNutrition(
    (n) =>
      n.calories >= 250 &&
      n.calories <= 700 &&
      n.proteinG >= 12 &&
      n.fiberG >= 4 &&
      n.saturatedFatG <= 7 &&
      n.sodiumMg <= 900 &&
      n.sugarG <= 20,
  ),
  'weight-loss': withNutrition((n) => n.calories <= 500 && n.proteinG >= 15 && n.fiberG >= 4),
  'high-protein': withNutrition((n) => n.proteinG >= 25),
  quick: (r) => {
    const t = totalMinutes(r);
    return t != null && t <= 20;
  },
  'low-carb': withNutrition((n) => n.carbsG <= 25),
  'high-fiber': withNutrition((n) => n.fiberG >= 8),
};

export function matchesGoal(recipe: Recipe, goal: GoalId): boolean {
  return GOAL_RULES[goal](recipe);
}

export function recipeGoals(recipe: Recipe): GoalId[] {
  return (Object.keys(GOAL_RULES) as GoalId[]).filter((g) => GOAL_RULES[g](recipe));
}

/**
 * Condition-aware thresholds (per serving). These are deliberately simple,
 * conservative screening rules based on widely published general guidance –
 * they are NOT medical advice and are shown to the user alongside a disclaimer.
 * Any production version should be reviewed by a registered dietitian.
 */
export const CONDITION_CRITERIA: Record<ConditionId, { summary: string; test: (r: Recipe) => boolean }> = {
  heart: {
    summary: 'Sodium ≤ 600 mg and saturated fat ≤ 5 g per serving.',
    test: withNutrition((n) => n.sodiumMg <= 600 && n.saturatedFatG <= 5),
  },
  kidney: {
    summary: 'Sodium ≤ 600 mg, potassium ≤ 700 mg and phosphorus ≤ 300 mg per serving.',
    test: withNutrition((n) => n.sodiumMg <= 600 && n.potassiumMg <= 700 && n.phosphorusMg <= 300),
  },
  liver: {
    summary: 'No alcohol, sodium ≤ 600 mg and saturated fat ≤ 5 g per serving.',
    test: (r) => !recipeFlags(r).has('alcohol') && withNutrition((n) => n.sodiumMg <= 600 && n.saturatedFatG <= 5)(r),
  },
  diabetes: {
    summary: 'Sugar ≤ 10 g, carbohydrate ≤ 50 g and fibre ≥ 5 g per serving.',
    test: withNutrition((n) => n.sugarG <= 10 && n.carbsG <= 50 && n.fiberG >= 5),
  },
  digestive: {
    summary: 'Fibre ≥ 6 g and total fat ≤ 20 g per serving.',
    test: withNutrition((n) => n.fiberG >= 6 && n.fatG <= 20),
  },
};

export function matchesCondition(recipe: Recipe, condition: ConditionId): boolean {
  return CONDITION_CRITERIA[condition].test(recipe);
}

export function recipeConditions(recipe: Recipe): ConditionId[] {
  return (Object.keys(CONDITION_CRITERIA) as ConditionId[]).filter((c) => matchesCondition(recipe, c));
}

/** Allergens present in a recipe (from ingredient flags). */
export function recipeAllergens(recipe: Recipe): AllergenId[] {
  const allergenFlags: AllergenId[] = ['peanut', 'tree-nut', 'dairy', 'egg', 'gluten', 'soy', 'sesame', 'fish', 'shellfish'];
  const flags = recipeFlags(recipe);
  return allergenFlags.filter((a) => flags.has(a));
}

const normalise = (s: string) => s.toLowerCase().trim().replace(/(es|s)$/, '');

/** Ingredients that match any of the user's free-text exclusions. */
export function excludedIngredientHits(recipe: Recipe, exclusions: string[]): string[] {
  const terms = exclusions.map(normalise).filter(Boolean);
  if (!terms.length) return [];
  return recipe.ingredients
    .filter((ing) => {
      const name = ing.name.toLowerCase();
      return terms.some((t) => name.includes(t));
    })
    .map((ing) => ing.name);
}
