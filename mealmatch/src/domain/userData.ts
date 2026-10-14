import { EMPTY_FILTERS, EMPTY_PREFERENCES } from './filter';
import type { RecipeFilters, SwipeEvent, UserPreferences } from './types';

/**
 * Everything we persist for a user. Versioned so the shape can evolve, and
 * stamped with `updatedAt` so a future cloud sync can do last-write-wins
 * merging between devices.
 */
export interface UserData {
  version: 1;
  onboarded: boolean;
  displayName: string;
  preferences: UserPreferences;
  filters: RecipeFilters;
  /** Saved recipe ids, most recent first. */
  saved: string[];
  /** Every swipe, oldest first. Drives the deck, undo and recommendations. */
  history: SwipeEvent[];
  /** Star ratings (1–5) by recipe id. */
  ratings: Record<string, number>;
  updatedAt: number;
}

export const DEFAULT_USER_DATA: UserData = {
  version: 1,
  onboarded: false,
  displayName: '',
  preferences: EMPTY_PREFERENCES,
  filters: EMPTY_FILTERS,
  saved: [],
  history: [],
  ratings: {},
  updatedAt: 0,
};

/** Fills in any fields missing from older saves. */
export function migrate(raw: Partial<UserData>): UserData {
  return {
    ...DEFAULT_USER_DATA,
    ...raw,
    version: 1,
    preferences: { ...EMPTY_PREFERENCES, ...raw.preferences },
    filters: { ...EMPTY_FILTERS, ...raw.filters },
  };
}
