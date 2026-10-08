"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // в проде сюда можно подключить отправку в систему мониторинга
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <div className="mx-auto h-px w-10 bg-stone-300" />
      <h1 className="mt-4 text-lg font-bold">Что-то пошло не так</h1>
      <p className="mt-2 text-sm text-stone-500">
        На этой странице произошёл сбой. Попробуйте обновить — или вернитесь на главную, ничего не сломано.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <button onClick={() => reset()} className="btn-secondary">Обновить</button>
        <Link href="/" className="btn-primary">На главную</Link>
      </div>
    </div>
  );
}
