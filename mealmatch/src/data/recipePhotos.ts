import type { ImageSourcePropType } from 'react-native';

/**
 * Photos bundled with the app, keyed by recipe id. Recipes without an entry
 * (and without an `imageUrl`) fall back to their emoji on a tinted background.
 * To add one: drop `assets/recipes/<recipe-id>.jpg` (≈720×900) and add a line here.
 */
export const RECIPE_PHOTOS: Record<string, ImageSourcePropType> = {
  'baked-cod-herbed-rice': require('../../assets/recipes/baked-cod-herbed-rice.jpg'),
  'banana-oat-pancakes': require('../../assets/recipes/banana-oat-pancakes.jpg'),
  'beef-and-broccoli': require('../../assets/recipes/beef-and-broccoli.jpg'),
  'black-bean-tacos': require('../../assets/recipes/black-bean-tacos.jpg'),
  'chicken-shawarma-bowl': require('../../assets/recipes/chicken-shawarma-bowl.jpg'),
  'chickpea-avocado-salad': require('../../assets/recipes/chickpea-avocado-salad.jpg'),
  'garlic-shrimp-zoodles': require('../../assets/recipes/garlic-shrimp-zoodles.jpg'),
  'greek-yogurt-berry-parfait': require('../../assets/recipes/greek-yogurt-berry-parfait.jpg'),
  'herb-chicken-rice-cabbage': require('../../assets/recipes/herb-chicken-rice-cabbage.jpg'),
  'lemon-herb-salmon-bowl': require('../../assets/recipes/lemon-herb-salmon-bowl.jpg'),
  'mediterranean-quinoa-salad': require('../../assets/recipes/mediterranean-quinoa-salad.jpg'),
  'overnight-chia-oats': require('../../assets/recipes/overnight-chia-oats.jpg'),
  'pasta-primavera': require('../../assets/recipes/pasta-primavera.jpg'),
  'peanut-noodle-bowl': require('../../assets/recipes/peanut-noodle-bowl.jpg'),
  'red-lentil-tomato-soup': require('../../assets/recipes/red-lentil-tomato-soup.jpg'),
  'spinach-feta-omelette': require('../../assets/recipes/spinach-feta-omelette.jpg'),
  'tofu-veggie-fried-rice': require('../../assets/recipes/tofu-veggie-fried-rice.jpg'),
  'turkey-meatballs-marinara': require('../../assets/recipes/turkey-meatballs-marinara.jpg'),
  'turkey-veggie-stir-fry': require('../../assets/recipes/turkey-veggie-stir-fry.jpg'),
};
