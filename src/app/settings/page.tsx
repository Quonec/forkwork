import type { Metadata } from "next";
import SettingsPanel from "@/components/SettingsPanel";

export const metadata: Metadata = { title: "Настройки — ForkWork" };

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-6">
      <h1 className="font-display text-2xl">Настройки</h1>
      <p className="mt-1 text-sm text-stone-500">Работают без входа и хранятся только на этом устройстве.</p>
      <SettingsPanel />
    </div>
  );
}
