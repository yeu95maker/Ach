import { describe, expect, it, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    default: {
      getItem: async (k: string) => store.get(k) ?? null,
      setItem: async (k: string, v: string) => void store.set(k, v),
      removeItem: async (k: string) => void store.delete(k),
    },
  };
});

import { SAMPLE_RECIPES } from '@/data/sampleRecipes';
import { mapWikibooksRecord, WIKIBOOKS_RECIPES, type WikibooksRecord } from '@/data/wikibooksRecipes';
import { matchesCondition, matchesDiet, matchesGoal, recipeAllergens, recipeDiets, totalMinutes } from '@/domain/classify';
import { EMPTY_FILTERS, EMPTY_PREFERENCES, filterRecipes } from '@/domain/filter';
import { inferIngredientFlags } from '@/domain/ingredientFlags';
import type { Recipe } from '@/domain/types';
import { LibraryRecipeRepository, reviveRecipe } from '@/services/recipeRepository';
import { mapSpoonacularRecipe, type SpoonacularRecipe } from '@/services/sources/spoonacular';
import { splitSteps } from '@/services/sources/text';
import { mapMealDbMeal, type MealDbMeal } from '@/services/sources/themealdb';
import type { RecipeSource } from '@/services/sources/types';

import fixture from './fixtures/mealdb-sample.json';

const meals = (fixture as { meals: MealDbMeal[] }).meals;
const mapped = meals.map(mapMealDbMeal) as Recipe[];
const byName = (prefix: string) => mapped.find((r) => r.name.startsWith(prefix))!;

describe('inferIngredientFlags', () => {
  it.each([
    ['parmesan cheese', ['dairy']],
    ['peanut butter', ['peanut']],
    ['coconut milk', []],
    ['butter beans', []],
    ['chickpeas', []],
    ['chicken stock', ['poultry']],
    ['vegetable stock', []],
    ['stock cubes', ['meat']], // unknown stock: assume meat
    ['sausages', ['pork']], // ambiguous: assume pork
    ['turkey ham', ['poultry']],
    ['soy sauce', ['gluten', 'soy']],
    ['gluten-free soy sauce', ['soy']],
    ['rice noodles', []],
    ['egg noodles', ['egg', 'gluten']],
    ['eggplant', []],
    ['white wine vinegar', []],
    ['dry white wine', ['alcohol']],
    ['nutmeg', []],
    ['water chestnut', []],
    ['ground almonds', ['tree-nut']],
    ['tahini', ['sesame']],
    ['worcestershire sauce', ['fish']],
    ['oyster mushrooms', []],
    ['oyster sauce', ['shellfish']],
  ])('%s → %j', (name, flags) => {
    expect(inferIngredientFlags(name).sort()).toEqual([...flags].sort());
  });
});

describe('splitSteps', () => {
  it('drops STEP headers and numbering', () => {
    expect(splitSteps('STEP 1\r\nChop it.\r\n\r\nSTEP 2\r\nCook it.')).toEqual(['Chop it.', 'Cook it.']);
    expect(splitSteps('1. Chop it.\n2. Cook it.')).toEqual(['Chop it.', 'Cook it.']);
  });
  it('splits one long paragraph into readable steps', () => {
    const para = Array.from({ length: 8 }, (_, i) => `Do thing number ${i + 1} carefully for a while.`).join(' ');
    expect(splitSteps(para).length).toBe(4);
  });
});

describe('TheMealDB mapping (real data)', () => {
  it('maps every fixture meal', () => {
    expect(mapped.every(Boolean)).toBe(true);
    for (const r of mapped) {
      expect(r.id.startsWith('mealdb-')).toBe(true);
      expect(r.imageUrl).toMatch(/^https:\/\//);
      expect(r.attribution?.provider).toBe('TheMealDB');
      expect(r.nutrition).toBeUndefined();
    }
  });

  it('uses the category when the ingredient list omits the meat', () => {
    const belly = byName('Slow-cooked, Wadadli');
    expect(belly.ingredients.some((i) => i.name.includes('pork'))).toBe(false);
    expect(matchesDiet(belly, 'vegetarian')).toBe(false);
    expect(matchesDiet(belly, 'halal')).toBe(false);
    expect(matchesDiet(byName('Sushi'), 'vegetarian')).toBe(false);
  });

  it('cleans up STEP headers', () => {
    const steps = byName('Acaraje').steps;
    expect(steps.some((s) => /^step\s*\d+$/i.test(s))).toBe(false);
    expect(recipeAllergens(byName('Acaraje'))).toEqual(expect.arrayContaining(['gluten', 'shellfish']));
  });

  it('never lets recipes without nutrition pass goal or condition filters', () => {
    const r = mapped[0];
    expect(matchesGoal(r, 'high-protein')).toBe(false);
    expect(matchesCondition(r, 'heart')).toBe(false);
    expect(totalMinutes(r)).toBeUndefined();
    const list = filterRecipes([...SAMPLE_RECIPES, ...mapped], { ...EMPTY_PREFERENCES, conditions: ['heart'] }, EMPTY_FILTERS);
    expect(list.some((x) => x.source === 'api')).toBe(false);
    const quick = filterRecipes(mapped, EMPTY_PREFERENCES, { ...EMPTY_FILTERS, maxTotalMinutes: 30 });
    expect(quick).toEqual([]);
  });
});

const spoon: SpoonacularRecipe = {
  id: 42,
  title: 'Creamy Tuscan Chicken',
  image: 'https://img.spoonacular.com/recipes/42-556x370.jpg',
  summary: 'This <b>chicken</b> dish is <i>creamy</i>. It has more.',
  readyInMinutes: 35,
  preparationMinutes: -1,
  cookingMinutes: -1,
  servings: 4,
  cuisines: ['Italian'],
  dishTypes: ['main course', 'dinner'],
  vegetarian: false,
  glutenFree: false,
  dairyFree: false,
  sourceUrl: 'https://example.com/tuscan',
  creditsText: 'Example Kitchen',
  extendedIngredients: [
    { nameClean: 'chicken breast', original: '2 chicken breasts', measures: { metric: { amount: 450, unitShort: 'g' } } },
    { nameClean: 'heavy cream', original: '1 cup heavy cream', measures: { metric: { amount: 236.6, unitShort: 'ml' } } },
    { nameClean: 'spinach', original: '2 cups spinach', measures: { metric: { amount: 60, unitShort: 'g' } } },
  ],
  analyzedInstructions: [{ steps: [{ step: 'Sear the chicken.' }, { step: 'Add cream and spinach.' }] }],
  nutrition: {
    nutrients: [
      { name: 'Calories', amount: 512.4, unit: 'kcal' },
      { name: 'Protein', amount: 38.2, unit: 'g' },
      { name: 'Carbohydrates', amount: 8.1, unit: 'g' },
      { name: 'Fat', amount: 36.9, unit: 'g' },
      { name: 'Saturated Fat', amount: 18.2, unit: 'g' },
      { name: 'Fiber', amount: 1.4, unit: 'g' },
      { name: 'Sugar', amount: 3.2, unit: 'g' },
      { name: 'Sodium', amount: 480, unit: 'mg' },
    ],
  },
};

describe('Spoonacular mapping', () => {
  const r = mapSpoonacularRecipe(spoon)!;

  it('maps the core fields', () => {
    expect(r.id).toBe('spoon-42');
    expect(r.description).toBe('This chicken dish is creamy.');
    expect(r.mealTypes).toEqual(expect.arrayContaining(['lunch', 'dinner']));
    expect(totalMinutes(r)).toBe(35);
    expect(r.prepMinutes).toBeUndefined();
    expect(r.ingredients[0]).toMatchObject({ name: 'chicken breast', amount: '450 g' });
    expect(r.steps).toEqual(['Sear the chicken.', 'Add cream and spinach.']);
    expect(r.attribution?.provider).toBe('Example Kitchen via Spoonacular');
  });

  it('uses nutrition for goals and treats missing nutrients as unknown', () => {
    expect(r.nutrition?.calories).toBe(512);
    expect(matchesGoal(r, 'high-protein')).toBe(true);
    expect(matchesGoal(r, 'low-carb')).toBe(true);
    expect(Number.isNaN(r.nutrition!.potassiumMg)).toBe(true);
    expect(matchesCondition(r, 'kidney')).toBe(false);
  });

  it('adds provider diet flags conservatively', () => {
    expect(matchesDiet(r, 'gluten-free')).toBe(false); // ingredients look GF, provider says not
    expect(matchesDiet(r, 'dairy-free')).toBe(false);
    expect(matchesDiet(r, 'vegetarian')).toBe(false);
  });
});

describe('LibraryRecipeRepository', () => {
  const source = (recipes: Recipe[], fail = false): RecipeSource => ({
    id: 'test',
    name: 'Test',
    url: 'https://example.com',
    fetchAll: vi.fn(async () => {
      if (fail) throw new Error('offline');
      return recipes;
    }),
  });

  it('merges local recipes with downloaded ones and serves them from cache', async () => {
    const src = source(mapped);
    const repo = new LibraryRecipeRepository(SAMPLE_RECIPES, [src], 72);
    expect((await repo.list()).length).toBe(SAMPLE_RECIPES.length);
    const { recipes, status } = await repo.refresh();
    expect(recipes.length).toBe(SAMPLE_RECIPES.length + mapped.length);
    expect(status.find((s) => s.id === 'test')?.count).toBe(mapped.length);
    await repo.refresh(); // fresh cache: no second download
    expect(src.fetchAll).toHaveBeenCalledTimes(1);
    expect((await repo.list()).length).toBe(SAMPLE_RECIPES.length + mapped.length);
  });

  it('keeps the cached copy when the provider is offline', async () => {
    const repo = new LibraryRecipeRepository(SAMPLE_RECIPES, [source([], true)], 0);
    const { recipes, status } = await repo.refresh({ force: true });
    expect(recipes.length).toBe(SAMPLE_RECIPES.length + mapped.length); // cache from the previous test
    expect(status.find((s) => s.id === 'test')?.error).toBe('offline');
  });

  it('revives unknown nutrients (null after JSON) as NaN so they never pass thresholds', () => {
    const r = mapSpoonacularRecipe(spoon)!;
    const revived = reviveRecipe(JSON.parse(JSON.stringify(r)));
    expect(Number.isNaN(revived.nutrition!.potassiumMg)).toBe(true);
    expect(matchesCondition(revived, 'kidney')).toBe(false);
  });
});

describe('Wikibooks Cookbook mapping', () => {
  const rec: WikibooksRecord = {
    t: 'Chicken Paprikash',
    u: 'https://en.wikibooks.org/wiki/Cookbook:Chicken_Paprikash',
    c: 'Chicken recipes',
    cu: 'Hungarian',
    m: ['dinner'],
    s: 4,
    r: 60,
    d: 'Medium',
    i: [
      ['1 kg', 'chicken thighs'],
      ['2 tbsp', 'butter'],
      ['200 ml', 'sour cream'],
      [null, 'salt to taste'],
    ],
    p: ['Brown the chicken in butter.', 'Add paprika and stock and simmer.', 'Stir in the sour cream.'],
    k: [],
  };

  it('maps to a recipe with inferred flags, credit and licence', () => {
    const r = mapWikibooksRecord(rec);
    expect(r.id).toBe('wikibooks-chicken-paprikash');
    expect(r.subtitle).toBe('Hungarian · Chicken');
    expect(r.readyInMinutes).toBe(60);
    expect(r.nutrition).toBeUndefined();
    expect(r.tips).toBeUndefined();
    expect(r.attribution?.license?.name).toBe('CC BY-SA 4.0');
    expect(r.attribution?.originalUrl).toBe(rec.u);
    const diets = recipeDiets(r);
    expect(diets).not.toContain('vegetarian');
    expect(diets).not.toContain('dairy-free');
    expect(matchesGoal(r, 'weight-loss')).toBe(false);
  });

  it('bundled Wikibooks recipes have unique ids that do not clash with other recipes', () => {
    const ids = [...SAMPLE_RECIPES, ...WIKIBOOKS_RECIPES].map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
