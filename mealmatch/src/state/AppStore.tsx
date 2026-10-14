import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { filterRecipes } from '@/domain/filter';
import { rankRecipes, type ScoredRecipe } from '@/domain/recommend';
import type { Recipe } from '@/domain/types';
import { authService, type AuthUser } from '@/services/auth';
import { recipeRepository } from '@/services/recipeRepository';
import { DEFAULT_USER_DATA, type UserData } from '@/domain/userData';
import { userDataStore } from '@/services/userDataStore';

import { reducer, type Action } from './reducer';

interface AppStore {
  ready: boolean;
  user: AuthUser | null;
  recipes: Recipe[];
  data: UserData;
  dispatch: React.Dispatch<Action>;
  /** Recipes left to swipe: passes profile + filters, not yet saved/swiped, ranked. */
  deck: ScoredRecipe[];
  /** How many recipes match profile + filters in total (including already swiped). */
  matchingCount: number;
  getRecipe(id: string): Recipe | undefined;
  isSaved(id: string): boolean;
}

const Ctx = createContext<AppStore | null>(null);

export function AppStoreProvider({ children }: { children: React.ReactNode }) {
  const [data, dispatch] = useReducer(reducer, DEFAULT_USER_DATA);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const u = await authService.currentUser();
      const [list, stored] = await Promise.all([recipeRepository.list(), userDataStore.load(u.id)]);
      if (cancelled) return;
      setUser(u);
      setRecipes(list);
      dispatch({ type: 'hydrate', data: stored });
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist after every change (debounced) once hydrated.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!ready || !user) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      userDataStore.save(user.id, data).catch(() => {});
    }, 250);
  }, [data, ready, user]);

  const value = useMemo<AppStore>(() => {
    const byId = new Map(recipes.map((r) => [r.id, r]));
    const matching = filterRecipes(recipes, data.preferences, data.filters);
    const seen = new Set([...data.saved, ...data.history.map((h) => h.recipeId)]);
    const deck = rankRecipes(
      matching.filter((r) => !seen.has(r.id)),
      data.preferences,
      data.history,
      recipes,
      data.ratings,
    );
    const savedSet = new Set(data.saved);
    return {
      ready,
      user,
      recipes,
      data,
      dispatch,
      deck,
      matchingCount: matching.length,
      getRecipe: (id) => byId.get(id),
      isSaved: (id) => savedSet.has(id),
    };
  }, [ready, user, recipes, data]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppStore(): AppStore {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAppStore must be used inside AppStoreProvider');
  return ctx;
}
