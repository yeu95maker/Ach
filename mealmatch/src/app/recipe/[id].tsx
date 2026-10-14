import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { conditionTags, displayTags, RecipeHero } from '@/components/RecipeVisual';
import { Button, Meta, Notice, SectionTitle, Tag } from '@/components/ui';
import { ALLERGENS, ALLERGY_DISCLAIMER, DIETS, labelOf, MEDICAL_DISCLAIMER } from '@/domain/catalog';
import {
  excludedIngredientHits,
  needsCertifiedMeat,
  recipeAllergens,
  recipeDiets,
  totalMinutes,
} from '@/domain/classify';
import { useAppStore } from '@/state/AppStore';
import { colors, radius } from '@/theme';

export default function RecipeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getRecipe, isSaved, dispatch, data } = useAppStore();
  const insets = useSafeAreaInsets();
  const recipe = getRecipe(String(id));
  const [done, setDone] = useState<Set<number>>(new Set());

  if (!recipe) {
    return (
      <SafeAreaView style={[s.wrap, { alignItems: 'center', justifyContent: 'center', padding: 24 }]}>
        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>Recipe not found</Text>
        <Button label="Back to Discover" onPress={() => router.replace('/discover')} style={{ marginTop: 16 }} />
      </SafeAreaView>
    );
  }

  const saved = isSaved(recipe.id);
  const toggleSave = () => dispatch({ type: 'toggleSaved', recipeId: recipe.id });
  const diets = recipeDiets(recipe);
  const allergens = recipeAllergens(recipe);
  const conditions = conditionTags(recipe);
  const exclusionHits = excludedIngredientHits(recipe, data.preferences.excludedIngredients);
  const allergyHits = allergens.filter((a) => data.preferences.allergens.includes(a));
  const n = recipe.nutrition;

  const back = () => (router.canGoBack() ? router.back() : router.replace('/discover'));
  const share = () =>
    Share.share({
      message: `${recipe.name} – ${recipe.subtitle}\n\nIngredients:\n${recipe.ingredients
        .map((i) => `• ${i.amount ? `${i.amount} ` : ''}${i.name}`)
        .join('\n')}\n\nFound on MealMatch`,
    }).catch(() => {});

  return (
    <View style={s.wrap}>
      <ScrollView contentContainerStyle={{ paddingBottom: 110 + insets.bottom }}>
        <RecipeHero recipe={recipe} emojiSize={120} style={[s.hero, { paddingTop: insets.top }]} />
        <View style={[s.topBar, { top: insets.top + 8 }]}>
          <CircleButton icon="chevron-back" label="Back" onPress={back} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <CircleButton icon="share-outline" label="Share" onPress={share} />
            <CircleButton
              icon={saved ? 'heart' : 'heart-outline'}
              label={saved ? 'Remove from saved' : 'Save'}
              color={colors.coral}
              onPress={toggleSave}
            />
          </View>
        </View>

        <View style={s.body}>
          <View style={s.tags}>
            {displayTags(recipe, 3).map((t) => (
              <Tag key={t} label={t} />
            ))}
          </View>
          <Text style={s.title}>{recipe.name}</Text>
          <Text style={s.subtitle}>{recipe.subtitle}</Text>
          <View style={s.metaRow}>
            <Meta icon="time-outline" label={`${totalMinutes(recipe)} min`} />
            <Meta icon="speedometer-outline" label={recipe.difficulty} />
            <Meta icon="people-outline" label={`${recipe.servings} serving${recipe.servings > 1 ? 's' : ''}`} />
            <Meta icon="globe-outline" label={recipe.cuisine} />
          </View>
          <Text style={s.desc}>{recipe.description}</Text>

          {(allergyHits.length > 0 || exclusionHits.length > 0) && (
            <View style={{ marginTop: 14 }}>
              <Notice title="Heads up:">
                This recipe contains{' '}
                {[...allergyHits.map((a) => labelOf(ALLERGENS, a).toLowerCase()), ...exclusionHits].join(', ')}, which
                you've asked to avoid.
              </Notice>
            </View>
          )}

          <SectionTitle right={<Text style={s.muted}>{recipe.servings} servings</Text>}>Ingredients</SectionTitle>
          {recipe.ingredients.map((ing, idx) => (
            <View key={idx} style={s.ingredient}>
              <View style={s.bullet} />
              <Text style={s.ingText}>
                {ing.amount ? <Text style={{ fontWeight: '700' }}>{ing.amount} </Text> : null}
                {ing.name}
                {ing.note ? <Text style={s.muted}> ({ing.note})</Text> : null}
              </Text>
            </View>
          ))}

          <SectionTitle right={<Text style={s.muted}>Tap to tick off</Text>}>Instructions</SectionTitle>
          {recipe.steps.map((step, idx) => {
            const on = done.has(idx);
            return (
              <Pressable
                key={idx}
                style={s.step}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                onPress={() =>
                  setDone((prev) => {
                    const next = new Set(prev);
                    if (next.has(idx)) next.delete(idx);
                    else next.add(idx);
                    return next;
                  })
                }
              >
                <View style={[s.stepNum, on && { backgroundColor: colors.green }]}>
                  {on ? <Ionicons name="checkmark" size={16} color="#fff" /> : <Text style={s.stepNumText}>{idx + 1}</Text>}
                </View>
                <Text style={[s.stepText, on && { color: colors.textMuted, textDecorationLine: 'line-through' }]}>{step}</Text>
              </Pressable>
            );
          })}

          <SectionTitle right={<Text style={s.muted}>per serving, approx.</Text>}>Nutrition</SectionTitle>
          <View style={s.nutriGrid}>
            <Nutri label="Calories" value={`${n.calories}`} unit="kcal" />
            <Nutri label="Protein" value={`${n.proteinG}`} unit="g" />
            <Nutri label="Carbs" value={`${n.carbsG}`} unit="g" />
            <Nutri label="Fat" value={`${n.fatG}`} unit="g" />
            <Nutri label="Sat. fat" value={`${n.saturatedFatG}`} unit="g" />
            <Nutri label="Fibre" value={`${n.fiberG}`} unit="g" />
            <Nutri label="Sugar" value={`${n.sugarG}`} unit="g" />
            <Nutri label="Sodium" value={`${n.sodiumMg}`} unit="mg" />
            <Nutri label="Potassium" value={`${n.potassiumMg}`} unit="mg" />
          </View>

          <SectionTitle>Diet & Allergens</SectionTitle>
          <View style={s.tags}>
            {diets.map((d) => (
              <Tag key={d} label={labelOf(DIETS, d)} />
            ))}
          </View>
          {needsCertifiedMeat(recipe) && (diets.includes('halal') || diets.includes('kosher')) && (
            <Text style={[s.muted, { marginTop: 8 }]}>Halal / kosher: use certified meat and products.</Text>
          )}
          <Text style={[s.label, { marginTop: 12 }]}>Contains</Text>
          <View style={s.tags}>
            {allergens.length ? (
              allergens.map((a) => <Tag key={a} label={labelOf(ALLERGENS, a)} tone="coral" />)
            ) : (
              <Text style={s.muted}>None of the 9 common allergens we track</Text>
            )}
          </View>
          <Text style={[s.muted, { marginTop: 10 }]}>{ALLERGY_DISCLAIMER}</Text>

          {conditions.length > 0 && (
            <>
              <SectionTitle>Condition-aware</SectionTitle>
              <View style={s.tags}>
                {conditions.map((c) => (
                  <Tag key={c} label={c} />
                ))}
              </View>
              <View style={{ marginTop: 12 }}>
                <Notice title="Please note:">{MEDICAL_DISCLAIMER}</Notice>
              </View>
            </>
          )}
        </View>
      </ScrollView>

      <View style={[s.footer, { paddingBottom: 12 + insets.bottom }]}>
        <Button
          label={saved ? 'Saved – tap to remove' : 'Save Recipe'}
          icon={saved ? 'heart' : 'heart-outline'}
          variant={saved ? 'outline' : 'green'}
          onPress={toggleSave}
        />
      </View>
    </View>
  );
}

function CircleButton({
  icon,
  label,
  onPress,
  color = colors.text,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  color?: string;
}) {
  return (
    <Pressable onPress={onPress} style={s.circle} accessibilityRole="button" accessibilityLabel={label} hitSlop={6}>
      <Ionicons name={icon} size={22} color={color} />
    </Pressable>
  );
}

function Nutri({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View style={s.nutri}>
      <Text style={s.nutriValue}>
        {value}
        <Text style={s.nutriUnit}> {unit}</Text>
      </Text>
      <Text style={s.nutriLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  hero: { height: 300 },
  topBar: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' },
  circle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    marginTop: -24,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: colors.bg,
    padding: 20,
  },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  title: { fontSize: 27, fontWeight: '800', color: colors.text, marginTop: 10 },
  subtitle: { fontSize: 16, color: colors.textMuted, marginTop: 2 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 12 },
  desc: { fontSize: 15, lineHeight: 22, color: colors.text, marginTop: 14 },
  muted: { fontSize: 12.5, color: colors.textMuted },
  label: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 6 },
  ingredient: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 5 },
  bullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.green, marginTop: 8 },
  ingText: { flex: 1, fontSize: 15, lineHeight: 21, color: colors.text },
  step: { flexDirection: 'row', gap: 12, paddingVertical: 8 },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: { fontWeight: '800', color: colors.greenText },
  stepText: { flex: 1, fontSize: 15, lineHeight: 22, color: colors.text },
  nutriGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  nutri: {
    width: '31.5%',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    alignItems: 'center',
  },
  nutriValue: { fontSize: 17, fontWeight: '800', color: colors.text },
  nutriUnit: { fontSize: 12, fontWeight: '500', color: colors.textMuted },
  nutriLabel: { fontSize: 11.5, color: colors.textMuted, marginTop: 2 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
