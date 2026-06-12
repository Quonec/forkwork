import type { Metadata } from "next";
import { listChefs } from "@/lib/queries";
import ChefsList from "./ChefsList";

export const metadata: Metadata = { title: "Повара — ForkWork" };
export const dynamic = "force-dynamic";

export default function ChefsPage() {
  const chefs = listChefs();
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold">Повара ForkWork</h1>
      <p className="mt-1 text-sm text-stone-500">Отсортированы по рейтингу — его формируют отзывы по реальным заказам.</p>
      <ChefsList chefs={chefs} />
    </div>
  );
}
