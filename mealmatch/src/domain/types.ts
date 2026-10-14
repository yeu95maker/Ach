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
  prepMinutes: number;
  cookMinutes: number;
  servings: number;
  difficulty: Difficulty;
  ingredients: Ingredient[];
  steps: string[];
  nutrition: Nutrition;
  /** Where the recipe came from – 'sample' for the bundled MVP data. */
  source: 'sample' | 'api' | 'user';
}

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
