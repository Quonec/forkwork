/**
 * The stub recognizer's repertoire: ten curated plates of Russian home food.
 * Every dish name resolves through the reference table
 * (`@forkwork/nutrition-data` `searchFoodReference`) — the unit test proves
 * it — except «Соус сырный», which is absent on purpose and carries the
 * provider's own per-100 g estimate: it exercises the labeller's `ai` tier.
 *
 * The main dish comes first (confidence high); sides follow (medium). The
 * stub adds `bbox` per dish from the image hash (stub-provider.ts).
 *
 * Substitution against the spec's list: plate 9 was «Лагман» 400 г — the
 * table has no row for it (nor anything a fuzzy match reaches), so it is
 * «Харчо» 400 г, the closest dish the table knows: a thick, spiced meat soup
 * served in the same portion.
 */
import type { VisionDish } from "./vision-types";

export type StubPlate = { id: string; dishes: VisionDish[] };

const main = (name: string, grams: number): VisionDish => ({ name, grams, confidence: "high" });
const side = (name: string, grams: number): VisionDish => ({ name, grams, confidence: "medium" });

export const PLATES: readonly StubPlate[] = [
  { id: "plov", dishes: [main("Плов с мясом", 350)] },
  { id: "borscht", dishes: [main("Борщ", 350), side("Хлеб ржаной", 40), side("Сметана", 30)] },
  { id: "pelmeni", dishes: [main("Пельмени", 250), side("Сметана", 30)] },
  { id: "syrniki", dishes: [main("Сырники", 180), side("Сметана", 40)] },
  {
    id: "grechka",
    dishes: [
      main("Гречка", 200),
      side("Котлета", 100),
      {
        ...side("Соус сырный", 30),
        estimatePer100g: { kcal: 320, proteinMg: 6000, fatMg: 30000, carbsMg: 4000 },
      },
    ],
  },
  { id: "olivier", dishes: [main("Оливье", 250)] },
  { id: "shchi", dishes: [main("Щи", 350), side("Хлеб", 40)] },
  { id: "pirozhki", dishes: [main("Пирожки с капустой", 160)] },
  { id: "kharcho", dishes: [main("Харчо", 400)] },
  { id: "bliny", dishes: [main("Блины", 150), side("Сметана", 30)] },
];

/** Index into PLATES by id (the pinned fixtures name their plate). */
export function plateIndex(id: string): number {
  const i = PLATES.findIndex((p) => p.id === id);
  if (i === -1) throw new Error(`vision stub: no plate "${id}"`);
  return i;
}
