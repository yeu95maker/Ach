import { SAMPLE_RECIPES } from '@/data/sampleRecipes';
import type { Recipe } from '@/domain/types';

/**
 * Source of recipes. The app only talks to this interface, so swapping the
 * bundled sample data for a real recipe API (Spoonacular, Edamam, your own
 * backend…) means writing one new class – no screen changes.
 *
 * An API adapter is responsible for mapping the provider's format into our
 * `Recipe` model, in particular filling `ingredients[].flags` and
 * `nutrition`, because every diet / allergy / condition tag is derived from them.
 */
export interface RecipeRepository {
  list(): Promise<Recipe[]>;
  getById(id: string): Promise<Recipe | undefined>;
}

export class SampleRecipeRepository implements RecipeRepository {
  constructor(private readonly recipes: Recipe[] = SAMPLE_RECIPES) {}

  async list(): Promise<Recipe[]> {
    return this.recipes;
  }

  async getById(id: string): Promise<Recipe | undefined> {
    return this.recipes.find((r) => r.id === id);
  }
}

/**
 * Skeleton for a remote source. Fill in `mapRecipe` for the chosen provider and
 * switch `recipeRepository` below to `new ApiRecipeRepository(url)`.
 */
export class ApiRecipeRepository implements RecipeRepository {
  constructor(
    private readonly baseUrl: string,
    private readonly mapRecipe: (raw: unknown) => Recipe,
  ) {}

  async list(): Promise<Recipe[]> {
    const res = await fetch(`${this.baseUrl}/recipes`);
    if (!res.ok) throw new Error(`Recipe API error ${res.status}`);
    const raw = (await res.json()) as unknown[];
    return raw.map(this.mapRecipe);
  }

  async getById(id: string): Promise<Recipe | undefined> {
    const res = await fetch(`${this.baseUrl}/recipes/${encodeURIComponent(id)}`);
    if (res.status === 404) return undefined;
    if (!res.ok) throw new Error(`Recipe API error ${res.status}`);
    return this.mapRecipe(await res.json());
  }
}

export const recipeRepository: RecipeRepository = new SampleRecipeRepository();
