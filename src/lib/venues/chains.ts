/**
 * Оценки и отзывы по сетям, которых много в общей базе заведений: у одной сети
 * один набор страниц на Отзовике или Irecommend, поэтому он относится ко всем её
 * точкам и в списках помечен «по сети». Прочитано на страницах источников
 * 2026-10-01 и 2026-10-02. На Irecommend фрагмент — заголовок отзыва, звёзды
 * отдельных отзывов с этого сайта не берём; на Отзовике звёзды как на странице.
 * Тональность: по звёздам, где они есть, иначе по смыслу (наша пометка).
 */
import type { ReviewTone, VenueReview } from "./reviews";
import { reviewStats, type ReviewStats } from "./reviewstats";
import { spectrumOf, type Spectrum } from "./spectrum";
import type { Rating } from "./types";

export type Chain = { id: string; name: string; aliases: string[]; ratings: Rating[]; reviews: VenueReview[] };

/** Средний чек сети в рублях: типичное значение по 2ГИС и разброс по точкам. Прочитано 2026-10-02. */
export const CHAIN_CHECKS: Record<string, { rub: number; text: string; url: string }> = {
  shokoladnica: { rub: 800, text: "около 800 ₽ (по точкам сети от 400 до 1 000 ₽)", url: "https://2gis.ru/moscow/branches/4504136498310300" },
  teremok: { rub: 450, text: "около 450 ₽ (по точкам сети 300–550 ₽)", url: "https://2gis.ru/moscow/firm/70000001068908527" },
  dodo: { rub: 500, text: "около 500 ₽ (по точкам сети 400–900 ₽)", url: "https://2gis.ru/moscow/branches/70000001032901383" },
  "vkusno-i-tochka": { rub: 400, text: "около 400 ₽ (по точкам сети 350–500 ₽)", url: "https://2gis.ru/moscow/firm/70000001007368641" },
  "kroshka-kartoshka": { rub: 450, text: "около 450 ₽ (по точкам сети 300–850 ₽)", url: "https://2gis.ru/moscow/branches/4504136498441391" },
  "burger-king": { rub: 450, text: "около 450 ₽ (по точкам сети 300–550 ₽)", url: "https://2gis.ru/moscow/firm/4504128908415304" },
  rostics: { rub: 450, text: "около 450 ₽ (по точкам сети 350–550 ₽)", url: "https://2gis.ru/moscow/firm/4504127910428339/tab/prices" },
  cofix: { rub: 300, text: "около 300 ₽ (по точкам сети 250–350 ₽)", url: "https://2gis.ru/moscow/firm/70000001059277022" },
  "one-price-coffee": { rub: 400, text: "около 400 ₽ (по точкам сети от 120 до 750 ₽)", url: "https://2gis.ru/moscow/firm/70000001082456234" },
  "surf-coffee": { rub: 450, text: "около 450 ₽ (по точкам сети 250–550 ₽)", url: "https://2gis.ru/moscow/firm/70000001081678714" },
};

const OTZ = "https://otzovik.com";
const IREC = "https://irecommend.ru/content";
const PERIOD = "прочитано 2026-10-01";

const otz = (list: string, c: Pick<Rating, "value" | "count">): Rating => ({ source: "Отзовик", url: `${OTZ}/reviews/${list}/`, value: c.value, scale: 5, count: c.count, period: PERIOD, kind: "гости" });
const irec = (slug: string, c: Pick<Rating, "value" | "count">): Rating => ({ source: "Irecommend", url: `${IREC}/${slug}`, value: c.value, scale: 5, count: c.count, period: PERIOD, kind: "гости" });

const toneOf = (stars: number): ReviewTone => (stars >= 4 ? "+" : stars === 3 ? "±" : "-");
/** Отзыв с Отзовика: автор, дата, звёзды, фрагмент, номер страницы отзыва. */
const o = (author: string, date: string, stars: number, text: string, id: string): VenueReview => ({
  source: "Отзовик",
  url: `${OTZ}/review_${id}.html`,
  author,
  date,
  stars,
  text,
  tone: toneOf(stars),
  chain: true,
});
/** Отзыв с Irecommend: автор, дата, заголовок, адрес страницы отзыва. */
const i = (author: string, date: string, text: string, slug: string, tone: ReviewTone): VenueReview => ({ source: "Irecommend", url: `${IREC}/${slug}`, author, date, text, tone, chain: true });

export const CHAINS: Chain[] = [
  {
    id: "shokoladnica",
    name: "Шоколадница",
    aliases: ["Шоколадница"],
    ratings: [otz("set_kofeen_shokoladnica_russia_moscow", { value: 2.8, count: "722 отзыва, 41 % рекомендуют" })],
    reviews: [
      o("Bojena87", "07.06.2021", 1, "40 минут ожидания, тёплое вино, плохое кофе", "12022921"),
      o("Ната-2", "03.06.2026", 5, "За капучино сюда, даже быстро здесь готовят его отлично", "18396336"),
      o("Лиля Ли", "12.06.2022", 1, "Никогда не ходите в Шоколадницу с утра и не пейте шампанское", "13474439"),
      o("Emma22", "06.07.2018", 4, "Атмосферное заведение, где приятно проводить время.", "6675558"),
      o("Avrora71", "29.12.2018", 5, "Уютно, вкусно, быстрое, вежливое обслуживание.", "7470552"),
      o("НастяЗнает", "13.11.2024", 4, "Долгое обслуживание. В наличии не было нескольких десертов из меню.", "16731040"),
      o("spook", "25.10.2018", 5, "Очень-очень вкусно кормят!", "7146525"),
      o("cortes88", "24.06.2022", 4, "маленькие порции; стоимость", "13516536"),
    ],
  },
  {
    id: "teremok",
    name: "Теремок",
    aliases: ["Теремок"],
    ratings: [irec("teremok-russkie-bliny-moskva", { value: 3.4, count: "239 голосов" })],
    reviews: [
      i("Mrs_Et", "17.08.2026", "Знакома с «Теремком» более 12 лет. Расскажу о конфликтных ситуациях", "znakoma-s-teremkom-bolee-12-let-rasskazhu-o-konfliktnykh-situatsiyakh-o-tom-chto-mne-ne-nrav", "±"),
      i("До завтра", "13.07.2025", "Теремок: непростые отношения от любви до ненависти и обратно", "teremok-neprostye-otnosheniya-ot-lyubvi-do-nenavisti-i-obratno-chto-ya-ne-rekomenduyu-tam-es", "±"),
      i("Sasha M", "27.07.2026", "Не умею печь блины, поэтому хожу в Теремок утром, днем и вечером", "khot-gde-menya-nazyvayut-sudarynei-ne-umeyu-pech-bliny-poetomu-khozhu-v-teremok-utrom-dnem-i", "+"),
      i("Moon.and.Ocean", "16.05.2025", "Очень не вкусно, очень тяжело и очень не безопасно", "ochen-ne-vkusno-ochen-tyazhelo-i-ochen-ne-bezopasno-uvy-no-imenno-takoi-teremok-v-2025", "-"),
      i("MalwiMalwi", "21.05.2026", "Место, где можно сытно и вкусно поесть за приятную стоимость", "teremok-mesto-gde-mozhno-sytno-i-vkusno-poest-za-priyatnuyu-stoimost-vkusnye-supchiki-sytnye", "+"),
      i("Miss Von Teese", "08.04.2025", "Любимое кафе Теремок: расскажу, что поесть, как получить скидку", "lyubimoe-kafe-teremok-rasskazhu-chto-poest-kak-poluchit-skidku-i-vospolzovatsya-kuponami-est", "+"),
      i("ElishevaLily", "08.05.2025", "Когда-то «Теремок» был моим любимым фастфудом, но больше не хочется", "kogda-teremok-byl-moim-lyubimym-fastfudom-no-bolshe-vozvrashchatsya-v-nego-ne-khochetsya-rus", "-"),
      i("Odarka_Dara", "25.03.2025", "Всегда думала, что в этой сети самые вкусные блинчики, пока не", "vsegda-dumala-chto-v-etoi-seti-samye-vkusnye-blinchiki-poka-ne-poprobovala-ikh-v-drugom-mest", "±"),
    ],
  },
  {
    id: "dodo",
    name: "Додо Пицца",
    aliases: ["Додо Пицца", "Dodo Pizza"],
    ratings: [otz("pizza_dodo_picca", { value: 2.3, count: "1 093 отзыва, 29 % рекомендуют" })],
    reviews: [
      o("julia mamochka", "06.12.2021", 4, "Вкусно, сытно", "12766205"),
      o("Criolla", "03.10.2020", 1, "Зажали кусок пиццы ребёнку", "10723014"),
      o("Experter", "20.02.2018", 4, "Вкусная пицца за 70 рублей, отличное тесто", "6086043"),
      o("Звук Тишины", "01.02.2022", 5, "Яркая, вкусная, сочная!", "13011974"),
      o("Svarshik78", "14.02.2024", 1, "Развод по промокоду", "15793491"),
      o("EkaterinaF2016", "20.10.2018", 4, "Много начинки, вкусно", "7120858"),
      o("Po4talion", "20.06.2019", 5, "Много вкусной свежей начинки, тонкое тесто", "8356605"),
      o("Аноним7114290", "24.02.2026", 1, "ОЧЕНЬ ДОЛГО ГОТОВЯТ ЗАКАЗЫ", "18144742"),
    ],
  },
  {
    id: "vkusno-i-tochka",
    name: "Вкусно — и точка",
    aliases: ["Вкусно — и точка", "Вкусно и точка"],
    ratings: [irec("vkusno-i-tochka-moskva", { value: 2.8, count: "436 голосов" })],
    reviews: [
      i("neli_rulit", "19.08.2026", "Вот что я скажу: как сейчас кормят, спустя 4 года после ребрендинга", "vkusno-i-tochka-vot-chto-ya-skazhu-kak-seichas-kormyat-spustya-4-goda-posle-rebrendinga-obzo", "±"),
      i("Stasya_00", "08.05.2024", "Мнение бывшего манагера Макдональдса. Что же там так сильно изменилось", "kak-menya-priglasili-v-restoran-mnenie-byvshego-managera-makdonaldsa-chto-zhe-tam-tak-silno", "±"),
      i("Sun12", "11.09.2026", "Раньше было лучше? Чем мне не нравится Вкусно и Точка, а что порадовало", "ranshe-bylo-luchshe-chem-mne-ne-nravitsya-vkusno-i-tochka-chto-poradovalo", "±"),
      i("FleurNarcotique", "13.06.2022", "После того, как я прочитала информацию на коробках и в чеке, я это точно больше никогда", "vredno-i-tochka", "-"),
      i("AlinaWHY191", "07.08.2026", "Фраппе, ради которого я посещаю данное заведение. Приятное заведение не без минусов", "frappe-radi-kotorogo-ya-poseshchayu-dannoe-zavedenie-priyatnoe-zavedenie-ne-bez-minusov", "+"),
      i("anutka375", "12.09.2026", "В целом хороший ресторан быстрого питания с интересными новинками в меню", "v-tselom-khoroshii-restoran-bystrogo-pitaniya-s-interesnymi-novinkami-v-menyu", "+"),
      i("IICherkasovII", "23.08.2024", "Накосячили просто везде, где могли", "nakosyachili-prosto-vezde-gde-mogli", "-"),
      i("MyOpinion.12_30", "20.01.2023", "Отзыв бывшего сотрудника мака. Изменилась ли еда после ребрендинга?", "otzyv-byvshego-sotrudnika-maka-izmenilas-li-eda-posle-rebrendinga-posmotrite-i-sravnite", "±"),
    ],
  },
  {
    id: "kroshka-kartoshka",
    name: "Крошка Картошка",
    aliases: ["Крошка Картошка", "Крошка-картошка"],
    ratings: [irec("kroshka-kartoshka-moskva", { value: 2.9, count: "143 голоса" })],
    reviews: [
      i("Summerside", "27.01.2025", "Зайти поесть в Крошку-картошку? Только если совсем нет альтернативы", "zaiti-poest-v-kroshku-kartoshku-tolko-esli-sovsem-net-alternativy-chto-tam-tochno-ne-stoit-b", "-"),
      i("DavveroVero", "07.07.2025", "Не изменяю своей Крошке уже много лет. Классное кафе", "ne-izmenyayu-svoei-kroshke-uzhe-mnogo-let-klassnoe-kafe-kto-chto-ni-govoril-nostalgiya-po-by", "+"),
      i("ural_ga", "10.11.2025", "Мы, старые работники культуры, помним, какие были булочки!", "my-starye-rabotniki-kultury-pomnim-kakie-byli-bulochki", "±"),
      i("E_nigma72", "10.01.2025", "Просто лучшее, что есть в фастфуде. Обожаю ее и ставлю 5 звезд", "prosto-luchshee-chto-est-v-fastfude-obozhayu-ee-i-stavlyu-5-zvezd-nesmotrya-na-khamstvo-seti", "+"),
      i("arkktika", "16.11.2023", "Вкусная печеная картошка необычного размера. Вернулась к ней", "vkusnaya-pechenaya-kartoshka-neobychnogo-razmera-vernulas-k-nei-nesmotrya-na-otravlenie", "+"),
      i("Helgamama", "11.09.2024", "Здесь можно кушать, если не боитесь тараканов", "zdes-mozhno-kushat-esli-ne-boites-tarakanov-i-ne-edite-kartoshku-s-kozhuroi", "-"),
      i("pronya2082", "19.05.2025", "Двойное комбо! Благодаря Крошке Картошке получила подвеску", "dvoinoe-kombo-blagodarya-kroshke-kartoshke-poluchila-podvesku-sunlig", "+"),
      i("tashafire30", "27.04.2025", "Не впечатлила меня крошка-картошка", "ne-vpechatlila-menya-kroshka-kartoshka", "±"),
    ],
  },
  {
    id: "burger-king",
    name: "Бургер Кинг",
    aliases: ["Бургер Кинг", "Burger King"],
    ratings: [otz("set_restoranov_bistrogo_pitaniya_burger_king_russia_moscow", { value: 2.6, count: "1 616 отзывов, 37 % рекомендуют" })],
    reviews: [
      o("Ника-Клубника", "21.08.2017", 5, "Более 100 ресторанов по Москве, области и в других городах, широкий выбор блюд", "5263272"),
      o("julia mamochka", "03.07.2022", 5, "Вкусно, можно списывать сбер спасибо", "13543928"),
      o("Experter", "04.04.2019", 2, "Редко абсолютно все блюда совсем невкусные", "8003384"),
      o("Космическая-я", "29.07.2024", 5, "Дети счастливы)", "16369351"),
      o("anna spiridonova", "01.01.2019", 4, "Быстро, чисто", "7481389"),
      o("champion-maks", "23.12.2019", 1, "Мало столиков, готовят без перчаток, не всё вкусно", "9209907"),
      o("Лиля Ли", "24.06.2022", 1, "Дорого и невкусно. Бургер кинг очень испортился", "13515573"),
      o("alex2960570alex", "28.10.2019", 4, "Расположение. Цены. Сытная еда. Бонусы.", "8934537"),
    ],
  },
  {
    id: "rostics",
    name: "Rostic's",
    aliases: ["Rostic's", "Ростикс"],
    ratings: [irec("rostiks-kfc-saratov-saratov", { value: 2.0, count: "118 голосов" })],
    reviews: [
      i("Printre Ingeri", "28.05.2026", "Это было последней каплей! Ростикс, спасибо за испорченный День Рождения!", "eto-bylo-poslednei-kaplei-rostiks-spasibo-za-isporchennyi-den-rozhdeniya", "-"),
      i("aus67regira", "02.02.2026", "Хотите унижений за ваши деньги — тогда вам в Rostic's.", "khotite-unizhenii-za-vashi-dengi-togda-vam-v-rostic-s", "-"),
      i("Stasya_00", "10.12.2025", "Бургеры из сухой подошвы и жгучие крылья, после которых горит не одно место", "zakheitili-novogodnee-menyu-rostiks-ya-tozhe-vyskazhus-burgery", "-"),
      i("Queen of spirits", "15.07.2026", "Не справляемся? Да и не собираемся! Квест с острым заказом в Ростикс", "ne-spravlyaemsya-da-i-ne-sobiraemsya-kvest-s-ostrym-zakazom-v-rostiks", "-"),
      i("Karina_Lat", "29.06.2025", "Самый грязный общепит, который я вообще видела. Пол и швабра не знакомы", "otvratitelno-i-tochka-fu-fu-fu-ne-khodili-v-fastfud-restorany", "-"),
      i("ksellena", "22.10.2023", "Мой первый и последний заказ в Rostic's. Новинка Ростмастер Чиз", "rostiks-na-zamenu-kfs-moi-pervyi-i-poslednii-zakaz-v-rostic-s", "-"),
      i("Хмурик", "23.07.2026", "Не люблю фаст-фуд, зашла в Ростикс ради миньонов и сто раз пожалела", "ne-lyublyu-fast-fud-zashla-v-rostiks-radi-minonov-i-sto-raz-pozhalela", "-"),
      i("Astarta88", "15.09.2026", "Доставка Rostic's — ни еды, ни денег. Деньги списали, но еды не доставили", "dostavka-rostics-ni-edy-ni-deneg-n11698130", "-"),
    ],
  },
  {
    id: "cofix",
    name: "Cofix",
    aliases: ["Cofix"],
    ratings: [irec("cofix-moskva", { value: 2.8, count: "97 голосов" })],
    reviews: [
      i("Julia Rylai", "14.10.2025", "Cofix совсем обнаглели! Смешно с того, сколько кофе они налили", "cofix-sovsem-obnagleli-prosto-posmotrite-skolko-kofe-oni-nalili-set-kofeen-zanyavshaya-vsyu", "-"),
      i("natulka09", "11.03.2026", "Встречаем весну в Cofix. Расскажу, как весь март покупать кофе и чай в 2 раза дешевле", "vstrechaem-vesnu-v-cofix-rasskazhu-kak-ves-mart-pokupat-kofe-i-chai-v-2-raza-deshevle", "+"),
      i("Оленьканн", "24.08.2025", "А вы пробовали кофе латте лимонная МЕРЕНГА и круглый круассан?", "vy-probovali-kofe-latte-limonnaya-merenga-i-kruglyi-kruassan-s-mandarinom-i-brusnikoisocheta", "+"),
      i("Juicy Olya", "10.01.2020", "Cofix уже не тот! Отзыв постоянного посетителя", "cofix-uzhe-ne-tot-otzyv-postoyannogo-posetitelya-l-kofeinya-odnoi-tseny-prevrashchaetsya-v-s", "-"),
      i("эсмиральда 153", "06.05.2019", "Просроченную запеканку, сэр?", "v-dannoi-kofeine-fresh-tolko-kofe-ves-assortimert-edy-prosrochka-v-99-sluchaevkak-cofix-pere", "-"),
      i("Златовласка", "18.08.2019", "Простите меня, поклонники Cofix, но нет, больше я сюда не приду", "prostite-menya-poklonniki-cofix-no-net-bolshe-ya-syuda-ne-pridu", "-"),
      i("Nika Vorozhtsova", "26.02.2019", "Дешёвая кофейня фиксированных цен. Имеет ли смысл заходить сюда", "deshevaya-kofeinya-fiksirovannykh-tsen-imeet-li-smysl-zakhodit-syuda-kakie-priyatnye-bonusy", "±"),
      i("nastya3015", "20.09.2018", "Как меня обольгали в кофикс при покупке кофе", "kak-menya-obolgali-v-kofiks-pri-pokupke-kofe-rezyume-po-seti-stoit-li-pokupat-franshizu-dann", "-"),
    ],
  },
  {
    id: "one-price-coffee",
    name: "One Price Coffee",
    aliases: ["One Price Coffee"],
    ratings: [otz("kofeynya_one_price_coffee_russia_moscow", { value: 2.6, count: "115 отзывов, 40 % рекомендуют" })],
    reviews: [
      o("Flikka", "15.06.2020", 4, "кофе и напитки, десерты и легкие закуски, вкусные сэндвичи", "10203923"),
      o("GURU36", "29.10.2020", 3, "Есть что-то по 60 рублей, вкусно, вечером скидка на выпечку", "10851962"),
      o("mazkomax", "11.09.2026", 5, "Вкусно и качественно", "18658449"),
      o("prettylotta", "07.03.2024", 4, "Здесь есть вкусный бабл-ти! Программа лояльности.", "15883023"),
      o("Criolla", "21.03.2019", 5, "вкусный кофе, аппетитная выпечка, ассортимент десертов", "7921673"),
      o("Tatyana Sekhmet", "10.12.2025", 5, "Много новинок, интересные акции, вкусно, есть в каждом районе", "17921344"),
      o("Femmi", "11.09.2022", 3, "Большой ассортимент, относительно недорого", "13777071"),
      o("Собакина Долли", "29.02.2020", 4, "Вкусная выпечка, недорого, многое по 60р, уютно, скидки", "9565506"),
    ],
  },
  {
    id: "surf-coffee",
    name: "Surf Coffee",
    aliases: ["Surf Coffee"],
    ratings: [otz("kofeynya_surf_coffee_russia_moscow", { value: 3.9, count: "40 отзывов, 72 % рекомендуют" })],
    reviews: [
      o("Flikka", "18.10.2023", 5, "атмосфера, обслуживание, кофеек, выпечка", "15323891"),
      o("SoulCatti", "22.09.2022", 5, "Расположение, ассортимент напитков, еды, продают кофейные зерна", "13815431"),
      o("Саша2502", "16.08.2023", 5, "Приятный интерьер, атмосфера, доброжелательный молодой персонал, свежие вкусняшки", "15082023"),
      o("Dkaorvianla", "26.04.2023", 4, "Вкусно, уютно, оригинально, стильно, разнообразно", "14655911"),
      o("Аноним6991671", "03.12.2025", 1, "Персонал без эмпатии, отсутствие вкуса и абсолютная жестокость", "17902020"),
      o("coconut shark", "09.07.2026", 5, "атмосфера, бесплатный интернет, качество, стабильность", "18497127"),
      o("Sveta25aaa", "05.06.2026", 1, "Ужасные неприветливые официанты, очень долго ждать", "18402694"),
      o("EkaterinaLap97", "13.05.2026", 5, "Уютная атмосфера, вкусный кофе, сезонное меню", "18347363"),
    ],
  },
];

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9]/g, "");
const BY_NAME = new Map(CHAINS.flatMap((c) => c.aliases.map((a) => [norm(a), c] as const)));

/** Сеть по названию точки из общей базы: точное совпадение названия без регистра и знаков препинания. */
export const chainOf = (name: string): Chain | undefined => BY_NAME.get(norm(name));

export type ChainView = { name: string; spectrum: Spectrum | null; reviews: VenueReview[]; stats: ReviewStats };

/** Оценки и отзывы сети для точки из общей базы; null, если сеть не из набора. */
export function chainView(name: string): ChainView | null {
  const c = chainOf(name);
  return c ? { name: c.name, spectrum: spectrumOf(c.ratings), reviews: c.reviews, stats: reviewStats(c.reviews) } : null;
}
