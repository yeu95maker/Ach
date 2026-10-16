/**
 * Core data model. Kept free of React / Expo imports so the same types can be
 * shared with a future backend (e.g. Supabase tables or a recipe API adapter).
 */

/** Facts about an ingredient that drive diet, allergy and religious checks. */
export type IngredientFlag =
  | 'meat' // red meat (beef, lamb, …)
  | 'pork'
  | 'poultry'
  | 'fish'
  | 'shellfish'
  | 'dairy'
  | 'egg'
  | 'gluten'
  | 'peanut'
  | 'tree-nut'
  | 'soy'
  | 'sesame'
  | 'alcohol'
  | 'honey';

export interface Ingredient {
  name: string;
  /** Human-readable amount, e.g. "1 cup" or "200 g". */
  amount?: string;
  note?: string;
  flags?: IngredientFlag[];
}

/** Approximate values per serving. */
export interface Nutrition {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  saturatedFatG: number;
  fiberG: number;
  sugarG: number;
  sodiumMg: number;
  potassiumMg: number;
  phosphorusMg: number;
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'dessert';
export type Difficulty = 'Easy' | 'Medium' | 'Hard';

export interface Recipe {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  /** Optional photo URL; when missing the UI shows the emoji on a tinted background. */
  imageUrl?: string;
  emoji: string;
  /** Background tint for the emoji hero. */
  tint: string;
  cuisine: string;
  mealTypes: MealType[];
  /** Unknown for some API sources – the UI hides missing values and filters treat them as "doesn't match". */
  prepMinutes?: number;
  cookMinutes?: number;
  /** Total time when the source only gives one number (no prep/cook split). */
  readyInMinutes?: number;
  servings?: number;
  difficulty?: Difficulty;
  ingredients: Ingredient[];
  steps: string[];
  /** Missing for sources without nutrition data; such recipes never pass goal or condition filters. */
  nutrition?: Nutrition;
  /** Short practical tips shown below the steps. */
  tips?: string[];
  /** Cheap everyday ingredients. */
  budgetFriendly?: boolean;
  /** Seasons the dish suits, e.g. a warming stew for cold weather. */
  weather?: Weather[];
  /** Where the recipe came from – 'sample' for the bundled MVP data. */
  source: 'sample' | 'api' | 'user';
  /** Credit shown on the recipe page for recipes from external providers. */
  attribution?: {
    provider: string;
    providerUrl?: string;
    originalUrl?: string;
    /** Content licence the recipe text is shared under (e.g. CC BY-SA 4.0). */
    license?: { name: string; url: string };
  };
  /** Recipe-level flags a provider asserts (e.g. "not gluten-free") on top of what the ingredients reveal. */
  flags?: IngredientFlag[];
}

export type Weather = 'cold' | 'warm';

/** Dietary needs the user can require. All are derived from ingredient flags. */
export type DietId =
  | 'vegetarian'
  | 'vegan'
  | 'gluten-free'
  | 'dairy-free'
  | 'nut-free'
  | 'egg-free'
  | 'halal'
  | 'kosher';

/** Meal goals – derived from nutrition and timing. */
export type GoalId = 'balanced' | 'weight-loss' | 'high-protein' | 'quick' | 'low-carb' | 'high-fiber';

/** Condition-aware filters – derived from nutrition thresholds (see domain/conditions.ts). */
export type ConditionId = 'heart' | 'kidney' | 'liver' | 'diabetes' | 'digestive';

/** Allergens the user can exclude. Maps onto ingredient flags. */
export type AllergenId =
  | 'peanut'
  | 'tree-nut'
  | 'dairy'
  | 'egg'
  | 'gluten'
  | 'soy'
  | 'sesame'
  | 'fish'
  | 'shellfish';

export interface RecipeFilters {
  query: string;
  mealTypes: MealType[];
  diets: DietId[];
  goals: GoalId[];
  conditions: ConditionId[];
  maxTotalMinutes?: number;
}

/** Persistent per-user preferences (onboarding + profile). */
export interface UserPreferences {
  goals: GoalId[];
  diets: DietId[];
  conditions: ConditionId[];
  allergens: AllergenId[];
  /** Free-text ingredient exclusions, e.g. "mushroom", "coriander". */
  excludedIngredients: string[];
}

export type SwipeAction = 'save' | 'skip';

export interface SwipeEvent {
  recipeId: string;
  action: SwipeAction;
  at: number;
}
