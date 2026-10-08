/** Гостевой аккаунт: создаётся при первом согласии на обработку фото и даёт один бесплатный скан без регистрации. */
export const GUEST_EMAIL_DOMAIN = "guest.forkwork.local";
export const GUEST_SCAN_LIMIT = 1;
export const GUEST_RETENTION_DAYS = 30;

export const isGuestEmail = (email: string): boolean => email.toLowerCase().endsWith(`@${GUEST_EMAIL_DOMAIN}`);
