"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function ChefActions({
  chefId,
  chefName,
  initialFavorite,
  loggedIn,
  liveStreamId,
}: {
  chefId: number;
  chefName: string;
  initialFavorite: boolean;
  loggedIn: boolean;
  liveStreamId: number | null;
}) {
  const router = useRouter();
  const [favorite, setFavorite] = useState(initialFavorite);
  const [tipOpen, setTipOpen] = useState(false);
  const [tip, setTip] = useState(100);
  const [note, setNote] = useState("");

  const requireLogin = () => {
    if (!loggedIn) {
      router.push("/login");
      return true;
    }
    return false;
  };

  const toggleFavorite = async () => {
    if (requireLogin()) return;
    const res = await fetch("/api/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chefId }),
    });
    const data = await res.json();
    if (res.ok) setFavorite(data.favorite);
  };

  const requestChat = async () => {
    if (requireLogin()) return;
    const res = await fetch("/api/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chefId }),
    });
    const data = await res.json();
    if (res.ok) router.push(`/chats/${data.chatId}`);
    else setNote(data.error ?? "Не получилось создать чат");
  };

  const sendTip = async () => {
    if (requireLogin()) return;
    const res = await fetch("/api/wallet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "tip", chefId, amount: tip }),
    });
    const data = await res.json();
    if (res.ok) {
      setNote(`Чаевые ${tip} FC отправлены. Повар скажет спасибо!`);
      setTipOpen(false);
      router.refresh();
    } else setNote(data.error ?? "Ошибка");
  };

  return (
    <div className="flex w-full flex-col gap-2 md:w-56">
      {liveStreamId && (
        <Link href={`/streams/${liveStreamId}`} className="btn bg-red-600 text-white hover:bg-red-700">
          Смотреть эфир
        </Link>
      )}
      <button onClick={toggleFavorite} className={favorite ? "btn bg-rose-50 text-rose-600 ring-1 ring-rose-200" : "btn-secondary"}>
        {favorite ? "В избранном" : "В избранное"}
      </button>
      <button onClick={requestChat} className="btn-secondary">
        Личный чат
      </button>
      <button onClick={() => setTipOpen(!tipOpen)} className="btn-secondary">
        Чаевые
      </button>
      {tipOpen && (
        <div className="card space-y-2 p-3">
          <div className="flex gap-1.5">
            {[50, 100, 300].map((v) => (
              <button key={v} onClick={() => setTip(v)} className={`chip flex-1 justify-center ${tip === v ? "bg-orange-500 text-white" : "bg-stone-100 text-stone-600"}`}>
                {v} FC
              </button>
            ))}
          </div>
          <input type="number" className="input" value={tip} min={10} onChange={(e) => setTip(Number(e.target.value))} />
          <button onClick={sendTip} className="btn-primary w-full !py-1.5 text-xs">
            Отправить {tip} FC
          </button>
        </div>
      )}
      {note && <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">{note}</p>}
      <p className="text-[11px] leading-snug text-stone-400">
        Личный чат откроется после согласия повара {chefName.split(" ")[0]} — таковы правила платформы.
      </p>
    </div>
  );
}
