import Anthropic from "@anthropic-ai/sdk";

import { buildWeek, mskDate, weekRangeUtc, weekStartOf } from "@/lib/scan/diary";
import { listDoneScansInRange } from "@/lib/scan/store";

import { analyzeWeek, buildInsights, buildTips, type Insight, type Tip, type WeekAnalysis } from "./analyze";
import { venueProvider } from "./data";

export type Advice = {
  analysis: WeekAnalysis;
  insights: Insight[];
  tips: Tip[];
  text: string;
  engine: "claude" | "heuristic";
};

function heuristicText(a: WeekAnalysis, tips: Tip[]): string {
  if (a.scans === 0) return "Дневник этой недели пуст. Отсканируйте несколько приёмов пищи, и я разберу вашу неделю. Меню заведений ниже открывается по ссылкам на их сайты.";
  const lead = a.flags.some((f) => f.endsWith("_low") || f.endsWith("_high"))
    ? "В недельном дневнике есть перекос в соотношении белков, жиров и углеводов."
    : "Соотношение белков, жиров и углеводов в дневнике в пределах ориентиров.";
  return `${lead} Открывайте меню заведений по ссылкам и ориентируйтесь на подсказки: ${tips.slice(0, 2).map((t) => t.title.toLowerCase()).join("; ")}. Это справочные ориентиры, а не медицинская рекомендация.`;
}

async function claudeText(a: WeekAnalysis, tips: Tip[], insights: Insight[]): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      system:
        "Ты — помощник по питанию в приложении ForkWork. Тебе дают сводку недельного дневника питания пользователя и список общих подсказок. Напиши по-русски 3–4 коротких предложения: что видно по неделе и на что обратить внимание, выбирая блюда в меню заведений (меню пользователь откроет сам по ссылкам). Используй только числа и подсказки из данных. Не называй конкретные блюда и заведения, не выдумывай калории. Не ставь диагнозов и не давай медицинских советов; подчеркни, что это справочные ориентиры. Тон дружелюбный, без восклицательных знаков.",
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            неделя: { дней_с_записями: a.daysLogged, приёмов_пищи: a.scans, ккал_в_день: a.avgKcalPerDay, доли_калорий_процент: a.shares && { белки: Math.round(a.shares.protein), жиры: Math.round(a.shares.fat), углеводы: Math.round(a.shares.carbs) }, приёмы_по_типам: a.meals },
            выводы: insights.map((i) => i.text),
            подсказки: tips.map((t) => `${t.title}: ${t.text}`),
            заведения_на_карте: venueProvider.listVenues().length,
          }),
        },
      ],
    });
    const block = response.content.find((b) => b.type === "text");
    return block && block.type === "text" ? block.text : null;
  } catch {
    return null;
  }
}

/** Разбор недельного дневника без обращения к ИИ: для подсказок и для диалога с помощником. */
export function analyzeFor(ownerId: number, weekParam?: string): { analysis: WeekAnalysis; insights: Insight[]; tips: Tip[] } {
  const weekStart = weekStartOf(weekParam ?? mskDate(new Date()));
  const { from, to } = weekRangeUtc(weekStart);
  const week = buildWeek(weekStart, listDoneScansInRange(ownerId, from.toISOString(), to.toISOString()));
  const analysis = analyzeWeek(week);
  return { analysis, insights: buildInsights(analysis), tips: buildTips(analysis) };
}

export async function buildAdvice(ownerId: number, weekParam?: string): Promise<Advice> {
  const { analysis, insights, tips } = analyzeFor(ownerId, weekParam);
  const ai = await claudeText(analysis, tips, insights);
  return { analysis, insights, tips, text: ai ?? heuristicText(analysis, tips), engine: ai ? "claude" : "heuristic" };
}
