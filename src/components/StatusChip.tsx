import { ORDER_STATUS_RU } from "@/lib/types";

export function StatusChip({ status }: { status: string }) {
  const cls: Record<string, string> = {
    new: "bg-sky-50 text-sky-600",
    accepted: "bg-indigo-50 text-indigo-600",
    cooking: "bg-amber-50 text-amber-600",
    delivering: "bg-violet-50 text-violet-600",
    done: "bg-emerald-50 text-emerald-600",
    cancelled: "bg-stone-100 text-stone-500",
  };
  return <span className={`chip px-2 py-0.5 text-[10px] ${cls[status] ?? ""}`}>{ORDER_STATUS_RU[status]}</span>;
}
