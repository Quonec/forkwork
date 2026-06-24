"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Step = { title: string; text: string };

const CUSTOMER_STEPS: Step[] = [
  { title: "Карта — ваша точка входа", text: "На карте видны повара рядом: их кухня, рейтинг, доступность и идущие live-эфиры. Фильтруйте по цене, кухне и формату." },
  { title: "Стримы и чат", text: "Подключайтесь к открытому чату эфира, задавайте вопросы и заказывайте блюда прямо из стрима. Личный чат с поваром открывается по его согласию." },
  { title: "Кошелёк ForkCoins", text: "Внутренняя валюта платформы: 1 FC = 1 ₽. Пополняйте баланс, оплачивайте заказы, оставляйте чаевые. Новичкам уже начислено 500 FC." },
  { title: "Отзывы решают", text: "После выполненного заказа оцените повара — рейтинг влияет на его позицию в поиске. Будьте честны и вежливы: жалобы рассматривает модерация." },
];

const CHEF_STEPS: Step[] = [
  { title: "Ваш поварской кабинет", text: "Профиль, блюда, рецепты, стримы, заказы и статистика — всё в одном месте. Заполните профиль и укажите локацию, чтобы появиться на карте." },
  { title: "Меню и цены", text: "Добавляйте блюда с описанием и ценой в FC. Включайте и выключайте доступность блюд и приём заказов одним тумблером." },
  { title: "Стримы продают", text: "Запускайте эфиры, закрепляйте сообщение с акцией, отвечайте в чате. Зрители могут заказать ваше блюдо, не выходя из стрима." },
  { title: "Правила платформы", text: "Личные чаты открываются только с вашего согласия. Комиссия платформы — 10% с заказа. Соблюдайте санитарные нормы и правила общения." },
];

const MANAGER_STEPS: Step[] = [
  { title: "Кабинет менеджера", text: "Вы курируете закреплённых поваров и их клиентов. На обзоре — портфель: обороты, рейтинги, активные эфиры и точки внимания." },
  { title: "Глубокая аналитика", text: "По каждому повару видны выручка, заказы, баланс, рейтинг и последняя активность; по клиентам — суммы, частота и любимые повара." },
  { title: "Быстрые инструменты", text: "Прямо из списка: включить приём заказов, закрепить промо в эфире, остановить стрим, начислить маркетинг-бонус, разобрать жалобу." },
  { title: "Передача прав", text: "Контроль и поддержку над поваром можно передать другому менеджеру в один клик — например, на время вашего отпуска." },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (!d.user) router.push("/login");
        else setRole(d.user.role);
      });
  }, [router]);

  if (!role) return <div className="py-24 text-center text-stone-400">Загрузка…</div>;

  const steps = role === "chef" ? CHEF_STEPS : role === "manager" ? MANAGER_STEPS : CUSTOMER_STEPS;
  const current = steps[step];
  const isLast = step === steps.length - 1;

  const finish = async () => {
    await fetch("/api/onboarding", { method: "POST" });
    router.push(role === "chef" ? "/kitchen" : role === "manager" ? "/manager" : "/map");
    router.refresh();
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <p className="text-center text-xs font-bold uppercase tracking-widest text-orange-500">
        Первичный инструктаж · {role === "chef" ? "повар" : role === "manager" ? "менеджер" : "заказчик"}
      </p>
      <div className="card mt-4 p-8 text-center">
        <div className="font-display text-5xl font-bold text-orange-300">{String(step + 1).padStart(2, "0")}</div>
        <h1 className="mt-4 text-xl font-extrabold">{current.title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-stone-600">{current.text}</p>

        <div className="mt-6 flex justify-center gap-1.5">
          {steps.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? "w-6 bg-orange-500" : "w-1.5 bg-stone-200"}`} />
          ))}
        </div>

        <div className="mt-6 flex gap-3">
          {step > 0 && (
            <button onClick={() => setStep(step - 1)} className="btn-secondary flex-1">
              Назад
            </button>
          )}
          {isLast ? (
            <button onClick={finish} className="btn-primary flex-1">
              {role === "chef" ? "В поварской кабинет" : "К карте поваров"}
            </button>
          ) : (
            <button onClick={() => setStep(step + 1)} className="btn-primary flex-1">
              Дальше
            </button>
          )}
        </div>
      </div>
      <button onClick={finish} className="mt-4 w-full text-center text-xs text-stone-400 hover:text-stone-600">
        Пропустить инструктаж
      </button>
    </div>
  );
}
