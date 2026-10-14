import { describe, expect, it } from 'vitest';

import { SAMPLE_RECIPES } from '@/data/sampleRecipes';
import { matchesDiet } from '@/domain/classify';
import { EMPTY_PREFERENCES } from '@/domain/filter';
import { fitReport } from '@/domain/fit';
import { rankRecipes } from '@/domain/recommend';
import { formatQuantity, scaleAmount } from '@/domain/scale';
import { DEFAULT_USER_DATA } from '@/domain/userData';
import { reducer } from '@/state/reducer';

const byId = (id: string) => SAMPLE_RECIPES.find((r) => r.id === id)!;

describe('scaleAmount', () => {
  it('scales whole numbers, decimals and unicode fractions', () => {
    expect(scaleAmount('2 tbsp', 2)).toBe('4 tbsp');
    expect(scaleAmount('½ tsp', 2)).toBe('1 tsp');
    expect(scaleAmount('1½ tbsp', 2)).toBe('3 tbsp');
    expect(scaleAmount('¾ cup', 0.5)).toBe('⅓ cup'); // 0.375 rounds to the nearest kitchen fraction
    expect(scaleAmount('200 g', 1.5)).toBe('300 g');
    expect(scaleAmount('2 fillets (≈200 g each)', 2)).toBe('4 fillets (≈200 g each)');
    expect(scaleAmount('1 clove', 2)).toBe('2 cloves');
    expect(scaleAmount('1 cup cooked', 3)).toBe('3 cups cooked');
    expect(scaleAmount('2 cloves', 0.5)).toBe('1 clove');
  });

  it('leaves amounts without a number alone', () => {
    expect(scaleAmount('to taste', 3)).toBe('to taste');
    expect(scaleAmount('handful', 2)).toBe('handful');
    expect(scaleAmount(undefined, 2)).toBeUndefined();
  });

  it('formats quantities for the kitchen', () => {
    expect(formatQuantity(2)).toBe('2');
    expect(formatQuantity(0.5)).toBe('½');
    expect(formatQuantity(1.75)).toBe('1¾');
    expect(formatQuantity(7.4)).toBe('7');
    expect(formatQuantity(333)).toBe('335');
  });
});

describe('fitReport', () => {
  it('flags conflicts with hard constraints', () => {
    const r = fitReport(byId('peanut-noodle-bowl'), { ...EMPTY_PREFERENCES, allergens: ['peanut'] });
    expect(r.status).toBe('bad');
    expect(r.items.some((i) => i.text.includes('peanuts'))).toBe(true);
  });

  it('treats missed goals as a warning, not a conflict', () => {
    const r = fitReport(byId('apple-crumble'), { ...EMPTY_PREFERENCES, goals: ['high-protein'] });
    expect(r.status).toBe('warn');
  });

  it('is a good match when everything lines up', () => {
    const r = fitReport(byId('vegan-pak-choi-rolls'), { ...EMPTY_PREFERENCES, diets: ['vegan'], goals: ['high-protein'] });
    expect(r.status).toBe('good');
  });
});

describe('new recipes', () => {
  it('classifies the pak choi rolls as vegan and the skillet as meat, gluten- and dairy-free', () => {
    expect(matchesDiet(byId('vegan-pak-choi-rolls'), 'vegan')).toBe(true);
    const skillet = byId('cabbage-roll-skillet');
    expect(matchesDiet(skillet, 'vegetarian')).toBe(false);
    expect(matchesDiet(skillet, 'gluten-free')).toBe(true);
    expect(matchesDiet(skillet, 'dairy-free')).toBe(true);
  });

  it('every recipe has tips', () => {
    for (const r of SAMPLE_RECIPES) expect(r.tips?.length, r.id).toBeGreaterThan(0);
  });
});

describe('ratings', () => {
  it('rate sets, changes and clears a rating', () => {
    let s = reducer(DEFAULT_USER_DATA, { type: 'rate', recipeId: 'a', stars: 4 });
    expect(s.ratings).toEqual({ a: 4 });
    s = reducer(s, { type: 'rate', recipeId: 'a', stars: 2 });
    expect(s.ratings).toEqual({ a: 2 });
    s = reducer(s, { type: 'rate', recipeId: 'a', stars: 2 });
    expect(s.ratings).toEqual({});
  });

  it('high ratings boost similar recipes', () => {
    const candidates = SAMPLE_RECIPES.filter((r) => r.id !== 'cabbage-roll-skillet');
    const ranked = rankRecipes(candidates, EMPTY_PREFERENCES, [], SAMPLE_RECIPES, { 'turkey-veggie-stir-fry': 5 });
    expect(ranked[0].recipe.cuisine).toBe('Asian');
  });
});
