import { listChefs, listCuisines } from "@/lib/queries";
import { json } from "@/lib/api";

export async function GET() {
  return json({ chefs: listChefs(), cuisines: listCuisines() });
}
