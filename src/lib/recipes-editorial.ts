/**
 * Рецепты из открытых источников: известные повара, повара ресторанов топа Москвы, блюда из кино
 * и игр, трендовые рецепты. Данные лежат в seed/recipes/editorial.json. Это пересказ своими
 * словами: состав и пропорции взяты со страницы источника, у каждого рецепта ссылка на неё.
 * Только на сервере: читает файл.
 */
import fs from "node:fs";
import path from "node:path";

export type EditorialCategory = "famous" | "top" | "media" | "trend";

export type EditorialRecipe = {
  slug: string;
  category: EditorialCategory;
  title: string;
  author: string;
  authorNote?: string;
  /** Откуда блюдо (фильм, игра). */
  from?: string;
  /** Заведение из топа Москвы, если автор оттуда. */
  venueId?: string;
  timeMin: number | null;
  /** 1 — легко, 2 — средне, 3 — сложно; оценка ForkWork, не источника. */
  difficulty: number;
  servings?: string;
  description: string;
  ingredients: string[];
  steps: string[];
  /** Шаги источника прочитать не удалось: показываем только состав и ссылку. */
  partial?: boolean;
  tags: string;
  note?: string;
  source: { name: string; url: string };
};

export const EDITORIAL_CATEGORIES: { id: EditorialCategory; label: string }[] = [
  { id: "famous", label: "Известные повара" },
  { id: "top", label: "Повара из топа Москвы" },
  { id: "media", label: "Из кино и игр" },
  { id: "trend", label: "Трендовые" },
];

export const editorialLabel = (c: EditorialCategory): string => EDITORIAL_CATEGORIES.find((x) => x.id === c)?.label ?? "";

const FILE = path.join(process.cwd(), "seed", "recipes", "editorial.json");

export function listEditorial(): EditorialRecipe[] {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8")) as EditorialRecipe[];
  } catch {
    return [];
  }
}

export const getEditorial = (slug: string): EditorialRecipe | undefined => listEditorial().find((r) => r.slug === slug);
