import React from 'react';
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { RECIPE_PHOTOS } from '@/data/recipePhotos';
import { CONDITIONS, DIETS, GOALS, labelOf } from '@/domain/catalog';
import { recipeConditions, recipeDiets, recipeGoals } from '@/domain/classify';
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
