"use client";

export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="mt-5 flex items-center gap-3 rounded-lg bg-stone-100 px-4 transition-colors focus-within:bg-white focus-within:ring-2 focus-within:ring-stone-950">
      <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-stone-500" fill="none" stroke="currentColor" strokeWidth={2}>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" strokeLinecap="round" />
      </svg>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent py-3 text-sm outline-none placeholder:text-stone-500"
      />
      {value && (
        <button onClick={() => onChange("")} className="shrink-0 text-stone-400 hover:text-stone-600" title="Очистить">
          ✕
        </button>
      )}
    </label>
  );
}
