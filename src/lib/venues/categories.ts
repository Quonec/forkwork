/** Категории кухни для фильтра избранных заведений: ключи кухонь заведения (см. cuisine.ts) сводятся к нескольким понятным группам. */
export const CATEGORIES: { id: string; label: string; keys: string[] }[] = [
  { id: "russian", label: "Русская", keys: ["russian"] },
  { id: "european", label: "Европейская и французская", keys: ["european", "french", "mediterranean"] },
  { id: "italian", label: "Итальянская", keys: ["italian", "pizza"] },
  { id: "fish", label: "Рыба и морепродукты", keys: ["fish", "seafood"] },
  { id: "asian", label: "Азиатская", keys: ["asian", "korean", "japanese", "regional"] },
  { id: "steak", label: "Стейки и гриль", keys: ["steak_house", "grill"] },
];

export const categoriesOf = (keys: string[]): string[] => CATEGORIES.filter((c) => c.keys.some((k) => keys.includes(k))).map((c) => c.id);

/**
 * Популярные рубрики для всей базы заведений. Рубрика складывается из тегов кухни
 * OpenStreetMap (cuisine=…) и вида заведения: у кого тега нет, в рубрику не попадает.
 */
export const OSM_CATEGORIES: { id: string; label: string; tags: string[]; kinds?: string[] }[] = [
  { id: "coffee", label: "Кофейни и десерты", tags: ["coffee_shop", "tea", "bubble_tea", "cake", "donut", "dessert", "ice_cream", "pie", "crepe", "bakery"] },
  { id: "burger", label: "Бургеры и фастфуд", tags: ["burger", "chicken", "hot_dog", "sausage", "sandwich", "potato", "deli"] },
  { id: "pizza", label: "Пицца", tags: ["pizza", "italian_pizza"] },
  { id: "sushi", label: "Суши и японская", tags: ["sushi", "japanese", "ramen"] },
  { id: "italian", label: "Итальянская", tags: ["italian", "pasta"] },
  { id: "caucasian", label: "Грузинская и кавказская", tags: ["georgian", "caucasian", "armenian", "uzbek", "azerbaijani"] },
  { id: "shawarma", label: "Шаурма и кебаб", tags: ["shawarma", "kebab", "turkish"] },
  { id: "asian", label: "Азиатская", tags: ["asian", "chinese", "vietnamese", "korean", "thai", "indian", "noodle", "oriental"] },
  { id: "russian", label: "Русская и европейская", tags: ["russian", "ukrainian", "european", "german", "french", "greek", "jewish", "belgian", "mediterranean"] },
  { id: "seafood", label: "Рыба и морепродукты", tags: ["seafood", "fish"] },
  { id: "steak", label: "Стейки и гриль", tags: ["steak_house", "grill", "barbecue", "beef"] },
  { id: "bar", label: "Бары и пабы", tags: [], kinds: ["bar", "pub", "biergarten"] },
];
