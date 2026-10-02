/** Оценка заведения на одном источнике, как она показана на странице источника. */
export type Rating = {
  source: string;
  url: string;
  /** Значение в шкале источника. */
  value: number;
  scale: 5 | 10;
  /** «292 оценки», «4 758 отзывов»: как указано на странице. */
  count?: string;
  /** Когда прочитано или за какой период. */
  period: string;
  kind: "карты" | "гости" | "критик";
  note?: string;
};

/** Реальное заведение Москвы: данные с его официального сайта, меню не копируется, а ведёт по ссылке. */
export type Venue = {
  id: string;
  brandId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  /** Часы работы так, как они указаны на сайте; null — на сайте не указаны однозначно. */
  hours: string | null;
  website: string;
  menuUrl: string;
  /** Страница сети со списком адресов, если заведение — одно из нескольких. */
  locationsUrl?: string;
  /** Оценки именно этой точки с карт и сайтов отзывов. */
  ratings?: Rating[];
  /** Средний чек на человека, как указан на странице заведения. */
  avgCheck?: { rub: number; text: string; url: string };
};

/** Публикация критика или издания о заведении. Только то, что найдено и открыто в источнике. */
export type Review = {
  outlet: string;
  author?: string;
  /** Как указано в источнике: «9 марта 2023», «2024». */
  date: string;
  url: string;
  /** О каком именно заведении материал (может быть другая точка сети). */
  about: string;
  /** Суть оценки своими словами. */
  verdict: string;
  /** Дословная цитата со страницы источника. */
  quote?: string;
};

/** Отзывы гостей с одного источника в сжатом виде: что хвалят и ругают. Только то, что прочитано на странице источника. */
export type GuestSource = {
  source: string;
  url: string;
  /** За какой период отзывы, как видно на странице. */
  period: string;
  /** Оценка источника в его шкале, если показана. */
  rating?: string;
  positives: string[];
  negatives: string[];
  note?: string;
};

/** Заведение или сеть: описание, меню тезисами и что о нём пишут. */
export type Brand = {
  id: string;
  name: string;
  cuisine: string;
  /** Тезисы о заведении: концепция, шеф, формат, средний чек. */
  info: string[];
  /** Меню тезисами: разделы, названные блюда, что КБЖУ не опубликовано. Основа для диалога с ИИ-помощником. */
  menuTheses: string[];
  /** Отзывы гостей по источникам. */
  guestSources: GuestSource[];
  /** Оценки всего бренда (сводки по сети, критики), не привязанные к одной точке. */
  ratings: Rating[];
  menu: {
    /** Что за меню, по официальному сайту. */
    summary: string;
    /** Блюда, названные на официальном сайте или в указанном источнике. */
    examples?: string[];
    examplesSource?: string;
  };
  reviews: Review[];
  /** Что сказать, когда профессиональных рецензий найти не удалось. */
  noReviewsNote?: string;
  /** Страницы с отзывами гостей (не проверялись построчно). */
  guestReviewLinks?: { title: string; url: string }[];
};

/** Откуда приходят заведения. Сейчас набор, собранный вручную по официальным сайтам; подключение Яндекс Поиска по организациям идёт через этот интерфейс. */
export interface VenueProvider {
  readonly name: string;
  /** Когда данные в последний раз сверялись с сайтами (ГГГГ-ММ-ДД). */
  readonly verifiedAt: string;
  listVenues(): Venue[];
  listBrands(): Brand[];
}
