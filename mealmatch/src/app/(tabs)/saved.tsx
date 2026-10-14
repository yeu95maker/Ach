import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RecipeRow } from '@/components/RecipeRow';
import { Button, Chip } from '@/components/ui';
import { DIETS, GOALS } from '@/domain/catalog';
import { recipeDiets, recipeGoals } from '@/domain/classify';
import { matchesQuery } from '@/domain/filter';
import type { Recipe } from '@/domain/types';
import { useAppStore } from '@/state/AppStore';
import { colors, radius } from '@/theme';

type Category = { key: string; label: string; test: (r: Recipe) => boolean };

export default function Saved() {
  const { data, getRecipe, dispatch } = useAppStore();
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');

  const savedRecipes = useMemo(
    () => data.saved.map(getRecipe).filter((r): r is Recipe => !!r),
    [data.saved, getRecipe],
  );

  // Only offer categories that at least one saved recipe belongs to.
  const categories = useMemo<Category[]>(() => {
    const all: Category[] = [
      ...GOALS.map((g) => ({ key: g.id, label: g.label, test: (r: Recipe) => recipeGoals(r).includes(g.id) })),
      ...DIETS.filter((d) => ['vegetarian', 'vegan', 'gluten-free', 'dairy-free'].includes(d.id)).map((d) => ({
        key: d.id,
        label: d.label,
        test: (r: Recipe) => recipeDiets(r).includes(d.id),
      })),
    ];
    return [{ key: 'all', label: 'All', test: () => true }, ...all.filter((c) => savedRecipes.some(c.test))];
  }, [savedRecipes]);

  const active = categories.find((c) => c.key === category) ?? categories[0];
  const list = savedRecipes.filter((r) => active.test(r) && matchesQuery(r, query));

  return (
    <SafeAreaView style={s.wrap} edges={['top']}>
      <View style={s.header}>
        <Ionicons name="heart-outline" size={26} color={colors.coral} />
        <Text style={s.title}>Saved Recipes</Text>
      </View>

      {savedRecipes.length === 0 ? (
        <View style={s.empty}>
          <Text style={{ fontSize: 60 }}>💚</Text>
          <Text style={s.emptyTitle}>No saved recipes yet</Text>
          <Text style={s.emptyText}>Swipe right or tap ♥ on a recipe to keep it here.</Text>
          <Button label="Start discovering" onPress={() => router.navigate('/discover')} style={{ marginTop: 20, alignSelf: 'stretch' }} />
        </View>
      ) : (
        <>
          <View style={s.search}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search saved recipes"
              placeholderTextColor={colors.textMuted}
              style={s.searchInput}
              accessibilityLabel="Search saved recipes"
            />
          </View>
          <View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.cats}>
              {categories.map((c) => (
                <Chip key={c.key} label={c.label} selected={active.key === c.key} onPress={() => setCategory(c.key)} />
              ))}
            </ScrollView>
          </View>
          <FlatList
            data={list}
            keyExtractor={(r) => r.id}
            contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 24 }}
            ListEmptyComponent={<Text style={s.none}>No saved recipes match.</Text>}
            renderItem={({ item }) => (
              <RecipeRow
                recipe={item}
                saved
                onPress={() => router.push(`/recipe/${item.id}`)}
                onToggleSave={() => dispatch({ type: 'toggleSaved', recipeId: item.id })}
              />
            )}
          />
        </>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingTop: 12 },
  title: { fontSize: 26, fontWeight: '800', color: colors.text },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 18,
    marginTop: 14,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 15, color: colors.text },
  cats: { gap: 8, paddingHorizontal: 18, paddingVertical: 12 },
  none: { color: colors.textMuted, textAlign: 'center', marginTop: 30 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 21, fontWeight: '800', color: colors.text, marginTop: 10 },
  emptyText: { fontSize: 15, color: colors.textMuted, textAlign: 'center', marginTop: 6 },
});
