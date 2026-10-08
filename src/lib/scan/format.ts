export const gFromMg = (mg: number): string => (Math.round(mg / 100) / 10).toLocaleString("ru-RU");

export const fmtTotal = (t: { kcal: number; proteinMg: number; fatMg: number; carbsMg: number }): string =>
  `≈${t.kcal} ккал · Б ${gFromMg(t.proteinMg)} · Ж ${gFromMg(t.fatMg)} · У ${gFromMg(t.carbsMg)}`;

const TZ = "Europe/Moscow";
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, day: "numeric", month: "long" });
const timeFmt = new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });

export const scanDayKey = (iso: string) => dayKeyFmt.format(new Date(iso));

export const scanDayLabel = (iso: string) => {
  const key = scanDayKey(iso);
  const now = new Date();
  if (key === dayKeyFmt.format(now)) return "Сегодня";
  if (key === dayKeyFmt.format(new Date(now.getTime() - 86_400_000))) return "Вчера";
  return dayFmt.format(new Date(iso));
};

export const scanTime = (iso: string) => timeFmt.format(new Date(iso));
export const scanDateTime = (iso: string) => `${dayFmt.format(new Date(iso))}, ${timeFmt.format(new Date(iso))}`;

export const SCAN_ERRORS: Record<string, string> = {
  NO_FOOD: "В кадре не видно еды — попробуйте другое фото",
  NOTHING_LABELLED: "Не удалось оценить блюда на фото — попробуйте другое фото",
  SCAN_FAILED: "Не получилось разобрать фото — попробуйте ещё раз",
  SCAN_DAILY_LIMIT: "Сегодня сканов больше нет — до завтра",
  PHOTO_INVALID: "Не получилось открыть фото — выберите другое",
  PHOTO_TOO_LARGE: "Фото слишком большое — выберите другое",
  PHOTO_REQUIRED: "Не получилось открыть фото — выберите другое",
  CONSENT_REQUIRED: "Нужно согласие на обработку фото",
  SCAN_UNAVAILABLE: "Сканер скоро",
};
