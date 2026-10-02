import { redirect } from "next/navigation";
import { getSessionUser } from "./auth";

/**
 * Защита ролевых кабинетов на сервере: без входа — на /login, с чужой ролью — в свой
 * кабинет. Данные и так закрыты в API, а здесь страница не показывает чужую оболочку.
 */
export async function requirePage(allow: (u: NonNullable<Awaited<ReturnType<typeof getSessionUser>>>) => boolean) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!allow(user)) redirect("/cabinet");
  return user;
}
