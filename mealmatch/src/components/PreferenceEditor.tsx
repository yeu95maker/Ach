import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ALLERGENS, ALLERGY_DISCLAIMER, CONDITIONS, DIETS, GOALS, MEDICAL_DISCLAIMER } from '@/domain/catalog';
import { CONDITION_CRITERIA } from '@/domain/classify';
import type { UserPreferences } from '@/domain/types';
import { colors, radius } from '@/theme';

import { Chip, Notice, OptionTile, SectionTitle } from './ui';

export type PreferenceSection = 'goals' | 'diets' | 'allergies' | 'conditions';

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

/**
 * Shared editor for onboarding and the Profile → preferences screens.
 * `sections` lets the profile open a single section (e.g. only allergies).
 */
export function PreferenceEditor({
  value,
  onChange,
  sections = ['goals', 'diets', 'allergies', 'conditions'],
}: {
  value: UserPreferences;
  onChange: (next: UserPreferences) => void;
  sections?: PreferenceSection[];
}) {
  const [draft, setDraft] = useState('');
  const set = (patch: Partial<UserPreferences>) => onChange({ ...value, ...patch });

  const addExclusion = () => {
    const items = draft
      .split(',')
      .map((x) => x.trim().toLowerCase())
      .filter((x) => x && !value.excludedIngredients.includes(x));
    if (items.length) set({ excludedIngredients: [...value.excludedIngredients, ...items] });
    setDraft('');
  };

  return (
    <View>
      {sections.includes('goals') && (
        <>
          <SectionTitle>Meal Goals</SectionTitle>
          <Text style={s.help}>Goals shape your recommendations.</Text>
          <View style={s.grid}>
            {GOALS.map((g) => (
              <OptionTile
                key={g.id}
                label={g.label}
                icon={g.icon}
                selected={value.goals.includes(g.id)}
                onPress={() => set({ goals: toggle(value.goals, g.id) })}
              />
            ))}
          </View>
        </>
      )}

      {sections.includes('diets') && (
        <>
          <SectionTitle>Dietary Needs</SectionTitle>
          <Text style={s.help}>Only recipes that meet every selected need will be shown.</Text>
          <View style={s.grid}>
            {DIETS.map((d) => (
              <OptionTile
                key={d.id}
                label={d.label}
                icon={d.icon}
                selected={value.diets.includes(d.id)}
                onPress={() => set({ diets: toggle(value.diets, d.id) })}
              />
            ))}
          </View>
          {(value.diets.includes('halal') || value.diets.includes('kosher')) && (
            <Notice tone="info">
              Halal / kosher matching excludes non-permitted ingredients (e.g. pork, alcohol, shellfish, meat with
              dairy). Please use certified meat and products.
            </Notice>
          )}
        </>
      )}

      {sections.includes('allergies') && (
        <>
          <SectionTitle>Allergies & Exclusions</SectionTitle>
          <Text style={s.help}>Recipes containing these are always hidden.</Text>
          <View style={s.chips}>
            {ALLERGENS.map((a) => (
              <Chip
                key={a.id}
                label={a.label}
                selected={value.allergens.includes(a.id)}
                onPress={() => set({ allergens: toggle(value.allergens, a.id) })}
              />
            ))}
          </View>
          <Text style={[s.help, { marginTop: 16 }]}>Other ingredients to avoid</Text>
          <View style={s.inputRow}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={addExclusion}
              placeholder="e.g. mushroom, coriander"
              placeholderTextColor={colors.textMuted}
              style={s.input}
              returnKeyType="done"
              accessibilityLabel="Ingredient to exclude"
            />
            <Pressable onPress={addExclusion} style={s.addBtn} accessibilityRole="button" accessibilityLabel="Add exclusion">
              <Ionicons name="add" size={22} color="#fff" />
            </Pressable>
          </View>
          {value.excludedIngredients.length > 0 && (
            <View style={[s.chips, { marginTop: 10 }]}>
              {value.excludedIngredients.map((x) => (
                <Pressable
                  key={x}
                  onPress={() => set({ excludedIngredients: value.excludedIngredients.filter((y) => y !== x) })}
                  style={s.exclusion}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${x}`}
                >
                  <Text style={s.exclusionText}>{x}</Text>
                  <Ionicons name="close" size={14} color={colors.warnText} />
                </Pressable>
              ))}
            </View>
          )}
          <View style={{ marginTop: 12 }}>
            <Notice tone="info">{ALLERGY_DISCLAIMER}</Notice>
          </View>
        </>
      )}

      {sections.includes('conditions') && (
        <>
          <SectionTitle>Health & Condition (optional)</SectionTitle>
          <Text style={s.help}>Show only recipes within general nutrition limits for these conditions.</Text>
          <View style={{ gap: 8 }}>
            {CONDITIONS.map((c) => {
              const on = value.conditions.includes(c.id);
              return (
                <Pressable
                  key={c.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  onPress={() => set({ conditions: toggle(value.conditions, c.id) })}
                  style={[s.condition, on && s.conditionOn]}
                >
                  <Ionicons name={c.icon as never} size={20} color={on ? colors.green : colors.greenText} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.conditionLabel}>{c.label}</Text>
                    <Text style={s.conditionHint}>{CONDITION_CRITERIA[c.id].summary}</Text>
                  </View>
                  <Ionicons
                    name={on ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={on ? colors.green : colors.border}
                  />
                </Pressable>
              );
            })}
          </View>
          <View style={{ marginTop: 12 }}>
            <Notice title="Please note:">{MEDICAL_DISCLAIMER}</Notice>
          </View>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  help: { fontSize: 13, color: colors.textMuted, marginTop: -4, marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-start' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  inputRow: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: colors.text,
  },
  addBtn: { backgroundColor: colors.green, borderRadius: radius.md, width: 46, alignItems: 'center', justifyContent: 'center' },
  exclusion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.warnBg,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  exclusionText: { color: colors.warnText, fontWeight: '600', fontSize: 13 },
  condition: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  conditionOn: { borderColor: colors.green, backgroundColor: colors.greenSoft },
  conditionLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  conditionHint: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
});
