"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fmtDateTime } from "@/lib/format";

// Живое видео эфира. Повар (host) вещает камеру через WebRTC peer-to-peer,
// зрители подключаются к нему напрямую; сигналинг — HTTP-поллинг /rtc.

type Signal = { sender: string; type: string; payload: string };

// STUN + TURN: без TURN-ретранслятора P2P через интернет (разные NAT) часто не
// пробивается — картинка «есть соединение, нет кадров». По умолчанию — публичный
// бесплатный Open Relay; свой TURN задаётся переменными NEXT_PUBLIC_TURN_*.
function iceServers(): RTCConfiguration {
  const servers: RTCIceServer[] = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"] },
  ];
  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
  if (turnUrl) {
    servers.push({
      urls: turnUrl.split(",").map((u) => u.trim()),
      username: process.env.NEXT_PUBLIC_TURN_USER ?? "",
      credential: process.env.NEXT_PUBLIC_TURN_PASS ?? "",
    });
  } else {
    servers.push({
      urls: [
        "turn:openrelay.metered.ca:80",
        "turn:openrelay.metered.ca:443",
        "turns:openrelay.metered.ca:443?transport=tcp",
      ],
      username: "openrelayproject",
      credential: "openrelayproject",
    });
  }
  return { iceServers: servers };
}

const POLL_MS = 2000;

type Peer = { pc: RTCPeerConnection; iceQueue: RTCIceCandidateInit[]; hasRemote: boolean };

export default function LiveVideo({
  streamId,
  title,
  status,
  scheduledAt,
  isChef,
  viewerKey,
}: {
  streamId: number;
  title: string;
  status: string;
  scheduledAt: string | null;
  isChef: boolean;
  viewerKey: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, Peer>>(new Map());
  const peerIdRef = useRef<string>("");
  const joinSentAtRef = useRef(0);
  const broadcastingRef = useRef(false);

  const [broadcasting, setBroadcasting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [cameraLive, setCameraLive] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [viewersConnected, setViewersConnected] = useState(0);
  const [error, setError] = useState("");
  const isLive = status === "live";

  const rtcUrl = `/api/streams/${streamId}/rtc`;
  const keyParam = viewerKey ? `&key=${encodeURIComponent(viewerKey)}` : "";

  const post = useCallback(
    (msg: { type: string; target?: string; payload?: string }) =>
      fetch(rtcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...msg, peerId: peerIdRef.current, key: viewerKey }),
      }).catch(() => {}),
    [rtcUrl, viewerKey]
  );

  const closePeers = useCallback(() => {
    peersRef.current.forEach((p) => p.pc.close());
    peersRef.current.clear();
    setViewersConnected(0);
  }, []);

  const applyIce = (peer: Peer, payload: string) => {
    const cand = JSON.parse(payload) as RTCIceCandidateInit;
    if (peer.hasRemote) peer.pc.addIceCandidate(cand).catch(() => {});
    else peer.iceQueue.push(cand);
  };

  const flushIce = (peer: Peer) => {
    peer.hasRemote = true;
    for (const c of peer.iceQueue) peer.pc.addIceCandidate(c).catch(() => {});
    peer.iceQueue = [];
  };

  // ---------- ПОВАР: вещание ----------
  const startBroadcast = async () => {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Браузер не поддерживает камеру. Нужен HTTPS или localhost.");
      return;
    }
    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      localStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true; // локальный предпросмотр без эха
      }
      peerIdRef.current = "host";
      await post({ type: "camera", payload: "1" });
      broadcastingRef.current = true;
      setBroadcasting(true);
      setPlaying(true);
      videoRef.current?.play().catch(() => {});
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      setError(
        name === "NotAllowedError"
          ? "Доступ к камере запрещён — разрешите его в браузере."
          : name === "NotFoundError"
            ? "Камера не найдена."
            : `Не удалось включить камеру${e instanceof Error ? `: ${e.message}` : ""}.`
      );
    } finally {
      setStarting(false);
    }
  };

  const stopBroadcast = useCallback(() => {
    post({ type: "camera", payload: "0" });
    closePeers();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    broadcastingRef.current = false;
    setBroadcasting(false);
    setPlaying(false);
  }, [post, closePeers]);

  const hostHandleSignal = useCallback(
    async (s: Signal) => {
      const local = localStreamRef.current;
      if (!local) return;
      if (s.type === "join") {
        peersRef.current.get(s.sender)?.pc.close();
        const pc = new RTCPeerConnection(iceServers());
        const peer: Peer = { pc, iceQueue: [], hasRemote: false };
        peersRef.current.set(s.sender, peer);
        local.getTracks().forEach((t) => pc.addTrack(t, local));
        pc.onicecandidate = (e) => {
          if (e.candidate) post({ type: "ice", target: s.sender, payload: JSON.stringify(e.candidate.toJSON()) });
        };
        pc.onconnectionstatechange = () => {
          if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
            peersRef.current.delete(s.sender);
          }
          setViewersConnected(
            [...peersRef.current.values()].filter((p) => p.pc.connectionState === "connected").length
          );
        };
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await post({ type: "offer", target: s.sender, payload: JSON.stringify(offer) });
      } else if (s.type === "answer") {
        const peer = peersRef.current.get(s.sender);
        if (!peer) return;
        await peer.pc.setRemoteDescription(JSON.parse(s.payload));
        flushIce(peer);
      } else if (s.type === "ice") {
        const peer = peersRef.current.get(s.sender);
        if (peer) applyIce(peer, s.payload);
      } else if (s.type === "leave") {
        peersRef.current.get(s.sender)?.pc.close();
        peersRef.current.delete(s.sender);
      }
    },
    [post]
  );

  // ---------- ЗРИТЕЛЬ: приём ----------
  const viewerHandleSignal = useCallback(
    async (s: Signal) => {
      if (s.type === "offer") {
        peersRef.current.get("host")?.pc.close();
        const pc = new RTCPeerConnection(iceServers());
        const peer: Peer = { pc, iceQueue: [], hasRemote: false };
        peersRef.current.set("host", peer);
        pc.ontrack = (e) => {
          if (videoRef.current && e.streams[0]) {
            // Автоплей разрешён только без звука — стартуем приглушённо,
            // звук зритель включает кнопкой (жест пользователя).
            // setPlaying здесь не зовём: видео покажем по факту прихода кадров
            // (событие onPlaying на элементе), а не по факту получения трека
            videoRef.current.srcObject = e.streams[0];
            videoRef.current.muted = true;
            setMuted(true);
            videoRef.current.play().catch(() => {});
          }
        };
        pc.onicecandidate = (e) => {
          if (e.candidate) post({ type: "ice", payload: JSON.stringify(e.candidate.toJSON()) });
        };
        pc.onconnectionstatechange = () => {
          if (["failed", "closed"].includes(pc.connectionState)) {
            pc.close();
            peersRef.current.delete("host");
            joinSentAtRef.current = 0; // следующий тик поллинга переподключится
            setPlaying(false);
          }
        };
        await pc.setRemoteDescription(JSON.parse(s.payload));
        flushIce(peer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await post({ type: "answer", payload: JSON.stringify(answer) });
      } else if (s.type === "ice") {
        const peer = peersRef.current.get("host");
        if (peer) applyIce(peer, s.payload);
      }
    },
    [post]
  );

  // ---------- Общий поллинг сигналинга ----------
  useEffect(() => {
    if (!isLive) return;
    if (!peerIdRef.current && !isChef) {
      peerIdRef.current = `v-${Math.random().toString(36).slice(2, 10)}`;
    }
    let stopped = false;

    const tick = async () => {
      if (stopped) return;
      try {
        // Повар до включения камеры к ящику не прикасается — иначе он бы
        // «съедал» join-сигналы зрителей, пришедшие раньше времени
        if (isChef && !broadcastingRef.current) return;

        const res = await fetch(`${rtcUrl}?peerId=${encodeURIComponent(peerIdRef.current || "host")}${keyParam}`);
        if (!res.ok) return;
        const data = (await res.json()) as { signals: Signal[]; cameraLive: number; status: string };
        setCameraLive(!!data.cameraLive);

        if (isChef) {
          if (localStreamRef.current) for (const s of data.signals) await hostHandleSignal(s);
        } else {
          if (data.cameraLive) {
            // Камера повара в эфире, а соединения нет — стучимся;
            // повторяем join каждые ~8 секунд, пока не получим оффер
            const pc = peersRef.current.get("host")?.pc;
            const connected = pc && ["connected", "connecting"].includes(pc.connectionState);
            if (!connected && Date.now() - joinSentAtRef.current > 8000) {
              joinSentAtRef.current = Date.now();
              await post({ type: "join" });
            }
          } else {
            joinSentAtRef.current = 0;
            if (peersRef.current.has("host")) {
              peersRef.current.get("host")?.pc.close();
              peersRef.current.delete("host");
              if (videoRef.current) videoRef.current.srcObject = null;
              setPlaying(false);
            }
          }
          for (const s of data.signals) await viewerHandleSignal(s);
        }
      } catch {}
    };

    tick();
    const t = setInterval(tick, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [isLive, isChef, rtcUrl, keyParam, hostHandleSignal, viewerHandleSignal, post]);

  // Уборка при уходе со страницы
  useEffect(
    () => () => {
      if (peerIdRef.current && peerIdRef.current !== "host") {
        navigator.sendBeacon?.(
          rtcUrl,
          new Blob([JSON.stringify({ type: "leave", peerId: peerIdRef.current, key: viewerKey })], {
            type: "application/json",
          })
        );
      }
      peersRef.current.forEach((p) => p.pc.close());
      peersRef.current.clear();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
    },
    [rtcUrl, viewerKey]
  );

  return (
    <>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        onPlaying={() => setPlaying(true)}
        className={`absolute inset-0 h-full w-full object-cover ${playing ? "" : "hidden"}`}
      />

      {/* Зритель смотрит: звук включается жестом — иначе браузер заблокирует автоплей */}
      {!isChef && playing && muted && (
        <button
          onClick={() => {
            if (videoRef.current) {
              videoRef.current.muted = false;
              videoRef.current.play().catch(() => {});
            }
            setMuted(false);
          }}
          className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-xl bg-black/65 px-4 py-2 text-xs font-bold text-white backdrop-blur hover:bg-black/80"
        >
          Включить звук
        </button>
      )}

      {/* Плейсхолдер, пока нет живого видео */}
      {!playing && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
          <div className="steam mb-2 text-2xl font-bold text-orange-300/70">
            <span>~</span>
            <span>~</span>
            <span>~</span>
          </div>
          <div className="font-display text-7xl font-bold text-orange-300/60">
            {(title.trim().charAt(0) || "F").toUpperCase()}
          </div>
          <p className="mt-4 max-w-md px-6 text-center text-lg font-bold">{title}</p>
          {!isLive ? (
            <p className="mt-2 text-sm text-stone-400">
              {status === "scheduled"
                ? `Эфир начнётся: ${scheduledAt ? fmtDateTime(scheduledAt) : "скоро"}`
                : "Эфир завершён. Спасибо, что были с нами!"}
            </p>
          ) : isChef ? (
            <p className="mt-2 text-sm text-stone-400">Камера выключена — зрители видят заставку.</p>
          ) : cameraLive ? (
            <p className="mt-2 max-w-sm px-6 text-center text-sm text-stone-400">
              Подключаемся к камере повара… Обычно это занимает 5–15 секунд;
              при сложной сети видео пойдёт через TURN-ретранслятор.
            </p>
          ) : (
            <p className="mt-2 text-sm text-stone-400">Повар ещё не включил камеру.</p>
          )}
        </div>
      )}

      {/* Панель вещания повара */}
      {isChef && isLive && (
        <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2">
          {error && <p className="rounded-lg bg-red-600/90 px-3 py-1.5 text-xs font-semibold text-white">{error}</p>}
          {broadcasting ? (
            <div className="flex items-center gap-2">
              <span className="chip bg-black/60 text-white">камера в эфире · зрителей на связи: {viewersConnected}</span>
              <button onClick={stopBroadcast} className="btn-danger !bg-red-600 !py-1.5 text-xs !text-white hover:!bg-red-700">
                Выключить камеру
              </button>
            </div>
          ) : (
            <button onClick={startBroadcast} disabled={starting} className="btn-primary !py-2 text-xs shadow-lg">
              {starting ? "Включаем камеру…" : "Включить камеру и вещать"}
            </button>
          )}
        </div>
      )}
    </>
  );
}
