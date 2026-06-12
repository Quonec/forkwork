"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { ChefCard } from "@/lib/types";

const MOSCOW: [number, number] = [55.751, 37.615];
// Демо-точка «вы здесь» — в проде заменяется геолокацией
export const USER_POINT: [number, number] = [55.7468, 37.6064];

export default function MapView({
  chefs,
  selected,
  onSelect,
}: {
  chefs: ChefCard[];
  selected: number | null;
  onSelect: (id: number | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<number, L.Marker>>(new Map());
  const routeRef = useRef<L.Polyline | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: false, attributionControl: true }).setView(MOSCOW, 13);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    // «Вы здесь» — жёлтая точка, как точка подачи в такси
    L.marker(USER_POINT, {
      icon: L.divIcon({
        className: "fw-marker",
        html: `<div style="width:18px;height:18px;background:#fcd000;border:3px solid #171410;border-radius:50%;box-shadow:0 0 0 6px rgba(252,208,0,.25);"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      }),
      interactive: false,
    }).addTo(map);

    map.on("click", () => onSelect(null));
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Маркеры синхронизируются с отфильтрованным списком; выбранный — крупнее, с жёлтым кольцом
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current.clear();

    for (const chef of chefs) {
      if (chef.lat == null || chef.lng == null) continue;
      const isSel = chef.id === selected;
      const ring = isSel ? "#fcd000" : chef.liveStreamId ? "#dc2626" : chef.available ? "#10b981" : "#c0b08e";
      const size = isSel ? 52 : 44;
      const live = chef.liveStreamId
        ? `<span style="position:absolute;top:-4px;right:-4px;background:#dc2626;color:#fff;font-size:8px;font-weight:800;padding:1px 4px;border-radius:99px;">LIVE</span>`
        : "";
      const letter = (chef.name.trim().charAt(0) || "F").toUpperCase();
      const icon = L.divIcon({
        className: "fw-marker",
        html: `<div style="position:relative;width:${size}px;height:${size}px;background:#fffefb;border:${isSel ? 4 : 3}px solid ${ring};border-radius:50%;display:flex;align-items:center;justify-content:center;font:800 ${isSel ? 20 : 18}px 'Helvetica Neue',Helvetica,Arial,sans-serif;letter-spacing:-0.03em;color:#171410;box-shadow:0 2px 10px rgba(23,20,16,.25);">${letter}${live}</div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });
      const marker = L.marker([chef.lat, chef.lng], { icon }).addTo(map);
      marker.on("click", () => onSelect(chef.id));
      markersRef.current.set(chef.id, marker);
    }
  }, [chefs, onSelect, selected]);

  // Маршрут «вы → кухня повара», как линия поездки в такси
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    routeRef.current?.remove();
    routeRef.current = null;

    const chef = chefs.find((c) => c.id === selected);
    if (!chef || chef.lat == null || chef.lng == null) return;

    const route = L.polyline([USER_POINT, [chef.lat, chef.lng]], {
      color: "#171410",
      weight: 3,
      dashArray: "8 8",
      opacity: 0.8,
    }).addTo(map);
    routeRef.current = route;
    map.flyToBounds(route.getBounds(), { padding: [70, 70], maxZoom: 15, duration: 0.6 });
  }, [selected, chefs]);

  return <div ref={containerRef} className="h-full w-full" />;
}
