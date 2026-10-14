import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { conditionTags, RecipeHero, recipeChips } from '@/components/RecipeVisual';
import { Button, Notice, Tag } from '@/components/ui';
import { ALLERGENS, ALLERGY_DISCLAIMER, DIETS, labelOf, MEDICAL_DISCLAIMER } from '@/domain/catalog';
import { needsCertifiedMeat, recipeAllergens, recipeDiets, totalMinutes } from '@/domain/classify';
import { fitReport, type FitStatus } from '@/domain/fit';
import { scaleAmount } from '@/domain/scale';
import { useAppStore } from '@/state/AppStore';
import { colors, radius } from '@/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const FIT_COLORS: Record<FitStatus, { fg: string; bg: string; icon: IconName }> = {
  good: { fg: colors.greenText, bg: colors.greenSoft, icon: 'checkmark-circle' },
  warn: { fg: '#8A5A12', bg: '#FCEFD6', icon: 'alert-circle' },
  bad: { fg: colors.warnText, bg: colors.warnBg, icon: 'close-circle' },
};

export default function RecipeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getRecipe, isSaved, dispatch, data } = useAppStore();
  const insets = useSafeAreaInsets();
  const recipe = getRecipe(String(id));
  const [done, setDone] = useState<Set<number>>(new Set());
  const [servings, setServings] = useState(recipe?.servings ?? 2);
  const [showFit, setShowFit] = useState(false);

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
  // Scaling only makes sense when the source says how many servings the amounts are for.
  const factor = recipe.servings ? servings / recipe.servings : 1;
  const diets = recipeDiets(recipe);
  const allergens = recipeAllergens(recipe);
  const conditions = conditionTags(recipe);
  const fit = fitReport(recipe, data.preferences);
  const fitStyle = FIT_COLORS[fit.status];
  const rating = data.ratings[recipe.id] ?? 0;
  const n = recipe.nutrition;
  const saltG = n ? (n.sodiumMg * 2.5) / 1000 : 0;
  const total = totalMinutes(recipe);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/discover'));
  const share = () =>
    Share.share({
      message: `${recipe.name} – ${recipe.subtitle}\n\nIngredients (${servings} servings):\n${recipe.ingredients
        .map((i) => `• ${i.amount ? `${scaleAmount(i.amount, factor)} ` : ''}${i.name}`)
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
          {/* How does this fit me? */}
          <Pressable
            onPress={() => setShowFit((v) => !v)}
            style={[s.fitPill, { backgroundColor: fitStyle.bg }]}
            accessibilityRole="button"
            accessibilityState={{ expanded: showFit }}
          >
            <Ionicons name="person-circle-outline" size={20} color={fitStyle.fg} />
            <Text style={[s.fitPillText, { color: fitStyle.fg }]}>How does this fit me?</Text>
            <Ionicons name={fitStyle.icon} size={18} color={fitStyle.fg} />
            <Ionicons name={showFit ? 'chevron-up' : 'chevron-down'} size={16} color={fitStyle.fg} />
          </Pressable>
          {showFit && (
            <View style={[s.fitPanel, { borderColor: fitStyle.bg }]}>
              <Text style={[s.fitHeadline, { color: fitStyle.fg }]}>{fit.headline}</Text>
              {fit.items.map((item, idx) => (
                <View key={idx} style={s.fitRow}>
                  <Ionicons name={FIT_COLORS[item.status].icon} size={16} color={FIT_COLORS[item.status].fg} />
                  <Text style={s.fitText}>{item.text}</Text>
                </View>
              ))}
              <Pressable onPress={() => router.push('/preferences')} hitSlop={6}>
                <Text style={s.link}>Edit my preferences</Text>
              </Pressable>
            </View>
          )}

          <Text style={s.title}>{recipe.name}</Text>
          <Text style={s.subtitle}>{recipe.subtitle}</Text>

          <View style={s.stats}>
            <Stat icon="time-outline" value={total != null ? `${total} min` : '–'} label="Total time" />
            <Stat icon="speedometer-outline" value={recipe.difficulty ?? '–'} label="Difficulty" />
            <Stat icon="flame-outline" value={n ? `${n.calories}` : '–'} label="kcal / serving" />
            <Stat icon="globe-outline" value={recipe.cuisine} label="Cuisine" />
          </View>

          <View style={s.chips}>
            {recipeChips(recipe).map((c) => (
              <View key={c.label} style={s.chip}>
                <Ionicons name={c.icon as IconName} size={15} color={c.color} />
                <Text style={s.chipText}>{c.label}</Text>
              </View>
            ))}
          </View>

          {recipe.description ? <Text style={s.desc}>{recipe.description}</Text> : null}
          {recipe.prepMinutes != null && (
            <Text style={s.prep}>
              Prep {recipe.prepMinutes} min{recipe.cookMinutes ? ` · Cook ${recipe.cookMinutes} min` : ''}
            </Text>
          )}
          {recipe.attribution && (
            <View style={s.credit}>
              <Ionicons name="globe-outline" size={14} color={colors.textMuted} />
              <Text style={s.creditText}>
                Recipe from{' '}
                <Text
                  style={s.creditLink}
                  onPress={() => recipe.attribution?.providerUrl && Linking.openURL(recipe.attribution.providerUrl)}
                >
                  {recipe.attribution.provider}
                </Text>
                {recipe.attribution.originalUrl ? (
                  <>
                    {' · '}
                    <Text style={s.creditLink} onPress={() => Linking.openURL(recipe.attribution!.originalUrl!)}>
                      original recipe
                    </Text>
                  </>
                ) : null}
              </Text>
            </View>
          )}

          {/* Ingredients */}
          <View style={s.card}>
            <View style={s.cardHead}>
              <Text style={s.cardTitle}>Ingredients</Text>
              {recipe.servings ? (
                <View style={s.stepper}>
                  <Pressable
                    onPress={() => setServings((v) => Math.max(1, v - 1))}
                    style={s.stepBtn}
                    accessibilityLabel="Fewer servings"
                    hitSlop={6}
                  >
                    <Ionicons name="remove" size={16} color={colors.green} />
                  </Pressable>
                  <Text style={s.stepText}>
                    {servings} serving{servings === 1 ? '' : 's'}
                  </Text>
                  <Pressable
                    onPress={() => setServings((v) => Math.min(12, v + 1))}
                    style={s.stepBtn}
                    accessibilityLabel="More servings"
                    hitSlop={6}
                  >
                    <Ionicons name="add" size={16} color={colors.green} />
                  </Pressable>
                </View>
              ) : null}
            </View>
            {recipe.ingredients.map((ing, idx) => (
              <View key={idx} style={[s.ingRow, idx > 0 && s.ingBorder]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.ingName}>{ing.name}</Text>
                  {ing.note ? <Text style={s.ingNote}>{ing.note}</Text> : null}
                </View>
                <Text style={s.ingAmount}>{scaleAmount(ing.amount, factor) ?? ''}</Text>
              </View>
            ))}
          </View>

          {/* Method */}
          <View style={s.sectionHead}>
            <Text style={s.cardTitle}>Method</Text>
            <Text style={s.muted}>Tap a step when it's done</Text>
          </View>
          {recipe.steps.map((step, idx) => {
            const on = done.has(idx);
            const last = idx === recipe.steps.length - 1;
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
                <View style={s.stepRail}>
                  <View style={[s.stepNum, on && { backgroundColor: colors.green }]}>
                    {on ? (
                      <Ionicons name="checkmark" size={16} color="#fff" />
                    ) : (
                      <Text style={s.stepNumText}>{idx + 1}</Text>
                    )}
                  </View>
                  {!last && <View style={s.stepLine} />}
                </View>
                <Text style={[s.stepText2, on && s.stepDone]}>{step}</Text>
              </Pressable>
            );
          })}

          {/* Tips */}
          {recipe.tips?.length ? (
            <View style={s.tips}>
              <View style={s.tipsHead}>
                <Ionicons name="bulb" size={18} color="#C98A12" />
                <Text style={s.tipsTitle}>{recipe.tips.length > 1 ? 'Tips' : 'Tip'}</Text>
              </View>
              {recipe.tips.map((t, idx) => (
                <Text key={idx} style={s.tipText}>
                  {t}
                </Text>
              ))}
            </View>
          ) : null}

          {/* Nutrition */}
          <View style={s.card}>
            <View style={s.cardHead}>
              <Text style={s.cardTitle}>Nutrition per serving</Text>
              {n ? <Text style={s.muted}>approx.</Text> : null}
            </View>
            {n ? (
              <>
                <MacroBar protein={n.proteinG} carbs={n.carbsG} fat={n.fatG} />
                <NutriRow label="Calories" value={fmt(n.calories, 'kcal')} strong />
                <NutriRow label="Carbohydrates" value={fmt(n.carbsG, 'g')} dot="#E9A23B" />
                <NutriRow label="  of which sugar" value={fmt(n.sugarG, 'g')} sub />
                <NutriRow label="Fat" value={fmt(n.fatG, 'g')} dot="#6C63C7" />
                <NutriRow label="  of which saturates" value={fmt(n.saturatedFatG, 'g')} sub />
                <NutriRow label="Protein" value={fmt(n.proteinG, 'g')} dot={colors.green} />
                <NutriRow label="Fibre" value={fmt(n.fiberG, 'g')} />
                <NutriRow label="Salt" value={fmt(Math.round(saltG * 10) / 10, 'g')} />
              </>
            ) : (
              <Text style={[s.muted, { marginTop: 6 }]}>
                Nutrition information isn't available for this recipe, so it won't appear under health-condition or
                nutrition-goal filters.
              </Text>
            )}
          </View>

          {/* Diet & allergens */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Diet & allergens</Text>
            <View style={[s.tagRow, { marginTop: 10 }]}>
              {diets.map((d) => (
                <Tag key={d} label={labelOf(DIETS, d)} />
              ))}
            </View>
            {needsCertifiedMeat(recipe) && (diets.includes('halal') || diets.includes('kosher')) && (
              <Text style={[s.muted, { marginTop: 8 }]}>Halal / kosher: use certified meat and products.</Text>
            )}
            <Text style={s.label}>Contains</Text>
            <View style={s.tagRow}>
              {allergens.length ? (
                allergens.map((a) => <Tag key={a} label={labelOf(ALLERGENS, a)} tone="coral" />)
              ) : (
                <Text style={s.muted}>None of the 9 common allergens we track</Text>
              )}
            </View>
            <Text style={[s.muted, { marginTop: 10 }]}>{ALLERGY_DISCLAIMER}</Text>
            {conditions.length > 0 && (
              <>
                <Text style={s.label}>Condition-aware</Text>
                <View style={s.tagRow}>
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

          {/* Rating */}
          <View style={[s.card, s.rateCard]}>
            <Text style={s.cardTitle}>How did you like this recipe?</Text>
            <View style={s.stars}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Pressable
                  key={star}
                  onPress={() => dispatch({ type: 'rate', recipeId: recipe.id, stars: star })}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={`Rate ${star} star${star > 1 ? 's' : ''}`}
                >
                  <Ionicons name={star <= rating ? 'star' : 'star-outline'} size={34} color="#E9A23B" />
                </Pressable>
              ))}
            </View>
            <Text style={s.muted}>
              {rating
                ? `You rated this ${rating} / 5 – tap again to change.`
                : 'Your rating helps us recommend recipes.'}
            </Text>
          </View>
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
  icon: IconName;
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

function Stat({ icon, value, label }: { icon: IconName; value: string; label: string }) {
  return (
    <View style={s.stat}>
      <Ionicons name={icon} size={18} color={colors.green} />
      <Text style={s.statValue} numberOfLines={2}>
        {value}
      </Text>
      <Text style={s.statLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function MacroBar({ protein, carbs, fat }: { protein: number; carbs: number; fat: number }) {
  // Share of calories from each macro.
  const p = protein * 4;
  const c = carbs * 4;
  const f = fat * 9;
  const total = p + c + f || 1;
  const pct = (x: number) => Math.round((x / total) * 100);
  return (
    <View style={{ marginTop: 10, marginBottom: 6 }}>
      <View style={s.macroBar}>
        <View style={{ flex: c, backgroundColor: '#E9A23B' }} />
        <View style={{ flex: f, backgroundColor: '#6C63C7' }} />
        <View style={{ flex: p, backgroundColor: colors.green }} />
      </View>
      <Text style={[s.muted, { marginTop: 6 }]}>
        Calories from carbs {pct(c)}% · fat {pct(f)}% · protein {pct(p)}%
      </Text>
    </View>
  );
}

/** Formats a nutrient value; unknown (NaN) values show as a dash. */
const fmt = (v: number, unit: string) => (Number.isFinite(v) ? `${v} ${unit}` : '–');

function NutriRow({
  label,
  value,
  strong,
  sub,
  dot,
}: {
  label: string;
  value: string;
  strong?: boolean;
  sub?: boolean;
  dot?: string;
}) {
  return (
    <View style={s.nRow}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
        {dot ? <View style={[s.nDot, { backgroundColor: dot }]} /> : <View style={{ width: sub ? 0 : 8 }} />}
        <Text style={[s.nLabel, strong && { fontWeight: '800' }, sub && s.nSub]}>{label.trim()}</Text>
      </View>
      <Text style={[s.nValue, strong && { fontWeight: '800' }, sub && s.nSub]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  hero: { height: 320 },
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
    marginTop: -28,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: colors.bg,
    padding: 20,
  },
  fitPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
  },
  fitPillText: { fontWeight: '700', fontSize: 13.5 },
  fitPanel: {
    marginTop: 10,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 2,
    backgroundColor: colors.surface,
    gap: 8,
  },
  fitHeadline: { fontWeight: '800', fontSize: 15 },
  fitRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  fitText: { flex: 1, fontSize: 13.5, color: colors.text, lineHeight: 19 },
  link: { color: colors.green, fontWeight: '700', fontSize: 13, marginTop: 2 },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, marginTop: 14 },
  subtitle: { fontSize: 16, color: colors.textMuted, marginTop: 2 },
  stats: { flexDirection: 'row', gap: 8, marginTop: 16 },
  stat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 2,
  },
  statValue: { fontSize: 14, fontWeight: '800', color: colors.text, textAlign: 'center' },
  statLabel: { fontSize: 10.5, color: colors.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 16 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: { fontSize: 12.5, fontWeight: '600', color: colors.text },
  desc: { fontSize: 15, lineHeight: 22, color: colors.text, marginTop: 16 },
  prep: { fontSize: 13, color: colors.textMuted, marginTop: 8, fontWeight: '600' },
  credit: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  creditText: { fontSize: 12.5, color: colors.textMuted, flex: 1 },
  creditLink: { color: colors.green, fontWeight: '700', textDecorationLine: 'underline' },
  card: {
    marginTop: 20,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  cardTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 24,
    marginBottom: 8,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.greenSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  stepBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { fontSize: 13, fontWeight: '700', color: colors.greenText },
  ingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  ingBorder: { borderTopWidth: 1, borderTopColor: colors.border, borderStyle: 'dashed' },
  ingName: { fontSize: 15, color: colors.text },
  ingNote: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  ingAmount: { fontSize: 15, fontWeight: '700', color: colors.greenText, textAlign: 'right', maxWidth: '45%' },
  step: { flexDirection: 'row', gap: 12 },
  stepRail: { alignItems: 'center', width: 30 },
  stepNum: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.coralSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: { fontWeight: '800', color: colors.coral },
  stepLine: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 4 },
  stepText2: { flex: 1, fontSize: 15, lineHeight: 22, color: colors.text, paddingTop: 4, paddingBottom: 16 },
  stepDone: { color: colors.textMuted, textDecorationLine: 'line-through' },
  tips: {
    marginTop: 8,
    backgroundColor: '#FFF6E0',
    borderRadius: radius.lg,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#E9A23B',
    gap: 8,
  },
  tipsHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tipsTitle: { fontSize: 17, fontWeight: '800', color: '#7A520C' },
  tipText: { fontSize: 14.5, lineHeight: 21, color: '#5C4510' },
  macroBar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden' },
  nRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  nDot: { width: 8, height: 8, borderRadius: 4 },
  nLabel: { fontSize: 14.5, color: colors.text },
  nValue: { fontSize: 14.5, color: colors.text, fontWeight: '600' },
  nSub: { fontSize: 13, color: colors.textMuted, fontWeight: '400', paddingLeft: 16 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  label: { fontSize: 13, fontWeight: '700', color: colors.text, marginTop: 14, marginBottom: 6 },
  muted: { fontSize: 12.5, color: colors.textMuted },
  rateCard: { alignItems: 'center', gap: 10 },
  stars: { flexDirection: 'row', gap: 10 },
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
