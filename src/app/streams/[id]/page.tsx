import { notFound } from "next/navigation";
import { getStream, getStreamAccessKey, getDishesByIds, getChef, logEvent } from "@/lib/queries";
import { getSessionUser } from "@/lib/auth";
import StreamRoom from "./StreamRoom";

export const dynamic = "force-dynamic";

export default async function StreamPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ key?: string }>;
}) {
  const { id } = await params;
  const stream = getStream(Number(id));
  if (!stream) notFound();
  const user = await getSessionUser();

  const isChef = user?.chefId === stream.chefId;
  const isStaff = user?.role === "admin" || user?.role === "manager";
  const { key = "" } = await searchParams;
  const accessKey = stream.visibility === "private" ? getStreamAccessKey(stream.id) : "";
  const allowed = stream.visibility !== "private" || isChef || isStaff || (key !== "" && key === accessKey);

  if (!allowed) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <div className="card p-8">
          <p className="font-display mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-100 text-2xl font-bold text-orange-700">
            {(stream.chefName ?? "F").trim().charAt(0).toUpperCase()}
          </p>
          <h1 className="mt-4 text-xl font-extrabold">Индивидуальный эфир</h1>
          <p className="mt-2 text-sm text-stone-500">
            Это закрытая трансляция повара {stream.chefName}. Вход — по личной ссылке или ключу доступа,
            который повар отправляет приглашённым.
          </p>
          {key !== "" && <p className="mt-3 text-sm font-semibold text-red-600">Ключ не подошёл — проверьте ссылку.</p>}
          <form method="GET" className="mt-5 flex gap-2">
            <input name="key" className="input flex-1" placeholder="Ключ доступа" defaultValue="" />
            <button type="submit" className="btn-primary shrink-0">
              Войти
            </button>
          </form>
        </div>
      </div>
    );
  }

  const chef = getChef(stream.chefId);
  const dishes = getDishesByIds(stream.dishIds);
  logEvent("stream_view", user?.id ?? null, { streamId: stream.id });

  // Зрителю приватного эфира прокидываем подтверждённый ключ — им подписываются
  // запросы чата/сигналинга; повару и персоналу ключ отдаём напрямую
  const viewerKey = stream.visibility === "private" ? (isChef || isStaff ? accessKey : key) : "";

  return <StreamRoom stream={stream} chef={chef} dishes={dishes} user={user} isChef={isChef} viewerKey={viewerKey} />;
}
