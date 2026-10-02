"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const DEMO = [
  ["user@forkwork.ru", "user123", "Заказчик Аня"],
  ["chef@forkwork.ru", "chef123", "Повар Марко"],
  ["manager@forkwork.ru", "manager123", "Менеджер Ольга"],
  ["admin@forkwork.ru", "admin123", "Администратор"],
];

/** Демо-аккаунты показываются в разработке и в продакшене только при NEXT_PUBLIC_SHOW_DEMO=1. */
const SHOW_DEMO = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_SHOW_DEMO === "1";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (em: string, pw: string) => {
    setBusy(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: em, password: pw }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Ошибка входа");
    const home = data.role === "chef" ? "/kitchen" : data.role === "admin" ? "/admin" : data.role === "manager" ? "/manager" : "/map";
    const next = new URLSearchParams(window.location.search).get("next");
    const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
    router.push(data.onboarded ? (safeNext ?? home) : "/onboarding");
    router.refresh();
  };

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-14">
      <h1 className="text-2xl font-extrabold">Вход в ForkWork</h1>
      <p className="mt-1 text-sm text-stone-500">Рады видеть снова! На кухне всё готово.</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(email, password);
        }}
        className="card mt-6 space-y-4 p-6"
      >
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
        </div>
        <div>
          <label className="label">Пароль</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••" required />
        </div>
        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? "Входим…" : "Войти"}
        </button>
        <p className="text-center text-sm text-stone-500">
          Нет аккаунта?{" "}
          <Link href="/register" className="font-semibold text-orange-600">
            Зарегистрироваться
          </Link>
        </p>
      </form>

      {SHOW_DEMO && (
        <details className="group mt-16 text-center">
          <summary
            className="mx-auto flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-full text-stone-500 opacity-30 transition-opacity hover:opacity-70 group-open:opacity-70 [&::-webkit-details-marker]:hidden"
            aria-label="Демо-аккаунты"
            title="Демо-аккаунты"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="8" cy="15" r="4" />
              <path d="M10.8 12.2 20 3M16 7l3 3M14 9l2 2" />
            </svg>
          </summary>
          <div className="card mt-3 p-4 text-left">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-stone-400">Демо-аккаунты</p>
            <div className="space-y-1.5">
              {DEMO.map(([em, pw, label]) => (
                <button
                  key={em}
                  onClick={() => submit(em, pw)}
                  disabled={busy}
                  className="flex w-full items-center justify-between rounded-xl bg-stone-50 px-3 py-2 text-sm hover:bg-orange-50"
                >
                  <span>{label}</span>
                  <span className="text-xs text-stone-400">{em}</span>
                </button>
              ))}
            </div>
          </div>
        </details>
      )}
    </div>
  );
}
