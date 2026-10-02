import Link from "next/link";

export const metadata = { title: "Согласие на обработку фото — ForkWork" };

export default function ScanConsentDocument() {
  return (
    <article className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/scan" className="text-sm font-semibold text-orange-600">
        ← К сканеру
      </Link>
      <h1 className="font-display mt-3 text-2xl tracking-tight">Согласие на обработку фото блюд</h1>
      <p className="mt-1 text-xs text-stone-500">Версия от 30 сентября 2026 г.</p>

      <div className="mt-5 space-y-4 text-sm leading-relaxed text-stone-700">
        <p>
          Сканер оценивает калорийность и БЖУ блюда по вашей фотографии. Чтобы это работало, мы принимаем и временно
          храним снимок, который вы отправляете из приложения.
        </p>
        <h2 className="text-base font-bold text-stone-950">Что мы делаем с фото</h2>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Фото привязано к вашему аккаунту и доступно только вам — другим пользователям и поварам оно не показывается.</li>
          <li>Фото хранится в закрытом хранилище без публичной ссылки и удаляется автоматически через 30 дней. Оценка остаётся в истории.</li>
          <li>Если на фото не найдено еды или анализ не удался, снимок удаляется сразу.</li>
          <li>Вы можете удалить любой скан вместе с фото в любой момент на странице результата.</li>
        </ul>
        <h2 className="text-base font-bold text-stone-950">Что важно знать</h2>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Снимайте только блюдо — без людей, документов и других персональных данных.</li>
          <li>Оценка приблизительная и не является медицинской рекомендацией.</li>
          <li>Сейчас распознавание работает в демонстрационном режиме и не использует внешние сервисы.</li>
        </ul>
        <p>Согласие записывается до первого снимка. Если условия изменятся, мы попросим согласиться заново.</p>
      </div>
    </article>
  );
}
