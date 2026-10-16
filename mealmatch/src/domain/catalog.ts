import type { AllergenId, ConditionId, DietId, GoalId, MealType } from './types';

/** Display metadata for every selectable option. Icons are Ionicons names. */
export interface OptionMeta<Id extends string> {
  id: Id;
  label: string;
  icon: string;
  hint?: string;
}

export const GOALS: OptionMeta<GoalId>[] = [
  { id: 'balanced', label: 'Healthy & Balanced', icon: 'leaf-outline' },
  { id: 'weight-loss', label: 'Weight Loss (healthy)', icon: 'scale-outline', hint: '≤ 500 kcal, protein & fibre rich' },
  { id: 'high-protein', label: 'High Protein', icon: 'barbell-outline', hint: '≥ 25 g protein' },
  { id: 'quick', label: 'Quick & Easy', icon: 'time-outline', hint: '20 min or less' },
  { id: 'low-carb', label: 'Low Carb', icon: 'nutrition-outline', hint: '≤ 25 g carbs, under 30% of calories' },
  { id: 'high-fiber', label: 'High Fibre', icon: 'flower-outline', hint: '≥ 8 g fibre' },
];

export const DIETS: OptionMeta<DietId>[] = [
  { id: 'vegetarian', label: 'Vegetarian', icon: 'leaf-outline' },
  { id: 'vegan', label: 'Vegan', icon: 'flower-outline' },
  { id: 'gluten-free', label: 'Gluten-Free', icon: 'ban-outline' },
  { id: 'dairy-free', label: 'Dairy-Free', icon: 'water-outline' },
  { id: 'nut-free', label: 'Nut-Free', icon: 'close-circle-outline' },
  { id: 'egg-free', label: 'Egg-Free', icon: 'egg-outline' },
  { id: 'halal', label: 'Halal', icon: 'moon-outline' },
  { id: 'kosher', label: 'Kosher', icon: 'star-outline' },
];

export const CONDITIONS: OptionMeta<ConditionId>[] = [
  { id: 'heart', label: 'Heart Friendly', icon: 'heart-outline' },
  { id: 'kidney', label: 'Kidney Friendly', icon: 'medical-outline' },
  { id: 'liver', label: 'Liver Friendly', icon: 'fitness-outline' },
  { id: 'diabetes', label: 'Diabetes Friendly', icon: 'pulse-outline' },
  { id: 'digestive', label: 'Digestive Health', icon: 'body-outline' },
];

export const ALLERGENS: OptionMeta<AllergenId>[] = [
  { id: 'peanut', label: 'Peanuts', icon: 'alert-circle-outline' },
  { id: 'tree-nut', label: 'Tree nuts', icon: 'alert-circle-outline' },
  { id: 'dairy', label: 'Milk / dairy', icon: 'alert-circle-outline' },
  { id: 'egg', label: 'Eggs', icon: 'alert-circle-outline' },
  { id: 'gluten', label: 'Gluten / wheat', icon: 'alert-circle-outline' },
  { id: 'soy', label: 'Soy', icon: 'alert-circle-outline' },
  { id: 'sesame', label: 'Sesame', icon: 'alert-circle-outline' },
  { id: 'fish', label: 'Fish', icon: 'alert-circle-outline' },
  { id: 'shellfish', label: 'Shellfish', icon: 'alert-circle-outline' },
];

export const MEAL_TYPES: OptionMeta<MealType>[] = [
  { id: 'breakfast', label: 'Breakfast', icon: 'sunny-outline' },
  { id: 'lunch', label: 'Lunch', icon: 'partly-sunny-outline' },
  { id: 'dinner', label: 'Dinner', icon: 'moon-outline' },
  { id: 'snack', label: 'Snacks', icon: 'cafe-outline' },
  { id: 'dessert', label: 'Dessert', icon: 'ice-cream-outline' },
];

export function labelOf<Id extends string>(list: OptionMeta<Id>[], id: Id): string {
  return list.find((o) => o.id === id)?.label ?? id;
}

export const MEDICAL_DISCLAIMER =
  'These recipes are for general information only and are not a substitute for professional medical advice. ' +
  'Condition-friendly labels are based on simple nutrition thresholds using approximate values. ' +
  'Always consult your doctor or a registered dietitian for personalised guidance, especially if you have a ' +
  'medical condition, take medication or follow a prescribed diet.';

export const ALLERGY_DISCLAIMER =
  'Allergen and diet labels are generated from the ingredient list. Always check product labels, ' +
  'as packaged ingredients may contain or be processed alongside allergens.';
