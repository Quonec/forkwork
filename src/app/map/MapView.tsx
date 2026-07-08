"use client";

import { useEffect, useRef, useState } from "react";
import type { ChefCard } from "@/lib/types";

import { loadYmaps } from "@/lib/ymaps";

const MOSCOW: [number, number] = [55.751, 37.615];
// Точка «вы здесь» по умолчанию — уточняется геолокацией браузера
export const USER_POINT: [number, number] = [55.7468, 37.6064];

/* eslint-disable @typescript-eslint/no-explicit-any */

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
  const mapRef = useRef<any>(null);
  const collRef = useRef<any>(null); // маркеры поваров + линия маршрута
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  // Инициализация карты
  useEffect(() => {
    let cancelled = false;
    loadYmaps()
      .then((ymaps) => {
        if (cancelled || !containerRef.current || mapRef.current) return;
        const map = new ymaps.Map(
          containerRef.current,
          { center: MOSCOW, zoom: 13, controls: ["zoomControl", "geolocationControl"] },
          { suppressMapOpenBlock: true, yandexMapDisablePoiInteractivity: true }
        );

        // «Вы здесь» — жёлтая точка подачи, как в такси
        map.geoObjects.add(
          new ymaps.Placemark(
            USER_POINT,
            {},
            {
              iconLayout: ymaps.templateLayoutFactory.createClass(
                `<div style="transform:translate(-9px,-9px);width:18px;height:18px;background:#fcd000;border:3px solid #171410;border-radius:50%;box-shadow:0 0 0 6px rgba(252,208,0,.25);"></div>`
              ),
              iconShape: { type: "Circle", coordinates: [0, 0], radius: 12 },
            }
          )
        );

        const coll = new ymaps.GeoObjectCollection();
        map.geoObjects.add(coll);
        map.events.add("click", () => onSelectRef.current(null));

        mapRef.current = map;
        collRef.current = coll;
        setReady(true);
      })
      .catch(() => setFailed(true));

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.destroy();
        mapRef.current = null;
        collRef.current = null;
      }
    };
  }, []);

  // Перерисовка маркеров и маршрута при смене списка/выбора
  useEffect(() => {
    if (!ready) return;
    const ymaps = window.ymaps;
    const map = mapRef.current;
    const coll = collRef.current;
    if (!ymaps || !map || !coll) return;

    coll.removeAll();

    for (const chef of chefs) {
      if (chef.lat == null || chef.lng == null) continue;
      const isSel = chef.id === selected;
      const ring = isSel ? "#fcd000" : chef.liveStreamId ? "#dc2626" : chef.available ? "#10b981" : "#c0b08e";
      const size = isSel ? 52 : 44;
      const letter = (chef.name.trim().charAt(0) || "F").toUpperCase();
      const live = chef.liveStreamId
        ? `<span style="position:absolute;top:-4px;right:-4px;background:#dc2626;color:#fff;font-size:8px;font-weight:800;padding:1px 4px;border-radius:99px;">LIVE</span>`
        : "";
      const html = `<div style="position:relative;transform:translate(-${size / 2}px,-${size / 2}px);width:${size}px;height:${size}px;background:#fffefb;border:${isSel ? 4 : 3}px solid ${ring};border-radius:50%;display:flex;align-items:center;justify-content:center;font:800 ${isSel ? 20 : 18}px 'Helvetica Neue',Helvetica,Arial,sans-serif;letter-spacing:-0.03em;color:#171410;box-shadow:0 2px 10px rgba(23,20,16,.25);">${letter}${live}</div>`;

      const pm = new ymaps.Placemark(
        [chef.lat, chef.lng],
        {},
        {
          iconLayout: ymaps.templateLayoutFactory.createClass(html),
          iconShape: { type: "Circle", coordinates: [0, 0], radius: size / 2 },
          zIndexActive: 1000,
          zIndex: isSel ? 999 : 1,
        }
      );
      const id = chef.id;
      pm.events.add("click", (e: any) => {
        e.preventDefault();
        onSelectRef.current(id);
      });
      coll.add(pm);
    }

    // Маршрут «вы → кухня повара»
    const sel = chefs.find((c) => c.id === selected);
    if (sel && sel.lat != null && sel.lng != null) {
      coll.add(
        new ymaps.Polyline(
          [USER_POINT, [sel.lat, sel.lng]],
          {},
          { strokeColor: "#171410", strokeWidth: 3, strokeStyle: "dash", strokeOpacity: 0.85 }
        )
      );
      const lats = [USER_POINT[0], sel.lat];
      const lngs = [USER_POINT[1], sel.lng];
      map.setBounds(
        [
          [Math.min(...lats), Math.min(...lngs)],
          [Math.max(...lats), Math.max(...lngs)],
        ],
        { checkZoomRange: true, zoomMargin: 70, duration: 500 }
      );
    }
  }, [ready, chefs, selected]);

  if (failed) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-stone-100 px-6 text-center">
        <p className="text-sm font-semibold text-stone-600">Карта Яндекса не загрузилась</p>
        <p className="max-w-xs text-xs text-stone-500">
          Задайте ключ <code className="rounded bg-stone-200 px-1">NEXT_PUBLIC_YANDEX_MAPS_API_KEY</code> в файле{" "}
          <code className="rounded bg-stone-200 px-1">.env.local</code>. Список поваров ниже работает и без карты.
        </p>
      </div>
    );
  }

  return <div ref={containerRef} className="h-full w-full" />;
}
