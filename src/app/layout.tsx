import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { CartProvider } from "@/components/cart";
import AIWidget from "@/components/AIWidget";

export const metadata: Metadata = {
  title: "ForkWork — гастрономическая платформа",
  description:
    "Foodtech-платформа, соединяющая поваров и горожан: интерактивная карта, live-стримы, заказы блюд, рецепты и AI-агент.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" className="h-full">
      <body className="flex min-h-full flex-col">
        <CartProvider>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
          <AIWidget />
        </CartProvider>
      </body>
    </html>
  );
}
