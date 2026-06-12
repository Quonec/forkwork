import type { Metadata } from "next";
import { listStreams } from "@/lib/queries";
import { StreamCardView } from "@/components/StreamCardView";
import { SectionTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Live-стримы — ForkWork" };
export const dynamic = "force-dynamic";

export default function StreamsPage() {
  const streams = listStreams();
  const live = streams.filter((s) => s.status === "live");
  const scheduled = streams.filter((s) => s.status === "scheduled");
  const ended = streams.filter((s) => s.status === "ended");

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold">Live-стримы</h1>
      <p className="mt-1 text-sm text-stone-500">
        Повара готовят в прямом эфире: открытый чат, реакции и заказ блюд не выходя из трансляции.
      </p>

      <section className="mt-8">
        <SectionTitle title={`Сейчас в эфире · ${live.length}`} />
        {live.length === 0 ? (
          <p className="text-sm text-stone-500">Прямо сейчас эфиров нет — загляните в расписание ниже.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {live.map((s) => (
              <StreamCardView key={s.id} stream={s} />
            ))}
          </div>
        )}
      </section>

      {scheduled.length > 0 && (
        <section className="mt-10">
          <SectionTitle title="Скоро в эфире" />
          <div className="grid gap-4 md:grid-cols-3">
            {scheduled.map((s) => (
              <StreamCardView key={s.id} stream={s} />
            ))}
          </div>
        </section>
      )}

      {ended.length > 0 && (
        <section className="mt-10">
          <SectionTitle title="Прошедшие эфиры" />
          <div className="grid gap-4 md:grid-cols-3">
            {ended.map((s) => (
              <StreamCardView key={s.id} stream={s} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
