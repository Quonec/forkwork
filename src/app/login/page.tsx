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
    router.push(data.onboarded ? home : "/onboarding");
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

      <div className="card mt-4 p-4">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-stone-400">Быстрый вход</p>
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
    </div>
  );
}
