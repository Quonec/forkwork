"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { timeAgo } from "@/lib/format";

type Chat = {
  id: number;
  status: string;
  createdAt: string;
  customerName: string;
  customerAvatar: string;
  customerId: number;
  chefName: string;
  chefAvatar: string;
  chefId: number;
  chefUserId: number;
  lastMessage: string | null;
  lastAt: string | null;
};

const STATUS_RU: Record<string, [string, string]> = {
  pending: ["Ожидает согласия", "bg-amber-50 text-amber-600"],
  active: ["Активен", "bg-emerald-50 text-emerald-600"],
  declined: ["Отклонён", "bg-stone-100 text-stone-500"],
  blocked: ["Заблокирован", "bg-red-50 text-red-600"],
};

export default function ChatsPage() {
  const [chats, setChats] = useState<Chat[] | null>(null);
  const [me, setMe] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/chats").then(async (r) => {
      if (r.status === 401) {
        window.location.href = "/login";
        return;
      }
      const d = await r.json();
      setChats(d.chats);
      setMe(d.me);
    });
  }, []);

  if (!chats) return <div className="py-24 text-center text-stone-400">Загружаем чаты…</div>;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold">Личные чаты</h1>
      <p className="mt-1 text-sm text-stone-500">Диалоги открываются только по взаимному согласию повара и заказчика.</p>

      {chats.length === 0 ? (
        <div className="card mt-6 p-10 text-center">
          <div className="mx-auto h-px w-12 bg-stone-300" />
          <p className="mt-4 text-sm text-stone-500">
            Чатов пока нет. Найдите повара на <Link href="/map" className="font-semibold text-orange-600">карте</Link> и отправьте запрос на личный чат.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {chats.map((c) => {
            const iAmChef = me === c.chefUserId;
            const other = iAmChef ? { name: c.customerName, avatar: c.customerAvatar } : { name: c.chefName, avatar: c.chefAvatar };
            const [label, cls] = STATUS_RU[c.status] ?? ["", ""];
            return (
              <Link key={c.id} href={`/chats/${c.id}`} className="card flex items-center gap-3 p-4 transition-shadow hover:shadow-md">
                <span className="font-display flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-orange-50 text-lg font-bold text-orange-700">
                  {other.name.trim().charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-bold">{other.name}</p>
                    <span className={`chip px-2 py-0.5 text-[10px] ${cls}`}>{label}</span>
                  </div>
                  <p className="truncate text-sm text-stone-500">{c.lastMessage ?? "Нет сообщений"}</p>
                </div>
                <span className="shrink-0 text-[11px] text-stone-400">{timeAgo(c.lastAt ?? c.createdAt)}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
