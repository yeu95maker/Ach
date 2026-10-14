import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Notice } from '@/components/ui';
import { ALLERGENS, CONDITIONS, DIETS, GOALS, labelOf, MEDICAL_DISCLAIMER } from '@/domain/catalog';
import { useAppStore } from '@/state/AppStore';
import { colors, radius } from '@/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function summary(items: string[], empty: string) {
  return items.length ? items.join(', ') : empty;
}

function confirm(title: string, message: string, onOk: () => void) {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`${title}\n\n${message}`)) onOk();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Reset', style: 'destructive', onPress: onOk },
  ]);
}

export default function Profile() {
  const { data, dispatch, user } = useAppStore();
  const [editingName, setEditingName] = useState(false);
  const p = data.preferences;
  const saves = data.history.filter((h) => h.action === 'save').length;
  const skips = data.history.filter((h) => h.action === 'skip').length;

  const allergyItems = [...p.allergens.map((a) => labelOf(ALLERGENS, a)), ...p.excludedIngredients];

  return (
    <SafeAreaView style={s.wrap} edges={['top']}>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.avatar}>
          <Ionicons name="person" size={40} color="#fff" />
        </View>
        {editingName ? (
          <TextInput
            autoFocus
            defaultValue={data.displayName}
            placeholder="Your name"
            placeholderTextColor={colors.textMuted}
            style={s.nameInput}
            onSubmitEditing={(e) => {
              dispatch({ type: 'setDisplayName', name: e.nativeEvent.text.trim() });
              setEditingName(false);
            }}
            onBlur={() => setEditingName(false)}
            returnKeyType="done"
            accessibilityLabel="Your name"
          />
        ) : (
          <Pressable onPress={() => setEditingName(true)} accessibilityRole="button" accessibilityLabel="Edit name">
            <Text style={s.hi}>
              Hi{data.displayName ? `, ${data.displayName}` : ' there'}! <Ionicons name="pencil" size={14} color={colors.textMuted} />
            </Text>
          </Pressable>
        )}
        <Text style={s.sub}>Good food. Better days.</Text>

        <View style={s.stats}>
          <Stat value={data.saved.length} label="Saved" />
          <View style={s.divider} />
          <Stat value={saves + skips} label="Swiped" />
          <View style={s.divider} />
          <Stat value={skips} label="Skipped" />
        </View>

        <View style={s.card}>
          <Row
            icon="leaf-outline"
            title="My Dietary Preferences"
            detail={summary(p.diets.map((d) => labelOf(DIETS, d)), 'No restrictions')}
            onPress={() => router.push('/preferences?section=diets')}
          />
          <Row
            icon="trophy-outline"
            title="Health & Wellness Goals"
            detail={summary(p.goals.map((g) => labelOf(GOALS, g)), 'None selected')}
            onPress={() => router.push('/preferences?section=goals')}
          />
          <Row
            icon="close-circle-outline"
            title="Allergies / Exclusions"
            detail={summary(allergyItems, 'None')}
            onPress={() => router.push('/preferences?section=allergies')}
          />
          <Row
            icon="heart-circle-outline"
            title="Health Conditions"
            detail={summary(p.conditions.map((c) => labelOf(CONDITIONS, c)), 'None')}
            onPress={() => router.push('/preferences?section=conditions')}
            last
          />
        </View>

        <View style={s.card}>
          <Row
            icon="cloud-outline"
            title="Account & Sync"
            detail={user?.isGuest ? 'Guest – saved on this device. Cloud sync coming soon.' : 'Signed in'}
          />
          <Row icon="information-circle-outline" title="About MealMatch" detail="Features & health information" onPress={() => router.push('/about')} />
          <Row
            icon="refresh-outline"
            title="Reset all data"
            detail="Clear preferences, saved recipes and history"
            danger
            last
            onPress={() =>
              confirm('Reset MealMatch?', 'This clears your preferences, saved recipes and swipe history on this device.', () => {
                dispatch({ type: 'resetAll' });
                router.replace('/');
              })
            }
          />
        </View>

        <View style={{ marginTop: 16 }}>
          <Notice title="Please note:">{MEDICAL_DISCLAIMER}</Notice>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function Row({
  icon,
  title,
  detail,
  onPress,
  last,
  danger,
}: {
  icon: IconName;
  title: string;
  detail: string;
  onPress?: () => void;
  last?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[s.row, !last && s.rowBorder]}
      accessibilityRole={onPress ? 'button' : undefined}
    >
      <Ionicons name={icon} size={22} color={danger ? colors.coral : colors.text} />
      <View style={{ flex: 1 }}>
        <Text style={[s.rowTitle, danger && { color: colors.coral }]}>{title}</Text>
        <Text style={s.rowDetail} numberOfLines={2}>
          {detail}
        </Text>
      </View>
      {onPress && <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />}
    </Pressable>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 18, paddingBottom: 32, alignItems: 'stretch' },
  avatar: {
    alignSelf: 'center',
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#4E5C59',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  hi: { fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center', marginTop: 10 },
  nameInput: {
    alignSelf: 'center',
    minWidth: 200,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    borderBottomWidth: 2,
    borderBottomColor: colors.green,
    marginTop: 10,
    paddingVertical: 4,
  },
  sub: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: 4 },
  stats: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: 16,
    marginTop: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  divider: { width: 1, backgroundColor: colors.border },
  statValue: { fontSize: 22, fontWeight: '800', color: colors.text },
  statLabel: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    marginTop: 16,
    marginBottom: 2,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  rowDetail: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
});
