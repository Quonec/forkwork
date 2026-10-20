import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth";
import { isGuestEmail } from "@/lib/guest";
import SellClient from "./SellClient";

export const metadata: Metadata = { title: "Продать блюдо — ForkWork" };
export const dynamic = "force-dynamic";

export default async function SellPage() {
  const user = await getSessionUser();
  const signedIn = !!user && !isGuestEmail(user.email);
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold">Продать блюдо</h1>
      <p className="mt-1 text-sm text-stone-500">
        Приготовили больше, чем съедите? Выставьте блюдо плиткой с фото и видео — соседи увидят его в ленте.
      </p>
      <SellClient signedIn={signedIn} />
    </div>
  );
}
