import AsyncStorage from '@react-native-async-storage/async-storage';

import { config } from '@/config';
import { SAMPLE_RECIPES } from '@/data/sampleRecipes';
import { WIKIBOOKS_RECIPES } from '@/data/wikibooksRecipes';
import type { Nutrition, Recipe } from '@/domain/types';

import { SpoonacularSource } from './sources/spoonacular';
import { TheMealDbSource } from './sources/themealdb';
import type { RecipeSource } from './sources/types';

/**
 * Where recipes come from. The app only talks to this interface: the bundled
 * sample recipes are always available, and external providers (see
 * services/sources) are downloaded in the background and cached on the device
 * so the library also works offline.
 */
export interface RecipeRepository {
  /** Bundled recipes plus whatever is cached – fast, no network. */
  list(): Promise<Recipe[]>;
  /** Downloads from providers whose cache is older than `maxAgeHours` (or all, when `force`). */
  refresh(opts?: { force?: boolean }): Promise<{ recipes: Recipe[]; status: SourceStatus[] }>;
  status(): Promise<SourceStatus[]>;
}

export interface SourceStatus {
  id: string;
  name: string;
  url: string;
  count: number;
  fetchedAt?: number;
  error?: string;
}

interface CacheEntry {
  fetchedAt: number;
  recipes: Recipe[];
}

const cacheKey = (sourceId: string) => `mealmatch:recipes:${sourceId}:v1`;
const NUTRITION_KEYS: (keyof Nutrition)[] = [
  'calories',
  'proteinG',
  'carbsG',
  'fatG',
  'saturatedFatG',
  'fiberG',
  'sugarG',
  'sodiumMg',
  'potassiumMg',
  'phosphorusMg',
];

/** JSON turns NaN ("unknown") into null; turn it back so unknown values never pass a health threshold. */
export function reviveRecipe(r: Recipe): Recipe {
  if (!r.nutrition) return r;
  const n = { ...r.nutrition };
  for (const k of NUTRITION_KEYS) if (n[k] == null) n[k] = NaN;
  return { ...r, nutrition: n };
}

export class LibraryRecipeRepository implements RecipeRepository {
  private errors = new Map<string, string>();

  constructor(
    private readonly local: Recipe[],
    private readonly sources: RecipeSource[],
    private readonly maxAgeHours = config.recipeCacheHours,
  ) {}

  private async readCache(id: string): Promise<CacheEntry | null> {
    try {
      const raw = await AsyncStorage.getItem(cacheKey(id));
      if (!raw) return null;
      const entry = JSON.parse(raw) as CacheEntry;
      return { ...entry, recipes: entry.recipes.map(reviveRecipe) };
    } catch {
      return null;
    }
  }

  private merge(remote: Recipe[][]): Recipe[] {
    const byId = new Map<string, Recipe>();
    for (const r of [...this.local, ...remote.flat()]) if (!byId.has(r.id)) byId.set(r.id, r);
    return [...byId.values()];
  }

  async list(): Promise<Recipe[]> {
    const caches = await Promise.all(this.sources.map((s) => this.readCache(s.id)));
    return this.merge(caches.map((c) => c?.recipes ?? []));
  }

  async refresh({ force = false } = {}): Promise<{ recipes: Recipe[]; status: SourceStatus[] }> {
    const now = Date.now();
    const lists = await Promise.all(
      this.sources.map(async (source) => {
        const cached = await this.readCache(source.id);
        const fresh = cached && now - cached.fetchedAt < this.maxAgeHours * 3600_000;
        if (fresh && !force) return cached.recipes;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 45_000);
        try {
          const recipes = await source.fetchAll(controller.signal);
          if (recipes.length) {
            await AsyncStorage.setItem(cacheKey(source.id), JSON.stringify({ fetchedAt: now, recipes })).catch(() => {});
          }
          this.errors.delete(source.id);
          return recipes.length ? recipes : (cached?.recipes ?? []);
        } catch (e) {
          // Offline or provider down: keep using whatever we had.
          this.errors.set(source.id, e instanceof Error ? e.message : String(e));
          return cached?.recipes ?? [];
        } finally {
          clearTimeout(timer);
        }
      }),
    );
    return { recipes: this.merge(lists), status: await this.status() };
  }

  async status(): Promise<SourceStatus[]> {
    const caches = await Promise.all(this.sources.map((s) => this.readCache(s.id)));
    return [
      { id: 'mealmatch', name: 'MealMatch originals', url: '', count: this.local.length },
      ...this.sources.map((s, i) => ({
        id: s.id,
        name: s.name,
        url: s.url,
        count: caches[i]?.recipes.length ?? 0,
        fetchedAt: caches[i]?.fetchedAt,
        error: this.errors.get(s.id),
      })),
    ];
  }
}

export function configuredSources(): RecipeSource[] {
  const sources: RecipeSource[] = [];
  if (config.spoonacularApiKey) sources.push(new SpoonacularSource());
  if (config.mealDbEnabled) sources.push(new TheMealDbSource());
  return sources;
}

export const recipeRepository: RecipeRepository = new LibraryRecipeRepository(
  [...SAMPLE_RECIPES, ...WIKIBOOKS_RECIPES],
  configuredSources(),
);
