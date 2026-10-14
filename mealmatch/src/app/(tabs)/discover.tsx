import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SwipeDeck, type SwipeDeckHandle, type SwipeDirection } from '@/components/SwipeDeck';
import { Button } from '@/components/ui';
import { activeFilterCount } from '@/domain/filter';
import { useAppStore } from '@/state/AppStore';
import { colors, shadow } from '@/theme';

export default function Discover() {
  const { deck, data, dispatch, matchingCount } = useAppStore();
  const deckRef = useRef<SwipeDeckHandle>(null);
  const [enterFrom, setEnterFrom] = useState<SwipeDirection | null>(null);
  const filterCount = activeFilterCount(data.filters);
  const canUndo = data.history.length > 0;

  const onSwipe = (recipeId: string, direction: SwipeDirection) => {
    setEnterFrom(null);
    dispatch({ type: 'swipe', recipeId, action: direction === 'right' ? 'save' : 'skip', at: Date.now() });
  };

  const undo = () => {
    const last = data.history.at(-1);
    if (!last) return;
    setEnterFrom(last.action === 'save' ? 'right' : 'left');
    dispatch({ type: 'undo' });
  };

  return (
    <SafeAreaView style={s.wrap} edges={['top']}>
      <View style={s.header}>
        <View style={{ width: 40 }} />
        <Text style={s.brand}>
          <Text style={{ color: colors.coral }}>Meal</Text>Match
        </Text>
        <Pressable
          onPress={() => router.navigate('/filters')}
          style={s.filterBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Filters${filterCount ? `, ${filterCount} active` : ''}`}
        >
          <Ionicons name="options-outline" size={24} color={colors.text} />
          {filterCount > 0 && (
            <View style={s.dot}>
              <Text style={s.dotText}>{filterCount}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {deck.length > 0 ? (
        <>
          <SwipeDeck
            ref={deckRef}
            items={deck}
            enterFrom={enterFrom}
            onSwipe={(recipe, dir) => onSwipe(recipe.id, dir)}
            onOpen={(recipe) => router.push(`/recipe/${recipe.id}`)}
          />
          <View style={s.actions}>
            <Pressable
              style={[s.round, s.skip]}
              onPress={() => deckRef.current?.swipe('left')}
              accessibilityRole="button"
              accessibilityLabel="Skip recipe"
            >
              <Ionicons name="close" size={34} color="#fff" />
            </Pressable>
            <Pressable
              style={[s.round, s.undo, !canUndo && { opacity: 0.4 }]}
              onPress={undo}
              disabled={!canUndo}
              accessibilityRole="button"
              accessibilityLabel="Undo last swipe"
            >
              <Ionicons name="arrow-undo" size={22} color={colors.textMuted} />
            </Pressable>
            <Pressable
              style={[s.round, s.save]}
              onPress={() => deckRef.current?.swipe('right')}
              accessibilityRole="button"
              accessibilityLabel="Save recipe"
            >
              <Ionicons name="heart" size={32} color="#fff" />
            </Pressable>
          </View>
          <Text style={s.count}>{deck.length} recipes left to explore</Text>
        </>
      ) : (
        <EmptyDeck
          matchingCount={matchingCount}
          filterCount={filterCount}
          canUndo={canUndo}
          onUndo={undo}
          onResetSkipped={() => dispatch({ type: 'resetSkipped' })}
          onClearFilters={() => dispatch({ type: 'resetFilters' })}
        />
      )}
    </SafeAreaView>
  );
}

function EmptyDeck(props: {
  matchingCount: number;
  filterCount: number;
  canUndo: boolean;
  onUndo: () => void;
  onResetSkipped: () => void;
  onClearFilters: () => void;
}) {
  const noMatches = props.matchingCount === 0;
  return (
    <View style={s.empty}>
      <Text style={{ fontSize: 64 }}>{noMatches ? '🔍' : '🎉'}</Text>
      <Text style={s.emptyTitle}>{noMatches ? 'No recipes match' : "You've seen everything!"}</Text>
      <Text style={s.emptyText}>
        {noMatches
          ? 'Try removing a filter or relaxing your preferences in Profile.'
          : 'Check your saved recipes, or bring back the ones you skipped.'}
      </Text>
      <View style={{ gap: 10, alignSelf: 'stretch', marginTop: 20 }}>
        {!noMatches && <Button label="Show skipped recipes again" variant="green" icon="refresh" onPress={props.onResetSkipped} />}
        {props.filterCount > 0 && <Button label="Clear filters" variant="outline" onPress={props.onClearFilters} />}
        {noMatches && <Button label="Edit preferences" variant="outline" onPress={() => router.push('/preferences')} />}
        {props.canUndo && <Button label="Undo last swipe" variant="ghost" icon="arrow-undo" onPress={props.onUndo} />}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 18 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  brand: { fontSize: 24, fontWeight: '800', color: colors.green },
  filterBtn: { width: 40, alignItems: 'flex-end' },
  dot: {
    position: 'absolute',
    top: -4,
    right: -6,
    backgroundColor: colors.coral,
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  dotText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 26, paddingTop: 22 },
  round: { alignItems: 'center', justifyContent: 'center', borderRadius: 999, ...shadow },
  skip: { width: 68, height: 68, backgroundColor: colors.coral },
  undo: { width: 50, height: 50, backgroundColor: colors.surface },
  save: { width: 68, height: 68, backgroundColor: colors.green },
  count: { textAlign: 'center', color: colors.textMuted, fontSize: 12, paddingVertical: 10 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: colors.text, marginTop: 12 },
  emptyText: { fontSize: 15, color: colors.textMuted, textAlign: 'center', marginTop: 8, lineHeight: 21 },
});
