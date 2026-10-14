import { EMPTY_FILTERS } from '@/domain/filter';
import type { RecipeFilters, SwipeAction, UserPreferences } from '@/domain/types';
import { DEFAULT_USER_DATA, type UserData } from '@/domain/userData';

export type Action =
  | { type: 'hydrate'; data: UserData }
  | { type: 'completeOnboarding' }
  | { type: 'setPreferences'; preferences: UserPreferences }
  | { type: 'setDisplayName'; name: string }
  | { type: 'setFilters'; filters: RecipeFilters }
  | { type: 'resetFilters' }
  | { type: 'swipe'; recipeId: string; action: SwipeAction; at: number }
  | { type: 'undo' }
  | { type: 'toggleSaved'; recipeId: string }
  | { type: 'rate'; recipeId: string; stars: number }
  | { type: 'resetSkipped' }
  | { type: 'resetAll' };

/** Pure state transitions – easy to unit test and to replay for cloud sync. */
export function reducer(state: UserData, action: Action): UserData {
  const next = apply(state, action);
  return next === state || action.type === 'hydrate' ? next : { ...next, updatedAt: Date.now() };
}

function apply(state: UserData, action: Action): UserData {
  switch (action.type) {
    case 'hydrate':
      return action.data;
    case 'completeOnboarding':
      return { ...state, onboarded: true };
    case 'setPreferences':
      return { ...state, preferences: action.preferences };
    case 'setDisplayName':
      return { ...state, displayName: action.name };
    case 'setFilters':
      return { ...state, filters: action.filters };
    case 'resetFilters':
      return { ...state, filters: EMPTY_FILTERS };
    case 'swipe': {
      const history = [...state.history, { recipeId: action.recipeId, action: action.action, at: action.at }];
      const saved =
        action.action === 'save' ? [action.recipeId, ...state.saved.filter((id) => id !== action.recipeId)] : state.saved;
      return { ...state, history, saved };
    }
    case 'undo': {
      const last = state.history.at(-1);
      if (!last) return state;
      return {
        ...state,
        history: state.history.slice(0, -1),
        saved: last.action === 'save' ? state.saved.filter((id) => id !== last.recipeId) : state.saved,
      };
    }
    case 'toggleSaved': {
      const isSaved = state.saved.includes(action.recipeId);
      if (!isSaved) return { ...state, saved: [action.recipeId, ...state.saved] };
      // Un-saving a swiped recipe keeps it out of the deck but stops it counting as a "like".
      return {
        ...state,
        saved: state.saved.filter((id) => id !== action.recipeId),
        history: state.history.map((h) =>
          h.recipeId === action.recipeId && h.action === 'save' ? { ...h, action: 'skip' as const } : h,
        ),
      };
    }
    case 'rate': {
      const ratings = { ...state.ratings };
      // Tapping the current rating again clears it.
      if (ratings[action.recipeId] === action.stars || action.stars < 1) delete ratings[action.recipeId];
      else ratings[action.recipeId] = Math.min(5, Math.round(action.stars));
      return { ...state, ratings };
    }
    case 'resetSkipped':
      return { ...state, history: state.history.filter((h) => h.action === 'save') };
    case 'resetAll':
      return { ...DEFAULT_USER_DATA };
  }
}
