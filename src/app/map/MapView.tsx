"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { ChefCard } from "@/lib/types";

const MOSCOW: [number, number] = [55.751, 37.615];

export default function MapView({
  chefs,
  selected,
  onSelect,
}: {
  chefs: ChefCard[];
  selected: number | null;
  onSelect: (id: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<number, L.Marker>>(new Map());

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: true, attributionControl: true }).setView(MOSCOW, 12);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Маркеры синхронизируются с отфильтрованным списком
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current.clear();

    for (const chef of chefs) {
      if (chef.lat == null || chef.lng == null) continue;
      const ring = chef.liveStreamId ? "#dc2626" : chef.available ? "#10b981" : "#c0b08e";
      const live = chef.liveStreamId
        ? `<span style="position:absolute;top:-4px;right:-4px;background:#dc2626;color:#fff;font-size:8px;font-weight:800;padding:1px 4px;border-radius:99px;">LIVE</span>`
        : "";
      const letter = (chef.name.trim().charAt(0) || "F").toUpperCase();
      const icon = L.divIcon({
        className: "fw-marker",
        html: `<div style="position:relative;width:44px;height:44px;background:#fffefb;border:3px solid ${ring};border-radius:50%;display:flex;align-items:center;justify-content:center;font:800 18px 'Helvetica Neue',Helvetica,Arial,sans-serif;letter-spacing:-0.03em;color:#171410;box-shadow:0 2px 8px rgba(23,20,16,.2);">${letter}${live}</div>`,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      });
      const marker = L.marker([chef.lat, chef.lng], { icon }).addTo(map);
      marker.bindPopup(
        `<div style="min-width:180px">
          <strong>${chef.name}</strong><br/>
          <span style="color:#9c8c6c;font-size:12px">${chef.cuisineName ?? ""} · ${chef.specialization}</span><br/>
          <span style="color:#b98d22;font-size:13px">★ ${chef.rating}</span>
          <span style="color:#c0b08e;font-size:11px"> · ${chef.address}</span><br/>
          <a href="/chefs/${chef.id}" style="display:inline-block;margin-top:6px;background:#171410;color:#fffefb;padding:5px 12px;border-radius:8px;font-size:12px;font-weight:700;text-decoration:none">Открыть профиль</a>
        </div>`
      );
      marker.on("click", () => onSelect(chef.id));
      markersRef.current.set(chef.id, marker);
    }
  }, [chefs, onSelect]);

  // Подсветка выбранного из списка
  useEffect(() => {
    if (!selected) return;
    const marker = markersRef.current.get(selected);
    if (marker && mapRef.current) {
      marker.openPopup();
    }
  }, [selected]);

  return <div ref={containerRef} className="h-full w-full" />;
}
