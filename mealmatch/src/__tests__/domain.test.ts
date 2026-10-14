import { describe, expect, it } from 'vitest';

import { SAMPLE_RECIPES } from '@/data/sampleRecipes';
import {
  excludedIngredientHits,
  matchesCondition,
  matchesDiet,
  recipeAllergens,
  recipeDiets,
} from '@/domain/classify';
import { DIETS, CONDITIONS, GOALS, MEAL_TYPES } from '@/domain/catalog';
import { EMPTY_FILTERS, EMPTY_PREFERENCES, filterRecipes, passesProfile } from '@/domain/filter';
import { rankRecipes } from '@/domain/recommend';
import type { Recipe, UserPreferences } from '@/domain/types';
import { matchesGoal } from '@/domain/classify';

const byId = (id: string): Recipe => {
  const r = SAMPLE_RECIPES.find((x) => x.id === id);
  if (!r) throw new Error(`missing ${id}`);
  return r;
};
const prefs = (p: Partial<UserPreferences>): UserPreferences => ({ ...EMPTY_PREFERENCES, ...p });

describe('sample database', () => {
  it('has unique ids', () => {
    const ids = SAMPLE_RECIPES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has at least one recipe for every diet, goal, condition and meal type', () => {
    for (const d of DIETS) expect(SAMPLE_RECIPES.some((r) => matchesDiet(r, d.id)), d.id).toBe(true);
    for (const g of GOALS) expect(SAMPLE_RECIPES.some((r) => matchesGoal(r, g.id)), g.id).toBe(true);
    for (const c of CONDITIONS) expect(SAMPLE_RECIPES.some((r) => matchesCondition(r, c.id)), c.id).toBe(true);
    for (const m of MEAL_TYPES) expect(SAMPLE_RECIPES.some((r) => r.mealTypes.includes(m.id)), m.id).toBe(true);
  });

  it('every recipe has ingredients and steps', () => {
    for (const r of SAMPLE_RECIPES) {
      expect(r.ingredients.length, r.id).toBeGreaterThan(2);
      expect(r.steps.length, r.id).toBeGreaterThan(1);
    }
  });
});

describe('diet classification', () => {
  it('derives vegan / vegetarian from ingredients', () => {
    expect(recipeDiets(byId('chickpea-avocado-salad'))).toEqual(
      expect.arrayContaining(['vegan', 'vegetarian', 'gluten-free', 'dairy-free', 'nut-free', 'egg-free']),
    );
    const pancakes = recipeDiets(byId('banana-oat-pancakes'));
    expect(pancakes).toContain('vegetarian');
    expect(pancakes).not.toContain('vegan');
    expect(recipeDiets(byId('lemon-herb-salmon-bowl'))).not.toContain('vegetarian');
  });

  it('honey makes a recipe non-vegan', () => {
    expect(matchesDiet(byId('greek-yogurt-berry-parfait'), 'vegan')).toBe(false);
  });

  it('halal excludes pork and alcohol', () => {
    expect(matchesDiet(byId('pork-apple-sheet-pan'), 'halal')).toBe(false);
    expect(matchesDiet(byId('mushroom-pea-risotto'), 'halal')).toBe(false);
    expect(matchesDiet(byId('chicken-shawarma-bowl'), 'halal')).toBe(true);
  });

  it('kosher excludes shellfish, pork and meat with dairy', () => {
    expect(matchesDiet(byId('garlic-shrimp-zoodles'), 'kosher')).toBe(false);
    expect(matchesDiet(byId('pork-apple-sheet-pan'), 'kosher')).toBe(false);
    expect(matchesDiet(byId('chicken-shawarma-bowl'), 'kosher')).toBe(false); // chicken + yogurt
    expect(matchesDiet(byId('beef-and-broccoli'), 'kosher')).toBe(true);
  });

  it('lists allergens', () => {
    expect(recipeAllergens(byId('peanut-noodle-bowl'))).toEqual(expect.arrayContaining(['peanut', 'soy']));
    expect(recipeAllergens(byId('hummus-veggie-wrap'))).toEqual(expect.arrayContaining(['gluten', 'sesame']));
  });
});

describe('exclusions', () => {
  it('matches plurals and substrings case-insensitively', () => {
    expect(excludedIngredientHits(byId('lemon-herb-salmon-bowl'), ['Tomatoes'])).toEqual(['cherry tomatoes']);
    expect(excludedIngredientHits(byId('mushroom-pea-risotto'), ['mushroom'])).toHaveLength(1);
    expect(excludedIngredientHits(byId('mushroom-pea-risotto'), ['  '])).toEqual([]);
  });
});

describe('profile filtering', () => {
  it('never shows recipes containing a selected allergen', () => {
    const list = filterRecipes(SAMPLE_RECIPES, prefs({ allergens: ['peanut', 'tree-nut', 'sesame'] }), EMPTY_FILTERS);
    expect(list.length).toBeGreaterThan(0);
    for (const r of list) {
      const a = recipeAllergens(r);
      expect(a).not.toContain('peanut');
      expect(a).not.toContain('tree-nut');
      expect(a).not.toContain('sesame');
    }
  });

  it('requires every selected diet', () => {
    const list = filterRecipes(SAMPLE_RECIPES, prefs({ diets: ['vegan', 'gluten-free'] }), EMPTY_FILTERS);
    expect(list.length).toBeGreaterThan(0);
    for (const r of list) {
      expect(matchesDiet(r, 'vegan')).toBe(true);
      expect(matchesDiet(r, 'gluten-free')).toBe(true);
    }
  });

  it('applies condition thresholds', () => {
    const list = filterRecipes(SAMPLE_RECIPES, prefs({ conditions: ['kidney'] }), EMPTY_FILTERS);
    expect(list.length).toBeGreaterThan(0);
    for (const r of list) {
      expect(r.nutrition!.sodiumMg).toBeLessThanOrEqual(600);
      expect(r.nutrition!.potassiumMg).toBeLessThanOrEqual(700);
      expect(r.nutrition!.phosphorusMg).toBeLessThanOrEqual(300);
    }
  });

  it('hides custom exclusions', () => {
    expect(passesProfile(byId('mushroom-pea-risotto'), prefs({ excludedIngredients: ['mushrooms'] }))).toBe(false);
  });
});

describe('search filters', () => {
  it('searches names, ingredients and cuisine', () => {
    const q = (query: string) => filterRecipes(SAMPLE_RECIPES, EMPTY_PREFERENCES, { ...EMPTY_FILTERS, query });
    expect(q('salmon').map((r) => r.id)).toContain('lemon-herb-salmon-bowl');
    expect(q('quinoa').length).toBeGreaterThanOrEqual(2);
    expect(q('mexican').map((r) => r.id)).toEqual(['black-bean-tacos']);
    expect(q('zzz')).toEqual([]);
  });

  it('filters meal type (any) and max time', () => {
    const list = filterRecipes(SAMPLE_RECIPES, EMPTY_PREFERENCES, {
      ...EMPTY_FILTERS,
      mealTypes: ['breakfast'],
      maxTotalMinutes: 15,
    });
    expect(list.length).toBeGreaterThan(0);
    for (const r of list) {
      expect(r.mealTypes).toContain('breakfast');
      expect(r.prepMinutes! + r.cookMinutes!).toBeLessThanOrEqual(15);
    }
  });
});

describe('recommendations', () => {
  it('ranks recipes meeting profile goals first', () => {
    const ranked = rankRecipes(SAMPLE_RECIPES, prefs({ goals: ['high-protein'] }), [], SAMPLE_RECIPES);
    expect(matchesGoal(ranked[0].recipe, 'high-protein')).toBe(true);
    expect(ranked[0].reasons).toContain('High Protein');
  });

  it('boosts cuisines the user liked', () => {
    const candidates = SAMPLE_RECIPES.filter((r) => r.id !== 'turkey-veggie-stir-fry');
    const ranked = rankRecipes(
      candidates,
      EMPTY_PREFERENCES,
      [{ recipeId: 'turkey-veggie-stir-fry', action: 'save', at: 1 }],
      SAMPLE_RECIPES,
    );
    expect(ranked[0].recipe.cuisine).toBe('Asian');
  });

  it('is deterministic', () => {
    const a = rankRecipes(SAMPLE_RECIPES, EMPTY_PREFERENCES, [], SAMPLE_RECIPES).map((x) => x.recipe.id);
    const b = rankRecipes([...SAMPLE_RECIPES].reverse(), EMPTY_PREFERENCES, [], SAMPLE_RECIPES).map((x) => x.recipe.id);
    expect(a).toEqual(b);
  });
});
