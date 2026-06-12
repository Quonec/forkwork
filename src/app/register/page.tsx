"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [role, setRole] = useState<"customer" | "chef">(params.get("role") === "chef" ? "chef" : "customer");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, role, specialization }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Ошибка регистрации");
    router.push("/onboarding");
    router.refresh();
  };

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <h1 className="text-2xl font-extrabold">Регистрация</h1>
      <p className="mt-1 text-sm text-stone-500">Выберите роль — у каждой свой кабинет и сценарий работы.</p>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <button
          onClick={() => setRole("customer")}
          className={`card p-4 text-left transition-all ${role === "customer" ? "ring-2 ring-orange-500" : "hover:ring-stone-300"}`}
        >
          <div className="text-2xl">🙂</div>
          <p className="mt-2 font-bold">Заказчик</p>
          <p className="mt-0.5 text-xs text-stone-500">Смотрю, заказываю, оцениваю</p>
        </button>
        <button
          onClick={() => setRole("chef")}
          className={`card p-4 text-left transition-all ${role === "chef" ? "ring-2 ring-orange-500" : "hover:ring-stone-300"}`}
        >
          <div className="text-2xl">👨‍🍳</div>
          <p className="mt-2 font-bold">Повар</p>
          <p className="mt-0.5 text-xs text-stone-500">Готовлю, стримлю, продаю</p>
        </button>
      </div>

      <form onSubmit={submit} className="card mt-4 space-y-4 p-6">
        <div>
          <label className="label">Имя или псевдоним</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Как к вам обращаться" required />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
        </div>
        <div>
          <label className="label">Пароль (от 6 символов)</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        </div>
        {role === "chef" && (
          <div>
            <label className="label">Специализация</label>
            <input className="input" value={specialization} onChange={(e) => setSpecialization(e.target.value)} placeholder="Например: неаполитанская пицца" />
          </div>
        )}
        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? "Создаём аккаунт…" : role === "chef" ? "Зарегистрироваться как повар" : "Зарегистрироваться"}
        </button>
        <p className="text-center text-xs text-stone-400">
          Регистрируясь, вы соглашаетесь с правилами публикации и общения. Новичкам — 500 FC в подарок 🎁
        </p>
        <p className="text-center text-sm text-stone-500">
          Уже с нами?{" "}
          <Link href="/login" className="font-semibold text-orange-600">
            Войти
          </Link>
        </p>
      </form>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
