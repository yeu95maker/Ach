import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius } from '@/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  style,
  disabled,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'green' | 'outline' | 'ghost';
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}) {
  const bg =
    variant === 'primary' ? colors.coral : variant === 'green' ? colors.green : 'transparent';
  const fg = variant === 'primary' || variant === 'green' ? '#fff' : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.btn,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        variant === 'outline' && s.btnOutline,
        style,
      ]}
    >
      {icon && <Ionicons name={icon} size={18} color={fg} />}
      <Text style={[s.btnText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

/** Square-ish selectable tile used on onboarding / preferences. */
export function OptionTile({
  label,
  icon,
  selected,
  onPress,
  hint,
}: {
  label: string;
  icon: string;
  selected: boolean;
  onPress: () => void;
  hint?: string;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[s.tile, selected && s.tileOn]}
    >
      {selected && (
        <View style={s.tileCheck}>
          <Ionicons name="checkmark" size={12} color="#fff" />
        </View>
      )}
      <Ionicons name={icon as IconName} size={24} color={selected ? colors.green : colors.greenText} />
      <Text style={s.tileLabel} numberOfLines={2}>
        {label}
      </Text>
      {hint ? (
        <Text style={s.tileHint} numberOfLines={2}>
          {hint}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** Compact pill toggle used on the Filters screen. */
export function Chip({
  label,
  icon,
  selected,
  onPress,
}: {
  label: string;
  icon?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[s.chip, selected && s.chipOn]}
    >
      {icon && <Ionicons name={icon as IconName} size={15} color={selected ? '#fff' : colors.greenText} />}
      <Text style={[s.chipText, selected && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

export function Tag({ label, tone = 'green' }: { label: string; tone?: 'green' | 'coral' | 'neutral' | 'dark' }) {
  const palette = {
    green: { bg: colors.greenSoft, fg: colors.greenText },
    coral: { bg: colors.coralSoft, fg: colors.warnText },
    neutral: { bg: colors.surfaceAlt, fg: colors.textMuted },
    dark: { bg: 'rgba(255,255,255,0.92)', fg: colors.text },
  }[tone];
  return (
    <View style={[s.tag, { backgroundColor: palette.bg }]}>
      <Text style={[s.tagText, { color: palette.fg }]}>{label}</Text>
    </View>
  );
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={s.sectionRow}>
      <Text style={s.section}>{children}</Text>
      {right}
    </View>
  );
}

export function Notice({
  title,
  children,
  tone = 'warn',
}: {
  title?: string;
  children: React.ReactNode;
  tone?: 'warn' | 'info';
}) {
  const warn = tone === 'warn';
  return (
    <View
      accessibilityRole="summary"
      style={[s.notice, warn ? { backgroundColor: colors.warnBg, borderColor: colors.warnBorder } : { backgroundColor: colors.infoBg, borderColor: colors.greenSoft }]}
    >
      <Ionicons
        name={warn ? 'information-circle-outline' : 'shield-checkmark-outline'}
        size={20}
        color={warn ? colors.coral : colors.green}
        style={{ marginTop: 1 }}
      />
      <Text style={[s.noticeText, { color: warn ? colors.warnText : colors.greenText }]}>
        {title ? <Text style={{ fontWeight: '700' }}>{title} </Text> : null}
        {children}
      </Text>
    </View>
  );
}

export function Meta({ icon, label }: { icon: IconName; label: string }) {
  return (
    <View style={s.meta}>
      <Ionicons name={icon} size={15} color={colors.textMuted} />
      <Text style={s.metaText}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: radius.pill,
  },
  btnOutline: { borderWidth: 1.5, borderColor: colors.text },
  btnText: { fontSize: 16, fontWeight: '700' },
  tile: {
    width: '31%',
    minHeight: 92,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 6,
    gap: 6,
  },
  tileOn: { borderColor: colors.green, backgroundColor: colors.greenSoft },
  tileCheck: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: { fontSize: 13, fontWeight: '600', color: colors.text, textAlign: 'center' },
  tileHint: { fontSize: 10, color: colors.textMuted, textAlign: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.green, borderColor: colors.green },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.text },
  tag: { paddingVertical: 4, paddingHorizontal: 9, borderRadius: radius.pill },
  tagText: { fontSize: 11.5, fontWeight: '600' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 10 },
  section: { fontSize: 17, fontWeight: '700', color: colors.text },
  notice: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: radius.md, borderWidth: 1 },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 19 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { fontSize: 13.5, color: colors.textMuted, fontWeight: '500' },
});
