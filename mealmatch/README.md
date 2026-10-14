# MealMatch

Swipe-style recipe discovery app built with **Expo (SDK 57) + Expo Router + TypeScript**.
Runs on iOS, Android and the web from one codebase.

> Swipe. Save. Cook. — Discover recipes that match your taste, health goals and lifestyle.

## Run it

```bash
cd mealmatch
npm install
npx expo start        # then scan the QR code with Expo Go, or press i / a / w
```

| Command | What it does |
| --- | --- |
| `npm start` | Dev server (Expo Go, simulators, web) |
| `npm run web` | Run in the browser |
| `npm test` | Unit tests (Vitest) for filtering, classification, recommendations and state |
| `npm run typecheck` | TypeScript check |
| `npm run check` | Typecheck + tests |
| `npm run export:web` | Static web build in `dist/` |

## Features

- **Swipe deck**: drag a card right to save ❤️ or left to skip ✕, or use the buttons. ↩ undo brings the last card back.
- **Full recipe pages**: icon chips (meal time, diet, goals, budget, season), quick stats, ingredient list that
  rescales with a servings stepper, step-by-step method you can tick off, tips, nutrition per serving (incl. salt
  and a macro split), diet & allergen info, a 5-star rating that feeds recommendations, and a
  "How does this fit me?" check against your profile.
- **Saved recipes**: searchable list with category chips (High Protein, Vegan, …).
- **Healthy discovery**: goals (Healthy & Balanced, Weight Loss, High Protein, Quick & Easy, Low Carb, High Fibre)
  drive the ranking.
- **Dietary needs**: vegetarian, vegan, gluten-free, dairy-free, nut-free, egg-free, halal, kosher.
- **Allergies & exclusions**: 9 common allergens plus any free-text ingredient ("mushroom", "coriander").
- **Condition-aware filters**: heart, kidney, liver, diabetes and digestive-friendly, each with its nutrition thresholds
  shown in the app, and a medical disclaimer wherever they appear.
- **Search & filters**: text search across names, ingredients and cuisines; meal type, diet, condition, goal and
  "under 30 min" filters with a live result count.
- **Profile**: preferences, goals, allergies, conditions, stats, About page, reset.
- **820+ recipes**: 31 hand-written MealMatch originals (with nutrition) plus TheMealDB's ~790 recipes with photos,
  downloaded in the background and cached for offline use. Add a Spoonacular key for hundreds more with full nutrition.

## Recipe sources

| Source | Enabled | Nutrition | Notes |
| --- | --- | --- | --- |
| MealMatch originals (`src/data/sampleRecipes.ts`) | always | approx. per serving | Bundled, work offline |
| [TheMealDB](https://www.themealdb.com) | by default (free test key `1`) | – | ~790 recipes with photos. Use a supporter key for a public release. |
| [Spoonacular](https://spoonacular.com/food-api) | when `EXPO_PUBLIC_SPOONACULAR_API_KEY` is set | yes | Paid plans for real traffic; free tier ≈ 50 points/day |

Configure them in `mealmatch/.env.local` (see `.env.example`). Downloads happen in the background on launch and from
**Profile → Recipe library → Update**, and are cached on the device (`EXPO_PUBLIC_RECIPE_CACHE_HOURS`, default 72).
Every external recipe is credited on its page with a link to the original.

How imported recipes stay safe for the filters:

- Ingredient names are classified by `src/domain/ingredientFlags.ts` (dairy, gluten, pork, alcohol, …). Ambiguous
  names take the restrictive reading ("sausages" → pork, plain "stock" → meat), and provider data such as TheMealDB's
  category or Spoonacular's `glutenFree: false` can only add restrictions, never remove them.
- Recipes without nutrition data never match nutrition goals or health-condition filters, and recipes without a time
  never match "Under 30 min".
- `EXPO_PUBLIC_*` values are bundled into the app. Before a public release, move paid keys behind your own backend.

To add another provider, implement `RecipeSource` (`src/services/sources/types.ts`) and add it in
`configuredSources()` in `src/services/recipeRepository.ts`.

## How the app is structured

```
src/
  app/                      Expo Router screens (every file is a route)
    index.tsx               Welcome (redirects to Discover once onboarded)
    onboarding.tsx          First-run preferences
    (tabs)/discover.tsx     Swipe deck
    (tabs)/saved.tsx        Saved recipes
    (tabs)/filters.tsx      Search & filters
    (tabs)/profile.tsx      Profile & settings
    recipe/[id].tsx         Full recipe
    preferences.tsx         Edit preferences (modal, ?section=diets|goals|allergies|conditions)
    about.tsx               Key features + how condition labels work
  domain/                   Pure TypeScript – no React, fully unit-tested
    types.ts                Recipe, Ingredient, Nutrition, UserPreferences, …
    classify.ts             Derives diet / allergen / goal / condition tags from ingredients + nutrition
    filter.ts               Profile (hard constraints) + ad-hoc filters + search
    recommend.ts            Explainable ranking from goals and swipe history
    catalog.ts              Labels, icons and disclaimer text
    userData.ts             Persisted user data model + migrations
  data/sampleRecipes.ts     Bundled sample database
  services/                 Swappable boundaries
    recipeRepository.ts     Bundled recipes + downloaded providers, cached on device
    sources/                TheMealDB and Spoonacular adapters (map provider JSON → Recipe)
    userDataStore.ts        UserDataStore → LocalUserDataStore (AsyncStorage)
    auth.ts                 AuthService → GuestAuthService
  state/                    Reducer (pure) + React context that wires services together
  components/               SwipeDeck, PreferenceEditor, RecipeRow, UI primitives
```

### Tags are derived, never hand-written

A recipe only stores its ingredients (each with flags such as `dairy`, `gluten`, `pork`, `alcohol`) and its
nutrition. Every "Vegan", "Gluten-Free", "Halal", "High Protein" or "Heart Friendly" label is calculated in
`domain/classify.ts`. That means a badge can never contradict the ingredient list, and recipes from an API or added by
users get the same treatment automatically.

### Profile vs. filters

- **Profile** diets, allergies, exclusions and conditions are *hard constraints* – non-matching recipes are never shown.
  Profile goals are *soft* and only boost ranking.
- **Filters** (Search tab) narrow results further for the current session.

## Growing it: accounts, cloud sync, personalisation

The UI only talks to three interfaces, so each upgrade is a single new class:

1. **More recipe providers** – implement `RecipeSource` and register it in `configuredSources()`.
2. **Accounts** – implement `AuthService` (Supabase Auth, Firebase Auth, Sign in with Apple/Google). The rest of the app
   already keys data by `user.id`.
3. **Cloud sync** – implement `UserDataStore` against your backend. `UserData` is versioned and stamped with
   `updatedAt` for last-write-wins merging; the local store can stay as an offline cache.
4. **Personalised recommendations** – `rankRecipes()` is a pure function of (candidates, preferences, swipe history).
   Swap it for a server-side model; swipe events (`recipeId`, `action`, `at`) are already the training signal.

## Health & safety notes

- Condition-friendly labels use simple per-serving nutrition thresholds (listed on the About screen and in
  `CONDITION_CRITERIA`). They are general information, **not medical advice**, and every place they appear shows a
  disclaimer recommending a doctor or registered dietitian. Have the thresholds reviewed by a qualified clinician
  before a public launch.
- Sample nutrition values are approximate.
- Halal/kosher matching works at ingredient level (no pork, alcohol, shellfish, meat with dairy); users are reminded
  to use certified meat and products.
- Allergen labels come from the ingredient list; the app reminds users to check product labels.

## Photos

Recipes show an emoji on a tinted background. Add an `imageUrl` to any recipe (or have your API adapter provide one)
and the cards, list rows and recipe page will show the photo instead.
