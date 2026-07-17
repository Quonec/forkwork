import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { CartProvider } from "@/components/cart";
import AIWidget from "@/components/AIWidget";
import BottomNav from "@/components/BottomNav";
import CartBar from "@/components/CartBar";

export const metadata: Metadata = {
  title: "ForkWork — гастрономическая платформа",
  description:
    "Foodtech-платформа, соединяющая поваров и горожан: интерактивная карта, live-стримы, заказы блюд, рецепты и AI-агент.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning: inline-скрипт ниже ставит data-theme на <html>
    // до гидрации — React не должен считать это расхождением с SSR-разметкой
    <html lang="ru" className="h-full" suppressHydrationWarning>
      <body className="flex min-h-full flex-col">
        {/* Палитра применяется до гидрации — без мигания цветов при загрузке */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("fw-theme");if(t)document.documentElement.dataset.theme=t}catch(e){}`,
          }}
        />
        <CartProvider>
          <Header />
          <main className="flex-1 pb-16 md:pb-0">{children}</main>
          <Footer />
          <CartBar />
          <BottomNav />
          <AIWidget />
        </CartProvider>
      </body>
    </html>
  );
}
