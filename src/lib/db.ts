import { DatabaseSync } from "node:sqlite";
import { hashSync } from "bcryptjs";
import path from "node:path";
import fs from "node:fs";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  pass_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer',
  avatar TEXT NOT NULL DEFAULT '',
  blocked INTEGER NOT NULL DEFAULT 0,
  onboarded INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cuisines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chefs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  specialization TEXT NOT NULL DEFAULT '',
  cuisine_id INTEGER,
  lat REAL, lng REAL,
  address TEXT NOT NULL DEFAULT '',
  price_level INTEGER NOT NULL DEFAULT 2,
  available INTEGER NOT NULL DEFAULT 1,
  delivery INTEGER NOT NULL DEFAULT 1,
  pickup INTEGER NOT NULL DEFAULT 1,
  work_hours TEXT NOT NULL DEFAULT '10:00–22:00'
);
CREATE TABLE IF NOT EXISTS dishes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chef_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL,
  emoji TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',
  available INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS recipes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chef_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  time_min INTEGER NOT NULL DEFAULT 30,
  difficulty INTEGER NOT NULL DEFAULT 2,
  emoji TEXT NOT NULL DEFAULT '',
  ingredients TEXT NOT NULL DEFAULT '[]',
  steps TEXT NOT NULL DEFAULT '[]',
  tags TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS streams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chef_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  scheduled_at TEXT,
  started_at TEXT,
  ended_at TEXT,
  viewers INTEGER NOT NULL DEFAULT 0,
  dish_ids TEXT NOT NULL DEFAULT '[]',
  recipe_id INTEGER,
  pinned_message TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',
  bot_cursor INTEGER NOT NULL DEFAULT 0,
  visibility TEXT NOT NULL DEFAULT 'public',
  access_key TEXT NOT NULL DEFAULT '',
  camera_live INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS rtc_signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stream_id INTEGER NOT NULL,
  sender TEXT NOT NULL,
  target TEXT NOT NULL,
  type TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS stream_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stream_id INTEGER NOT NULL,
  user_id INTEGER,
  author_name TEXT NOT NULL,
  text TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'msg',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  chef_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  UNIQUE(customer_id, chef_id)
);
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  sender_id INTEGER,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  chef_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  items TEXT NOT NULL,
  total INTEGER NOT NULL,
  fee INTEGER NOT NULL DEFAULT 0,
  delivery_type TEXT NOT NULL DEFAULT 'delivery',
  address TEXT NOT NULL DEFAULT '',
  payment TEXT NOT NULL DEFAULT 'wallet',
  source TEXT NOT NULL DEFAULT 'site',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS wallets (
  user_id INTEGER PRIMARY KEY,
  balance INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  ref TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chef_id INTEGER NOT NULL,
  author_id INTEGER NOT NULL,
  order_id INTEGER,
  rating INTEGER NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'visible',
  chef_reply TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS favorites (
  user_id INTEGER NOT NULL,
  chef_id INTEGER NOT NULL,
  PRIMARY KEY (user_id, chef_id)
);
CREATE TABLE IF NOT EXISTS complaints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author_id INTEGER NOT NULL,
  target_type TEXT NOT NULL,
  target_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS role_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  specialization TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  user_id INTEGER,
  meta TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS manager_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  manager_id INTEGER NOT NULL,
  chef_id INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'control',
  created_at TEXT NOT NULL,
  UNIQUE(chef_id, kind)
);
`;

export const nowIso = () => new Date().toISOString();
const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

function seed(db: DatabaseSync) {
  const t = nowIso();
  const pass = (p: string) => hashSync(p, 8);

  const insUser = db.prepare(
    "INSERT INTO users (email, pass_hash, name, role, avatar, onboarded, created_at) VALUES (?,?,?,?,?,?,?)"
  );
  const user = (email: string, pw: string, name: string, role: string, avatar: string, createdDaysAgo = 30) =>
    Number(insUser.run(email, pass(pw), name, role, avatar, 1, daysAgo(createdDaysAgo)).lastInsertRowid);

  // --- кухни ---
  const insCuisine = db.prepare("INSERT INTO cuisines (name, emoji) VALUES (?,?)");
  const cuisineIds: Record<string, number> = {};
  for (const [name, emoji] of [
    ["Итальянская", ""], ["Узбекская", ""], ["Грузинская", ""], ["Японская", ""],
    ["Веганская", ""], ["Турецкая", ""], ["Выпечка и десерты", ""], ["Корейская", ""],
    ["Русская", ""],
  ] as const) {
    cuisineIds[name] = Number(insCuisine.run(name, emoji).lastInsertRowid);
  }

  // --- пользователи ---
  const adminId = user("admin@forkwork.ru", "admin123", "Администратор ForkWork", "admin", "", 90);
  const marcoU = user("chef@forkwork.ru", "chef123", "Марко Россини", "chef", "", 80);
  const timurU = user("timur@forkwork.ru", "chef123", "Тимур Юлдашев", "chef", "", 75);
  const ninoU = user("nino@forkwork.ru", "chef123", "Нино Геловани", "chef", "", 70);
  const haruU = user("haru@forkwork.ru", "chef123", "Хару Танака", "chef", "", 65);
  const polinaU = user("polina@forkwork.ru", "chef123", "Полина Ветрова", "chef", "", 60);
  const ayseU = user("ayse@forkwork.ru", "chef123", "Айше Демир", "chef", "", 55);
  const grishaU = user("grisha@forkwork.ru", "chef123", "Григорий Печёнкин", "chef", "", 50);
  const sofiaU = user("sofia@forkwork.ru", "chef123", "Софья Ким", "chef", "", 45);
  const anyaId = user("user@forkwork.ru", "user123", "Аня Смирнова", "customer", "", 40);
  const kirillId = user("kirill@forkwork.ru", "user123", "Кирилл Орлов", "customer", "", 20);
  const lenaId = user("lena@forkwork.ru", "user123", "Лена Маркова", "customer", "", 15);
  const denisId = user("denis@forkwork.ru", "user123", "Денис Чащин", "customer", "", 10);

  // --- менеджеры (кураторы поваров) ---
  const olgaId = user("manager@forkwork.ru", "manager123", "Ольга Корнеева", "manager", "", 85);
  const pavelId = user("manager2@forkwork.ru", "manager123", "Павел Сухой", "manager", "", 60);

  // --- повара ---
  const insChef = db.prepare(
    "INSERT INTO chefs (user_id, bio, specialization, cuisine_id, lat, lng, address, price_level, available, delivery, pickup, work_hours) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)"
  );
  const chef = (uid: number, bio: string, spec: string, cuisine: string, lat: number, lng: number,
    addr: string, price: number, avail: number, del: number, pick: number, hours: string) =>
    Number(insChef.run(uid, bio, spec, cuisineIds[cuisine], lat, lng, addr, price, avail, del, pick, hours).lastInsertRowid);

  const marco = chef(marcoU, "10 лет готовил в тратториях Болоньи. Паста ручной работы, настоящая карбонара без сливок и пицца на закваске.", "Паста и пицца", "Итальянская", 55.7601, 37.6049, "Тверская, 12", 2, 1, 1, 1, "11:00–23:00");
  const timur = chef(timurU, "Плов из казана на огне, самса из тандыра. Семейные рецепты Ташкента в четвёртом поколении.", "Плов и тандыр", "Узбекская", 55.7412, 37.6113, "Пятницкая, 3", 1, 1, 1, 1, "10:00–22:00");
  const nino = chef(ninoU, "Хинкали лепим при вас, хачапури по-аджарски с домашним сыром. Вино советует муж Гоги.", "Хинкали и хачапури", "Грузинская", 55.7553, 37.6502, "Покровка, 27", 2, 1, 1, 1, "12:00–23:00");
  const haru = chef(haruU, "Суши-мастер из Осаки. Рис заправляю по секретной формуле, рыба — утренняя поставка.", "Суши и рамен", "Японская", 55.7625, 37.5849, "Б. Никитская, 21", 3, 1, 1, 0, "12:00–22:00");
  const polina = chef(polinaU, "Растительная кухня без скуки: боулы, фалафель, десерты без сахара. Веганская выпечка по выходным.", "Боулы и фалафель", "Веганская", 55.7349, 37.5904, "Якиманка, 8", 2, 1, 1, 1, "09:00–21:00");
  const ayse = chef(ayseU, "Стамбульский стритфуд: кебабы на углях, пиде, баклава по рецепту бабушки Фатмы.", "Кебаб и пиде", "Турецкая", 55.7699, 37.6351, "Мясницкая, 30", 1, 0, 1, 1, "11:00–23:00");
  const grisha = chef(grishaU, "Пекарь-кондитер. Круассаны на французском масле, медовик, который заказывают за неделю.", "Круассаны и торты", "Выпечка и десерты", 55.7448, 37.5672, "Арбат, 51", 2, 1, 0, 1, "08:00–20:00");
  const sofia = chef(sofiaU, "Корейская домашняя кухня: кимчи собственной закваски, рамён, токпокки и кимпаб.", "Кимчи и рамён", "Корейская", 55.7282, 37.6405, "Люсиновская, 14", 1, 1, 1, 1, "10:00–22:00");

  // --- назначения менеджеров: контроль (control) и поддержка (support) ---
  const insAssign = db.prepare("INSERT INTO manager_assignments (manager_id, chef_id, kind, created_at) VALUES (?,?,?,?)");
  const assign = (mid: number, cid: number, kind: "control" | "support" = "control") => insAssign.run(mid, cid, kind, t);
  // Ольга курирует «итальяно-кавказско-азиатский» куст
  [marco, timur, nino, haru].forEach((c) => assign(olgaId, c, "control"));
  // Павел курирует «веган-восток-десерты» куст
  [polina, ayse, grisha, sofia].forEach((c) => assign(pavelId, c, "control"));
  // перекрёстная поддержка, чтобы показать второй тип прав
  assign(olgaId, polina, "support");
  assign(pavelId, marco, "support");

  // --- блюда ---
  const insDish = db.prepare(
    "INSERT INTO dishes (chef_id, name, description, price, emoji, tags, available, created_at) VALUES (?,?,?,?,?,?,?,?)"
  );
  const dish = (cid: number, name: string, desc: string, price: number, emoji: string, tags: string, avail = 1) =>
    Number(insDish.run(cid, name, desc, price, emoji, tags, avail, t).lastInsertRowid);

  const dCarbonara = dish(marco, "Паста карбонара", "Гуанчале, пекорино, желтки. Без сливок — как в Риме.", 590, "", "паста,классика,хит");
  const dPizza = dish(marco, "Пицца Маргарита", "Тесто 48 часов холодной ферментации, сан-марцано, фьор ди латте.", 650, "", "пицца,вегетарианское");
  dish(marco, "Лазанья болоньезе", "Восемь слоёв, рагу томится 6 часов.", 720, "", "паста,мясо");
  dish(marco, "Тирамису", "Маскарпоне, савоярди, эспрессо. Какао — сверху, ложка — ваша.", 390, "", "десерт,хит");
  const dPlov = dish(timur, "Плов ферганский", "Баранина, жёлтая морковь, зира. Казан, огонь, час времени.", 480, "", "плов,мясо,хит");
  dish(timur, "Самса с бараниной", "Тандыр, слоёное тесто, сочная начинка.", 150, "", "выпечка,мясо");
  dish(timur, "Лагман", "Тянутая лапша, говядина, овощи.", 420, "", "суп,мясо");
  dish(timur, "Чак-чак", "Хрустящий, с горным мёдом.", 250, "", "десерт");
  const dKhinkali = dish(nino, "Хинкали с говядиной (5 шт)", "Сочные, с бульоном. Держите за хвостик!", 450, "", "хинкали,мясо,хит");
  const dKhachapuri = dish(nino, "Хачапури по-аджарски", "Лодочка с сыром, яйцом и сливочным маслом.", 520, "", "выпечка,сыр,хит");
  dish(nino, "Пхали ассорти", "Шпинат, свёкла, фасоль с грецким орехом.", 380, "", "закуска,веганское");
  dish(nino, "Чурчхела", "Виноградный сок, грецкий орех. Сами варим.", 180, "", "десерт");
  const dSushi = dish(haru, "Сет «Осака» (24 шт)", "Лосось, тунец, угорь, креветка. Васаби настоящий.", 1450, "", "суши,рыба,хит");
  dish(haru, "Рамен тонкоцу", "Бульон варится 18 часов. Чашу — двумя руками.", 690, "", "суп,рамен");
  dish(haru, "Поке с лососем", "Рис, лосось, эдамаме, манго.", 590, "", "поке,рыба");
  dish(haru, "Моти ассорти", "Манго, матча, кокос.", 350, "", "десерт");
  const dBowl = dish(polina, "Будда-боул", "Киноа, нут, авокадо, тахини. Полный заряд.", 490, "", "боул,веганское,хит");
  dish(polina, "Фалафель в пите", "Хрустящий снаружи, нежный внутри, соус из кешью.", 380, "", "веганское,стритфуд");
  dish(polina, "Тыквенный крем-суп", "Кокосовые сливки, имбирь, семечки.", 320, "", "суп,веганское");
  dish(polina, "Раф-чизкейк", "Без выпечки и сахара: кешью, финики, малина.", 350, "", "десерт,веганское");
  const dKebab = dish(ayse, "Адана-кебаб", "Рубленая баранина на углях, лаваш, овощи гриль.", 540, "", "кебаб,мясо,хит");
  dish(ayse, "Пиде с сыром и яйцом", "Турецкая лодочка из дровяной печи.", 430, "", "выпечка,сыр");
  dish(ayse, "Чечевичный суп мерджимек", "Классика Стамбула, лимон обязателен.", 290, "", "суп,веганское");
  dish(ayse, "Баклава с фисташками", "40 слоёв теста, щербет, фисташки из Газиантепа.", 320, "", "десерт,хит");
  const dCroissant = dish(grisha, "Круассан классический", "82% масло, 27 слоёв, хруст слышно с улицы.", 220, "", "выпечка,завтрак,хит");
  dish(grisha, "Медовик «как у бабушки»", "12 коржей, томлёная сметана. За неделю — бронь.", 520, "", "торт,десерт,хит");
  dish(grisha, "Эклер фисташковый", "Заварной крем с фисташковой пастой.", 280, "", "десерт");
  dish(grisha, "Хлеб на закваске", "Тартин, 24 часа ферментации.", 350, "", "выпечка,веганское");
  const dRamyeon = dish(sofia, "Рамён с кимчи", "Острый, согревающий, с домашним кимчи.", 450, "", "суп,острое,хит");
  dish(sofia, "Кимпаб с тунцом", "Корейские роллы, 8 штук.", 390, "", "роллы,рыба");
  dish(sofia, "Токпокки", "Рисовые клёцки в соусе кочуджан.", 370, "", "острое,стритфуд");
  dish(sofia, "Кимчи (банка 500г)", "Ферментация 2 недели, капуста по сезону.", 420, "", "закуска,веганское,острое");

  // --- рецепты ---
  const insRecipe = db.prepare(
    "INSERT INTO recipes (chef_id, title, description, time_min, difficulty, emoji, ingredients, steps, tags, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)"
  );
  const recipe = (cid: number, title: string, desc: string, time: number, diff: number, emoji: string,
    ingr: string[], steps: string[], tags: string) =>
    Number(insRecipe.run(cid, title, desc, time, diff, emoji, JSON.stringify(ingr), JSON.stringify(steps), tags, t).lastInsertRowid);

  const rCarbonara = recipe(marco, "Карбонара без сливок", "Та самая римская карбонара: только желтки, сыр и гуанчале. 20 минут — и Рим у вас дома.", 20, 2, "",
    ["Спагетти — 200 г", "Гуанчале (или панчетта) — 100 г", "Желтки — 3 шт", "Пекорино романо — 50 г", "Чёрный перец — много"],
    ["Нарежьте гуанчале брусочками и вытопите на сухой сковороде до хруста.", "Сварите спагетти аль денте, сохраните стакан пасты-воды.", "Смешайте желтки с тёртым пекорино и перцем.", "Снимите сковороду с огня, добавьте пасту и яичную смесь, энергично перемешайте.", "Доведите соус до кремовости пастой-водой. Сразу подавайте."],
    "паста,италия,быстро");
  recipe(timur, "Плов в казане дома", "Ферганский плов на плите: рассыпчатый рис, янтарная морковь и правильный зирвак.", 90, 3, "",
    ["Баранина — 500 г", "Рис девзира — 400 г", "Морковь жёлтая — 300 г", "Лук — 2 шт", "Зира, барбарис, чеснок"],
    ["Раскалите масло, обжарьте лук до тёмно-золотого.", "Добавьте мясо, жарьте до корочки.", "Морковь соломкой, зира — томите 10 минут.", "Залейте кипятком, соль — зирвак кипит 30 минут.", "Рис ровным слоем, не мешать! Готовьте до выпаривания.", "Соберите горкой, чеснок в центр, томите под крышкой 20 минут."],
    "узбекистан,плов,казан");
  recipe(nino, "Хинкали: лепим правильно", "Минимум 19 складочек, бульон внутри и тонкое тесто — учимся у мастеров Тбилиси.", 60, 3, "",
    ["Мука — 500 г", "Говядина+свинина — 400 г", "Лук — 2 шт", "Бульон — 150 мл", "Кинза, перец"],
    ["Замесите крутое тесто на воде с солью, дайте отдохнуть 30 минут.", "В фарш вмешайте ледяной бульон — он станет сочным.", "Раскатайте кружки, в центр — фарш, соберите 19+ складок.", "Варите в кипящей воде 7–8 минут, пока не всплывут и не перевернутся.", "Подавайте с чёрным перцем. Едят руками за хвостик!"],
    "грузия,тесто,мясо");
  recipe(haru, "Идеальный рис для суши", "База всех суши — правильный рис: промывка, варка и заправка су.", 40, 2, "",
    ["Рис для суши — 300 г", "Рисовый уксус — 50 мл", "Сахар — 2 ст.л.", "Соль — 1 ч.л.", "Комбу — кусочек 5 см"],
    ["Промойте рис 5–7 раз до прозрачной воды.", "Варите с комбу: 1:1,1 риса к воде, 12 минут на минимальном огне.", "Растворите сахар и соль в уксусе, не кипятя.", "Переложите рис в широкую посуду, полейте заправкой.", "Перемешивайте режущими движениями, охлаждая веером до 36°C."],
    "япония,суши,база");
  recipe(polina, "Будда-боул за 25 минут", "Формула идеального боула: злак + белок + овощи + соус. Меняйте составляющие под сезон.", 25, 1, "",
    ["Киноа — 100 г", "Нут варёный — 150 г", "Авокадо — 1 шт", "Овощи по сезону", "Тахини, лимон, кленовый сироп"],
    ["Сварите киноа 15 минут, остудите.", "Нут обжарьте с паприкой до хруста.", "Нарежьте овощи и авокадо.", "Соус: тахини + лимонный сок + сироп + вода.", "Соберите боул секторами, полейте соусом, посыпьте семечками."],
    "веган,боул,быстро");
  recipe(ayse, "Мерджимек чорбасы", "Турецкий чечевичный суп-пюре: согревает, стоит копейки, готовится из ничего.", 35, 1, "",
    ["Красная чечевица — 200 г", "Лук, морковь — по 1 шт", "Томатная паста — 1 ст.л.", "Сливочное масло, мята, паприка", "Лимон — обязательно"],
    ["Обжарьте лук и морковь, добавьте томатную пасту.", "Засыпьте промытую чечевицу, залейте водой 1:4.", "Варите 20 минут, пробейте блендером.", "Полейте маслом с паприкой и мятой.", "Подавайте с долькой лимона и сухариками."],
    "турция,суп,бюджетно");
  recipe(grisha, "Круассаны: слоёное тесто без страха", "Главный страх кондитера — ламинирование. Разбираем по шагам с температурами.", 720, 3, "",
    ["Мука Т55 — 500 г", "Масло 82% — 280 г", "Молоко — 140 мл", "Дрожжи свежие — 20 г", "Сахар — 55 г, соль — 10 г"],
    ["Замесите тесто, ночь в холодильнике при 4°C.", "Раскатайте масло в пласт 17×17 см.", "Заверните масло в тесто, раскатайте до 60 см — тур 1.", "Ещё два тура с охлаждением по 30 минут.", "Нарежьте треугольники, скрутите, расстойка 2 часа при 26°C.", "Смажьте желтком, выпекайте 17 минут при 175°C."],
    "выпечка,франция,мастер-класс");
  recipe(sofia, "Кимчи домашнее", "Корейская ферментация: пекинская капуста, кочукару и две недели терпения.", 60, 2, "",
    ["Пекинская капуста — 1 кочан", "Кочукару — 4 ст.л.", "Чеснок, имбирь, дайкон", "Рыбный соус — 2 ст.л. (или соевый)", "Рисовая мука — 1 ст.л."],
    ["Просолите капусту 4 часа, промойте.", "Сварите рисовый кисель, смешайте с кочукару, чесноком, имбирём.", "Промажьте каждый лист пастой.", "Уложите плотно в банку, оставьте на сутки при комнатной температуре.", "Уберите в холодильник на 10–14 дней. Пузырится — значит живое!"],
    "корея,ферментация,веган");

  // --- стримы ---
  const insStream = db.prepare(
    "INSERT INTO streams (chef_id, title, status, scheduled_at, started_at, ended_at, viewers, dish_ids, recipe_id, pinned_message, tags) VALUES (?,?,?,?,?,?,?,?,?,?,?)"
  );
  const sMarco = Number(insStream.run(marco, "Карбонара вживую: из Рима с любовью", "live", null, minsAgo(24), null, 132,
    JSON.stringify([dCarbonara, dPizza]), rCarbonara, "Скидка 10% на карбонару до конца эфира — промокод LIVE10", "паста,карбонара,италия").lastInsertRowid);
  const sNino = Number(insStream.run(nino, "Хинкали-марафон: 100 штук за час", "live", null, minsAgo(41), null, 87,
    JSON.stringify([dKhinkali, dKhachapuri]), null, "Лепим вместе! Вопросы по тесту — в чат", "хинкали,грузия,тесто").lastInsertRowid);
  insStream.run(polina, "Зелёный завтрак: 3 боула на неделю", "live", null, minsAgo(12), null, 45,
    JSON.stringify([dBowl]), null, "", "веган,завтрак,боул");
  insStream.run(grisha, "Круассаны: ламинирование без паники", "scheduled", inHours(20), null, null, 0,
    JSON.stringify([dCroissant]), null, "", "выпечка,мастер-класс");
  insStream.run(haru, "Суши дома: рис, рыба, ритм", "ended", null, daysAgo(1), daysAgo(1), 214,
    JSON.stringify([dSushi]), null, "", "суши,япония");
  insStream.run(sofia, "Кимчи с нуля: день первый", "scheduled", inHours(44), null, null, 0,
    JSON.stringify([dRamyeon]), null, "", "корея,ферментация");
  // Индивидуальный (приватный) эфир — доступ только по личной ссылке с ключом
  db.prepare(
    "INSERT INTO streams (chef_id, title, status, scheduled_at, viewers, dish_ids, recipe_id, pinned_message, tags, visibility, access_key) VALUES (?,?,?,?,?,?,?,?,?,?,?)"
  ).run(marco, "Индивидуальный мастер-класс: паста для своих", "scheduled", inHours(6), 0,
    JSON.stringify([dCarbonara]), rCarbonara, "Закрытый эфир — вход по личной ссылке от повара", "паста,индивидуально", "private", "MARCO-VIP");

  // --- сообщения в стримах ---
  const insSMsg = db.prepare(
    "INSERT INTO stream_messages (stream_id, user_id, author_name, text, kind, created_at) VALUES (?,?,?,?,?,?)"
  );
  insSMsg.run(sMarco, null, "система", "Эфир начался. Добро пожаловать!", "system", minsAgo(24));
  insSMsg.run(sMarco, anyaId, "Аня Смирнова", "Марко, а можно панчетту вместо гуанчале?", "msg", minsAgo(18));
  insSMsg.run(sMarco, null, "Марко Россини", "Можно! Но гуанчале ароматнее — ищите на рынках", "msg", minsAgo(17));
  insSMsg.run(sMarco, lenaId, "Лена Маркова", "Заказала карбонару прямо из эфира, жду!", "msg", minsAgo(9));
  insSMsg.run(sNino, null, "система", "Эфир начался. Добро пожаловать!", "system", minsAgo(41));
  insSMsg.run(sNino, denisId, "Денис Чащин", "Сколько складок минимум?", "msg", minsAgo(30));
  insSMsg.run(sNino, null, "Нино Геловани", "19! Меньше — не хинкали, а вареник", "msg", minsAgo(29));

  // --- заказы ---
  const insOrder = db.prepare(
    "INSERT INTO orders (customer_id, chef_id, status, items, total, fee, delivery_type, address, payment, source, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)"
  );
  const order = (cust: number, cid: number, status: string, items: object[], total: number,
    dt: string, src: string, created: string) =>
    Number(insOrder.run(cust, cid, status, JSON.stringify(items), total, Math.round(total * 0.1), dt, "Москва, ул. Лесная, 7", "wallet", src, created, created).lastInsertRowid);

  const o1 = order(anyaId, nino, "done",
    [{ dishId: dKhinkali, name: "Хинкали с говядиной (5 шт)", price: 450, qty: 2, emoji: "" },
     { dishId: dKhachapuri, name: "Хачапури по-аджарски", price: 520, qty: 1, emoji: "" }],
    1420, "delivery", "map", daysAgo(6));
  order(anyaId, marco, "cooking",
    [{ dishId: dCarbonara, name: "Паста карбонара", price: 590, qty: 1, emoji: "" }],
    590, "delivery", "stream", minsAgo(15));
  order(lenaId, marco, "new",
    [{ dishId: dPizza, name: "Пицца Маргарита", price: 650, qty: 2, emoji: "" }],
    1300, "pickup", "stream", minsAgo(6));
  const o4 = order(denisId, timur, "done",
    [{ dishId: dPlov, name: "Плов ферганский", price: 480, qty: 2, emoji: "" }],
    960, "delivery", "map", daysAgo(3));
  const o5 = order(kirillId, haru, "done",
    [{ dishId: dSushi, name: "Сет «Осака» (24 шт)", price: 1450, qty: 1, emoji: "" }],
    1450, "delivery", "site", daysAgo(2));
  order(lenaId, grisha, "done",
    [{ dishId: dCroissant, name: "Круассан классический", price: 220, qty: 4, emoji: "" }],
    880, "pickup", "site", daysAgo(5));
  order(denisId, sofia, "delivering",
    [{ dishId: dRamyeon, name: "Рамён с кимчи", price: 450, qty: 1, emoji: "" }],
    450, "delivery", "map", minsAgo(35));

  // --- отзывы ---
  const insReview = db.prepare(
    "INSERT INTO reviews (chef_id, author_id, order_id, rating, text, status, chef_reply, created_at) VALUES (?,?,?,?,?,?,?,?)"
  );
  insReview.run(nino, anyaId, o1, 5, "Хинкали — восторг! Бульон внутри, тесто тонкое. Доставили горячими.", "visible", "Спасибо, Аня! Приходите на стрим — научу лепить", daysAgo(5));
  insReview.run(marco, lenaId, null, 5, "Лучшая карбонара в городе, без шуток. Рим отдыхает.", "visible", "", daysAgo(10));
  insReview.run(marco, denisId, null, 4, "Пицца отличная, но ждал на 15 минут дольше обещанного.", "visible", "Извините за ожидание! В пятницу был аврал — исправляемся.", daysAgo(8));
  insReview.run(timur, denisId, o4, 5, "Плов как в Ташкенте у бабушки. Рассыпчатый, мясо тает.", "visible", "", daysAgo(2));
  insReview.run(haru, kirillId, o5, 5, "Рыба свежайшая, рис идеальный. Видно руку мастера.", "visible", "", daysAgo(1));
  insReview.run(haru, lenaId, null, 4, "Вкусно, но дорого. Хотя за качество — справедливо.", "visible", "", daysAgo(12));
  insReview.run(polina, anyaId, null, 5, "Наконец-то веганская еда, которая не скучная! Боул — топ.", "visible", "", daysAgo(7));
  insReview.run(grisha, lenaId, null, 5, "Круассаны хрустят так, что соседи завидуют.", "visible", "", daysAgo(4));
  insReview.run(ayse, denisId, null, 3, "Кебаб вкусный, но остыл по дороге. Упаковку бы получше.", "visible", "Спасибо за честность — уже заказали термопакеты!", daysAgo(9));
  insReview.run(sofia, kirillId, null, 5, "Кимчи — огонь. Беру вторую банку.", "visible", "", daysAgo(3));
  insReview.run(marco, kirillId, null, 1, "СПАМ: продам гараж недорого", "hidden", "", daysAgo(2));

  // --- кошельки ---
  const insWallet = db.prepare("INSERT INTO wallets (user_id, balance) VALUES (?,?)");
  insWallet.run(adminId, 0);
  insWallet.run(olgaId, 0);
  insWallet.run(pavelId, 0);
  insWallet.run(anyaId, 5000);
  insWallet.run(kirillId, 2300);
  insWallet.run(lenaId, 800);
  insWallet.run(denisId, 1500);
  insWallet.run(marcoU, 12450);
  insWallet.run(timurU, 8200);
  insWallet.run(ninoU, 9100);
  insWallet.run(haruU, 15600);
  insWallet.run(polinaU, 4300);
  insWallet.run(ayseU, 3900);
  insWallet.run(grishaU, 6700);
  insWallet.run(sofiaU, 5100);

  // --- транзакции ---
  const insTx = db.prepare(
    "INSERT INTO transactions (user_id, type, amount, comment, ref, created_at) VALUES (?,?,?,?,?,?)"
  );
  insTx.run(anyaId, "topup", 6000, "Пополнение кошелька", "", daysAgo(7));
  insTx.run(anyaId, "payment", -1420, "Оплата заказа #" + o1, "order:" + o1, daysAgo(6));
  insTx.run(anyaId, "payment", -590, "Оплата заказа (карбонара)", "", minsAgo(15));
  insTx.run(anyaId, "tip_out", -100, "Чаевые повару Нино Геловани", "", daysAgo(5));
  insTx.run(ninoU, "income", 1278, "Заказ #" + o1 + " (за вычетом комиссии 10%)", "order:" + o1, daysAgo(6));
  insTx.run(ninoU, "tip_in", 100, "Чаевые от Аня Смирнова", "", daysAgo(5));
  insTx.run(marcoU, "income", 531, "Заказ (карбонара), комиссия 10%", "", minsAgo(14));
  insTx.run(kirillId, "topup", 4000, "Пополнение кошелька", "", daysAgo(3));
  insTx.run(kirillId, "payment", -1450, "Оплата заказа #" + o5, "order:" + o5, daysAgo(2));
  insTx.run(haruU, "income", 1305, "Заказ #" + o5 + " (за вычетом комиссии 10%)", "order:" + o5, daysAgo(2));

  // --- избранное ---
  const insFav = db.prepare("INSERT INTO favorites (user_id, chef_id) VALUES (?,?)");
  insFav.run(anyaId, marco);
  insFav.run(anyaId, nino);
  insFav.run(lenaId, grisha);

  // --- личные чаты ---
  const insChat = db.prepare("INSERT INTO chats (customer_id, chef_id, status, created_at) VALUES (?,?,?,?)");
  const insCMsg = db.prepare("INSERT INTO chat_messages (chat_id, sender_id, text, created_at) VALUES (?,?,?,?)");
  const c1 = Number(insChat.run(anyaId, nino, "active", daysAgo(5)).lastInsertRowid);
  insCMsg.run(c1, null, "Повар принял запрос на личный чат. Будьте вежливы и приятного общения!", daysAgo(5));
  insCMsg.run(c1, anyaId, "Нино, здравствуйте! Можно заказать хинкали на субботу на компанию 8 человек?", daysAgo(5));
  insCMsg.run(c1, ninoU, "Здравствуйте, Аня! Конечно. 40 штук хватит? Сделаю свежие к 18:00.", daysAgo(5));
  insCMsg.run(c1, anyaId, "Идеально! Оформлю заказ здесь на платформе.", daysAgo(4));
  const c2 = Number(insChat.run(lenaId, marco, "pending", minsAgo(50)).lastInsertRowid);
  insCMsg.run(c2, null, "Запрос на личный чат отправлен. Ожидайте согласия повара.", minsAgo(50));

  // --- жалобы ---
  const insComplaint = db.prepare(
    "INSERT INTO complaints (author_id, target_type, target_id, reason, status, created_at) VALUES (?,?,?,?,?,?)"
  );
  insComplaint.run(lenaId, "review", 11, "Спам в отзывах: реклама гаража", "open", daysAgo(2));
  insComplaint.run(denisId, "stream", sNino, "Музыка на фоне слишком громкая (шутка, но проверьте)", "open", minsAgo(33));

  // --- заявки на роль повара ---
  db.prepare("INSERT INTO role_requests (user_id, message, specialization, status, created_at) VALUES (?,?,?,?,?)")
    .run(kirillId, "Готовлю неаполитанскую пиццу в дровяной печи на даче, хочу делиться и продавать.", "Пицца", "pending", daysAgo(1));

  // --- события для аналитики ---
  const insEvent = db.prepare("INSERT INTO events (type, user_id, meta, created_at) VALUES (?,?,?,?)");
  for (let d = 14; d >= 0; d--) {
    const n = 3 + ((d * 7) % 5);
    for (let i = 0; i < n; i++) insEvent.run("visit", null, JSON.stringify({ src: ["direct", "search", "social"][i % 3] }), daysAgo(d));
    insEvent.run("stream_view", anyaId, JSON.stringify({ streamId: sMarco }), daysAgo(d));
    if (d % 2 === 0) insEvent.run("stream_view", lenaId, JSON.stringify({ streamId: sNino }), daysAgo(d));
    if (d % 3 === 0) insEvent.run("order_created", anyaId, JSON.stringify({ source: "stream" }), daysAgo(d));
  }
}

// Идемпотентная миграция: гарантирует наличие менеджеров и их назначений даже
// в БД, созданных до появления роли (там seed уже не запускается). Безопасна
// при повторных и параллельных вызовах: уникальные индексы + INSERT OR IGNORE.
function ensureManagers(db: DatabaseSync) {
  const t = nowIso();
  const ensureUser = (email: string, name: string): number => {
    db.prepare(
      "INSERT OR IGNORE INTO users (email, pass_hash, name, role, avatar, onboarded, created_at) VALUES (?,?,?,?,?,1,?)"
    ).run(email, hashSync("manager123", 8), name, "manager", "", t);
    const row = db.prepare("SELECT id FROM users WHERE email = ?").get(email) as { id: number };
    db.prepare("INSERT OR IGNORE INTO wallets (user_id, balance) VALUES (?, 0)").run(row.id);
    return row.id;
  };
  const olga = ensureUser("manager@forkwork.ru", "Ольга Корнеева");
  const pavel = ensureUser("manager2@forkwork.ru", "Павел Сухой");

  const have = (db.prepare("SELECT COUNT(*) AS n FROM manager_assignments").get() as { n: number }).n;
  if (have > 0) return; // назначения уже расставлены — не трогаем

  const chefByEmail = (email: string): number | undefined =>
    (db.prepare("SELECT c.id AS id FROM chefs c JOIN users u ON u.id = c.user_id WHERE u.email = ?").get(email) as
      | { id: number }
      | undefined)?.id;
  const ins = db.prepare("INSERT OR IGNORE INTO manager_assignments (manager_id, chef_id, kind, created_at) VALUES (?,?,?,?)");
  const a = (mid: number, email: string, kind: "control" | "support" = "control") => {
    const cid = chefByEmail(email);
    if (cid) ins.run(mid, cid, kind, t);
  };
  ["chef@forkwork.ru", "timur@forkwork.ru", "nino@forkwork.ru", "haru@forkwork.ru"].forEach((e) => a(olga, e));
  ["polina@forkwork.ru", "ayse@forkwork.ru", "grisha@forkwork.ru", "sofia@forkwork.ru"].forEach((e) => a(pavel, e));
  a(olga, "polina@forkwork.ru", "support");
  a(pavel, "chef@forkwork.ru", "support");
}

const sleepSync = (ms: number) => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

function open(): DatabaseSync {
  const dir = path.join(process.cwd(), "data");
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, "forkwork.db"));
  db.exec("PRAGMA busy_timeout = 8000;");
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);
  // Догоняющая миграция для БД, созданных до появления приватных эфиров.
  // Гонка параллельных процессов (`duplicate column`) безопасно игнорируется.
  for (const ddl of [
    "ALTER TABLE streams ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public'",
    "ALTER TABLE streams ADD COLUMN access_key TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE streams ADD COLUMN camera_live INTEGER NOT NULL DEFAULT 0",
  ]) {
    try {
      db.exec(ddl);
    } catch {}
  }
  // Сид первого запуска: защищён от гонок параллельных процессов (например, воркеров next build)
  for (let attempt = 0; ; attempt++) {
    try {
      db.exec("BEGIN IMMEDIATE");
      const row = db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
      if (row.n === 0) seed(db);
      ensureManagers(db); // догоняем существующие БД, созданные до роли «Менеджер»
      db.exec("COMMIT");
      break;
    } catch (e) {
      try {
        db.exec("ROLLBACK");
      } catch {}
      if (attempt >= 10) throw e;
      sleepSync(150 * (attempt + 1));
    }
  }
  return db;
}

// Ленивый синглтон: не открываем базу на импорте модуля (важно для сборки),
// переживает горячую перезагрузку в dev-режиме
function getDb(): DatabaseSync {
  const g = globalThis as unknown as { __fwdb?: DatabaseSync };
  return (g.__fwdb ??= open());
}

export const db: DatabaseSync = new Proxy({} as DatabaseSync, {
  get(_target, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = real[prop];
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(real) : value;
  },
});
