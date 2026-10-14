import { config } from '@/config';
import { inferIngredientFlags } from '@/domain/ingredientFlags';
import type { Ingredient, IngredientFlag, MealType, Nutrition, Recipe } from '@/domain/types';

import { capitalise, splitSteps, stripHtml } from './text';
import { fetchJson, type RecipeSource } from './types';

/** Raw shape of a recipe from /recipes/complexSearch with addRecipeInformation + addRecipeNutrition + fillIngredients. */
export interface SpoonacularRecipe {
  id: number;
  title: string;
  image?: string;
  summary?: string;
  instructions?: string | null;
  analyzedInstructions?: { steps: { step: string }[] }[];
  readyInMinutes?: number;
  preparationMinutes?: number | null;
  cookingMinutes?: number | null;
  servings?: number;
  cuisines?: string[];
  dishTypes?: string[];
  vegetarian?: boolean;
  vegan?: boolean;
  glutenFree?: boolean;
  dairyFree?: boolean;
  sourceUrl?: string;
  sourceName?: string;
  creditsText?: string;
  extendedIngredients?: {
    name?: string;
    nameClean?: string | null;
    original?: string;
    amount?: number;
    unit?: string;
    measures?: { metric?: { amount: number; unitShort: string } };
  }[];
  nutrition?: { nutrients?: { name: string; amount: number; unit: string }[] };
}

function mealTypes(dishTypes: string[] = []): MealType[] {
  const d = dishTypes.map((t) => t.toLowerCase());
  const types = new Set<MealType>();
  if (d.some((t) => ['breakfast', 'brunch', 'morning meal'].includes(t))) types.add('breakfast');
  if (d.includes('dessert')) types.add('dessert');
  if (d.some((t) => ['snack', 'appetizer', 'antipasti', 'starter', 'fingerfood', "hor d'oeuvre"].includes(t))) types.add('snack');
  if (d.some((t) => ['lunch', 'main course', 'main dish', 'dinner', 'salad', 'soup', 'side dish'].includes(t))) {
    types.add('lunch');
    types.add('dinner');
  }
  return types.size ? [...types] : ['lunch', 'dinner'];
}

function nutritionOf(r: SpoonacularRecipe): Nutrition | undefined {
  const list = r.nutrition?.nutrients ?? [];
  const get = (name: string) => list.find((n) => n.name.toLowerCase() === name.toLowerCase())?.amount;
  const calories = get('Calories');
  const proteinG = get('Protein');
  const carbsG = get('Carbohydrates');
  const fatG = get('Fat');
  if ([calories, proteinG, carbsG, fatG].some((v) => v == null)) return undefined;
  const r1 = (v: number | undefined) => (v == null ? NaN : Math.round(v * 10) / 10);
  return {
    calories: Math.round(calories!),
    proteinG: r1(proteinG),
    carbsG: r1(carbsG),
    fatG: r1(fatG),
    // Missing values become NaN: every threshold comparison with NaN is false, so the recipe safely fails that rule.
    saturatedFatG: r1(get('Saturated Fat')),
    fiberG: r1(get('Fiber')),
    sugarG: r1(get('Sugar')),
    sodiumMg: r1(get('Sodium')),
    potassiumMg: r1(get('Potassium')),
    phosphorusMg: r1(get('Phosphorus')),
  };
}

function formatAmount(i: NonNullable<SpoonacularRecipe['extendedIngredients']>[number]): string | undefined {
  const m = i.measures?.metric;
  const amount = m?.amount ?? i.amount;
  const unit = m?.unitShort ?? i.unit ?? '';
  if (amount == null || !isFinite(amount) || amount <= 0) return undefined;
  const rounded = amount >= 10 ? Math.round(amount) : Math.round(amount * 4) / 4;
  return `${rounded}${unit ? ` ${unit}` : ''}`;
}

export function mapSpoonacularRecipe(r: SpoonacularRecipe): Recipe | null {
  const ingredients: Ingredient[] = (r.extendedIngredients ?? [])
    .filter((i) => i.name || i.nameClean)
    .map((i) => {
      const name = (i.nameClean || i.name || '').toLowerCase();
      return { name, amount: formatAmount(i), flags: inferIngredientFlags(`${name} ${i.original ?? ''}`) };
    });
  let steps = (r.analyzedInstructions ?? []).flatMap((block) => block.steps.map((s) => s.step.trim())).filter(Boolean);
  if (!steps.length && r.instructions) steps = splitSteps(stripHtml(r.instructions.replace(/<\/(li|p)>/g, '\n')));
  if (!r.title || !ingredients.length || !steps.length) return null;

  // Spoonacular's own diet booleans add flags our ingredient reading might miss (conservative direction only).
  const flags: IngredientFlag[] = [];
  const inferred = new Set(ingredients.flatMap((i) => i.flags ?? []));
  if (r.vegetarian === false && !['meat', 'pork', 'poultry', 'fish', 'shellfish'].some((f) => inferred.has(f as IngredientFlag))) flags.push('meat');
  if (r.glutenFree === false && !inferred.has('gluten')) flags.push('gluten');
  if (r.dairyFree === false && !inferred.has('dairy')) flags.push('dairy');

  const summary = r.summary ? stripHtml(r.summary) : '';
  const firstSentence = summary.match(/^.*?[.!?](\s|$)/)?.[0]?.trim() ?? '';
  const cuisine = r.cuisines?.[0] ?? 'International';
  const prep = r.preparationMinutes && r.preparationMinutes > 0 ? r.preparationMinutes : undefined;
  const cook = r.cookingMinutes && r.cookingMinutes > 0 ? r.cookingMinutes : undefined;
  return {
    id: `spoon-${r.id}`,
    name: r.title.trim(),
    subtitle: [cuisine !== 'International' ? cuisine : null, r.dishTypes?.[0] ? capitalise(r.dishTypes[0]) : null]
      .filter(Boolean)
      .join(' · '),
    description: firstSentence,
    imageUrl: r.image,
    emoji: '🍽️',
    tint: '#EFE9E1',
    cuisine,
    mealTypes: mealTypes(r.dishTypes),
    prepMinutes: prep,
    cookMinutes: cook,
    readyInMinutes: prep == null && cook == null ? r.readyInMinutes : undefined,
    servings: r.servings && r.servings > 0 ? r.servings : undefined,
    ingredients,
    steps,
    nutrition: nutritionOf(r),
    flags: flags.length ? flags : undefined,
    source: 'api',
    attribution: {
      provider: r.creditsText ? `${r.creditsText} via Spoonacular` : 'Spoonacular',
      providerUrl: 'https://spoonacular.com/food-api',
      originalUrl: r.sourceUrl,
    },
  };
}

export class SpoonacularSource implements RecipeSource {
  id = 'spoonacular';
  name = 'Spoonacular';
  url = 'https://spoonacular.com/food-api';

  constructor(
    private readonly apiKey = config.spoonacularApiKey,
    private readonly maxRecipes = config.spoonacularMaxRecipes,
  ) {}

  async fetchAll(signal?: AbortSignal): Promise<Recipe[]> {
    const pageSize = 100;
    const all: SpoonacularRecipe[] = [];
    for (let offset = 0; offset < this.maxRecipes; offset += pageSize) {
      const params = new URLSearchParams({
        apiKey: this.apiKey,
        number: String(Math.min(pageSize, this.maxRecipes - offset)),
        offset: String(offset),
        addRecipeInformation: 'true',
        addRecipeNutrition: 'true',
        fillIngredients: 'true',
        instructionsRequired: 'true',
        sort: 'popularity',
      });
      const page = await fetchJson<{ results: SpoonacularRecipe[]; totalResults: number }>(
        `https://api.spoonacular.com/recipes/complexSearch?${params}`,
        signal,
      );
      all.push(...page.results);
      if (page.results.length < pageSize || all.length >= page.totalResults) break;
    }
    return all.map(mapSpoonacularRecipe).filter((r): r is Recipe => r !== null);
  }
}
