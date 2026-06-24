# syntax=docker/dockerfile:1

# ──────────────────────────────────────────────────────────────
# ForkWork — production-образ для Amvera Cloud (и любого Docker-хоста)
# Стек: Next.js 16 + встроенный node:sqlite (нужен Node ≥ 22.5)
# ──────────────────────────────────────────────────────────────

# ── Стадия 1: сборка ───────────────────────────────────────────
FROM node:24-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Ключ Яндекс.Карт вшивается в клиентский бандл НА ЭТАПЕ СБОРКИ
# (переменные NEXT_PUBLIC_* инлайнятся в JS и всё равно видны в браузере —
#  это не секрет). Передайте свой ключ build-arg'ом:
#   docker build --build-arg NEXT_PUBLIC_YANDEX_MAPS_API_KEY=xxxx .
# либо впишите значение по умолчанию прямо здесь. Без ключа карта
# покажет подсказку, остальная логика работает.
ARG NEXT_PUBLIC_YANDEX_MAPS_API_KEY=key-414f6ec4-fde0-48c6-9a08-6d7e8100ccff
ENV NEXT_PUBLIC_YANDEX_MAPS_API_KEY=${NEXT_PUBLIC_YANDEX_MAPS_API_KEY}

COPY package*.json ./
RUN npm ci
COPY . .
# В проекте может не быть папки public/ (статика App Router живёт в src/app).
# Создаём её, чтобы COPY в рантайм-стадию всегда находил путь.
RUN mkdir -p public
RUN npm run build

# ── Стадия 2: рантайм (только прод-зависимости) ────────────────
FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.ts ./next.config.ts

# Папка БД (SQLite). На Amvera сюда монтируется постоянный том
# через persistenceMount: /app/data — данные переживают рестарты и деплои.
RUN mkdir -p /app/data

EXPOSE 3000
CMD ["npm", "start"]
