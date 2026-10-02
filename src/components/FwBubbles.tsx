/**
 * Фон заставки: россыпь кругов разного размера по образцу фирменного круга FW
 * (жёлтый круг с белым кольцом). Часть кругов с монограммой, часть пустые, часть контурные.
 * Расположение задано списком (без случайности), поэтому разметка на сервере и в браузере совпадает.
 * Круги плавно появляются и исчезают, каждый в своём ритме; анимация отключается у тех, кто просит меньше движения (см. globals.css).
 */
type Bubble = {
  /** Левая и верхняя точка в процентах окна. */
  x: number;
  y: number;
  /** Диаметр, px. */
  d: number;
  /** solid — жёлтый круг с кольцом, soft — бледно-жёлтый, ring — тонкий контур, ink — тёмный. */
  kind: "solid" | "soft" | "ring" | "ink";
  /** Подпись внутри (монограмма). */
  mark?: string;
  /** Длительность и сдвиг анимации, с. */
  t: number;
  delay: number;
};

export const BUBBLE_TOTAL = 26;

const BUBBLES: Bubble[] = [
  { x: 4, y: 6, d: 132, kind: "solid", mark: "FW", t: 9, delay: 0 },
  { x: 78, y: 3, d: 76, kind: "soft", t: 11, delay: 1.2 },
  { x: 90, y: 18, d: 28, kind: "solid", t: 7, delay: 0.4 },
  { x: 62, y: 9, d: 18, kind: "ink", t: 8, delay: 2 },
  { x: 36, y: 2, d: 44, kind: "ring", t: 10, delay: 0.8 },
  { x: 18, y: 30, d: 22, kind: "soft", t: 8, delay: 1.6 },
  { x: 2, y: 38, d: 64, kind: "ring", t: 12, delay: 0.3 },
  { x: 82, y: 34, d: 110, kind: "soft", mark: "FW", t: 10, delay: 2.4 },
  { x: 70, y: 52, d: 34, kind: "solid", t: 9, delay: 0.9 },
  { x: 8, y: 58, d: 96, kind: "solid", t: 11, delay: 1.8 },
  { x: 26, y: 50, d: 16, kind: "ink", t: 7, delay: 0.2 },
  { x: 92, y: 62, d: 52, kind: "ring", t: 10, delay: 1.1 },
  { x: 48, y: 70, d: 24, kind: "soft", t: 8, delay: 2.2 },
  { x: 14, y: 82, d: 38, kind: "solid", t: 9, delay: 0.6 },
  { x: 60, y: 84, d: 146, kind: "soft", mark: "FW", t: 12, delay: 0 },
  { x: 86, y: 86, d: 60, kind: "solid", t: 8, delay: 1.4 },
  { x: 34, y: 92, d: 20, kind: "ink", t: 9, delay: 0.7 },
  { x: 3, y: 94, d: 70, kind: "ring", t: 11, delay: 2.6 },
  { x: 52, y: 22, d: 14, kind: "solid", t: 7, delay: 1 },
  { x: 24, y: 14, d: 30, kind: "ring", t: 10, delay: 1.9 },
  { x: 96, y: 48, d: 20, kind: "soft", t: 8, delay: 0.5 },
  { x: 44, y: 46, d: 12, kind: "solid", t: 7, delay: 2.1 },
  { x: 74, y: 70, d: 18, kind: "ink", t: 9, delay: 1.3 },
  { x: 20, y: 68, d: 26, kind: "soft", t: 8, delay: 0.1 },
  { x: 56, y: 58, d: 40, kind: "ring", t: 11, delay: 1.5 },
  { x: 40, y: 80, d: 54, kind: "solid", t: 10, delay: 2.8 },
];

/** Тёмная заставка: круги как большой круг FW в её правой части (светлая заливка и тонкое кольцо) и жёлтые акценты. */
const STYLE_DARK: Record<Bubble["kind"], string> = {
  solid: "bg-yellow-400 ring-4 ring-white/15 text-stone-950",
  soft: "bg-white/5 ring-1 ring-white/10 text-yellow-300/70",
  ring: "border-2 border-yellow-400/60 bg-transparent text-yellow-300",
  ink: "bg-white/10 text-white",
};

const STYLE: Record<Bubble["kind"], string> = {
  solid: "bg-yellow-400 ring-4 ring-white shadow-md shadow-stone-950/10 text-stone-950",
  soft: "bg-yellow-300/50 ring-2 ring-white text-stone-950/70",
  ring: "border-2 border-yellow-400/70 bg-transparent text-yellow-500",
  ink: "bg-stone-950 text-white",
};

export type BubbleSettings = {
  /** Сколько кругов показывать, 0–26. */
  count: number;
  /** Скорость появления и исчезновения, 0,4–2,5 (1 — обычная). */
  speed: number;
  /** Яркость кругов, 0,2–1. */
  intensity: number;
  /** dark — для тёмной заставки на главной. */
  tone?: "light" | "dark";
};

export const DEFAULT_BUBBLES: BubbleSettings = { count: BUBBLE_TOTAL, speed: 1, intensity: 1 };

export default function FwBubbles({ count, speed, intensity, tone = "light" }: BubbleSettings) {
  const styles = tone === "dark" ? STYLE_DARK : STYLE;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden" style={{ opacity: intensity }}>
      {BUBBLES.slice(0, count).map((b, i) => (
        <span
          key={i}
          className={`fw-bubble absolute flex items-center justify-center rounded-full font-display font-bold ${styles[b.kind]}`}
          style={{
            left: `${b.x}%`,
            top: `${b.y}%`,
            width: b.d,
            height: b.d,
            fontSize: b.d * 0.32,
            animationDuration: `${(b.t + 3) / speed}s`,
            animationDelay: `-${b.delay}s`,
          }}
        >
          {b.mark}
        </span>
      ))}
    </div>
  );
}
