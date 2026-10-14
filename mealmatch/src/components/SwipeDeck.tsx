import { Ionicons } from '@expo/vector-icons';
import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import {
  Animated,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { totalMinutes } from '@/domain/classify';
import type { ScoredRecipe } from '@/domain/recommend';
import type { Recipe } from '@/domain/types';
import { colors, radius, shadow } from '@/theme';

import { displayTags, RecipeHero } from './RecipeVisual';
import { Meta, Tag } from './ui';

export type SwipeDirection = 'left' | 'right';

export interface SwipeDeckHandle {
  swipe(direction: SwipeDirection): void;
}

const useNative = Platform.OS !== 'web';
const SWIPE_THRESHOLD = 110;

interface Props {
  items: ScoredRecipe[];
  onSwipe: (recipe: Recipe, direction: SwipeDirection) => void;
  onOpen: (recipe: Recipe) => void;
  /** When a card comes back via undo, it slides in from this side. */
  enterFrom?: SwipeDirection | null;
}

export const SwipeDeck = forwardRef<SwipeDeckHandle, Props>(function SwipeDeck(
  { items, onSwipe, onOpen, enterFrom },
  ref,
) {
  const top = items[0];
  const next = items[1];
  const cardRef = useRef<SwipeDeckHandle>(null);
  useImperativeHandle(ref, () => ({ swipe: (d) => cardRef.current?.swipe(d) }), []);

  return (
    <View style={s.deck}>
      {next && (
        <View style={[s.cardPos, s.behind]} pointerEvents="none">
          <CardFace item={next} />
        </View>
      )}
      {top && (
        <TopCard
          key={top.recipe.id}
          ref={cardRef}
          item={top}
          onSwipe={onSwipe}
          onOpen={onOpen}
          enterFrom={enterFrom}
        />
      )}
    </View>
  );
});

const TopCard = forwardRef<
  SwipeDeckHandle,
  { item: ScoredRecipe; onSwipe: Props['onSwipe']; onOpen: Props['onOpen']; enterFrom?: SwipeDirection | null }
>(function TopCard({ item, onSwipe, onOpen, enterFrom }, ref) {
  const { width } = useWindowDimensions();
  const offscreen = Math.max(width, 420) * 1.3;
  const startX = enterFrom === 'left' ? -offscreen : enterFrom === 'right' ? offscreen : 0;
  // A fresh animated value per card (component is keyed by recipe id), so the
  // next card never inherits the previous card's fly-out position.
  const position = useRef(new Animated.ValueXY({ x: startX, y: 0 })).current;
  const busy = useRef(false);
  const latest = useRef({ onSwipe, item });
  latest.current = { onSwipe, item };

  useEffect(() => {
    if (startX !== 0) {
      Animated.spring(position, { toValue: { x: 0, y: 0 }, useNativeDriver: useNative, friction: 7 }).start();
    }
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flyOut = (direction: SwipeDirection, vy = 0) => {
    if (busy.current) return;
    busy.current = true;
    Animated.timing(position, {
      toValue: { x: direction === 'right' ? offscreen : -offscreen, y: vy * 60 },
      duration: 230,
      useNativeDriver: useNative,
    }).start(() => latest.current.onSwipe(latest.current.item.recipe, direction));
  };

  useImperativeHandle(ref, () => ({ swipe: (d) => flyOut(d) }));

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderMove: (_, g) => position.setValue({ x: g.dx, y: g.dy * 0.3 }),
        onPanResponderRelease: (_, g) => {
          if (g.dx > SWIPE_THRESHOLD || g.vx > 0.8) flyOut('right', g.vy);
          else if (g.dx < -SWIPE_THRESHOLD || g.vx < -0.8) flyOut('left', g.vy);
          else Animated.spring(position, { toValue: { x: 0, y: 0 }, useNativeDriver: useNative, friction: 6 }).start();
        },
        onPanResponderTerminate: () =>
          Animated.spring(position, { toValue: { x: 0, y: 0 }, useNativeDriver: useNative }).start(),
      }),
    // flyOut only reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const rotate = position.x.interpolate({ inputRange: [-300, 0, 300], outputRange: ['-12deg', '0deg', '12deg'] });
  const saveOpacity = position.x.interpolate({ inputRange: [20, 120], outputRange: [0, 1], extrapolate: 'clamp' });
  const skipOpacity = position.x.interpolate({ inputRange: [-120, -20], outputRange: [1, 0], extrapolate: 'clamp' });

  return (
    <Animated.View
      {...responder.panHandlers}
      style={[s.cardPos, { transform: [...position.getTranslateTransform(), { rotate }] }]}
    >
      <Pressable
        style={{ flex: 1 }}
        onPress={() => onOpen(item.recipe)}
        accessibilityRole="button"
        accessibilityLabel={`${item.recipe.name}. Tap for full recipe.`}
        accessibilityHint="Swipe right to save, left to skip"
      >
        <CardFace item={item} />
      </Pressable>
      <Animated.View style={[s.stamp, s.stampSave, { opacity: saveOpacity }]} pointerEvents="none">
        <Ionicons name="heart" size={20} color={colors.green} />
        <Text style={[s.stampText, { color: colors.green }]}>SAVE</Text>
      </Animated.View>
      <Animated.View style={[s.stamp, s.stampSkip, { opacity: skipOpacity }]} pointerEvents="none">
        <Ionicons name="close" size={20} color={colors.coral} />
        <Text style={[s.stampText, { color: colors.coral }]}>SKIP</Text>
      </Animated.View>
    </Animated.View>
  );
});

function CardFace({ item }: { item: ScoredRecipe }) {
  const { recipe, reasons } = item;
  const tags = displayTags(recipe, 4);
  return (
    <View style={s.card}>
      <RecipeHero recipe={recipe} emojiSize={110} style={s.hero} />
      <View style={s.badges}>
        {tags[0] && <Tag label={tags[0]} tone="green" />}
        {reasons.some((r) => r.startsWith('Because')) && <Tag label="For you" tone="dark" />}
      </View>
      <View style={s.info}>
        <Text style={s.name} numberOfLines={2}>
          {recipe.name}
        </Text>
        <Text style={s.subtitle} numberOfLines={1}>
          {recipe.subtitle}
        </Text>
        <View style={s.metaRow}>
          <Meta icon="time-outline" label={`${totalMinutes(recipe)} min`} />
          <Meta icon="speedometer-outline" label={recipe.difficulty} />
          <Meta icon="flame-outline" label={`${recipe.nutrition.calories} kcal`} />
        </View>
        <View style={s.tags}>
          {tags.slice(1).map((t) => (
            <Tag key={t} label={t} tone="neutral" />
          ))}
        </View>
        <Text style={s.tap}>Tap for full recipe</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  deck: { flex: 1, marginTop: 8 },
  cardPos: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  behind: { transform: [{ scale: 0.95 }, { translateY: 14 }], opacity: 0.7 },
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    overflow: 'hidden',
    ...shadow,
  },
  hero: { flex: 1, minHeight: 160 },
  badges: { position: 'absolute', top: 14, left: 14, flexDirection: 'row', gap: 6 },
  info: { padding: 18, gap: 6 },
  name: { fontSize: 23, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 15, color: colors.textMuted },
  metaRow: { flexDirection: 'row', gap: 16, marginTop: 4 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  tap: { fontSize: 12, color: colors.textMuted, marginTop: 6 },
  stamp: {
    position: 'absolute',
    top: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    borderWidth: 3,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  stampSave: { right: 20, borderColor: colors.green, transform: [{ rotate: '12deg' }] },
  stampSkip: { left: 20, borderColor: colors.coral, transform: [{ rotate: '-12deg' }] },
  stampText: { fontSize: 18, fontWeight: '900', letterSpacing: 1 },
});
