import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Notice, SectionTitle } from '@/components/ui';
import { CONDITIONS, MEDICAL_DISCLAIMER } from '@/domain/catalog';
import { CONDITION_CRITERIA } from '@/domain/classify';
import { colors, radius } from '@/theme';

const FEATURES: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; detail: string }[] = [
  { icon: 'scale-outline', title: 'Weight Loss', detail: 'Healthy & sustainable – calorie-aware, protein and fibre rich' },
  { icon: 'leaf-outline', title: 'Dietary Needs', detail: 'Vegetarian, vegan, gluten-free, dairy-free, nut-free, egg-free, halal, kosher' },
  { icon: 'heart-outline', title: 'Medical Conditions', detail: 'Heart, kidney, liver, diabetes and digestive-friendly filters' },
  { icon: 'shield-checkmark-outline', title: 'Allergies & Exclusions', detail: 'Hide recipes with your allergens or any ingredient you dislike' },
  { icon: 'home-outline', title: 'Everyday Favourites', detail: 'Comfort food, quick meals, family-friendly' },
];

export default function About() {
  return (
    <SafeAreaView style={s.wrap}>
      <View style={s.header}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))} hitSlop={10} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.title}>Personalised. Healthy.{'\n'}For every diet.</Text>
        <Text style={s.sub}>MealMatch helps you find recipes for:</Text>
        {FEATURES.map((f) => (
          <View key={f.title} style={s.feature}>
            <View style={s.icon}>
              <Ionicons name={f.icon} size={22} color={colors.green} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.fTitle}>{f.title}</Text>
              <Text style={s.fDetail}>{f.detail}</Text>
            </View>
          </View>
        ))}

        <SectionTitle>How condition-friendly labels work</SectionTitle>
        <Text style={s.p}>
          Labels are calculated from each recipe's approximate nutrition per serving using these simple thresholds:
        </Text>
        {CONDITIONS.map((c) => (
          <Text key={c.id} style={s.li}>
            <Text style={{ fontWeight: '700' }}>{c.label}: </Text>
            {CONDITION_CRITERIA[c.id].summary}
          </Text>
        ))}
        <Text style={s.p}>
          Real dietary needs vary by person, stage of condition and medication. For example, kidney diets are often
          individually prescribed, and digestive conditions such as IBS may need less fibre rather than more.
        </Text>
        <View style={{ marginTop: 14 }}>
          <Notice title="Please note:">{MEDICAL_DISCLAIMER}</Notice>
        </View>
        <Text style={[s.p, { marginTop: 18 }]}>
          Sample recipes and nutrition values are included for demonstration. Your data is stored only on this device.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.infoBg },
  header: { paddingHorizontal: 16, paddingTop: 8 },
  content: { padding: 22, paddingTop: 4, paddingBottom: 40 },
  title: { fontSize: 27, fontWeight: '800', color: colors.greenText, textAlign: 'center' },
  sub: { fontSize: 15, color: colors.textMuted, textAlign: 'center', marginTop: 8, marginBottom: 12 },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10 },
  icon: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  fDetail: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  p: { fontSize: 14, lineHeight: 21, color: colors.text, marginTop: 6 },
  li: { fontSize: 13.5, lineHeight: 20, color: colors.text, marginTop: 6, paddingLeft: 8 },
});
