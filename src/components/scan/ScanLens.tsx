"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";

import { ProgressDriver, createEventQueue } from "@/lib/scan/choreography";
import { prepareScanUpload } from "@/lib/scan/compress-image";
import type { ScanEvent, ScanListRow, ScanLogKey } from "@/lib/scan/events";
import { SCAN_ERRORS, scanDayLabel, scanTime } from "@/lib/scan/format";
import { createSseParser } from "@/lib/scan/sse";

import HoldToCancel from "./HoldToCancel";
import { LensFrame, LensMessage } from "./LensFrame";
import { ShutterGraphic } from "./Shutter";

type Chip = { id: string; name: string; grams: number; bbox?: { x: number; y: number }; kcal?: number };
type Phase = "idle" | "analyzing" | "error";
type Kind = "camera" | "gallery";
type Pending = Kind | "resend" | "frame";
type Cam = "idle" | "starting" | "live" | "denied" | "unsupported";

const STAGE_LABEL = { 1: "Распознаю", 2: "Уточняю", 3: "Суммирую" } as const;
const LOG_TEXT: Record<ScanLogKey, (name?: string) => string> = {
  looking: () => "Смотрю на тарелку…",
  see: (n) => `Похоже, ${n ?? "блюдо"}…`,
  weighing: () => "Прикидываю граммы…",
  summing: () => "Считаю итог…",
  unlabelled: (n) => `Не удалось оценить: ${n ?? "блюдо"}`,
  noFood: () => "Еды в кадре не вижу",
};

export default function ScanLens() {
  const router = useRouter();
  const [consented, setConsented] = useState<boolean | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [consentBusy, setConsentBusy] = useState(false);
  const [consentError, setConsentError] = useState(false);
  const [justConsented, setJustConsented] = useState(false);
  const pending = useRef<Pending | null>(null);
  const lastKind = useRef<Kind>("camera");
  const lastFile = useRef<File | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);

  /** Живая камера в видоискателе: включается при открытии сканера. */
  const [cam, setCam] = useState<Cam>("idle");
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pendingFrame = useRef<File | null>(null);
  const alive = useRef(true);

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [stage, setStage] = useState<1 | 2 | 3>(1);
  const [pct, setPct] = useState(0);
  const [eta, setEta] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [chips, setChips] = useState<Chip[]>([]);
  const [recent, setRecent] = useState<ScanListRow[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const driver = useRef(new ProgressDriver());
  const finished = useRef(false);
  /** Стена регистрации: бесплатный гостевой скан уже использован. */
  const [guest, setGuest] = useState(false);
  /** Без регистрации: анонимный посетитель или гость с ещё не использованным сканом. */
  const [unregistered, setUnregistered] = useState(false);
  const [lastScanId, setLastScanId] = useState<string | null>(null);

  const applyStatus = useCallback((d: { consented?: boolean; guest?: boolean; guestLeft?: number | null; lastScanId?: string | null }) => {
    setConsented(!!d.consented);
    if (d.guest) {
      setUnregistered(true);
      setLastScanId(d.lastScanId ?? null);
      if (d.guestLeft === 0) setGuest(true);
    }
  }, []);

  useEffect(() => {
    fetch("/api/scans/consent")
      .then((r) => {
        if (r.status === 401) {
          // Ещё нет сессии: сканировать можно как гость, согласие создаст гостевую сессию.
          setUnregistered(true);
          setConsented(false);
          return null;
        }
        return r.json();
      })
      .then((d) => d && applyStatus(d))
      .catch(() => setConsented(false))
      .finally(() => setReady(true));
    fetch("/api/scans?limit=3")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { scans: ScanListRow[] } | null) => d && setRecent(d.scans))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (phase !== "analyzing") return;
    let raf = 0;
    const loop = (t: number) => {
      if (!finished.current) setPct(driver.current.tick(t));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  const fail = (code: string, message?: string) => {
    setError({ code, message: message ?? SCAN_ERRORS[code] ?? SCAN_ERRORS.SCAN_FAILED });
    setPhase("error");
  };

  const analyze = useCallback(
    async (file: File) => {
      lastFile.current = file;
      setError(null);
      setLogs([]);
      setChips([]);
      setStage(1);
      setPct(0);
      setEta(0);
      finished.current = false;
      driver.current.start(0);
      setPhase("analyzing");

      const upload = await prepareScanUpload(file);
      if (!upload) return fail("PHOTO_INVALID");
      setPreview(URL.createObjectURL(upload.photo));

      const ac = new AbortController();
      abortRef.current = ac;
      const fd = new FormData();
      fd.append("photo", upload.photo);
      if (upload.originalSha256) fd.append("originalSha256", upload.originalSha256);

      let res: Response;
      try {
        res = await fetch("/api/scans", { method: "POST", body: fd, signal: ac.signal });
      } catch {
        if (ac.signal.aborted) return void setPhase("idle");
        return fail("SCAN_FAILED");
      }
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => ({}))) as { code?: string };
        if (j.code === "GUEST_LIMIT") {
          setGuest(true);
          setPhase("idle");
          return;
        }
        if (res.status === 401 || j.code === "CONSENT_REQUIRED") {
          setConsented(false);
          pending.current = "resend";
          setPhase("idle");
          setSheetOpen(true);
          return;
        }
        return fail(j.code ?? "SCAN_FAILED");
      }

      let doneId: string | null = null;
      let errorCode: string | null = null;
      const queue = createEventQueue<ScanEvent>((ev) => {
        switch (ev.event) {
          case "started":
            driver.current.start(ev.data.etaSeconds * 1000);
            setEta(ev.data.etaSeconds);
            break;
          case "progress":
            driver.current.bump(ev.data.progress);
            driver.current.setStage(ev.data.stage);
            setStage(ev.data.stage);
            break;
          case "log":
            setLogs((l) => [...l, LOG_TEXT[ev.data.key](ev.data.params?.name)].slice(-4));
            break;
          case "item_found":
            setChips((c) => [...c, ev.data]);
            break;
          case "item_enriched":
            setChips((c) => c.map((x) => (x.id === ev.data.id ? { ...x, kcal: ev.data.kcal } : x)));
            break;
          case "done":
            doneId = ev.data.scanId;
            break;
          case "error":
            errorCode = ev.data.code;
            break;
        }
      });

      const parser = createSseParser();
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          for (const ev of parser.push(decoder.decode(value, { stream: true }))) queue.push(ev);
        }
      } catch {
        if (ac.signal.aborted) {
          queue.clear();
          return void setPhase("idle");
        }
      }
      await queue.drain();

      if (doneId) {
        finished.current = true;
        setPct(1);
        router.push(`/scan/${doneId}`);
      } else {
        fail(errorCode ?? "SCAN_FAILED");
      }
    },
    [router],
  );

  // Согласие записано и окно закрыто: открываем то, что просил тап.
  useEffect(() => {
    if (sheetOpen || !consented) return;
    const next = pending.current;
    pending.current = null;
    if (next === "camera") camera.current?.click();
    else if (next === "gallery") gallery.current?.click();
    else if (next === "frame" && pendingFrame.current) {
      const frame = pendingFrame.current;
      pendingFrame.current = null;
      void analyze(frame);
    } else if (next === "resend" && lastFile.current) void analyze(lastFile.current);
  }, [sheetOpen, consented, analyze]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCam((c) => (c === "live" || c === "starting" ? "idle" : c));
  }, []);

  const startCamera = useCallback(async () => {
    if (streamRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCam("unsupported");
      return;
    }
    setCam("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1440 } },
        audio: false,
      });
      if (!alive.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      setCam("live");
    } catch {
      setCam("denied");
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const wantCamera = ready && !guest && phase === "idle" && !hidden;
  useEffect(() => {
    if (wantCamera) {
      if (cam === "idle") void startCamera();
    } else {
      stopCamera();
    }
  }, [wantCamera, cam, startCamera, stopCamera]);

  useEffect(() => {
    const v = videoRef.current;
    if (cam === "live" && v && streamRef.current) {
      v.srcObject = streamRef.current;
      void v.play().catch(() => undefined);
    }
  }, [cam]);

  const cameraUsable = cam !== "denied" && cam !== "unsupported";

  const shoot = async () => {
    const v = videoRef.current;
    if (cam === "live" && v && v.videoWidth > 0) {
      const scale = Math.min(1, 1920 / Math.max(v.videoWidth, v.videoHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(v.videoWidth * scale);
      canvas.height = Math.round(v.videoHeight * scale);
      canvas.getContext("2d")?.drawImage(v, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
      canvas.width = 0;
      canvas.height = 0;
      if (!blob) return fail("PHOTO_INVALID");
      const frame = new File([blob], "camera.jpg", { type: "image/jpeg" });
      lastKind.current = "camera";
      if (!consented) {
        // Кадр остаётся на устройстве: отправим его только после согласия.
        pendingFrame.current = frame;
        pending.current = "frame";
        setSheetOpen(true);
        return;
      }
      setJustConsented(false);
      void analyze(frame);
      return;
    }
    choose("camera");
  };

  const choose = (kind: Kind) => {
    lastKind.current = kind;
    setError(null);
    setPhase("idle");
    if (kind === "camera" && cameraUsable) return;
    if (!consented) {
      pending.current = kind;
      setSheetOpen(true);
      return;
    }
    (kind === "camera" ? camera : gallery).current?.click();
  };

  const onPicked = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setJustConsented(false);
    void analyze(file);
  };

  const acceptConsent = async () => {
    setConsentBusy(true);
    setConsentError(false);
    try {
      const r = await fetch("/api/scans/consent", { method: "POST" });
      if (!r.ok) throw new Error("consent");
      applyStatus({ ...(await r.json().catch(() => ({}))), consented: true });
      setJustConsented(true);
      setSheetOpen(false);
    } catch {
      setConsentError(true);
    } finally {
      setConsentBusy(false);
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    setPhase("idle");
  };

  const today = new Date().toISOString();

  if (guest) {
    return (
      <div className="mx-auto max-w-md px-4 py-6">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-2xl tracking-tight">Скан</h1>
          <span className="chip bg-orange-100 text-orange-800">КБЖУ по фото</span>
        </div>
        <div className="mt-4">
          <LensFrame>
            <div className="flex max-w-xs flex-col items-center gap-3 px-6 text-center">
              <LensMessage title="Бесплатный скан использован" hint="Зарегистрируйтесь — и сканируйте дальше, а этот скан сохранится в истории и дневнике." />
              <div className="flex flex-wrap justify-center gap-2 pt-1">
                <Link href="/register" className="btn-primary">
                  Регистрация
                </Link>
                <Link href="/login?next=/scan" className="btn-secondary">
                  Войти
                </Link>
              </div>
              {lastScanId && (
                <Link href={`/scan/${lastScanId}`} className="text-sm font-semibold text-orange-700 underline">
                  Открыть результат
                </Link>
              )}
            </div>
          </LensFrame>
        </div>
        <div className="flex justify-center py-4">
          <Link href="/login?next=/scan" aria-label="Войти, чтобы сканировать" className="rounded-full opacity-40">
            <ShutterGraphic />
          </Link>
        </div>
        <p className="text-center text-xs text-stone-400">Демо: распознавание условное</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-2xl tracking-tight">Скан</h1>
        <span className="chip bg-orange-100 text-orange-800">КБЖУ по фото</span>
      </div>

      <div className="mt-4">
        <LensFrame>
          {phase === "error" && error ? (
            <div className="flex max-w-xs flex-col items-center gap-4 px-6 text-center" role="alert">
              <p className="text-sm text-orange-950">{error.message}</p>
              <div className="flex flex-wrap justify-center gap-2">
                {error.code === "SCAN_FAILED" && lastFile.current && (
                  <button className="btn-primary" onClick={() => lastFile.current && void analyze(lastFile.current)}>
                    Повторить
                  </button>
                )}
                {error.code !== "SCAN_UNAVAILABLE" && (
                  <button className={error.code === "SCAN_FAILED" ? "btn-secondary" : "btn-primary"} onClick={() => choose(lastKind.current)}>
                    Снять ещё
                  </button>
                )}
              </div>
            </div>
          ) : cam === "live" ? (
            <>
              <video ref={videoRef} playsInline muted autoPlay aria-label="Камера" className="absolute inset-0 h-full w-full object-cover" />
              <span className="absolute inset-x-0 bottom-4 z-10 mx-auto w-fit rounded-full bg-orange-950/70 px-3 py-1 text-xs font-semibold text-orange-50">
                Снимите тарелку сверху
              </span>
            </>
          ) : cam === "starting" ? (
            <LensMessage hint="Включаю камеру…" />
          ) : cam === "denied" ? (
            <div className="flex max-w-xs flex-col items-center gap-3 px-6 text-center">
              <LensMessage hint="Нет доступа к камере. Разрешите её в браузере или выберите фото из галереи." />
              <button className="btn-primary" onClick={() => setCam("idle")}>
                Включить камеру
              </button>
            </div>
          ) : cam === "unsupported" ? (
            <LensMessage hint="Камера в этом браузере недоступна: нужен защищённый адрес (https) или localhost. Выберите фото из галереи." />
          ) : (
            <LensMessage hint="Снимите тарелку сверху — оценю КБЖУ на порцию и на 100 г" />
          )}
        </LensFrame>
      </div>

      <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} onChange={onPicked} />
      <input ref={gallery} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} onChange={onPicked} />

      <div className="grid grid-cols-3 items-center justify-items-center py-4">
        <button type="button" onClick={() => choose("gallery")} className="group flex min-h-11 flex-col items-center gap-2 rounded-lg px-2">
          <span className="flex h-12 w-12 items-center justify-center rounded-full border border-orange-300 bg-orange-50 text-orange-800 transition-transform group-active:scale-95">
            <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="16" rx="2.5" />
              <circle cx="9" cy="10" r="1.6" />
              <path d="m21 16-5-5-8 9" />
            </svg>
          </span>
          <span className="text-sm text-stone-600">Из галереи</span>
        </button>
        <button type="button" aria-label="Сделать снимок" onClick={() => void shoot()} className="group rounded-full">
          <ShutterGraphic />
        </button>
        <span aria-hidden />
      </div>
      <p role="status" className="text-center text-sm text-stone-600">
        {justConsented ? "Согласие записано — можно снимать" : null}
      </p>
      {unregistered ? (
        <div className="card mt-2 border-l-4 border-orange-400 p-3 text-sm">
          <p className="font-semibold">Гостевой режим: один бесплатный скан</p>
          <p className="mt-0.5 text-xs text-stone-500">
            Зарегистрируйтесь, чтобы сканировать без ограничений и сохранять историю и дневник.{" "}
            <Link href="/register" className="font-semibold text-orange-700 underline">
              Регистрация
            </Link>
          </p>
        </div>
      ) : (
      <Link
        href="/scan/diary"
        className="card mt-2 flex items-center gap-3 border-l-4 border-orange-400 p-3 hover:bg-orange-50"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-700">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="4" y="5" width="16" height="15" rx="2.5" />
            <path d="M8 3v4M16 3v4M4 10h16M8 14h3" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Дневник по неделям</span>
          <span className="text-xs text-stone-500">Калории и БЖУ по дням, итоги недели</span>
        </span>
        <span className="text-stone-400">›</span>
      </Link>
      )}
      <p className="mt-2 text-center text-xs text-stone-400">Демо: распознавание условное</p>

      {recent.length > 0 && (
        <section className="mt-6" aria-labelledby="scan-recent">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 id="scan-recent" className="font-display text-lg tracking-tight">
              Последние
            </h2>
            <Link href="/scan/history" className="text-sm font-semibold text-orange-600">
              Все сканы →
            </Link>
          </div>
          <ul className="space-y-2">
            {recent.map((r) => (
              <li key={r.id}>
                <Link href={`/scan/${r.id}`} className="card flex items-center gap-3 p-3 hover:bg-orange-50">
                  {r.thumb.available ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/scans/${r.id}/photo`} alt="" className="h-12 w-12 rounded-xl object-cover" loading="lazy" />
                  ) : (
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-100 text-orange-400">—</span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {r.headline ?? "Скан"}
                      {r.moreCount > 0 ? ` и ещё ${r.moreCount}` : ""}
                    </span>
                    <span className="text-xs text-stone-500">
                      {scanDayLabel(r.createdAt) === scanDayLabel(today) ? scanTime(r.createdAt) : scanDayLabel(r.createdAt)} · ≈{r.totalKcal} ккал
                    </span>
                  </span>
                  <span className="text-stone-400">›</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sheetOpen && (
        <div
          className="fixed inset-0 z-[1300] flex items-end justify-center bg-black/40 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Согласие на обработку фото"
        >
          <div className="card w-full max-w-md rounded-b-none p-5 sm:rounded-b-2xl">
            <h2 className="text-lg font-bold">Согласие на обработку фото</h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-stone-600">
              <li>Фото блюда привязано к вашему аккаунту и видно только вам.</li>
              <li>Фото хранится 30 дней, затем удаляется; оценка остаётся в истории.</li>
              <li>Вы можете удалить любой скан вместе с фото в любой момент.</li>
              <li>Снимайте только блюдо — без людей и документов.</li>
            </ul>
            <Link href="/legal/scan" target="_blank" className="mt-3 inline-block text-sm font-semibold text-orange-600">
              Открыть документ
            </Link>
            <label className="mt-3 flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
              <span>Принимаю условия</span>
            </label>
            {consentError && <p className="mt-2 text-sm text-red-600">Не получилось сохранить согласие — попробуйте ещё раз</p>}
            <div className="mt-4 flex gap-2">
              <button
                className="btn-secondary flex-1"
                onClick={() => {
                  pending.current = null;
                  pendingFrame.current = null;
                  setSheetOpen(false);
                }}
              >
                Закрыть
              </button>
              <button className="btn-primary flex-1 disabled:opacity-50" disabled={!accepted || consentBusy} onClick={acceptConsent}>
                Продолжить
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === "analyzing" && (
        <div className="fixed inset-0 z-[1400] flex flex-col bg-orange-950 text-orange-50" role="status" aria-label="Анализ фото">
          <div className="relative flex-1 overflow-hidden">
            {preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" />
            )}
            {chips.map((c) => (
              <span
                key={c.id}
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange-300 px-3 py-1 text-xs font-semibold text-orange-950 shadow ring-1 ring-orange-100/60"
                style={{ left: `${c.bbox?.x ?? 50}%`, top: `${c.bbox?.y ?? 50}%` }}
              >
                {c.name} · {c.grams} г{c.kcal !== undefined ? ` · ${c.kcal} ккал` : ""}
              </span>
            ))}
          </div>
          <div className="space-y-3 bg-orange-950 px-5 pb-8 pt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold">{STAGE_LABEL[stage]}</span>
              <span className="text-orange-300">
                {Math.round(pct * 100)} %{eta > 0 ? ` · осталось ~${Math.max(0, Math.round(eta * (1 - pct)))} с` : ""}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-orange-900">
              <div className="h-full rounded-full bg-orange-400" style={{ width: `${pct * 100}%` }} />
            </div>
            <ul className="min-h-[4.5rem] space-y-0.5 text-sm text-orange-100" aria-live="polite">
              {logs.length === 0 && <li>Отправляю фото…</li>}
              {logs.map((l, i) => (
                <li key={`${i}-${l}`}>{l}</li>
              ))}
            </ul>
            <HoldToCancel onCommit={cancel} />
          </div>
        </div>
      )}
    </div>
  );
}
