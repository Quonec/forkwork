// Форматирование и мелкие утилиты (безопасно для клиента)

export const fmtFC = (n: number) => `${n.toLocaleString("ru-RU")} FC`;

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function timeAgo(iso: string): string {
  const sec = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return "только что";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} мин назад`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ч назад`;
  const d = Math.floor(h / 24);
  return `${d} дн назад`;
}

export const PRICE_LEVELS = ["", "₽", "₽₽", "₽₽₽"];
export const DIFFICULTY_RU = ["", "Легко", "Средне", "Сложно"];

const GRADIENTS = [
  "from-orange-100 to-amber-50",
  "from-rose-100 to-orange-50",
  "from-lime-100 to-emerald-50",
  "from-sky-100 to-cyan-50",
  "from-violet-100 to-fuchsia-50",
  "from-yellow-100 to-orange-50",
];

export const gradientFor = (id: number) => GRADIENTS[id % GRADIENTS.length];

export const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};
