import type { IngredientFlag } from './types';

/**
 * Infers allergen / diet flags from a free-text ingredient name, for recipes
 * imported from providers that don't tag ingredients themselves.
 *
 * It is deliberately conservative: when a name is ambiguous ("sausages",
 * "stock", "gelatine") it assumes the restrictive reading, so a recipe is
 * more likely to be hidden from a vegetarian / halal / allergy profile than
 * wrongly shown. Anything matched by `unless` is exempt from that rule.
 */
interface Rule {
  flag: IngredientFlag;
  match: RegExp;
  unless?: RegExp;
}

const w = (words: string) => new RegExp(`\\b(?:${words})\\b`, 'i');

const RULES: Rule[] = [
  // ---- Pork & pork products (ambiguous sausages assumed pork) ----
  {
    flag: 'pork',
    match: w(
      'pork|bacon|lardons?|lard|ham|hams|prosciutto|pancetta|parma ham|jam[oó]n|serrano|chorizo|salami|pepperoni|sausages?|kielbasa|kabanos|morcilla|black pudding|pigs?|trotters?|gelatine?|gelatin|guanciale|speck|mortadella',
    ),
    unless: w('turkey ham|turkey sausages?|chicken sausages?|vegan|vegetarian|plant[- ]based|veggie|hamburger'),
  },
  // ---- Red meat ----
  {
    flag: 'meat',
    match: w(
      'beef|steak|steaks|brisket|mince|minced|veal|lamb|mutton|goat|oxtail|venison|corned beef|doner|shredded meat|meat|kidneys?|chuck|sirloin|tenderloin|fillet of steak|suet|bone broth|beef stock|lamb stock|gravy|stock|stock cubes?|bouillon|frogs? legs|rabbit|cutlet|shank|shanks|mincemeat',
    ),
    unless: w(
      'kidney beans?|vegetable stock|veg stock|vegetable bouillon|vegan|vegetarian|plant[- ]based|veggie|chicken stock|chicken bouillon|fish stock|seafood stock|shrimp stock|mushroom stock|minced garlic|minced ginger|minced onion|pork tenderloin|beef tomatoes?|coconut meat|stock ?pot',
    ),
  },
  // ---- Poultry ----
  {
    flag: 'poultry',
    match: w('chicken|turkey|duck|goose|poussin|quail|chicken stock|chicken bouillon|chicken liver'),
    unless: w('chickpeas?|chick peas?|vegan|vegetarian|plant[- ]based|turkish|chicken of the woods|duck sauce'),
  },
  // ---- Fish ----
  {
    flag: 'fish',
    match: w(
      'fish|salmon|cod|codfish|tuna|haddock|hake|trout|sardines?|mackerel|herring|anchov(?:y|ies)|barramundi|snapper|sea ?bass|monkfish|pilchards?|tilapia|halibut|sole|plaice|pollock|swordfish|eel|bream|carp|catfish|worcestershire|prahok|bonito|dashi|caviar|roe',
    ),
    unless: w('vegan|vegetarian|fish-free|fishless|plant[- ]based|seafood mix'),
  },
  // ---- Shellfish ----
  {
    flag: 'shellfish',
    match: w(
      'prawns?|shrimps?|crabs?|crab meat|crab meay|lobsters?|mussels?|clams?|oysters?|oyster sauce|squid|calamari|scallops?|conchs?|langoustines?|crayfish|seafood|shrimp paste|cockles?|octopus',
    ),
    unless: w('oyster mushrooms?|vegan|vegetarian|plant[- ]based'),
  },
  // ---- Dairy ----
  {
    flag: 'dairy',
    match: w(
      'milk|butter|buttermilk|cream|creams|cheese|cheeses|yogh?urts?|cr[eè]me fra[iî]che|ghee|mascarpone|ricotta|paneer|quark|feta|parmesan|parmigiano(?:-reggiano)?|mozzarella|cheddar|gruy[eè]re|brie|stilton|gouda|pecorino|manchego|emmentaler?|bryndza|halloumi|camembert|fromage frais|curds?|custard|condensed milk|evaporated milk|malai|whey|dulce de leche|milk chocolate|white chocolate|ice cream|queso fresco|panquehue|v[äa]sterbottensost|kefir|labneh|skyr',
    ),
    unless: w(
      'coconut milk|coconut cream|almond milk|soya milk|soy milk|oat milk|rice milk|vegetable millk|vegetable milk|cashew milk|plant milk|peanut butter|almond butter|cashew butter|nut butter|vegan butter|vegan cheese|cocoa butter|butter beans?|butternut|butternut squash|cream of tartar|coconut yogh?urt|vegan|dairy[- ]free|plant[- ]based|cream crackers|bean curds?',
    ),
  },
  // ---- Eggs ----
  {
    flag: 'egg',
    match: w('eggs?|egg yolks?|egg whites?|egg wash|mayonnaise|mayo|meringues?|meringue nests|a[iï]oli|egg noodles|egg roll wrappers|egg rolls'),
    unless: w('eggplants?|egg plants|flax eggs?|vegan|egg[- ]free|chia eggs?'),
  },
  // ---- Gluten (wheat, barley, rye) ----
  {
    flag: 'gluten',
    match: w(
      'flour|bread|breads|breadcrumbs|bun|buns|rolls|toast|baguette|ciabatta|pita|naan|tortillas?|wraps?|crackers?|biscuits?|cookies|digestive|graham|pretzels?|pastry|filo|phyllo|puff pastry|shortcrust|pasta|spaghetti|macaroni|linguine|fettuccine|lasagne|lasagna|penne|rigatoni|farfalle|paccheri|tagliatelle|vermicelli pasta|bowtie pasta|orzo|noodles|udon|ramen|couscous|bulgur|bulgar|semolina|freekeh|barley|rye|wheat|spelt|seitan|soy sauce|dark soy sauce|teriyaki|hoisin|beer|stout|ale|malt|malt vinegar|wonton|wrappers|dumpling wrappers|muffins|croutons|stuffing|self[- ]raising|mars bar|rice krispies|oreo|maria cookies|grape nut|christmas pudding|khus khus|sevaiiya|knafeh|seasoned flour',
    ),
    unless: w(
      'gluten[- ]free|rice flour|cassava flour|chickpea flour|gram flour|almond flour|coconut flour|potato flour|buckwheat flour|corn flour|cornflour|tapioca flour|sorghum flour|teff flour|rice noodles|rice stick noodles|rice vermicelli|vermicelli rice noodles|brown rice noodles?|flat rice noodles|glass noodles|soba noodles 100|corn tortillas?|rice paper|tamari|banana bread|sweet potato noodles|rice flour pancakes|bread fruit|breadfruit|ginger beer|root beer|cabbage rolls',
    ),
  },
  // ---- Peanuts ----
  { flag: 'peanut', match: w('peanuts?|peanut butter|peanut oil|groundnuts?|ground nut oil|satay|peanut brittle|peanut cookies') },
  // ---- Tree nuts ----
  {
    flag: 'tree-nut',
    match: w(
      'almonds?|almond milk|almond extract|almond essence|almond paste|almond flour|ground almonds|flaked almonds|walnuts?|cashews?|cashew nuts|pecans?|pecan nuts|pistachios?|pistachio paste|hazelnuts?|hazlenuts|pine nuts|macadamias?|brazil nuts?|chestnuts?|marzipan|praline|nougat|nougatine|nutella|frangipane|amaretto|mixed nuts|nuts',
    ),
    unless: w('water chestnuts?|nutmeg|butternut|coconut|doughnuts?|donuts?|pine nut free|nut[- ]free|chestnut mushrooms?|peanuts?|ground ?nuts?'),
  },
  // ---- Soy ----
  {
    flag: 'soy',
    match: w(
      'soy|soya|soy sauce|soya bean|soybeans?|tofu|bean curds?|tempeh|edamame|miso|tamari|doubanjiang|chilli bean paste|fermented black beans|hoisin|teriyaki|textured vegetable protein|tvp|soy chunks|silken tofu',
    ),
  },
  // ---- Sesame ----
  { flag: 'sesame', match: w('sesame|sesame seeds?|sesame oil|sesame seed oil|tahini|tahini paste|hummus|houmous|halva|za.?atar|chinese sesame sauce|sesame seed burger buns') },
  // ---- Alcohol ----
  {
    flag: 'alcohol',
    match: w(
      'wine|wines|beer|stout|ale|lager|cider|brandy|cognac|rum|sherry|vodka|whisky|whiskey|bourbon|gin|tequila|liqueur|grand marnier|cointreau|kirsch|amaretto|marsala|port|vermouth|sake|mirin|shaoxing|rice wine|cooking wine|baileys|kahlua|calvados|schnapps|prosecco|champagne',
    ),
    unless: w('wine vinegar|red wine vinegar|white wine vinegar|rice wine vinegar|sherry vinegar|cider vinegar|apple cider vinegar|ginger beer|root beer|non[- ]alcoholic|alcohol[- ]free|ginger ale|port salut'),
  },
  // ---- Honey ----
  { flag: 'honey', match: w('honey|clear honey|honeycomb'), unless: w('honeydew|honey ?nut squash') },
];

/** Removes exempt phrases first, so "peanut butter" can't also count as "butter". */
function stripExempt(name: string, unless?: RegExp): string {
  if (!unless) return name;
  const global = new RegExp(unless.source, 'gi');
  return name.replace(global, ' ');
}

export function inferIngredientFlags(name: string): IngredientFlag[] {
  const text = name.toLowerCase();
  const flags = new Set<IngredientFlag>();
  for (const rule of RULES) {
    if (rule.match.test(stripExempt(text, rule.unless))) flags.add(rule.flag);
  }
  // Gluten-free soy sauce and similar.
  if (/\bgluten[- ]free\b/i.test(text)) flags.delete('gluten');
  return [...flags];
}
