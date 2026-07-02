import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";

export async function GET() {
  await destroySession();
  // Относительный Location: браузер сам подставит текущие протокол и хост.
  // Абсолютный URL из req.url ломался при смене пользователя — протокол
  // угадывался как https, и редирект уводил на несуществующий https://localhost:3000.
  return new NextResponse(null, { status: 303, headers: { Location: "/" } });
}
