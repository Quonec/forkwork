"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Step = { title: string; text: string };

const CUSTOMER_STEPS: Step[] = [
  { title: "Карта — ваша точка входа", text: "На карте видны повара рядом: их кухня, рейтинг, доступность и идущие live-эфиры. Фильтруйте по цене, кухне и формату." },
  { title: "Живые стримы с камерой", text: "Повара готовят в прямом эфире с реальной камерой и звуком. Задавайте вопросы в чате и заказывайте блюда, не выходя из трансляции. Индивидуальные эфиры открываются по личной ссылке от повара." },
  { title: "AI-агент оформит заказ", text: "Напишите ассистенту «закажи карбонару» — он подберёт блюдо, покажет форму заказа прямо в чате, а повар мгновенно получит уведомление на кухне." },
  { title: "Кошелёк ForkCoins", text: "Внутренняя валюта платформы: 1 FC = 1 ₽. Пополняйте баланс, оплачивайте заказы, оставляйте чаевые. Новичкам уже начислено 500 FC. После заказа оцените повара — рейтинг влияет на его позицию." },
];

const CHEF_STEPS: Step[] = [
  { title: "Ваш поварской кабинет", text: "Профиль, блюда, рецепты, стримы, заказы и статистика — всё в одном месте. Укажите локацию по геопозиции или точкой на карте — и вы появитесь на карте города." },
  { title: "Меню и цены", text: "Стартовое меню вы выбрали при регистрации — цены и описания можно править, добавлять свои блюда и выключать недоступные одним тумблером." },
  { title: "Эфиры с реальной камерой", text: "Публичный эфир виден всем в каталоге, индивидуальный — только по личной ссылке с ключом. Включите камеру на странице эфира, настройте качество до 60 к/с в меню настроек — и продавайте прямо из трансляции." },
  { title: "Живые заказы", text: "Новые заказы выпадают в кабинете всплывающим уведомлением со звуком — включая заказы, оформленные зрителями через AI-агента. Комиссия платформы — 10% с заказа." },
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
