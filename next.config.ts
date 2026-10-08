import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Индикатор Next.js («N») в режиме разработки скрыт: на его месте красная точка, когда идёт эфир
  devIndicators: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Сканер использует камеру, карта и поиск рядом — геолокацию; остальное закрыто.
          { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=(), payment=()" },
          ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=15552000; includeSubDomains" }] : []),
        ],
      },
    ];
  },
};

export default nextConfig;
