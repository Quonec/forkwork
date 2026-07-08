"use client";

import { useEffect, useRef, useState } from "react";
import { loadYmaps } from "@/lib/ymaps";

// Выбор локации повара: кнопка геопозиции браузера + интерактивная карта
// (клик или перетаскивание маркера). Если карта не загрузилась — ручной ввод.

/* eslint-disable @typescript-eslint/no-explicit-any */

const MOSCOW: [number, number] = [55.751, 37.615];

export default function LocationPicker({
  lat,
  lng,
  onChange,
}: {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [mapFailed, setMapFailed] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState("");

  const setPoint = (la: number, ln: number, pan = true) => {
    const rounded: [number, number] = [Math.round(la * 1e5) / 1e5, Math.round(ln * 1e5) / 1e5];
    onChangeRef.current(rounded[0], rounded[1]);
    if (markerRef.current) markerRef.current.geometry.setCoordinates(rounded);
    if (pan && mapRef.current) mapRef.current.panTo(rounded, { duration: 300 });
  };

  // Инициализация мини-карты с перетаскиваемым маркером
  useEffect(() => {
    let cancelled = false;
    loadYmaps()
      .then((ymaps) => {
        if (cancelled || !containerRef.current || mapRef.current) return;
        const start: [number, number] = lat != null && lng != null ? [lat, lng] : MOSCOW;
        const map = new ymaps.Map(
          containerRef.current,
          { center: start, zoom: 13, controls: ["zoomControl"] },
          { suppressMapOpenBlock: true, yandexMapDisablePoiInteractivity: true }
        );
        const marker = new ymaps.Placemark(
          start,
          {},
          {
            draggable: true,
            iconLayout: ymaps.templateLayoutFactory.createClass(
              `<div style="transform:translate(-14px,-14px);width:28px;height:28px;background:#bf7d27;border:4px solid #fffdf8;border-radius:50%;box-shadow:0 2px 10px rgba(23,20,16,.35);"></div>`
            ),
            iconShape: { type: "Circle", coordinates: [0, 0], radius: 16 },
          }
        );
        marker.events.add("dragend", () => {
          const [la, ln] = marker.geometry.getCoordinates();
          setPoint(la, ln, false);
        });
        map.events.add("click", (e: any) => {
          const [la, ln] = e.get("coords");
          setPoint(la, ln, false);
        });
        map.geoObjects.add(marker);
        mapRef.current = map;
        markerRef.current = marker;
      })
      .catch(() => setMapFailed(true));

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.destroy();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const locateMe = () => {
    setGeoError("");
    if (!navigator.geolocation) {
      setGeoError("Браузер не поддерживает геолокацию — поставьте точку на карте.");
      return;
    }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoBusy(false);
        setPoint(pos.coords.latitude, pos.coords.longitude);
        mapRef.current?.setZoom(15);
      },
      (e) => {
        setGeoBusy(false);
        setGeoError(
          e.code === e.PERMISSION_DENIED
            ? "Доступ к геопозиции запрещён — разрешите его или поставьте точку на карте."
            : "Не удалось определить геопозицию — поставьте точку на карте вручную."
        );
      },
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={locateMe} disabled={geoBusy} className="btn-secondary !py-1.5 text-xs">
          {geoBusy ? "Определяем…" : "Определить по геопозиции"}
        </button>
        <span className="text-xs text-stone-500">
          {lat != null && lng != null ? `Точка: ${lat.toFixed(4)}, ${lng.toFixed(4)}` : "Точка не выбрана"}
        </span>
      </div>
      {geoError && <p className="text-xs text-red-600">{geoError}</p>}

      {mapFailed ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Широта</label>
            <input
              type="number"
              step="0.0001"
              className="input"
              value={lat ?? ""}
              onChange={(e) => onChange(Number(e.target.value) || 0, lng ?? 0)}
              placeholder="55.75"
            />
          </div>
          <div>
            <label className="label">Долгота</label>
            <input
              type="number"
              step="0.0001"
              className="input"
              value={lng ?? ""}
              onChange={(e) => onChange(lat ?? 0, Number(e.target.value) || 0)}
              placeholder="37.62"
            />
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl ring-1 ring-stone-200">
          <div ref={containerRef} className="h-56 w-full" />
          <p className="bg-stone-50 px-3 py-1.5 text-[11px] text-stone-400">
            Кликните по карте или перетащите маркер, чтобы указать, где вы готовите.
          </p>
        </div>
      )}
    </div>
  );
}
