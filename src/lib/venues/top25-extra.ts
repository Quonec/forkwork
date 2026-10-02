/**
 * Повара на кухне и средний чек избранных заведений. Всё приведено по
 * публикациям и страницам, найденным 2026-10-02; у каждой строки ссылка на
 * источник. Составы кухонь меняются, в источниках бывают расхождения (они
 * названы), поэтому актуальное всегда на сайте заведения.
 */
/**
 * Сведение о поваре. `text` — исходная фраза из источника (она показывается, пока нет разбивки);
 * `path` и `awards` — та же фраза, разложенная на гастропуть и достижения (ничего сверх источника).
 */
export type ChefFact = { text: string; url: string; name?: string; role?: string; path?: string; awards?: string[] };
export type AvgCheck = { rub: number; text: string; url: string };

const G2 = (id: string) => `https://2gis.ru/moscow/firm/${id}`;

export const CHEFS: Record<string, ChefFact[]> = {
  pushkin: [
    {
      name: "Андрей Махов",
      role: "шеф-повар",
      path: "1965 г. р.; возглавляет кухню с 1999 года. Окончил кулинарное училище № 165 и Российскую экономическую академию им. Плеханова, написал книгу рецептов «Пушкина».",
      awards: ["2000 год: на Всемирной кулинарной олимпиаде в Эрфурте возглавлял команду, получившую бронзу в номинации «Национальный обед»"],
      text: "Шеф-повар Андрей Махов (1965 г. р.) возглавляет кухню с 1999 года. Окончил кулинарное училище № 165 и Российскую экономическую академию им. Плеханова, написал книгу рецептов «Пушкина»; в 2000 году на Всемирной кулинарной олимпиаде в Эрфурте возглавлял команду, получившую бронзу в номинации «Национальный обед».",
      url: "https://vkusonomika.ru/moscow/media/persons/shef-povar-andrej-mahov-biografiya-filosofiya-i-kuhnya-kafe-pushkin/",
    },
  ],
  olluco: [{ text: "Перуанская кухня шефа Virgilio Martinez, которого 2ГИС называет шефом № 1 Латинской Америки.", url: G2("70000001057572155") }],
  beluga: [
    { text: "С 2025 года кухню возглавляет шеф-повар Роман Чистов: он соединяет традиционные техники и старорусскую кухню с сезонными локальными продуктами.", url: "https://belugamoscow.ru/" },
    { text: "Прежде ресторан со звездой Michelin ассоциировался с шефом Евгением Викентьевым, самым молодым обладателем звезды Michelin в России на тот момент.", url: "https://events.vedomosti.ru/speakers/vikentev-evgenii-11066" },
  ],
  ava: [
    { text: "Ресторан называют мастерской трёх шефов: ресторатор Антон Пинский (Pinskiy&Co), Виталий Истомин («Техникум») и Артём Лосев («Горыныч»). Название AVA составлено из первых букв их имён.", url: "https://www.admagazine.ru/article/restoran-ava-na-maloj-bronnoj" },
  ],
  savva: [
    { text: "Бренд-шеф Андрей Шмаков возглавляет кухню (Novikov Group): готовит из традиционных русских продуктов, используя европейские техники. Проект ведут ресторатор Аркадий Новиков и Андрей Шмаков; звезда Michelin получена в 2022 году.", url: "https://savvarest.ru/chef" },
  ],
  sage: [
    { text: "Ресторан открыл петербургский шеф Дмитрий Блинов вместе с ресторатором Владимиром Перельманом.", url: "https://yandex.com/maps/org/sage/217923947701/" },
  ],
  maya: [
    {
      name: "Tom Halpin",
      role: "исполнительный шеф",
      path: "Австралиец, раньше су-шеф ресторана Noma со звёздами Michelin; на Maya готовит на открытом огне, угле и копчении.",
      text: "Исполнительный шеф — австралиец Tom Halpin, раньше су-шеф ресторана Noma со звездами Michelin: на Maya готовит на открытом огне, угле и копчении.", url: "https://www.rma.ru/news/63462/" },
    { text: "Меню на основе культурного кода Центральной и Латинской Америки придумал бренд-шеф Glen Ballis.", url: "https://www.rma.ru/news/63462/" },
  ],
  selfie: [
    {
      name: "Анатолий Казаков",
      role: "шеф-повар",
      awards: [
        "В списке 100 лучших шефов мира",
        "«Лучший шеф» по версии GQ (2019)",
        "Шеф года The Best Chef Awards (2021)",
        "Под его руководством ресторан входил в лонг-лист The World's 50 Best Restaurants (65-е место, 2019) и получил четыре колпака Gault&Millau (2018)",
      ],
      text: "Шеф-повар Анатолий Казаков: в списке 100 лучших шефов мира, «Лучший шеф» по версии GQ (2019), шеф года The Best Chef Awards (2021). Под его руководством ресторан входил в лонг-лист The World's 50 Best Restaurants (65-е место в 2019 году) и получил четыре колпака Gault&Millau (2018).", url: "https://selfiemoscow.ru/restaurant" },
  ],
  "grand-cru": [
    { text: "Шеф-повар Давид Эммерле: классика французской кухни в авторском прочтении, сезонные, локальные и органические продукты. Винная коллекция — более 1 200 позиций.", url: "https://grandcrumsk.ru/" },
  ],
  padron: [
    { text: "Концепт-шеф — испанец Адриан Кетглас, обладатель звезды Michelin за ресторан на Майорке. Шеф-повар — Антон Лебедев, шеф-кондитер — Альбина Родыгина. Ресторан входит в группу Folk Team.", url: "https://moskvichmag.ru/gorod/vot-kak-budet-vyglyadet-novyj-restoran-padron-s-kontsept-shefom-adrianom-ketglasom-na-strastnom/" },
  ],
  "twins-garden": [
    { text: "Основатели и шефы, братья Иван и Сергей Березуцкие, покинули ресторан в марте 2023 года. Кухню после обновления возглавил Виталий Савельев.", url: "https://www.kommersant.ru/doc/5888285" },
  ],
  "white-rabbit": [
    {
      name: "Владимир Мухин",
      role: "бренд-шеф White Rabbit Family",
      path: "Шеф ресторана с 2012 года, повар в пятом поколении (родился 15 марта 1983 года в Ессентуках).",
      awards: ["2017: ресторан на 23-м месте в рейтинге 50 лучших ресторанов мира", "Gault&Millau: четыре колпака", "Звание «шеф-легенда»"],
      text: "Бренд-шеф White Rabbit Family Владимир Мухин — шеф ресторана с 2012 года, повар в пятом поколении (родился 15 марта 1983 года в Ессентуках). В 2017 году ресторан занял 23-е место в рейтинге 50 лучших ресторанов мира, Gault&Millau дал четыре колпака, Мухину присвоено звание «шеф-легенда».", url: "https://style.rbc.ru/food_and_wine/67f52a119a79472fe0fed3aa" },
  ],
  sakhalin: [
    { text: "Команда кухни при открытии: бренд-шеф Владимир Мухин, шеф-повар Виталий Истомин и шеф raw bar Алексей Когай. Концепция называется MediterrAsian (смесь средиземноморской и азиатской кухонь).", url: "https://www.elle.ru/stil-zhizni/food/ostrov-sahalin-chego-zhdat-ot-novogo-restorana-white-rabbit-family-id6802790/" },
  ],
  "due-forni": [
    { text: "Проект возглавляет итальянский бренд-шеф Бруно Марино (по публикациям, обладатель звезды Michelin). В старых источниках названы другие шефы, например Remo Mazukatto из Osteria Unica.", url: "https://prime.travel/restaurants/due-forni" },
  ],
  regent: [
    { text: "Ресторан в 2018 году открыл ресторатор и бренд-шеф Алексей Пинский, за выбор и поставку продуктов отвечает лично он. Работает в паре с су-шефом из Кореи Евгением Ченом.", url: "https://www.restoclub.ru/msk/place/regent-1" },
  ],
  biwon: [
    {
      name: "Мидо Мустафа",
      role: "шеф-повар",
      path: "Египтянин: начинал карьеру в Италии, работал в проекте Ronin (The World's 50 Best / Discovery) в Гонконге, жил и стажировался в Южной Корее.",
      text: "Шеф-повар — египтянин Мидо Мустафа: начинал карьеру в Италии, работал в проекте Ronin (The World's 50 Best / Discovery) в Гонконге, жил и стажировался в Южной Корее. Проект создателей Due Forni (Folio Group).", url: "https://chef.ru/restoran/biwon/" },
  ],
  onest: [
    { text: "Авторская средиземноморская кухня Mirko Dzago и Аркадия Новикова; шеф Mirko сам выходит в зал и рассказывает гостям о блюдах.", url: "https://yandex.com/maps/org/onest/165468132116/" },
  ],
  semifreddo: [
    {
      name: "Нино Грациано (Nino Graziano)",
      role: "бренд-шеф",
      path: "Сицилиец; на кухне ресторана также шеф Luka Verdolini.",
      awards: ["Владелец ресторана с двумя звёздами Michelin"],
      text: "Бренд-шеф Нино Грациано (Nino Graziano), сицилиец, владелец ресторана с двумя звёздами Michelin; на кухне также шеф Luka Verdolini.", url: "https://semifreddo-restaurant.com/team.html" },
  ],
  ikra: [
    { text: "Тематические сеты готовят шефы Владимир Мухин, Анатолий Казаков, Ликарион Солнцев и Глеб Шеломанов; гости в отзывах называют шефов Анатолия и Мануэля.", url: G2("70000001063771095") },
  ],
  vadvare: [
    { text: "Кухней руководит Emanuele Pollini, раньше работавший у Carlo Cracco в OVO by Carlo Cracco. Проект Stolen Artichoke.", url: "https://zen.yandex.ru/media/mkostin_ru/kulinarnyi-ceh-vadvare-ot-stolen-artichoke-v-hamovnikah-606dfa20a057e8171d5338fb" },
  ],
  lui: [{ text: "Шеф-повар Claudio Pirovano (по описанию 2ГИС).", url: G2("70000001086975581") }],
  maritozzo: [
    { text: "В источниках разные имена, по времени публикаций: бренд-шеф Марко Губбиотти и Андреа Сантилли, затем бренд-шеф Симоне Гобби и шеф-повар Дмитрий Барган.", url: "https://www.restoran.ru/msk/detailed/restaurants/maritozzo/" },
  ],
  "la-maree": [
    { text: "По одному источнику кухню ведут Massimiliano Montiroli (итальянский шеф) и Thongsuk Channamom (тайский шеф), по другому — бренд-шеф Павел Маслов.", url: "https://www.vashdosug.ru/msk/restaurant/place/55177/" },
  ],
  "la-bottega-siciliana": [
    { text: "Проект Нино Грациано и Игоря Витошинского: за кухней стоит Грациано (его ресторан Il Mulinazzo на Сицилии первым на острове получил две звезды Michelin, 2002). Кухню возглавляет Claudio Pirovano, ученик Грациано.", url: "https://style.rbc.ru/people/5da9c6fd9a7947aaaef0d731" },
  ],
  gvidon: [
    { text: "Меню создали шеф-повар Анатолий Казаков (Selfie, звезда Michelin) и бренд-шеф White Rabbit Family Владимир Мухин; русско-французская кухня вдохновлена дореволюционными традициями.", url: "https://gvidon.wrf.su/about" },
  ],
  butler: [{ text: "Шеф Giuseppe Davi — традиционалист, в меню классические рецепты (по описанию 2ГИС).", url: G2("70000001028625083") }],
};

/** Средний чек на человека, рублей, как указано на страницах заведений. */
export const CHECKS: Record<string, { rub: number; text: string }> = {
  olluco: { rub: 3000, text: "около 3 000 ₽" },
  beluga: { rub: 2000, text: "около 2 000 ₽ по 2ГИС" },
  ava: { rub: 3000, text: "2 500–3 500 ₽" },
  savva: { rub: 6000, text: "около 6 000 ₽" },
  sage: { rub: 3900, text: "около 3 900 ₽" },
  maya: { rub: 5000, text: "около 5 000 ₽" },
  "grand-cru": { rub: 8500, text: "от 8 500 ₽" },
  "white-rabbit": { rub: 6000, text: "около 6 000 ₽" },
  sakhalin: { rub: 6000, text: "около 6 000 ₽" },
  "due-forni": { rub: 2500, text: "2 000–3 000 ₽ по публикациям" },
  regent: { rub: 7000, text: "около 7 000 ₽" },
  biwon: { rub: 2500, text: "около 2 500 ₽" },
  semifreddo: { rub: 7500, text: "7 000–8 000 ₽" },
  ikra: { rub: 20000, text: "около 20 000 ₽" },
  vadvare: { rub: 3000, text: "около 3 000 ₽" },
  maritozzo: { rub: 3500, text: "около 3 500 ₽" },
  "la-maree": { rub: 7000, text: "около 7 000 ₽" },
  "la-bottega-siciliana": { rub: 4000, text: "около 4 000 ₽" },
  gvidon: { rub: 4000, text: "3 000–5 000 ₽" },
  butler: { rub: 12000, text: "около 12 000 ₽" },
};

/** Сегмент избранных заведений, где среднего чека нет, но есть другой факт из источника. */
export const SEGMENT_OVERRIDES: { id: string; name: string; lat: number; lng: number; segment: string; text: string }[] = [
  { id: "selfie", name: "Selfie", lat: 55.75794, lng: 37.58329, segment: "top", text: "одна звезда Michelin (по описанию на Яндекс Картах)" },
  { id: "twins-garden", name: "Twins Garden", lat: 55.7663, lng: 37.61073, segment: "top", text: "две звезды Michelin (по публикациям)" },
  { id: "onest", name: "Onest", lat: 55.76035, lng: 37.597, segment: "top", text: "сет из 8 блюд за 12 000 ₽ (по Яндекс Картам)" },
  { id: "pushkin", name: "Пушкинъ", lat: 55.7637, lng: 37.605, segment: "top", text: "цены очень высокие (по отзывам на Отзовике)" },
];

/**
 * Сколько фото о заведении выложили гости на картах, как показано на страницах
 * (прочитано 2026-10-02). Формат: id, номер организации в 2ГИС, фото в 2ГИС,
 * адрес организации на Яндекс Картах, фото на Яндекс Картах (null — не удалось
 * прочитать надёжно: у Twins Garden и Due Forni страница Яндекса показала у
 * «Фото» число, совпадающее с числом отзывов, и мы его не берём).
 */
const PHOTO_ROWS: [string, string, number, string | null, number | null][] = [
  ["pushkin", "4504127908559765", 519, "kafe_pushkin/1018907821", 548],
  ["olluco", "70000001057572155", 224, "olluco/2573741895", 698],
  ["beluga", "70000001026500511", 447, "beluga/25982578297", 948],
  ["ava", "70000001055517404", 304, "ava/42192706478", 586],
  ["savva", "70000001045420296", 353, "savva/1399471349", 305],
  ["sage", "70000001058789736", 207, "sage/217923947701", 1737],
  ["maya", "70000001059933775", 274, "maya/136884364483", 758],
  ["selfie", "70000001006795733", 318, "selfie/143870666133", 1599],
  ["grand-cru", "70000001030704526", 240, "grand_cru/1092999324", 422],
  ["padron", "70000001084139981", 105, "padron/150776184815", 512],
  ["twins-garden", "70000001030100666", 233, "twins_garden/192990200894", null],
  ["white-rabbit", "4504127916088459", 648, "white_rabbit/1281512603", 3896],
  ["sakhalin", "70000001034163056", 499, "sakhalin/175810691116", 573],
  ["due-forni", "70000001059373875", 73, "due_forni/146989264608", null],
  ["regent", "70000001033870212", 156, "regent/68941024620", 116],
  ["biwon", "70000001082063030", 37, "biwon/49807541183", 80],
  ["onest", "70000001056371465", 89, "onest/165468132116", 227],
  ["semifreddo", "70000001018595552", 104, "semifreddo/1072187769", 266],
  ["ikra", "70000001063771095", 45, "ikra/111605106812", 688],
  ["vadvare", "70000001050267090", 39, "vadvare/104335850463", 570],
  ["lui", "70000001086975581", 133, "lui/191669161118", 255],
  ["maritozzo", "70000001024733614", 170, null, null],
  ["la-maree", "70000001006977682", 152, "la_maree/1152474031", 417],
  ["la-bottega-siciliana", "4504128908413609", 370, "la_bottega_siciliana/61925386633", 531],
  ["gvidon", "70000001050277108", 342, "gvidon/119336995368", 2007],
  ["butler", "70000001028625083", 454, "butler/20313286325", 1232],
];

export type SourcePhotos = { source: string; url: string; count: number };

export const SOURCE_PHOTOS: Record<string, SourcePhotos[]> = Object.fromEntries(
  PHOTO_ROWS.map(([id, g2, g2n, ya, yan]) => [
    id,
    [
      { source: "2ГИС", url: `https://2gis.ru/moscow/gallery/firm/${g2}`, count: g2n },
      ...(ya && yan !== null ? [{ source: "Яндекс Карты", url: `https://yandex.com/maps/org/${ya}/gallery/`, count: yan }] : []),
    ],
  ]),
);

/** Границы по среднему чеку для фильтра. */
export const CHECK_BRACKETS: { id: string; label: string; min: number; max: number }[] = [
  { id: "low", label: "до 500 ₽", min: 0, max: 500 },
  { id: "mid", label: "500–1 500 ₽", min: 501, max: 1500 },
  { id: "high", label: "1 500–3 000 ₽", min: 1501, max: 3000 },
  { id: "top", label: "от 3 000 ₽", min: 3001, max: 10_000_000 },
];

export const bracketOf = (rub: number): string => CHECK_BRACKETS.find((b) => rub >= b.min && rub <= b.max)?.id ?? "";
