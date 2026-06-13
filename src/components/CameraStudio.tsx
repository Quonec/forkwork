"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Quality = { label: string; width: number; height: number; fps: number };

const QUALITIES: Quality[] = [
  { label: "480p", width: 854, height: 480, fps: 30 },
  { label: "720p HD", width: 1280, height: 720, fps: 30 },
  { label: "1080p Full HD", width: 1920, height: 1080, fps: 30 },
  { label: "1080p · 60 fps", width: 1920, height: 1080, fps: 60 },
];

const DEFAULT_GFX = { brightness: 100, contrast: 100, saturation: 100 };

export default function CameraStudio() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [on, setOn] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>("");
  const [qi, setQi] = useState(1);
  const [mirror, setMirror] = useState(true);
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
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: id ? { exact: id } : undefined,
            width: { ideal: q.width },
            height: { ideal: q.height },
            frameRate: { ideal: q.fps },
          },
          audio: false,
        });
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
            ? "Доступ к камере запрещён. Разрешите его в настройках браузера и повторите."
            : name === "NotFoundError"
              ? "Камера не найдена. Подключите устройство и повторите."
              : `Не удалось включить камеру${e instanceof Error ? `: ${e.message}` : ""}.`
        );
        stop();
      } finally {
        setStarting(false);
      }
    },
    [qi, stop]
  );

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
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 px-5 py-4">
        <div>
          <h3 className="font-bold">Студия эфира</h3>
          <p className="text-xs text-stone-500">Предпросмотр камеры и настройка картинки перед выходом в эфир.</p>
        </div>
        {on ? (
          <button onClick={stop} className="btn-danger !py-2 text-xs">Выключить камеру</button>
        ) : (
          <button onClick={() => start(deviceId || undefined)} disabled={starting} className="btn-primary !py-2 text-xs">
            {starting ? "Включаем…" : "Включить камеру"}
          </button>
        )}
      </div>

      <div className="grid gap-4 p-5 lg:grid-cols-[1fr_300px]">
        {/* Превью */}
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
              <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <rect x="2.5" y="6" width="13" height="12" rx="2.5" />
                <path d="m15.5 10 6-3v10l-6-3" strokeLinejoin="round" />
              </svg>
              <p className="max-w-[15rem] text-xs">Камера выключена. Нажмите «Включить камеру», чтобы увидеть предпросмотр.</p>
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

        {/* Настройки графики */}
        <div className="space-y-4">
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
        </div>
      </div>

      {error && <p className="mx-5 mb-5 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</p>}

      <p className="border-t border-stone-100 px-5 py-3 text-[11px] text-stone-400">
        Предпросмотр локальный — видео никуда не передаётся. Подключение реального вещания (WebRTC/LiveKit) — на дорожной карте.
      </p>
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
