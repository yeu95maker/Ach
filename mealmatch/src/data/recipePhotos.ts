import type { ImageSourcePropType } from 'react-native';

/**
 * Photos bundled with the app, keyed by recipe id. Recipes without an entry
 * (and without an `imageUrl`) fall back to their emoji on a tinted background.
 * To add one: drop `assets/recipes/<recipe-id>.jpg` (≈720×900) and add a line here.
 */
export const RECIPE_PHOTOS: Record<string, ImageSourcePropType> = {
  'lemon-herb-salmon-bowl': require('../../assets/recipes/lemon-herb-salmon-bowl.jpg'),
  'chickpea-avocado-salad': require('../../assets/recipes/chickpea-avocado-salad.jpg'),
  'turkey-veggie-stir-fry': require('../../assets/recipes/turkey-veggie-stir-fry.jpg'),
  'banana-oat-pancakes': require('../../assets/recipes/banana-oat-pancakes.jpg'),
  'red-lentil-tomato-soup': require('../../assets/recipes/red-lentil-tomato-soup.jpg'),
  'greek-yogurt-berry-parfait': require('../../assets/recipes/greek-yogurt-berry-parfait.jpg'),
  'chicken-shawarma-bowl': require('../../assets/recipes/chicken-shawarma-bowl.jpg'),
  'black-bean-tacos': require('../../assets/recipes/black-bean-tacos.jpg'),
  'garlic-shrimp-zoodles': require('../../assets/recipes/garlic-shrimp-zoodles.jpg'),
};
