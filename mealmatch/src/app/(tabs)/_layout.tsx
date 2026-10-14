import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import React from 'react';
import type { ColorValue } from 'react-native';

import { activeFilterCount } from '@/domain/filter';
import { useAppStore } from '@/state/AppStore';
import { colors } from '@/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const icon =
  (name: IconName, focusedName: IconName) =>
  ({ color, focused, size }: { color: ColorValue; focused: boolean; size: number }) => (
    <Ionicons name={focused ? focusedName : name} size={size} color={color} />
  );

export default function TabsLayout() {
  const { data } = useAppStore();
  const filters = activeFilterCount(data.filters);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.coral,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="discover" options={{ title: 'Discover', tabBarIcon: icon('flame-outline', 'flame') }} />
      <Tabs.Screen
        name="saved"
        options={{
          title: 'Saved',
          tabBarIcon: icon('heart-outline', 'heart'),
          tabBarBadge: data.saved.length || undefined,
          tabBarBadgeStyle: { backgroundColor: colors.green, fontSize: 10 },
        }}
      />
      <Tabs.Screen
        name="filters"
        options={{
          title: 'Search',
          tabBarIcon: icon('search-outline', 'search'),
          tabBarBadge: filters || undefined,
          tabBarBadgeStyle: { backgroundColor: colors.coral, fontSize: 10 },
        }}
      />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon('person-outline', 'person') }} />
    </Tabs>
  );
}
