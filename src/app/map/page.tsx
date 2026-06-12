import type { Metadata } from "next";
import MapClient from "./MapClient";

export const metadata: Metadata = { title: "Карта поваров — ForkWork" };

export default function MapPage() {
  return <MapClient />;
}
