import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtFC } from "@/lib/format";
import CartBadge from "./CartBadge";

const NAV = [
  { href: "/map", label: "Карта" },
  { href: "/streams", label: "Стримы" },
  { href: "/chefs", label: "Повара" },
  { href: "/recipes", label: "Рецепты" },
];

export default async function Header() {
  const user = await getSessionUser();
  const balance = user
    ? ((db.prepare("SELECT balance FROM wallets WHERE user_id = ?").get(user.id) as { balance: number } | undefined)
        ?.balance ?? 0)
    : 0;

  return (
    <header className="sticky top-0 z-[1100] border-b border-stone-200/80 bg-white/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="font-display flex h-9 w-9 items-center justify-center rounded-xl bg-yellow-400 text-base text-stone-950">
            FW
          </span>
          <span className="font-display text-lg tracking-tight">
            Fork<span className="text-orange-600">Work</span>
          </span>
        </Link>

        <nav className="ml-4 hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100 hover:text-stone-900"
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {user && (
            <Link
              href={user.role === "chef" ? "/kitchen?tab=wallet" : "/cabinet?tab=wallet"}
              className="chip hidden bg-stone-100 font-semibold text-stone-900 sm:inline-flex"
              title="Внутренний кошелёк"
            >
              {fmtFC(balance)}
            </Link>
          )}
          <CartBadge />
          {user ? (
            <details className="group relative">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-stone-100 [&::-webkit-details-marker]:hidden">
                <span className="font-display flex h-8 w-8 items-center justify-center rounded-full bg-stone-950 text-sm text-white">
                  {user.name.trim().charAt(0).toUpperCase()}
                </span>
                <span className="hidden max-w-[120px] truncate text-sm font-semibold sm:block">{user.name}</span>
              </summary>
              <div className="card absolute right-0 top-12 z-50 w-56 overflow-hidden p-1.5">
                <div className="border-b border-stone-100 px-3 py-2">
                  <p className="truncate text-sm font-semibold">{user.name}</p>
                  <p className="text-xs text-stone-500">
                    {user.role === "chef" ? "Повар" : user.role === "admin" ? "Администратор" : user.role === "manager" ? "Менеджер" : "Заказчик"}
                  </p>
                </div>
                <MenuLink href="/cabinet" label="Мой кабинет" />
                {user.role === "chef" && <MenuLink href="/kitchen" label="Поварской кабинет" />}
                {user.role === "manager" && <MenuLink href="/manager" label="Кабинет менеджера" />}
                {user.role === "admin" && <MenuLink href="/admin" label="Админ-панель" />}
                <MenuLink href="/chats" label="Личные чаты" />
                <a href="/api/auth/logout" className="block rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                  Выйти
                </a>
              </div>
            </details>
          ) : (
            <>
              <Link href="/login" className="btn-ghost">
                Войти
              </Link>
              <Link href="/register" className="btn-primary">
                Регистрация
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function MenuLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="block rounded-lg px-3 py-2 text-sm text-stone-700 hover:bg-stone-50">
      {label}
    </Link>
  );
}
