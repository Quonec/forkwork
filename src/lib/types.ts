// Общие типы ForkWork

export type Role = "customer" | "chef" | "admin";

export type SessionUser = {
  id: number;
  email: string;
  name: string;
  role: Role;
  avatar: string;
  onboarded: number;
  blocked: number;
  chefId: number | null;
};

export type Cuisine = { id: number; name: string; emoji: string };

export type ChefCard = {
  id: number;
  userId: number;
  name: string;
  avatar: string;
  bio: string;
  specialization: string;
  cuisineId: number | null;
  cuisineName: string | null;
  cuisineEmoji: string | null;
  lat: number | null;
  lng: number | null;
  address: string;
  priceLevel: number;
  available: number;
  delivery: number;
  pickup: number;
  workHours: string;
  rating: number;
  reviewsCount: number;
  liveStreamId: number | null;
  dishesCount: number;
};

export type Dish = {
  id: number;
  chefId: number;
  name: string;
  description: string;
  price: number;
  emoji: string;
  tags: string;
  available: number;
};

export type Recipe = {
  id: number;
  chefId: number;
  title: string;
  description: string;
  timeMin: number;
  difficulty: number;
  emoji: string;
  ingredients: string[];
  steps: string[];
  tags: string;
  chefName?: string;
  chefAvatar?: string;
};

export type StreamInfo = {
  id: number;
  chefId: number;
  title: string;
  status: "live" | "scheduled" | "ended";
  scheduledAt: string | null;
  startedAt: string | null;
  viewers: number;
  dishIds: number[];
  pinnedMessage: string;
  tags: string;
  chefName?: string;
  chefAvatar?: string;
  cuisineName?: string;
};

export type CartItem = {
  dishId: number;
  name: string;
  price: number;
  qty: number;
  emoji: string;
};

export type OrderRow = {
  id: number;
  customerId: number;
  chefId: number;
  status: "new" | "accepted" | "cooking" | "delivering" | "done" | "cancelled";
  items: CartItem[];
  total: number;
  fee: number;
  deliveryType: "delivery" | "pickup";
  address: string;
  payment: "wallet" | "card";
  source: string;
  createdAt: string;
  chefName?: string;
  customerName?: string;
  hasReview?: boolean;
};

export const ORDER_STATUS_RU: Record<string, string> = {
  new: "Новый",
  accepted: "Принят",
  cooking: "Готовится",
  delivering: "Доставляется",
  done: "Выполнен",
  cancelled: "Отменён",
};

export const ORDER_FLOW: string[] = ["new", "accepted", "cooking", "delivering", "done"];

export const PLATFORM_FEE = 0.1; // комиссия платформы 10%
