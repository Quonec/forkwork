import Link from "next/link";
import FaqList from "./FaqList";

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-stone-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-display flex h-8 w-8 items-center justify-center rounded-xl bg-yellow-400 text-sm text-stone-950">
              FW
            </span>
            <span className="font-display">
              Fork<span className="text-orange-600">Work</span>
            </span>
          </div>
          <p className="mt-3 text-sm text-stone-500">
            Foodtech-платформа, соединяющая поваров и горожан: стримы, заказы, рецепты и живое общение.
          </p>
        </div>
        <FooterCol
          title="Платформа"
          links={[
            ["/map", "Карта поваров"],
            ["/streams", "Live-стримы"],
            ["/recipes", "Рецепты"],
            ["/chefs", "Все повара"],
            ["/venues", "Заведения"],
            ["/scan", "Сканер блюда"],
            ["/legal/scan", "Правила сканера"],
            ["/faq", "Частые вопросы"],
            ["/settings", "Настройки"],
          ]}
        />
        <FooterCol
          title="Участникам"
          links={[
            ["/register", "Стать заказчиком"],
            ["/register?role=chef", "Стать поваром"],
            ["/cabinet", "Мой кабинет"],
            ["/chats", "Личные чаты"],
            ["/cart", "Корзина"],
          ]}
        />
        <div>
          <h4 className="mb-3 text-sm font-bold uppercase tracking-wide text-stone-400">Важно</h4>
          <p className="text-xs leading-relaxed text-stone-400">
            Платформа не заменяет санитарные и медицинские проверки. Пользователи обязаны соблюдать правила публикации
            и общения. AI-агент носит вспомогательный характер. Расчёты внутри платформы идут во внутренней валюте ForkCoins (FC).
          </p>
        </div>
      </div>
      <div className="border-t border-stone-100">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <details id="faq" className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
              <span className="text-sm font-bold uppercase tracking-wide text-stone-500">Частые вопросы по всем разделам</span>
              <span className="text-xs font-semibold text-orange-700 group-open:hidden">Показать</span>
              <span className="hidden text-xs font-semibold text-orange-700 group-open:inline">Скрыть</span>
            </summary>
            <div className="mt-5">
              <FaqList />
              <p className="mt-4 text-xs text-stone-400">
                Эти же вопросы на отдельной странице:{" "}
                <Link href="/faq" className="font-semibold text-orange-700 underline">
                  /faq
                </Link>
              </p>
            </div>
          </details>
        </div>
      </div>
      <div className="border-t border-stone-100 py-4 text-center text-xs text-stone-400">
        © {new Date().getFullYear()} ForkWork
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <h4 className="mb-3 text-sm font-bold uppercase tracking-wide text-stone-400">{title}</h4>
      <ul className="space-y-2">
        {links.map(([href, label]) => (
          <li key={href}>
            <Link href={href} className="text-sm text-stone-600 hover:text-orange-600">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
