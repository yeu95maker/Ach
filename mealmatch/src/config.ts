/**
 * Build-time configuration, read from `EXPO_PUBLIC_*` environment variables
 * (put them in `mealmatch/.env.local`, which is git-ignored). Note that
 * EXPO_PUBLIC_ values are bundled into the app, so for a public release move
 * paid API keys behind your own backend / proxy.
 */
export const config = {
  /** TheMealDB: "1" is the free test key for development. Use your supporter key for a public release. */
  mealDbApiKey: process.env.EXPO_PUBLIC_MEALDB_API_KEY || '1',
  mealDbEnabled: process.env.EXPO_PUBLIC_MEALDB_ENABLED !== 'false',
  /** Spoonacular is switched on automatically when a key is present. */
  spoonacularApiKey: process.env.EXPO_PUBLIC_SPOONACULAR_API_KEY || '',
  /** How many Spoonacular recipes to download per refresh (100 per request, roughly 7 API points each). */
  spoonacularMaxRecipes: Number(process.env.EXPO_PUBLIC_SPOONACULAR_MAX_RECIPES || 300),
  /** Re-download provider recipes after this many hours. */
  recipeCacheHours: Number(process.env.EXPO_PUBLIC_RECIPE_CACHE_HOURS || 72),
};
