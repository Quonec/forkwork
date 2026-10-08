import type { ReactNode } from "react";

const CORNER = "absolute h-8 w-8 border-orange-500";

/** Четыре угловые скобки видоискателя внутри `relative`-блока. */
export function LensBrackets() {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-3 z-10">
      <span className={`${CORNER} left-0 top-0 rounded-tl-md border-l-2 border-t-2`} />
      <span className={`${CORNER} right-0 top-0 rounded-tr-md border-r-2 border-t-2`} />
      <span className={`${CORNER} bottom-0 left-0 rounded-bl-md border-b-2 border-l-2`} />
      <span className={`${CORNER} bottom-0 right-0 rounded-br-md border-b-2 border-r-2`} />
    </span>
  );
}

/** Видоискатель: у веба нет живого превью, поэтому в рамке подсказка. */
export function LensFrame({ children }: { children?: ReactNode }) {
  return (
    <div className="relative flex aspect-[4/5] max-h-[52dvh] w-full items-center justify-center overflow-hidden rounded-2xl bg-orange-100 ring-1 ring-orange-300">
      <LensBrackets />
      {children}
    </div>
  );
}

export function LensMessage({ title, hint }: { title?: string; hint: string }) {
  return (
    <div className="flex max-w-xs flex-col items-center gap-3 px-8 text-center">
      <svg viewBox="0 0 120 80" aria-hidden="true" className="mb-2 h-24 w-36 text-orange-400" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="60" cy="40" r="30" />
        <circle cx="60" cy="40" r="20" className="text-orange-300" />
        <circle cx="60" cy="40" r="6" fill="currentColor" className="text-orange-300" stroke="none" />
        <path d="M16 12v16M12 12v10a4 4 0 0 0 8 0V12M16 28v40" />
        <path d="M104 12c-5 4-6 14-4 24h4V12ZM104 36v32" />
      </svg>
      {title && <p className="font-display text-xl text-orange-950">{title}</p>}
      <p className="text-sm text-orange-800">{hint}</p>
    </div>
  );
}
