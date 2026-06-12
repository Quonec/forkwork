import { notFound } from "next/navigation";
import { getStream, getDishesByIds, getChef, logEvent } from "@/lib/queries";
import { getSessionUser } from "@/lib/auth";
import StreamRoom from "./StreamRoom";

export const dynamic = "force-dynamic";

export default async function StreamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const stream = getStream(Number(id));
  if (!stream) notFound();
  const chef = getChef(stream.chefId);
  const dishes = getDishesByIds(stream.dishIds);
  const user = await getSessionUser();
  logEvent("stream_view", user?.id ?? null, { streamId: stream.id });

  return <StreamRoom stream={stream} chef={chef} dishes={dishes} user={user} />;
}
