import { NextResponse } from "next/server";
import { getSessionUser } from "./auth";
import type { Role, SessionUser } from "./types";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const err = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

/** Возвращает пользователя сессии или NextResponse с ошибкой 401/403. */
export async function requireUser(role?: Role): Promise<SessionUser | NextResponse> {
  const user = await getSessionUser();
  if (!user) return err("Требуется вход в систему", 401);
  if (role && user.role !== role) return err("Недостаточно прав", 403);
  return user;
}

export const isResponse = (v: unknown): v is NextResponse => v instanceof NextResponse;
