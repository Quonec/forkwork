"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Step = { title: string; text: string };

const CUSTOMER_STEPS: Step[] = [
  { title: "Добро пожаловать в ForkWork", text: "Здесь рядом живут три вещи: повара, которые готовят на заказ, гид по заведениям Москвы и сканер блюд. Мы стартуем в Москве, в Хамовниках, и дальше растём по городу." },
  { title: "Карта: повара и заведения", text: "На карте повара рядом и заведения города. «Избранное» — заведения из топа Москвы, «Все заведения» — вся база из OpenStreetMap. Фильтруйте по близости, тематике и цене." },
  { title: "Оценки без усреднения", text: "У заведений из топа оценки 2ГИС и Яндекс Карт показаны рядом, а не одним числом, у каждой ссылка на источник. Во вкладках «О кухне» и «Повара» — кухня и сведения о шефах из открытых публикаций." },
  { title: "Сканер и рецепты", text: "Сфотографируйте блюдо, и сервис приблизительно оценит состав и КБЖУ: это ориентир, а не медицинская рекомендация. В «Рецептах» блюда поваров платформы, известных шефов и из кино, у каждого внешнего рецепта ссылка на источник." },
  { title: "Чаты и кошелёк", text: "Личный чат открывается с согласия повара. Для приватности можно включить шифрование: тогда переписку прочитаете только вы и собеседник. Сообщения можно удалять, в том числе по таймеру. Деньги в кошельке ForkCoins виртуальные (1 FC = 1 ₽), новичкам начислено 500 FC." },
];

const CHEF_STEPS: Step[] = [
  { title: "Ваш поварской кабинет", text: "Профиль, блюда, рецепты, стримы, заказы, чаты, отзывы и финансы в одном месте. Заполните профиль и укажите локацию, чтобы появиться на карте." },
  { title: "Меню и цены", text: "Добавляйте блюда с описанием и ценой в FC. Доступность блюд и приём заказов включаются и выключаются одним тумблером." },
  { title: "Стримы продают", text: "Запускайте эфиры, закрепляйте сообщение с акцией, отвечайте в чате. Зрители могут заказать ваше блюдо, не выходя из стрима." },
  { title: "Личные чаты", text: "Личный чат открывается только с вашего согласия. Включите шифрование, и переписку прочитаете только вы и заказчик. Если оно выключено, администрация может прочитать чат при жалобе." },
  { title: "Правила платформы", text: "Комиссия платформы — 10% с заказа. Соблюдайте санитарные нормы и правила общения; жалобы рассматривает модерация." },
];

const MANAGER_STEPS: Step[] = [
  { title: "Кабинет менеджера", text: "Вы курируете закреплённых поваров и их клиентов. На обзоре — портфель: обороты, рейтинги, активные эфиры и точки внимания." },
  { title: "Аналитика", text: "По каждому повару видны выручка, заказы, баланс, рейтинг и последняя активность; по клиентам — суммы, частота и любимые повара." },
  { title: "Быстрые инструменты", text: "Прямо из списка: включить приём заказов, закрепить промо в эфире, остановить стрим, начислить маркетинг-бонус, разобрать жалобу." },
  { title: "Передача прав", text: "Контроль и поддержку над поваром можно передать другому менеджеру, например на время вашего отпуска." },
  { title: "Чаты поваров", text: "Переписку поваров с шифрованием менеджер не видит: читать её могут только участники." },
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
        Знакомство с ForkWork · {role === "chef" ? "повар" : role === "manager" ? "менеджер" : "заказчик"}
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
              {role === "chef" ? "В поварской кабинет" : role === "manager" ? "В кабинет менеджера" : "К карте"}
            </button>
          ) : (
            <button onClick={() => setStep(step + 1)} className="btn-primary flex-1">
              Дальше
            </button>
          )}
        </div>
      </div>
      <button onClick={finish} className="mt-4 w-full text-center text-xs text-stone-400 hover:text-stone-600">
        Пропустить знакомство
      </button>
    </div>
  );
}
