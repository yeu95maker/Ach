import React from 'react';
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { RECIPE_PHOTOS } from '@/data/recipePhotos';
import { CONDITIONS, DIETS, GOALS, labelOf } from '@/domain/catalog';
import { recipeConditions, recipeDiets, recipeFlags, recipeGoals, totalMinutes } from '@/domain/classify';
import type { Recipe } from '@/domain/types';

/** Photo when the recipe has one (remote `imageUrl` or a bundled photo), otherwise a large emoji on the recipe's tint. */
export function RecipeHero({
  recipe,
  emojiSize = 96,
  style,
}: {
  recipe: Recipe;
  emojiSize?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const source = recipe.imageUrl ? { uri: recipe.imageUrl } : RECIPE_PHOTOS[recipe.id];
  if (source) {
    return (
      <View style={[s.hero, { backgroundColor: recipe.tint }, style]}>
        <Image source={source} style={s.photo} resizeMode="cover" accessibilityIgnoresInvertColors />
      </View>
    );
  }
  return (
    <View style={[s.hero, { backgroundColor: recipe.tint }, style]}>
      <Text style={{ fontSize: emojiSize }} accessibilityElementsHidden importantForAccessibility="no">
        {recipe.emoji}
      </Text>
    </View>
  );
}

/** Most useful tags for a card or list row, in display order. */
export function displayTags(recipe: Recipe, max = 4): string[] {
  const goals = recipeGoals(recipe).map((g) => labelOf(GOALS, g));
  const diets = recipeDiets(recipe)
    .filter((d) => !['halal', 'kosher', 'egg-free', 'nut-free'].includes(d))
    .map((d) => labelOf(DIETS, d));
  // Vegan implies vegetarian – don't show both.
  const dietsDeduped = diets.includes('Vegan') ? diets.filter((d) => d !== 'Vegetarian') : diets;
  return [...goals.slice(0, 2), ...dietsDeduped].slice(0, max);
}

export function conditionTags(recipe: Recipe): string[] {
  return recipeConditions(recipe).map((c) => labelOf(CONDITIONS, c));
}

const s = StyleSheet.create({
  hero: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  photo: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
});

export interface RecipeChip {
  label: string;
  icon: string;
  color: string;
}

const MEAL_CHIP: Record<string, RecipeChip> = {
  breakfast: { label: 'Breakfast', icon: 'sunny', color: '#E9A23B' },
  lunch: { label: 'Lunch', icon: 'partly-sunny', color: '#E9A23B' },
  dinner: { label: 'Dinner', icon: 'moon', color: '#6C63C7' },
  snack: { label: 'Snack', icon: 'cafe', color: '#B07A4A' },
  dessert: { label: 'Dessert', icon: 'ice-cream', color: '#D9668A' },
};

/** Icon chips summarising a recipe: when to eat it, diet, goals, budget and season. */
export function recipeChips(recipe: Recipe): RecipeChip[] {
  const chips: RecipeChip[] = recipe.mealTypes.map((m) => MEAL_CHIP[m]);
  if ((recipe.mealTypes.includes('lunch') || recipe.mealTypes.includes('dinner')) && (recipe.cookMinutes ?? 0) > 0) {
    chips.push({ label: 'Warm main meal', icon: 'restaurant', color: '#E0603A' });
  }
  const diets = recipeDiets(recipe);
  const dietChip: Record<string, RecipeChip> = {
    vegan: { label: 'Vegan', icon: 'leaf', color: '#2E9E5B' },
    vegetarian: { label: 'Vegetarian', icon: 'leaf-outline', color: '#2E9E5B' },
    'gluten-free': { label: 'Gluten-free', icon: 'ban', color: '#C4862F' },
    'dairy-free': { label: 'Dairy-free', icon: 'water', color: '#3B8FD6' },
    'nut-free': { label: 'Nut-free', icon: 'close-circle', color: '#B9673C' },
    'egg-free': { label: 'Egg-free', icon: 'egg', color: '#D2A93A' },
  };
  for (const d of diets) {
    if (d === 'vegetarian' && diets.includes('vegan')) continue;
    if (dietChip[d]) chips.push(dietChip[d]);
  }
  const flags = recipeFlags(recipe);
  if (!flags.has('pork') && (flags.has('meat') || flags.has('poultry'))) chips.push({ label: 'Pork-free', icon: 'remove-circle', color: '#D9668A' });
  if (!flags.has('soy')) chips.push({ label: 'Soy-free', icon: 'remove-circle-outline', color: '#8A9A3B' });
  const goals = recipeGoals(recipe);
  if (goals.includes('high-protein')) chips.push({ label: 'High protein', icon: 'barbell', color: '#D9534F' });
  if (goals.includes('high-fiber')) chips.push({ label: 'High fibre', icon: 'flower', color: '#7A9A2E' });
  if (goals.includes('low-carb')) chips.push({ label: 'Low carb', icon: 'nutrition', color: '#4A9A8A' });
  if ((totalMinutes(recipe) ?? Infinity) <= 20) chips.push({ label: 'Quick', icon: 'flash', color: '#E9A23B' });
  if (recipe.budgetFriendly) chips.push({ label: 'Budget-friendly', icon: 'wallet', color: '#22885F' });
  if (recipe.weather?.includes('cold')) chips.push({ label: 'Cold days', icon: 'snow', color: '#4A90C9' });
  if (recipe.weather?.includes('warm')) chips.push({ label: 'Warm days', icon: 'thermometer', color: '#E0603A' });
  return chips;
}

/** "25 min · Easy · 430 kcal", skipping whatever the source doesn't provide. */
export function recipeMetaLine(recipe: Recipe): string {
  const t = totalMinutes(recipe);
  return [t != null ? `${t} min` : null, recipe.difficulty, recipe.nutrition ? `${recipe.nutrition.calories} kcal` : null]
    .filter(Boolean)
    .join(' · ');
}
