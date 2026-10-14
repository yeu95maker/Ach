import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RecipeRow } from '@/components/RecipeRow';
import { Button, Chip, Notice, SectionTitle } from '@/components/ui';
import { CONDITIONS, DIETS, GOALS, MEAL_TYPES, MEDICAL_DISCLAIMER } from '@/domain/catalog';
import { activeFilterCount, filterRecipes } from '@/domain/filter';
import type { RecipeFilters } from '@/domain/types';
import { useAppStore } from '@/state/AppStore';
import { colors, radius } from '@/theme';

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export default function Filters() {
  const { data, dispatch, recipes, deck, isSaved } = useAppStore();
  const f = data.filters;
  const set = (patch: Partial<RecipeFilters>) => dispatch({ type: 'setFilters', filters: { ...f, ...patch } });
  const results = filterRecipes(recipes, data.preferences, f);
  const count = activeFilterCount(f);

  return (
    <SafeAreaView style={s.wrap} edges={['top']}>
      <View style={s.header}>
        <Text style={s.title}>Search & Filters</Text>
        <Pressable onPress={() => dispatch({ type: 'resetFilters' })} disabled={!count} hitSlop={8}>
          <Text style={[s.reset, !count && { opacity: 0.4 }]}>Reset</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <View style={s.search}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={f.query}
            onChangeText={(query) => set({ query })}
            placeholder="Search recipes, ingredients, cuisines"
            placeholderTextColor={colors.textMuted}
            style={s.searchInput}
            returnKeyType="search"
            accessibilityLabel="Search recipes"
          />
          {f.query ? (
            <Pressable onPress={() => set({ query: '' })} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        <SectionTitle>Meal Type</SectionTitle>
        <View style={s.chips}>
          {MEAL_TYPES.map((m) => (
            <Chip key={m.id} label={m.label} icon={m.icon} selected={f.mealTypes.includes(m.id)} onPress={() => set({ mealTypes: toggle(f.mealTypes, m.id) })} />
          ))}
        </View>

        <SectionTitle>Dietary Needs</SectionTitle>
        <View style={s.chips}>
          {DIETS.map((d) => (
            <Chip key={d.id} label={d.label} icon={d.icon} selected={f.diets.includes(d.id)} onPress={() => set({ diets: toggle(f.diets, d.id) })} />
          ))}
        </View>

        <SectionTitle>Health & Condition</SectionTitle>
        <View style={s.chips}>
          {CONDITIONS.map((c) => (
            <Chip key={c.id} label={c.label} icon={c.icon} selected={f.conditions.includes(c.id)} onPress={() => set({ conditions: toggle(f.conditions, c.id) })} />
          ))}
        </View>
        {f.conditions.length > 0 && (
          <View style={{ marginTop: 10 }}>
            <Notice title="Please note:">{MEDICAL_DISCLAIMER}</Notice>
          </View>
        )}

        <SectionTitle>Goals & Options</SectionTitle>
        <View style={s.chips}>
          <Chip
            label="Under 30 min"
            icon="time-outline"
            selected={f.maxTotalMinutes === 30}
            onPress={() => set({ maxTotalMinutes: f.maxTotalMinutes === 30 ? undefined : 30 })}
          />
          {GOALS.map((g) => (
            <Chip key={g.id} label={g.label} icon={g.icon} selected={f.goals.includes(g.id)} onPress={() => set({ goals: toggle(f.goals, g.id) })} />
          ))}
        </View>

        {(data.preferences.diets.length > 0 || data.preferences.allergens.length > 0 || data.preferences.conditions.length > 0 || data.preferences.excludedIngredients.length > 0) && (
          <Pressable onPress={() => router.push('/preferences')} style={s.profileNote}>
            <Ionicons name="shield-checkmark-outline" size={16} color={colors.greenText} />
            <Text style={s.profileNoteText}>Your profile's dietary needs, allergies and exclusions are always applied. Edit</Text>
          </Pressable>
        )}

        <SectionTitle>
          {results.length} matching recipe{results.length === 1 ? '' : 's'}
        </SectionTitle>
        {results.length === 0 && <Text style={s.none}>Nothing matches – try removing a filter.</Text>}
        {results.map((r) => (
          <RecipeRow
            key={r.id}
            recipe={r}
            saved={isSaved(r.id)}
            onPress={() => router.push(`/recipe/${r.id}`)}
            onToggleSave={() => dispatch({ type: 'toggleSaved', recipeId: r.id })}
          />
        ))}
      </ScrollView>
      <View style={s.footer}>
        <Button
          label={deck.length ? `Swipe ${deck.length} new recipe${deck.length === 1 ? '' : 's'}` : 'No new recipes to swipe'}
          variant="green"
          icon="flame"
          disabled={!deck.length}
          onPress={() => router.navigate('/discover')}
        />
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 12 },
  title: { fontSize: 26, fontWeight: '800', color: colors.text },
  reset: { color: colors.green, fontWeight: '700', fontSize: 15 },
  content: { paddingHorizontal: 18, paddingBottom: 24 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, paddingVertical: 11, fontSize: 15, color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  profileNote: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 18, backgroundColor: colors.infoBg, padding: 12, borderRadius: radius.md },
  profileNoteText: { flex: 1, fontSize: 12.5, color: colors.greenText },
  none: { color: colors.textMuted },
  footer: { padding: 14, paddingHorizontal: 18, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg },
});
