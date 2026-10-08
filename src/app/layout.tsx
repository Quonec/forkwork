import type { Metadata, Viewport } from "next";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { CartProvider } from "@/components/cart";
import AIWidget from "@/components/AIWidget";
import BottomNav from "@/components/BottomNav";
import CartBar from "@/components/CartBar";
import ScanHint from "@/components/ScanHint";
import LiveDot from "@/components/LiveDot";
import PrefsSync from "@/components/PrefsSync";
import { PREFS_BOOT_SCRIPT } from "@/lib/prefs";
import { getSessionUser } from "@/lib/auth";

const DESCRIPTION =
  "ForkWork: сканер блюд с оценкой КБЖУ, карта поваров и лучших заведений Москвы с оценками из разных источников, live-стримы и рецепты.";

export const metadata: Metadata = {
  // Адрес сайта для ссылок в соцсетях и карты сайта; задаётся при деплое (NEXT_PUBLIC_SITE_URL).
  ...(process.env.NEXT_PUBLIC_SITE_URL ? { metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL) } : {}),
  title: { default: "ForkWork — гастрономическая платформа", template: "%s" },
  description: DESCRIPTION,
  applicationName: "ForkWork",
  keywords: ["сканер еды", "КБЖУ по фото", "рестораны Москвы", "повара", "рецепты"],
  openGraph: {
    type: "website",
    siteName: "ForkWork",
    locale: "ru_RU",
    title: "ForkWork — гастрономическая платформа",
    description: DESCRIPTION,
  },
  twitter: { card: "summary", title: "ForkWork — гастрономическая платформа", description: DESCRIPTION },
  icons: { icon: "/icon.svg", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "ForkWork", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#fcd000",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getSessionUser();
  return (
    <html lang="ru" className="h-full" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFS_BOOT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <CartProvider>
          <Header />
          <main className="flex-1 pb-24 md:pb-0">{children}</main>
          <Footer />
          <CartBar />
          <BottomNav role={user?.role ?? null} />
          <AIWidget />
          <ScanHint loggedIn={!!user} />
          <LiveDot />
          <PrefsSync />
        </CartProvider>
      </body>
    </html>
  );
}
