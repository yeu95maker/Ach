import type { Draft } from '../recipeBuilder';
import { ASIAN_RECIPES } from './asian';
import { WEIGHT_LOSS_BOWLS_2 } from './bowls2';
import { BREAKFASTS } from './breakfast';
import { GERMAN_RECIPES_2 } from './german2';
import { GLOBAL_RECIPES } from './global';
import { MEDITERRANEAN_RECIPES } from './mediterranean';
import { QUICK_DINNERS } from './quick';
import { SOUPS_AND_STEWS } from './soups';
import { SOUPS_AND_STEWS_2 } from './soups2';
import { SNACKS_AND_DESSERTS } from './sweets';
import { VEGGIE_MAINS } from './veggie';

/** Additional hand-written MealMatch recipe collections. */
export const EXTRA_RECIPES: Draft[] = [
  ...GERMAN_RECIPES_2,
  ...WEIGHT_LOSS_BOWLS_2,
  ...QUICK_DINNERS,
  ...BREAKFASTS,
  ...VEGGIE_MAINS,
  ...ASIAN_RECIPES,
  ...MEDITERRANEAN_RECIPES,
  ...GLOBAL_RECIPES,
  ...SOUPS_AND_STEWS,
  ...SOUPS_AND_STEWS_2,
  ...SNACKS_AND_DESSERTS,
];
