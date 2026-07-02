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

  const relayBusyRef = useRef(false);
  const relaySeqRef = useRef(0);
  const mjpegLoadedRef = useRef(false);
  // P2P-дерево: соединение с родителем (повар или зритель-ретранслятор),
  // полученный от него поток и флаг «мы уже объявили себя раздающим узлом»
  const parentRef = useRef<Peer | null>(null);
  const parentIdRef = useRef<string>("");
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const relayReadySentRef = useRef(false);

  const [broadcasting, setBroadcasting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [cameraLive, setCameraLive] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [viewersConnected, setViewersConnected] = useState(0);
  const [relayAvailable, setRelayAvailable] = useState(false);
  const [relayMode, setRelayMode] = useState<"mjpeg" | "poll">("mjpeg");
  const [relayShown, setRelayShown] = useState(false);
  const [relayFrame, setRelayFrame] = useState<string | null>(null);
  const [relayAudioOn, setRelayAudioOn] = useState(false);
  const [error, setError] = useState("");
  // Звук резервного канала: скрытый <audio> + MediaSource, сегменты в очередь
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioSeqRef = useRef(0);
  const msRef = useRef<MediaSource | null>(null);
  const sbRef = useRef<SourceBuffer | null>(null);
  const audioQueueRef = useRef<Uint8Array[]>([]);
  const isLive = status === "live";

  const rtcUrl = `/api/streams/${streamId}/rtc`;
  const relayUrl = `/api/streams/${streamId}/relay`;
  const audioUrl = `/api/streams/${streamId}/audio`;
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

  // Подключение «ребёнка» в P2P-дереве: повар и зритель-ретранслятор раздают
  // одинаково — различается только источник (камера или поток от родителя)
  const addChild = useCallback(
    async (childId: string, source: MediaStream) => {
      peersRef.current.get(childId)?.pc.close();
      const pc = new RTCPeerConnection(iceServers());
      const peer: Peer = { pc, iceQueue: [], hasRemote: false };
      peersRef.current.set(childId, peer);
      source.getTracks().forEach((t) => pc.addTrack(t, source));
      pc.onicecandidate = (e) => {
        if (e.candidate) post({ type: "ice", target: childId, payload: JSON.stringify(e.candidate.toJSON()) });
      };
      pc.onconnectionstatechange = () => {
        if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
          peersRef.current.delete(childId);
        }
        setViewersConnected(
          [...peersRef.current.values()].filter((p) => p.pc.connectionState === "connected").length
        );
      };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await post({ type: "offer", target: childId, payload: JSON.stringify(offer) });
    },
    [post]
  );

  // ---------- ПОВАР: корень дерева ----------
  const hostHandleSignal = useCallback(
    async (s: Signal) => {
      const local = localStreamRef.current;
      if (!local) return;
      if (s.type === "join") {
        await addChild(s.sender, local);
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
    [addChild]
  );

  // ---------- ЗРИТЕЛЬ: приём от родителя + ретрансляция своим детям ----------
  const dropParent = useCallback(() => {
    parentRef.current?.pc.close();
    parentRef.current = null;
    parentIdRef.current = "";
    remoteStreamRef.current = null;
    // Без источника детей не удержать: закрываем — они переподключатся к живым узлам
    peersRef.current.forEach((p) => p.pc.close());
    peersRef.current.clear();
    if (videoRef.current) videoRef.current.srcObject = null;
    joinSentAtRef.current = 0; // следующий тик поллинга переподключится
    setPlaying(false);
  }, []);

  const viewerHandleSignal = useCallback(
    async (s: Signal) => {
      if (s.type === "offer") {
        // Оффер от родителя — повара или зрителя-ретранслятора
        parentRef.current?.pc.close();
        const pc = new RTCPeerConnection(iceServers());
        const peer: Peer = { pc, iceQueue: [], hasRemote: false };
        parentRef.current = peer;
        parentIdRef.current = s.sender;
        pc.ontrack = (e) => {
          if (videoRef.current && e.streams[0]) {
            // Автоплей разрешён только без звука — стартуем приглушённо,
            // звук зритель включает кнопкой (жест пользователя).
            // setPlaying здесь не зовём: видео покажем по факту прихода кадров
            remoteStreamRef.current = e.streams[0];
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
          if (["failed", "closed"].includes(pc.connectionState)) dropParent();
        };
        await pc.setRemoteDescription(JSON.parse(s.payload));
        flushIce(peer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await post({ type: "answer", payload: JSON.stringify(answer) });
      } else if (s.type === "ice") {
        if (s.sender === parentIdRef.current) {
          if (parentRef.current) applyIce(parentRef.current, s.payload);
        } else {
          const child = peersRef.current.get(s.sender);
          if (child) applyIce(child, s.payload);
        }
      } else if (s.type === "join") {
        // Сервер назначил нам ребёнка — устройство зрителя раздаёт поток дальше
        if (remoteStreamRef.current) await addChild(s.sender, remoteStreamRef.current);
      } else if (s.type === "answer") {
        const child = peersRef.current.get(s.sender);
        if (!child) return;
        await child.pc.setRemoteDescription(JSON.parse(s.payload));
        flushIce(child);
      } else if (s.type === "leave") {
        peersRef.current.get(s.sender)?.pc.close();
        peersRef.current.delete(s.sender);
      }
    },
    [post, addChild, dropParent]
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
            // Камера повара в эфире, а соединения с родителем нет — стучимся;
            // повторяем join каждые ~8 секунд, пока не получим оффер
            const pc = parentRef.current?.pc;
            const connected = pc && ["connected", "connecting"].includes(pc.connectionState);
            if (!connected && Date.now() - joinSentAtRef.current > 8000) {
              joinSentAtRef.current = Date.now();
              await post({ type: "join" });
            }
          } else {
            joinSentAtRef.current = 0;
            relayReadySentRef.current = false;
            if (parentRef.current || peersRef.current.size > 0) dropParent();
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
  }, [isLive, isChef, rtcUrl, keyParam, hostHandleSignal, viewerHandleSignal, post, dropParent]);

  // ---------- Резервный канал: повар шлёт JPEG-кадры через сервер ----------
  // Работает параллельно с WebRTC: если у зрителя P2P не пробился (нет TURN),
  // он смотрит MJPEG-поток с сервера. Целевой темп 25 к/с (тик 40 мс);
  // при медленной сети или CPU кадры пропускаются, темп проседает плавно.
  useEffect(() => {
    if (!broadcasting) return;
    const canvas = document.createElement("canvas");
    const postUrl = `${relayUrl}${viewerKey ? `?key=${encodeURIComponent(viewerKey)}` : ""}`;
    const t = setInterval(() => {
      const v = videoRef.current;
      if (!v || v.videoWidth === 0 || relayBusyRef.current) return;
      const w = 640;
      const h = Math.round((v.videoHeight / v.videoWidth) * w) || 360;
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")?.drawImage(v, 0, 0, w, h);
      relayBusyRef.current = true;
      canvas.toBlob(
        async (blob) => {
          try {
            if (blob) {
              await fetch(postUrl, {
                method: "POST",
                headers: { "Content-Type": "image/jpeg" },
                body: blob,
              });
            }
          } catch {
          } finally {
            relayBusyRef.current = false;
          }
        },
        "image/jpeg",
        0.5
      );
    }, 40);
    return () => {
      clearInterval(t);
      fetch(relayUrl, { method: "DELETE" }).catch(() => {});
    };
  }, [broadcasting, relayUrl, viewerKey]);

  // Звук резервного канала: повар пишет микрофон самодостаточными сегментами
  // ~1.5 с (каждый — законченный webm-файл) и шлёт их на сервер
  useEffect(() => {
    if (!broadcasting) return;
    const tracks = localStreamRef.current?.getAudioTracks() ?? [];
    if (tracks.length === 0 || typeof MediaRecorder === "undefined") return;
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) =>
      MediaRecorder.isTypeSupported(m)
    );
    if (!mime) return;
    const audioStream = new MediaStream(tracks);
    const postUrl = `${audioUrl}?mime=${encodeURIComponent(mime)}${viewerKey ? `&key=${encodeURIComponent(viewerKey)}` : ""}`;
    let stopped = false;
    let rec: MediaRecorder | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const startSegment = () => {
      if (stopped) return;
      const parts: BlobPart[] = [];
      rec = new MediaRecorder(audioStream, { mimeType: mime, audioBitsPerSecond: 64_000 });
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) parts.push(e.data);
      };
      rec.onstop = async () => {
        const blob = new Blob(parts, { type: mime });
        try {
          if (blob.size > 0 && !stopped) await fetch(postUrl, { method: "POST", body: blob });
        } catch {}
        startSegment();
      };
      rec.start();
      timer = setTimeout(() => {
        if (rec && rec.state !== "inactive") rec.stop();
      }, 1500);
    };

    startSegment();
    return () => {
      stopped = true;
      clearTimeout(timer);
      try {
        if (rec && rec.state !== "inactive") rec.stop();
      } catch {}
      fetch(audioUrl, { method: "DELETE" }).catch(() => {});
    };
  }, [broadcasting, audioUrl, viewerKey]);

  // Зритель: проверяем доступность резервного канала, пока WebRTC-видео не пошло
  useEffect(() => {
    if (isChef || !isLive) return;
    if (!cameraLive || playing) {
      setRelayAvailable(false);
      setRelayShown(false);
      setRelayFrame(null);
      relaySeqRef.current = 0;
      return;
    }
    let stopped = false;
    const probe = async () => {
      if (stopped) return;
      try {
        const res = await fetch(`${relayUrl}?probe=1${keyParam}`);
        if (!res.ok) return;
        const d = (await res.json()) as { seq: number };
        setRelayAvailable(d.seq > 0);
      } catch {}
    };
    probe();
    const t = setInterval(probe, 1500);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [isChef, isLive, cameraLive, playing, relayUrl, keyParam]);

  // Звук резервного канала у зрителя: включается кнопкой (жест пользователя),
  // сегменты подшиваются в SourceBuffer в режиме sequence — непрерывный поток
  const startRelayAudio = () => {
    const a = audioRef.current;
    if (!a || typeof MediaSource === "undefined") return;
    const ms = new MediaSource();
    msRef.current = ms;
    sbRef.current = null;
    audioQueueRef.current = [];
    audioSeqRef.current = 0;
    a.src = URL.createObjectURL(ms);
    a.muted = false;
    a.play().catch(() => {}); // вызов внутри клика — автоплей разрешён
    setRelayAudioOn(true);
  };

  useEffect(() => {
    if (isChef || !relayAudioOn || playing || !cameraLive) {
      if (relayAudioOn && (playing || !cameraLive)) {
        // WebRTC подхватил звук или эфир камеры кончился — резервный звук не нужен
        audioRef.current?.pause();
        setRelayAudioOn(false);
      }
      return;
    }
    let stopped = false;

    const drain = () => {
      const sb = sbRef.current;
      const a = audioRef.current;
      if (!sb || sb.updating) return;
      const next = audioQueueRef.current.shift();
      if (next) {
        try {
          sb.appendBuffer(next as BufferSource);
        } catch {}
      }
      // Держимся близко к прямому эфиру: отстали больше чем на 4 с — прыгаем
      if (a && a.buffered.length > 0) {
        const end = a.buffered.end(a.buffered.length - 1);
        if (end - a.currentTime > 4) a.currentTime = end - 0.8;
      }
    };

    const ensureSourceBuffer = (mime: string) => {
      const ms = msRef.current;
      if (sbRef.current || !ms || ms.readyState !== "open") return;
      if (!MediaSource.isTypeSupported(mime)) return;
      const sb = ms.addSourceBuffer(mime);
      sb.mode = "sequence"; // сегменты независимы — таймлайн склеивается автоматически
      sb.addEventListener("updateend", drain);
      sbRef.current = sb;
    };

    const loop = async () => {
      while (!stopped) {
        try {
          const res = await fetch(`${audioUrl}?since=${audioSeqRef.current}${keyParam}`);
          if (stopped) return;
          if (res.status === 200) {
            const seq = Number(res.headers.get("X-Seq") ?? 0);
            const mime = res.headers.get("X-Mime") ?? "audio/webm";
            const buf = new Uint8Array(await res.arrayBuffer());
            if (seq > 0) audioSeqRef.current = seq;
            ensureSourceBuffer(mime);
            audioQueueRef.current.push(buf);
            drain();
          } else {
            await new Promise((r) => setTimeout(r, 700));
          }
        } catch {
          await new Promise((r) => setTimeout(r, 1200));
        }
      }
    };
    loop();

    return () => {
      stopped = true;
      try {
        if (msRef.current?.readyState === "open") msRef.current.endOfStream();
      } catch {}
      sbRef.current = null;
      msRef.current = null;
    };
  }, [isChef, relayAudioOn, playing, cameraLive, audioUrl, keyParam]);

  // Если MJPEG-поток не пошёл за 6 секунд (прокси буферизует multipart) —
  // падаем на покадровый поллинг (~6 к/с)
  useEffect(() => {
    if (isChef || !relayAvailable || playing || relayMode !== "mjpeg") return;
    mjpegLoadedRef.current = false;
    const t = setTimeout(() => {
      if (!mjpegLoadedRef.current) setRelayMode("poll");
    }, 6000);
    return () => clearTimeout(t);
  }, [isChef, relayAvailable, playing, relayMode]);

  // Покадровый фолбэк-поллинг (только когда MJPEG не заработал)
  useEffect(() => {
    if (isChef || !relayAvailable || playing || relayMode !== "poll") return;
    let stopped = false;
    const t = setInterval(async () => {
      if (stopped) return;
      try {
        const res = await fetch(`${relayUrl}?since=${relaySeqRef.current}${keyParam}`);
        if (!res.ok) return;
        const d = (await res.json()) as { seq: number; frame?: string };
        if (d.frame) {
          relaySeqRef.current = d.seq;
          setRelayFrame(d.frame);
          setRelayShown(true);
        }
      } catch {}
    }, 150);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [isChef, relayAvailable, playing, relayMode, relayUrl, keyParam]);

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
      parentRef.current?.pc.close();
      parentRef.current = null;
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
        onPlaying={() => {
          setPlaying(true);
          // Кадры реально пошли — устройство зрителя готово раздавать поток дальше
          if (!isChef && remoteStreamRef.current && !relayReadySentRef.current) {
            relayReadySentRef.current = true;
            post({ type: "relay-ready" });
          }
        }}
        className={`absolute inset-0 h-full w-full object-cover ${playing ? "" : "hidden"}`}
      />

      {/* Скрытый аудиоэлемент для звука резервного канала */}
      <audio ref={audioRef} className="hidden" />

      {/* Зритель смотрит: звук включается жестом — иначе браузер заблокирует автоплей.
          Для WebRTC — снимаем mute с видео; для резервного канала — отдельный аудиопоток */}
      {!isChef && ((playing && muted) || (!playing && relayShown && !relayAudioOn)) && (
        <button
          onClick={() => {
            if (playing) {
              if (videoRef.current) {
                videoRef.current.muted = false;
                videoRef.current.play().catch(() => {});
              }
              setMuted(false);
            } else {
              startRelayAudio();
            }
          }}
          className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-xl bg-black/65 px-4 py-2 text-xs font-bold text-white backdrop-blur hover:bg-black/80"
        >
          Включить звук
        </button>
      )}

      {/* Резервный канал: MJPEG-поток через сервер, пока WebRTC не подключился */}
      {!isChef && !playing && relayAvailable && relayMode === "mjpeg" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`${relayUrl}?mjpeg=1${keyParam}`}
          alt="Эфир повара (резервный канал)"
          onLoad={() => {
            mjpegLoadedRef.current = true;
            setRelayShown(true);
          }}
          onError={() => setRelayMode("poll")}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      {/* Фолбэк: покадровый поллинг, если MJPEG не прошёл через прокси */}
      {!isChef && !playing && relayMode === "poll" && relayFrame && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={relayFrame} alt="Эфир повара (резервный канал)" className="absolute inset-0 h-full w-full object-cover" />
      )}
      {!isChef && !playing && relayShown && (
        <span className="absolute bottom-3 right-3 z-10 rounded-md bg-black/55 px-2 py-1 text-[11px] font-semibold text-white">
          {relayAudioOn ? "резервный канал · звук включён" : "резервный канал"}
        </span>
      )}

      {/* Плейсхолдер, пока нет живого видео */}
      {!playing && !relayShown && (
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
