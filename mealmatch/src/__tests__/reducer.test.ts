import { describe, expect, it } from 'vitest';

import { DEFAULT_USER_DATA, migrate } from '@/domain/userData';
import { reducer } from '@/state/reducer';

const swipe = (recipeId: string, action: 'save' | 'skip') => ({ type: 'swipe' as const, recipeId, action, at: 1 });

describe('reducer', () => {
  it('saves on right swipe and records history', () => {
    const s = reducer(DEFAULT_USER_DATA, swipe('a', 'save'));
    expect(s.saved).toEqual(['a']);
    expect(s.history.map((h) => h.recipeId)).toEqual(['a']);
  });

  it('undo reverts the last swipe, including the save', () => {
    let s = reducer(DEFAULT_USER_DATA, swipe('a', 'skip'));
    s = reducer(s, swipe('b', 'save'));
    s = reducer(s, { type: 'undo' });
    expect(s.saved).toEqual([]);
    expect(s.history.map((h) => h.recipeId)).toEqual(['a']);
    s = reducer(s, { type: 'undo' });
    expect(s.history).toEqual([]);
    expect(reducer(s, { type: 'undo' })).toBe(s);
  });

  it('un-saving a swiped recipe turns its like into a skip', () => {
    let s = reducer(DEFAULT_USER_DATA, swipe('a', 'save'));
    s = reducer(s, { type: 'toggleSaved', recipeId: 'a' });
    expect(s.saved).toEqual([]);
    expect(s.history[0].action).toBe('skip');
    s = reducer(s, { type: 'toggleSaved', recipeId: 'a' });
    expect(s.saved).toEqual(['a']);
  });

  it('resetSkipped keeps saves only', () => {
    let s = reducer(DEFAULT_USER_DATA, swipe('a', 'skip'));
    s = reducer(s, swipe('b', 'save'));
    s = reducer(s, { type: 'resetSkipped' });
    expect(s.history.map((h) => h.recipeId)).toEqual(['b']);
  });

  it('stamps updatedAt on changes', () => {
    const s = reducer(DEFAULT_USER_DATA, { type: 'completeOnboarding' });
    expect(s.onboarded).toBe(true);
    expect(s.updatedAt).toBeGreaterThan(0);
  });

  it('migrate fills missing fields from older saves', () => {
    const m = migrate({ saved: ['x'], preferences: { diets: ['vegan'] } as never });
    expect(m.saved).toEqual(['x']);
    expect(m.preferences.diets).toEqual(['vegan']);
    expect(m.preferences.allergens).toEqual([]);
    expect(m.filters.query).toBe('');
  });
});
