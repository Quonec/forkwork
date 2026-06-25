"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Quality = { label: string; width: number; height: number; fps: number };
type Facing = "user" | "environment";

const QUALITIES: Quality[] = [
  { label: "480p", width: 854, height: 480, fps: 30 },
  { label: "720p HD", width: 1280, height: 720, fps: 30 },
  { label: "1080p Full HD", width: 1920, height: 1080, fps: 30 },
  { label: "1080p · 60 fps", width: 1920, height: 1080, fps: 60 },
];

const DEFAULT_GFX = { brightness: 100, contrast: 100, saturation: 100 };

export default function CameraStudio() {
  const [dual, setDual] = useState(false);
  const [startAll, setStartAll] = useState(0);
  const [stopAll, setStopAll] = useState(0);

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 px-5 py-4">
        <div>
          <h3 className="font-bold">Студия эфира</h3>
          <p className="text-xs text-stone-500">
            Предпросмотр камеры и настройка картинки перед выходом в эфир.
            {dual && " Передняя и задняя — одновременно, в двух окнах."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {dual && (
            <>
              <button onClick={() => setStartAll((n) => n + 1)} className="btn-primary !py-2 text-xs">
                Включить обе
              </button>
              <button onClick={() => setStopAll((n) => n + 1)} className="btn-secondary !py-2 text-xs">
                Выключить обе
              </button>
            </>
          )}
          <label className="flex items-center gap-2 text-sm font-semibold">
            Две камеры
            <input
              type="checkbox"
              checked={dual}
              onChange={(e) => setDual(e.target.checked)}
              className="h-4 w-4 accent-yellow-400"
            />
          </label>
        </div>
      </div>

      {dual ? (
        <div className="grid gap-4 p-5 lg:grid-cols-2">
          <CameraPane title="Передняя камера" facing="user" startSignal={startAll} stopSignal={stopAll} />
          <CameraPane title="Задняя камера" facing="environment" startSignal={startAll} stopSignal={stopAll} />
        </div>
      ) : (
        <div className="p-5">
          <CameraPane title="Камера" side />
        </div>
      )}

      <p className="border-t border-stone-100 px-5 py-3 text-[11px] text-stone-400">
        Предпросмотр локальный — видео никуда не передаётся. Подключение реального вещания (WebRTC/LiveKit) — на дорожной карте.
        {" "}На части смартфонов одновременная работа передней и задней камеры ограничена железом — тогда второе окно сообщит об этом.
      </p>
    </div>
  );
}

function CameraPane({
  title,
  facing,
  side = false,
  startSignal = 0,
  stopSignal = 0,
}: {
  title: string;
  facing?: Facing;
  side?: boolean;
  startSignal?: number;
  stopSignal?: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [on, setOn] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>("");
  const [qi, setQi] = useState(1);
  const [mirror, setMirror] = useState(facing !== "environment"); // фронталку зеркалим, заднюю — нет
  const [gfx, setGfx] = useState(DEFAULT_GFX);
  const [actual, setActual] = useState("");

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setOn(false);
    setActual("");
  }, []);

  const start = useCallback(
    async (id?: string, quality = qi) => {
      setError("");
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setError("Браузер не поддерживает доступ к камере. Нужен HTTPS или localhost.");
        return;
      }
      setStarting(true);
      try {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        const q = QUALITIES[quality];
        const video: MediaTrackConstraints = {
          width: { ideal: q.width },
          height: { ideal: q.height },
          frameRate: { ideal: q.fps },
        };
        // Явно выбранное устройство приоритетнее, иначе — предпочтение перед/зад (важно на телефоне)
        if (id) video.deviceId = { exact: id };
        else if (facing) video.facingMode = { ideal: facing };

        const stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setOn(true);

        const track = stream.getVideoTracks()[0];
        const s = track.getSettings();
        setActual(`${s.width ?? "?"}×${s.height ?? "?"}${s.frameRate ? ` · ${Math.round(s.frameRate)} fps` : ""}`);

        // Названия камер доступны только после выдачи доступа
        const list = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
        setCams(list);
        setDeviceId(s.deviceId ?? id ?? list[0]?.deviceId ?? "");
      } catch (e) {
        const name = e instanceof DOMException ? e.name : "";
        setError(
          name === "NotAllowedError"
            ? "Доступ к камере запрещён. Разрешите его в браузере и повторите."
            : name === "NotFoundError"
              ? "Камера не найдена. Подключите устройство и повторите."
              : name === "NotReadableError"
                ? "Камера занята другим приложением или недоступна одновременно со второй."
                : `Не удалось включить камеру${e instanceof Error ? `: ${e.message}` : ""}.`
        );
        stop();
      } finally {
        setStarting(false);
      }
    },
    [qi, facing, stop]
  );

  // Реакция на сигналы «включить/выключить обе» из контейнера — через ref на актуальные колбэки
  const startRef = useRef(start);
  startRef.current = start;
  const stopRef = useRef(stop);
  stopRef.current = stop;
  const deviceIdRef = useRef(deviceId);
  deviceIdRef.current = deviceId;

  useEffect(() => {
    if (startSignal > 0) startRef.current(deviceIdRef.current || undefined);
  }, [startSignal]);
  useEffect(() => {
    if (stopSignal > 0) stopRef.current();
  }, [stopSignal]);

  // Освобождаем камеру при уходе со страницы
  useEffect(() => () => stop(), [stop]);

  const changeQuality = (idx: number) => {
    setQi(idx);
    if (on) start(deviceId || undefined, idx);
  };

  const changeDevice = (id: string) => {
    setDeviceId(id);
    if (on) start(id);
  };

  const filter = `brightness(${gfx.brightness}%) contrast(${gfx.contrast}%) saturate(${gfx.saturation}%)`;

  return (
    <div className={`rounded-xl border border-stone-100 p-3 ${side ? "lg:grid lg:grid-cols-[1fr_280px] lg:gap-4" : ""}`}>
      {/* Превью */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold">{title}</span>
          {on ? (
            <button onClick={stop} className="btn-danger !py-1.5 text-[11px]">Выключить</button>
          ) : (
            <button
              onClick={() => start(deviceId || undefined)}
              disabled={starting}
              className="btn-primary !py-1.5 text-[11px]"
            >
              {starting ? "Включаем…" : "Включить"}
            </button>
          )}
        </div>

        <div className="relative aspect-video overflow-hidden rounded-xl bg-stone-950">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-cover"
            style={{ filter, transform: mirror ? "scaleX(-1)" : undefined }}
          />
          {!on && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-stone-400">
              <svg viewBox="0 0 24 24" className="h-9 w-9" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <rect x="2.5" y="6" width="13" height="12" rx="2.5" />
                <path d="m15.5 10 6-3v10l-6-3" strokeLinejoin="round" />
              </svg>
              <p className="max-w-[14rem] text-xs">Камера выключена.</p>
            </div>
          )}
          {on && (
            <>
              <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-1 text-[11px] font-bold text-white">
                <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-white" />
                ПРЕВЬЮ
              </span>
              {actual && (
                <span className="absolute bottom-3 right-3 rounded-md bg-black/55 px-2 py-1 text-[11px] font-semibold text-white">{actual}</span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Настройки */}
      <div className={`space-y-3 ${side ? "" : "mt-3"}`}>
        <div>
          <label className="label">Камера</label>
          <select
            className="input !py-2"
            value={deviceId}
            onChange={(e) => changeDevice(e.target.value)}
            disabled={!on || cams.length === 0}
          >
            {cams.length === 0 && <option value="">включите камеру</option>}
            {cams.map((c, i) => (
              <option key={c.deviceId} value={c.deviceId}>
                {c.label || `Камера ${i + 1}`}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Качество</label>
          <div className="flex flex-wrap gap-1.5">
            {QUALITIES.map((q, i) => (
              <button
                key={q.label}
                onClick={() => changeQuality(i)}
                className={`chip ${qi === i ? "bg-stone-950 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"}`}
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center justify-between text-sm font-semibold">
          Зеркально
          <input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} className="h-4 w-4 accent-yellow-400" />
        </label>

        <Slider label="Яркость" value={gfx.brightness} min={50} max={150} onChange={(v) => setGfx((g) => ({ ...g, brightness: v }))} />
        <Slider label="Контраст" value={gfx.contrast} min={50} max={150} onChange={(v) => setGfx((g) => ({ ...g, contrast: v }))} />
        <Slider label="Насыщенность" value={gfx.saturation} min={0} max={200} onChange={(v) => setGfx((g) => ({ ...g, saturation: v }))} />

        <button onClick={() => setGfx(DEFAULT_GFX)} className="text-xs font-semibold text-stone-400 hover:text-stone-700">
          Сбросить картинку
        </button>

        {error && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="label !mb-0">{label}</label>
        <span className="text-xs font-bold tabular-nums text-stone-500">{value}%</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1.5 w-full accent-yellow-400"
      />
    </div>
  );
}
