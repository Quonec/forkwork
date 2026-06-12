import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-stone-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-display flex h-8 w-8 items-center justify-center rounded-lg bg-stone-950 text-sm text-white">
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
          ]}
        />
        <FooterCol
          title="Участникам"
          links={[
            ["/register", "Стать заказчиком"],
            ["/register?role=chef", "Стать поваром"],
            ["/cabinet", "Мой кабинет"],
            ["/cart", "Корзина"],
          ]}
        />
        <div>
          <h4 className="mb-3 text-sm font-bold uppercase tracking-wide text-stone-400">Важно</h4>
          <p className="text-xs leading-relaxed text-stone-400">
            Платформа не заменяет санитарные и медицинские проверки. Пользователи обязаны соблюдать правила публикации
            и общения. AI-агент носит вспомогательный характер. Демонстрационная версия — платежи виртуальные (FC).
          </p>
        </div>
      </div>
      <div className="border-t border-stone-100 py-4 text-center text-xs text-stone-400">
        © {new Date().getFullYear()} ForkWork · MVP-демо
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
