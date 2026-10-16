import type { Ingredient, IngredientFlag, Nutrition, Recipe } from '@/domain/types';

/** Helpers for writing bundled recipes compactly. */
export const i = (amount: string, name: string, flags: IngredientFlag[] = [], note?: string): Ingredient => ({
  amount,
  name,
  flags,
  note,
});

export const n = (
  calories: number,
  proteinG: number,
  carbsG: number,
  fatG: number,
  saturatedFatG: number,
  fiberG: number,
  sugarG: number,
  sodiumMg: number,
  potassiumMg: number,
  phosphorusMg: number,
): Nutrition => ({ calories, proteinG, carbsG, fatG, saturatedFatG, fiberG, sugarG, sodiumMg, potassiumMg, phosphorusMg });

export type Draft = Omit<Recipe, 'source'>;
