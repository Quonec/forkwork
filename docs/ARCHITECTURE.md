# ForkWork — карта приложения и бизнес-процессы

Диаграммы в нотации **Mermaid** (рендерятся прямо на GitHub) и **BPMN-приближении**.
Источник истины — код в `src/` (роуты `app/api/*`, схема `lib/db.ts`, статусы `lib/types.ts`).

**Условные обозначения для процессов (BPMN-приближение):**

| Фигура | Mermaid | Значение |
|---|---|---|
| `([...])` | стадион | событие (старт / конец) |
| `[...]` | прямоугольник | задача / действие |
| `{...}` | ромб | шлюз-развилка (XOR) |
| `subgraph` | рамка | дорожка (lane) — роль/система |

---

## 1. Карта приложения (роли и разделы)

```mermaid
flowchart TD
  Guest(["Гость"]) --> Landing["Лендинг /"]
  Guest --> Login["Вход /login"]
  Guest --> Register["Регистрация /register"]

  Landing --> Map["Карта /map"]
  Landing --> Streams["Стримы /streams"]
  Landing --> Chefs["Повара /chefs"]
  Landing --> Recipes["Рецепты /recipes"]

  Register --> Onb["Онбординг /onboarding"]
  Login --> Router{"Роль?"}
  Onb --> Router

  Router -->|заказчик| Cabinet["Кабинет /cabinet"]
  Router -->|повар| Kitchen["Поварской кабинет /kitchen"]
  Router -->|менеджер| Manager["Кабинет менеджера /manager"]
  Router -->|админ| Admin["Админ-панель /admin"]

  Map --> ChefProfile["Профиль повара /chefs/:id"]
  Streams --> StreamRoom["Эфир /streams/:id"]
  Recipes --> RecipePage["Рецепт /recipes/:id"]

  ChefProfile --> Cart["Корзина /cart"]
  StreamRoom --> Cart
  Cart --> Order["Заказ /orders/:id"]
  ChefProfile --> Chat["Личный чат /chats/:id"]
  StreamRoom --> Chat

  AIWidget["AI-агент (виджет, на всех страницах)"]
```

### Разделы кабинетов (вкладки)

```mermaid
flowchart LR
  subgraph CAB["Заказчик /cabinet"]
    c1[Обзор] --- c2[Заказы] --- c3[Избранное] --- c4[Кошелёк] --- c5["Стать поваром"]
  end
  subgraph KIT["Повар /kitchen"]
    k1[Обзор] --- k2[Заказы] --- k3[Блюда] --- k4[Рецепты] --- k5["Стримы + Студия эфира"] --- k6[Чаты] --- k7[Отзывы] --- k8[Профиль] --- k9[Финансы]
  end
  subgraph MAN["Менеджер /manager"]
    m1[Обзор] --- m2["Мои повара"] --- m3[Клиенты] --- m4["Передача прав"]
  end
  subgraph ADM["Админ /admin"]
    a1[Аналитика] --- a2[Пользователи] --- a3[Менеджеры] --- a4[Стримы] --- a5[Жалобы] --- a6[Отзывы] --- a7[Заявки] --- a8[Категории]
  end
```

---

## 2. Слои приложения (страница → API → данные)

```mermaid
flowchart LR
  subgraph Client["Клиент (Next.js App Router)"]
    P1["/map · MapClient + Яндекс.Карты"]
    P2["/streams/:id · StreamRoom"]
    P3["/cart · CartProvider"]
    P4["/kitchen · CameraStudio"]
    P5["/manager"]
    P6["/admin"]
  end
  subgraph API["API-роуты (app/api)"]
    R1["/api/chefs"]
    R2["/api/orders, /api/orders/:id"]
    R3["/api/streams/:id/messages"]
    R4["/api/wallet"]
    R5["/api/chats, /api/chats/:id"]
    R6["/api/kitchen"]
    R7["/api/manager"]
    R8["/api/admin"]
    R9["/api/ai/assistant, /api/ai/stream-analysis"]
    AUTH["/api/auth/* · сессии httpOnly + bcrypt"]
  end
  subgraph Data["SQLite (node:sqlite, lib/db.ts)"]
    D1[(users / sessions)]
    D2[(chefs / dishes / recipes)]
    D3[(streams / stream_messages)]
    D4[(orders / reviews)]
    D5[(wallets / transactions)]
    D6[(chats / chat_messages)]
    D7[(manager_assignments)]
    D8[(complaints / role_requests / events)]
  end

  P1 --> R1 --> D2
  P2 --> R3 --> D3
  P3 --> R2 --> D4
  R2 --> D5
  P4 --> R6 --> D2
  P5 --> R7 --> D7
  P6 --> R8 --> D8
  P3 --> R4 --> D5
  P2 --> R5 --> D6
  Client --> AUTH --> D1
```

---

## 3. Модель данных (ER)

```mermaid
erDiagram
  users ||--o| chefs : "является поваром"
  users ||--|| wallets : "имеет"
  users ||--o{ transactions : "движения"
  users ||--o{ orders : "заказывает"
  users ||--o{ role_requests : "подаёт заявку"
  cuisines ||--o{ chefs : "кухня"
  chefs ||--o{ dishes : "меню"
  chefs ||--o{ recipes : "рецепты"
  chefs ||--o{ streams : "эфиры"
  chefs ||--o{ orders : "принимает"
  chefs ||--o{ reviews : "оценивают"
  orders ||--o| reviews : "после выполнения"
  chefs ||--o{ chats : "диалоги"
  users ||--o{ chats : "инициирует"
  chats ||--o{ chat_messages : "сообщения"
  streams ||--o{ stream_messages : "чат эфира"
  users ||--o{ favorites : "избранное"
  chefs ||--o{ favorites : "в избранном"
  users ||--o{ manager_assignments : "куратор (manager)"
  chefs ||--o{ manager_assignments : "подопечный"

  users {
    int id PK
    string email
    string role "customer|chef|manager|admin"
    int blocked
    int onboarded
  }
  chefs {
    int id PK
    int user_id FK
    int cuisine_id FK
    int available
    real lat
    real lng
  }
  orders {
    int id PK
    int customer_id FK
    int chef_id FK
    string status
    int total
    int fee
    string source "site|map|stream"
  }
  manager_assignments {
    int manager_id FK
    int chef_id FK
    string kind "control|support"
  }
```

---

## 4. Бизнес-процесс: заказ блюда (E2E)

Дорожки: **Заказчик**, **Платформа (API)**, **Повар**. Источник: `api/orders` и `api/orders/:id`.

```mermaid
flowchart TD
  subgraph L1["Заказчик"]
    s([Голоден]) --> find["Находит повара: карта / стрим / каталог"]
    find --> add["Добавляет блюда в корзину (один повар)"]
    add --> checkout["Оформляет: доставка/самовывоз + оплата кошелёк/карта"]
    review2["Оставляет отзыв и оценку"] --> e([Готово])
    cancelReq["Отменяет заказ"]
  end
  subgraph L2["Платформа"]
    val{"Повар принимает заказы? блюда доступны? хватает FC?"}
    create["Создаёт заказ status=new; списывает FC с заказчика; зачисляет повару total − 10%"]
    refund["Возврат FC заказчику; списание у повара"]
  end
  subgraph L3["Повар"]
    g{"Решение"}
    accept["accepted"] --> cooking["cooking"] --> delivering["delivering"] --> done["done"]
  end

  checkout --> val
  val -->|нет| rej["Ошибка: причина отказа"] --> add
  val -->|да| create --> g
  g --> accept
  done --> review2
  create -.->|new или accepted| cancelReq --> refund --> e

  classDef ev fill:#fcd000,stroke:#171410,color:#171410;
  class s,e ev;
```

### Машина состояний заказа

```mermaid
stateDiagram-v2
  [*] --> new: создан, оплачен
  new --> accepted: повар принял
  accepted --> cooking: готовит
  cooking --> delivering: передал в доставку
  delivering --> done: вручён
  new --> cancelled: отмена + возврат
  accepted --> cancelled: отмена + возврат
  done --> [*]
  cancelled --> [*]
```

---

## 5. Платёж и кошелёк (оплата заказа)

Демо-упрощение: повар получает деньги сразу, за вычетом комиссии 10%. Источник: `api/orders` (POST).

```mermaid
sequenceDiagram
  participant C as Заказчик
  participant API as /api/orders
  participant WC as Кошелёк заказчика
  participant WK as Кошелёк повара
  participant TX as transactions

  C->>API: POST заказ (items, payment)
  API->>API: пересчёт цен из БД, total, fee = 10%
  alt оплата кошельком и недостаточно FC
    API-->>C: Ошибка «недостаточно средств»
  else достаточно
    API->>WC: −total (если payment=wallet)
    API->>WK: +(total − fee)
    API->>TX: payment(−total), income(+total−fee)
    API-->>C: orderId, status=new
  end
  Note over C,WK: Отмена (new/accepted): +total заказчику, −(total−fee) повару, type=refund
```

---

## 6. Стриминг и заказ из эфира

Источник: `api/kitchen` (stream_create/start/stop), `api/streams/:id/messages` (симуляция зрителей), `api/ai/stream-analysis`.

```mermaid
flowchart TD
  subgraph Chef["Повар"]
    p0([Открывает «Стримы»]) --> studio["Студия эфира: getUserMedia, настройка графики"]
    studio --> createS["Создаёт эфир: название, блюда, промо"]
    createS --> when{"Запуск?"}
    when -->|сейчас| live["status=live"]
    when -->|по расписанию| sched["status=scheduled"]
    sched --> startBtn["Начать эфир"] --> live
    live --> pin["Закрепляет промо, отвечает в чате"]
    live --> stop["Завершить"] --> ended["status=ended"]
  end
  subgraph Platform["Платформа"]
    bots["Сервер генерирует сообщения зрителей (bot_cursor), счётчик «дышит»"]
    ai["AI: распознанное блюдо + уверенность, кнопка «Заказать»"]
  end
  subgraph Viewer["Зритель"]
    join([Заходит в эфир]) --> watch["Смотрит, пишет в чат"]
    watch --> orderS["Заказывает блюдо из стрима (source=stream)"]
    watch --> reqChat["Запрос личного чата"]
  end
  live --> bots --> watch
  live --> ai --> orderS
```

---

## 7. Личный чат по согласию повара

Источник: `api/chats/:id` (PATCH accept/decline/block). Статусы: `pending → active | declined | blocked`.

```mermaid
stateDiagram-v2
  [*] --> pending: заказчик отправил запрос
  pending --> active: повар принял (accept)
  pending --> declined: повар отклонил (decline)
  active --> blocked: повар заблокировал (block)
  note right of pending
    Пока pending заказчик писать не может.
    Сообщения — только в active.
  end note
```

---

## 8. Заявка «стать поваром» и модерация

Источник: `api/role-requests` (создание), `api/admin` (request_approve / request_reject).

```mermaid
flowchart LR
  c([Заказчик]) --> form["Заявка: специализация + о себе"]
  form --> pending["role_requests: pending"]
  pending --> adm{"Решение админа"}
  adm -->|approve| toChef["role=chef, создан профиль chefs, onboarded=0"]
  adm -->|reject| rejected["rejected (можно подать снова)"]
  toChef --> onb["Онбординг повара → /kitchen"]
```

---

## 9. Менеджер: кураторство и передача прав

Источник: `api/admin` (manager_assign), `api/manager` (transfer + быстрые инструменты). Права: `control` и `support`.

```mermaid
flowchart TD
  subgraph Admin["Админ"]
    assign["Назначает повару контроль и/или поддержку"]
  end
  subgraph Manager["Менеджер"]
    over["Обзор портфеля: оборот, рейтинги, точки внимания"]
    deep["Глубокая аналитика по повару и клиентам"]
    tools{"Быстрый инструмент"}
    t1["Пауза/включение приёма заказов"]
    t2["Закрепить промо в эфире"]
    t3["Остановить стрим"]
    t4["Маркетинг-бонус повару +200 FC"]
    t5["Разобрать жалобу"]
    transfer["Передать control/support другому менеджеру"]
  end

  assign --> over --> deep --> tools
  tools --> t1 & t2 & t3 & t4 & t5
  over --> transfer
  transfer -->|обновляет manager_assignments| over

  note1["Все действия проверяют, что повар закреплён за менеджером"]
```

---

## 10. Сводный поток ценности

```mermaid
flowchart LR
  reg([Регистрация]) --> role{"Роль"}
  role -->|повар| sell["Профиль → меню → эфир → продажа"]
  role -->|заказчик| buy["Карта/эфир → заказ → отзыв"]
  role -->|менеджер| curate["Кураторство поваров и клиентов"]
  role -->|админ| moderate["Модерация, аналитика, назначения"]
  sell --> money["Кошелёк: доход − 10% комиссии"]
  buy --> money
  curate --> sell
  moderate --> sell
  moderate --> buy
```
