import { Redirect, router } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui';
import { useAppStore } from '@/state/AppStore';
import { colors } from '@/theme';

export default function Welcome() {
  const { data } = useAppStore();
  if (data.onboarded) return <Redirect href="/discover" />;

  return (
    <SafeAreaView style={s.wrap}>
      <View style={s.top}>
        <Text style={s.logo}>🧑‍🍳</Text>
        <Text style={s.title}>MealMatch</Text>
        <Text style={s.tagline}>Swipe. Save. Cook.</Text>
        <Text style={s.copy}>Discover recipes that match your taste, health goals and lifestyle.</Text>
      </View>
      <View style={s.plate}>
        <Text style={s.plateEmoji}>🥗</Text>
        <Text style={[s.side, { left: '8%', top: '10%' }]}>🍅</Text>
        <Text style={[s.side, { right: '10%', top: '18%' }]}>🥑</Text>
        <Text style={[s.side, { left: '16%', bottom: '8%' }]}>🍋</Text>
        <Text style={[s.side, { right: '14%', bottom: '4%' }]}>🌿</Text>
      </View>
      <View style={s.actions}>
        <Button label="Get Started" onPress={() => router.push('/onboarding')} />
        <Text style={s.small}>No account needed – your preferences stay on this device.</Text>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 28 },
  top: { alignItems: 'center', marginTop: 32 },
  logo: { fontSize: 56 },
  title: { fontSize: 44, fontWeight: '800', color: colors.green, marginTop: 4 },
  tagline: { fontSize: 20, fontWeight: '700', color: colors.text, marginTop: 6 },
  copy: { fontSize: 16, color: colors.textMuted, textAlign: 'center', lineHeight: 23, marginTop: 14, maxWidth: 320 },
  plate: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  plateEmoji: { fontSize: 150 },
  side: { position: 'absolute', fontSize: 40 },
  actions: { gap: 12, paddingBottom: 20 },
  small: { fontSize: 12.5, color: colors.textMuted, textAlign: 'center' },
});
