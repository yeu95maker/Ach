import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { totalMinutes } from '@/domain/classify';
import type { Recipe } from '@/domain/types';
import { colors, radius } from '@/theme';

import { displayTags, RecipeHero } from './RecipeVisual';
import { Tag } from './ui';

export function RecipeRow({
  recipe,
  saved,
  onPress,
  onToggleSave,
}: {
  recipe: Recipe;
  saved: boolean;
  onPress: () => void;
  onToggleSave: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={s.row} accessibilityRole="button" accessibilityLabel={recipe.name}>
      <RecipeHero recipe={recipe} emojiSize={40} style={s.thumb} />
      <View style={s.body}>
        <Text style={s.name} numberOfLines={1}>
          {recipe.name}
        </Text>
        <View style={s.tags}>
          {displayTags(recipe, 2).map((t) => (
            <Tag key={t} label={t} />
          ))}
        </View>
        <Text style={s.meta}>
          {totalMinutes(recipe)} min · {recipe.difficulty} · {recipe.nutrition.calories} kcal
        </Text>
      </View>
      <Pressable
        onPress={onToggleSave}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={saved ? `Remove ${recipe.name} from saved` : `Save ${recipe.name}`}
      >
        <Ionicons name={saved ? 'heart' : 'heart-outline'} size={24} color={colors.coral} />
      </Pressable>
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  thumb: { width: 84, height: 84, borderRadius: radius.md },
  body: { flex: 1, gap: 5 },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  meta: { fontSize: 12.5, color: colors.textMuted },
});
