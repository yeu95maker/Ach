import { inferIngredientFlags } from '@/domain/ingredientFlags';
import type { Difficulty, IngredientFlag, MealType, Recipe } from '@/domain/types';

import raw from './wikibooks.json';

/**
 * Recipes from the Wikibooks Cookbook (en.wikibooks.org), bundled for offline
 * use. Text © Wikibooks contributors, licensed CC BY-SA 4.0; the ingredient
 * lists and steps were extracted and reformatted from the original pages,
 * which each recipe links to.
 */
export interface WikibooksRecord {
  /** Page title. */
  t: string;
  /** Page URL. */
  u: string;
  /** Wikibooks category, e.g. "Soup recipes". */
  c: string;
  /** Cuisine, or '' when unknown. */
  cu: string;
  m: MealType[];
  s: number | null;
  /** Total time in minutes. */
  r: number | null;
  d: Difficulty | null;
  /** [amount, name] pairs. */
  i: [string | null, string][];
  p: string[];
  k: string[];
}

export const WIKIBOOKS_LICENSE = { name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' };

const CATEGORY_FLAGS: [RegExp, IngredientFlag[]][] = [
  [/chicken|poultry|turkey|duck/i, ['poultry']],
  [/\bpork\b|\bham\b|bacon/i, ['pork']],
  [/beef|\bmeat\b|lamb|mutton|goat|veal|game/i, ['meat']],
  [/seafood|shellfish|shrimp|prawn|crab|lobster/i, ['shellfish']],
  [/\bfish\b|salmon|tuna|cod\b/i, ['fish']],
];

const EMOJI: [RegExp, string][] = [
  [/soup|stew|chowder|curry/i, '🍲'],
  [/salad/i, '🥗'],
  [/cake|cupcake/i, '🍰'],
  [/cookie|biscuit/i, '🍪'],
  [/pie|tart|pastr/i, '🥧'],
  [/bread|bun|roll/i, '🍞'],
  [/pancake|waffle|crepe/i, '🥞'],
  [/dessert|pudding|sweet|confection|candy|ice cream/i, '🍮'],
  [/pasta|noodle|spaghetti/i, '🍝'],
  [/rice|risotto|pilaf/i, '🍚'],
  [/chicken|poultry|turkey/i, '🍗'],
  [/beef|meat|lamb|pork|steak/i, '🥩'],
  [/fish|seafood|shrimp|prawn/i, '🐟'],
  [/egg|omelet/i, '🍳'],
  [/sandwich|burger/i, '🥪'],
  [/beverage|drink|smoothie|tea|juice|lassi/i, '🥤'],
  [/bean|lentil|chickpea|dal|dhal/i, '🫘'],
  [/potato/i, '🥔'],
  [/vegetable|vegan|vegetarian|cabbage/i, '🥦'],
];

const TINTS = ['#EFE6DA', '#E6EEE0', '#F3E3DC', '#E4EAF2', '#F1ECD8', '#ECE4F0'];

function hash(s: string): number {
  let h = 0;
  for (let k = 0; k < s.length; k++) h = (h * 31 + s.charCodeAt(k)) | 0;
  return Math.abs(h);
}

export function slug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function mapWikibooksRecord(w: WikibooksRecord): Recipe {
  const label = `${w.t} ${w.c}`;
  const flags = new Set<IngredientFlag>(inferIngredientFlags(w.t));
  for (const [re, fs] of CATEGORY_FLAGS) if (re.test(w.c)) fs.forEach((f) => flags.add(f));
  const cuisine = w.cu || 'International';
  const category = w.c.replace(/\s*recipes?$/i, '').replace(/^Recipes for\s+/i, '');
  return {
    id: `wikibooks-${slug(w.t)}`,
    name: w.t,
    subtitle: category && category.toLowerCase() !== cuisine.toLowerCase() ? `${cuisine} · ${category}` : cuisine,
    description: '',
    emoji: EMOJI.find(([re]) => re.test(label))?.[1] ?? '🍽️',
    tint: TINTS[hash(w.t) % TINTS.length],
    cuisine,
    mealTypes: w.m,
    readyInMinutes: w.r ?? undefined,
    servings: w.s ?? undefined,
    difficulty: w.d ?? undefined,
    ingredients: w.i.map(([amount, name]) => ({ amount: amount ?? undefined, name, flags: inferIngredientFlags(name) })),
    steps: w.p,
    tips: w.k.length ? w.k : undefined,
    flags: flags.size ? [...flags] : undefined,
    source: 'api',
    attribution: {
      provider: 'Wikibooks Cookbook',
      providerUrl: 'https://en.wikibooks.org/wiki/Cookbook:Table_of_Contents',
      originalUrl: w.u,
      license: WIKIBOOKS_LICENSE,
    },
  };
}

export const WIKIBOOKS_RECIPES: Recipe[] = (raw as WikibooksRecord[]).map(mapWikibooksRecord);
