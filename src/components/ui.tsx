import Link from "next/link";
import { gradientFor } from "@/lib/format";
import type { ReactNode } from "react";

export function Stars({ rating, size = "text-sm" }: { rating: number; size?: string }) {
  const full = Math.round(rating);
  return (
    <span className={`inline-flex items-center gap-0.5 ${size}`} title={`Рейтинг ${rating}`}>
      <span className="text-amber-500">{"★".repeat(Math.max(0, full))}</span>
      <span className="text-stone-300">{"★".repeat(Math.max(0, 5 - full))}</span>
      {rating > 0 && <span className="ml-1 font-semibold text-stone-700">{rating}</span>}
    </span>
  );
}

export function LiveBadge({ small = false }: { small?: boolean }) {
  return (
    <span className={`chip bg-red-600 text-white ${small ? "px-2 py-0.5 text-[10px]" : ""}`}>
      <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-white" />
      LIVE
    </span>
  );
}

export function Monogram({
  label,
  id,
  className = "",
  textSize = "text-5xl",
}: {
  label: string;
  id: number;
  className?: string;
  textSize?: string;
}) {
  const letter = (label.trim().charAt(0) || "F").toUpperCase();
  return (
    <div className={`flex items-center justify-center ${gradientFor(id)} ${className}`}>
      <span className={`font-display ${textSize} select-none leading-none text-stone-950/30`}>{letter}</span>
    </div>
  );
}

export function SectionTitle({
  title,
  subtitle,
  href,
  linkText,
}: {
  title: string;
  subtitle?: string;
  href?: string;
  linkText?: string;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-xl font-bold sm:text-2xl">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-stone-500">{subtitle}</p>}
      </div>
      {href && (
        <Link href={href} className="shrink-0 text-sm font-semibold text-orange-600 hover:text-orange-700">
          {linkText ?? "Все"} →
        </Link>
      )}
    </div>
  );
}

/** Дружелюбный «тупик»: понятное сообщение и кнопки выхода, чтобы пользователь
   никогда не застрял на странице без навигации (например, при нехватке прав). */
export function Stranded({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <div className="mx-auto h-px w-10 bg-stone-300" />
      <h1 className="mt-4 text-lg font-bold">{title}</h1>
      {hint && <p className="mt-2 text-sm text-stone-500">{hint}</p>}
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Link href="/" className="btn-secondary">На главную</Link>
        <Link href="/login" className="btn-primary">Сменить аккаунт</Link>
      </div>
    </div>
  );
}

export function Empty({ text, children }: { icon?: string; text: string; children?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
      <div className="h-px w-10 bg-stone-300" />
      <p className="text-sm text-stone-500">{text}</p>
      {children}
    </div>
  );
}
