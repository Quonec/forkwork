import { requirePage } from "@/lib/guard";

export default async function Layout({ children }: { children: React.ReactNode }) {
  await requirePage((u) => u.role === "admin");
  return children;
}
