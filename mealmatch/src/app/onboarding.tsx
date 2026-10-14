import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PreferenceEditor } from '@/components/PreferenceEditor';
import { Button } from '@/components/ui';
import { useAppStore } from '@/state/AppStore';
import { colors } from '@/theme';

export default function Onboarding() {
  const { data, dispatch } = useAppStore();

  const finish = () => {
    dispatch({ type: 'completeOnboarding' });
    router.replace('/discover');
  };

  return (
    <SafeAreaView style={s.wrap} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {router.canGoBack() && (
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
        )}
        <Text style={s.title}>What recipes would you like to discover?</Text>
        <Text style={s.sub}>Choose as many as you like. You can change this anytime.</Text>
        <PreferenceEditor
          value={data.preferences}
          onChange={(preferences) => dispatch({ type: 'setPreferences', preferences })}
        />
      </ScrollView>
      <View style={s.footer}>
        <Button label="Continue" onPress={finish} />
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 22, paddingBottom: 30 },
  title: { fontSize: 27, fontWeight: '800', color: colors.text, marginTop: 10 },
  sub: { fontSize: 15, color: colors.textMuted, marginTop: 8 },
  footer: { paddingHorizontal: 22, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg },
});
