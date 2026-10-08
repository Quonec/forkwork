# Контекст работы над ForkWork Scanner (на 2026-10-02, версия 0.9.26)

Репозиторий: `C:\Users\Simon\forkwork-scanner` → приватный GitHub `Quonec/forkwork-scanner`. Коммиты идут от имени Quonec (`git -c user.name=Quonec -c user.email=hron099@gmail.com`), версии нумеруются с 0.9.1, на каждую тег `vX.Y.Z` и push `origin main vX.Y.Z`.
Dev-сервер: `npm run dev -- -p 3010` (http://localhost:3010). Данные топа читаются при старте сервера, после новой партии его нужно перезапустить.

## Стек
Next.js 16 (App Router), React 19, TypeScript strict, Tailwind 4, SQLite через `node:sqlite` (`data/forkwork.db`), Яндекс.Карты JS API 2.1, cookie-сессии. Сканер КБЖУ, дневник по неделям, гостевой скан.

## Заведения
- Общая база: 12 317 точек OpenStreetMap (`seed/venues-moscow.json`, таблица `osm_venues`) + метро, тематика, ценовой сегмент, средний чек (сети и избранные).
- Избранные: «Пушкинъ» (`src/lib/venues/data.ts`), топ-25 по РБК Вино (`top25.ts`, `top25-extra.ts`: повара, чек, число фото) и расширенный топ: `seed/top250/batch-NN.json` + `coords.json` (загрузчик `src/lib/venues/more.ts`).
- Сети с отзывами Отзовика/Irecommend: `chains.ts`.
- Тематика/сегмент: `themes.ts`, `categories.ts`. Фото: общая галерея `photos.ts` + `/api/venues/photos*`, компонент `VenuePhotos.tsx`. Карточки: `KitchenTabs.tsx` («О кухне»/«О поварах»), `VenueTags.tsx`, `RatingSpectrum.tsx`.
- Страницы: `/venues` (фильтры, карточки), `/map` (вкладки Рядом/Тематика/Цена, ближайшие).

## Как добавлять партию заведений (топ-250)
1. Список кандидатов: `scratchpad/cands.json` (193 имени из WHERETOEAT 2025, Restorating 2022–2025, Forbes, РБК, Great List, Яндекс Путеводитель). Сделаны индексы 0–≈55.
2. Для каждого: WebSearch по 2ГИС/Яндексу (id организации), WebFetch `2gis.ru/moscow/firm/<id>/tab/reviews` и `yandex.com/maps/org/<slug>/reviews/` (оценка, число оценок, отзывы, фото), WebSearch «шеф-повар».
3. Записать `seed/top250/batch-NN.json` (формат в `more.ts`: тип `MoreEntry`), затем `node scripts/geocode-top250.mjs`, `npx tsc --noEmit`, коммит+тег.
Правила: отзывы дословно на языке оригинала, английские только от авторов с латинскими именами (`"en"`); эмодзи убирать; тональность «+», «±», «-» — наша пометка; чек/повара только со ссылкой на источник.

## Пропущенные и дозаполнить
- Пропущены: Capo dei Capi, Бункер-42, Le Pigeon, Amy, Lou Lou, Rocky 2.
- Повара добавлены всем заведениям партий 1–5; гастропуть/достижения разложены у 12 поваров (поля name/role/path/awards в ChefFact), у остальных одна строка из источника.
- Осталось ≈120 кандидатов (WHERETOEAT без адресов, Restorating 2022–2024: Muse bar, Brera, Yudashkin Сад, Настойкин, Галки, Tehnikum, Л.Е.С., Buono, Киану, Sixty, Арбатский базар, Dogs In The Fog и др.).
- Итог будет примерно 220 заведений, не ровно 250.

## Честные ограничения
Оценки и отзывы только там, где прочитаны на страницах; у 10 600 заведений общей базы средний чек неизвестен (сегмент помечен «≈» как оценка по виду). Фото на картах — числа со страниц; у Twins Garden и Due Forni Яндекс отдал число, совпадающее с отзывами, оно не взято.
