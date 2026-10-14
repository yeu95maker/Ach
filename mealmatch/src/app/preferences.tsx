import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PreferenceEditor, type PreferenceSection } from '@/components/PreferenceEditor';
import { Button } from '@/components/ui';
import { useAppStore } from '@/state/AppStore';
import { colors } from '@/theme';

const TITLES: Record<PreferenceSection, string> = {
  goals: 'Health & Wellness Goals',
  diets: 'Dietary Preferences',
  allergies: 'Allergies & Exclusions',
  conditions: 'Health Conditions',
};

/** Edits preferences live (changes apply as you tap). `?section=` limits to one section. */
export default function PreferencesScreen() {
  const { section } = useLocalSearchParams<{ section?: string }>();
  const { data, dispatch, matchingCount } = useAppStore();
  const only = section && section in TITLES ? (section as PreferenceSection) : undefined;
  const close = () => (router.canGoBack() ? router.back() : router.replace('/profile'));

  return (
    <SafeAreaView style={s.wrap}>
      <View style={s.header}>
        <Text style={s.title}>{only ? TITLES[only] : 'Your Preferences'}</Text>
        <Pressable onPress={close} hitSlop={10} accessibilityRole="button">
          <Text style={s.done}>Done</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <PreferenceEditor
          value={data.preferences}
          onChange={(preferences) => dispatch({ type: 'setPreferences', preferences })}
          sections={only ? [only] : undefined}
        />
      </ScrollView>
      <View style={s.footer}>
        <Text style={s.count}>{matchingCount} recipes match your profile and filters</Text>
        <Button label="Done" variant="green" onPress={close} />
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12 },
  title: { fontSize: 22, fontWeight: '800', color: colors.text, flex: 1 },
  done: { color: colors.green, fontWeight: '700', fontSize: 16 },
  content: { paddingHorizontal: 20, paddingBottom: 24 },
  footer: { padding: 16, paddingHorizontal: 20, gap: 8, borderTopWidth: 1, borderTopColor: colors.border },
  count: { textAlign: 'center', fontSize: 12.5, color: colors.textMuted },
});
