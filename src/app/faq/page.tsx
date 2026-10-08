import type { Metadata } from "next";
import FaqList from "@/components/FaqList";

export const metadata: Metadata = {
  title: "Частые вопросы — ForkWork",
  description: "Ответы по картам, заведениям, сканеру, дневнику, рецептам, поварам, заказам и личным чатам ForkWork.",
};

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold">Частые вопросы</h1>
      <p className="mt-1 text-sm text-stone-500">По всем разделам платформы. Нажмите на вопрос, чтобы увидеть ответ.</p>
      <div className="mt-6">
        <FaqList />
      </div>
    </div>
  );
}
