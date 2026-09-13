"use client";

import { useEffect, useRef, useState } from "react";
import { getAudioEngine } from "@/lib/audio";
import { pickCreepyParams, type CreepyParams } from "@/lib/random";
import NoiseCanvas from "@/components/NoiseCanvas";

const MAX_CANVAS_W = 960;
// How long each drawn frame is held before the next refresh — a rough
// 13fps judder instead of smooth 30/60fps video, closer to a projected
// Super 8 reel than a modern digital clip.
const FRAME_HOLD_MS = 75;
// Random per-held-frame translate, simulating film gate weave.
const GATE_WEAVE_PX = 3;
// Narrower-than-source pillarbox aspect (width/height) — classic Super 8.
const TARGET_ASPECT = 4 / 3;
// The shadow figure's idle-sway period; the motion-loop trick replays
// whole multiples of this so the loop point is seamless (same phase
// going in and coming out) rather than a visible jump-cut.
const SWAY_PERIOD_MS = 2200;

function loopedAnimMs(elapsedMs: number, loopStartMs: number, loopWindowMs: number): number {
  if (elapsedMs >= loopStartMs && elapsedMs < loopStartMs + loopWindowMs) {
    return loopStartMs - loopWindowMs + ((elapsedMs - loopStartMs) % loopWindowMs);
  }
  return elapsedMs;
}

/** The one ambiguous, human-shaped presence in the frame — a soft dark
 * silhouette, never a rendered face or detail. It's meant to read as "is
 * that a shadow, or someone standing there," not as an obvious graphic. */
function drawFigure(ctx: CanvasRenderingContext2D, w: number, h: number, animMs: number, opacity: number, params: CreepyParams, offsetXPx: number) {
  if (opacity <= 0.003) return;
  const t = animMs / 1000;
  const swayX = Math.sin((t * 2 * Math.PI * 1000) / SWAY_PERIOD_MS) * 3;
  const breathe = 1 + 0.015 * Math.sin((t * 2 * Math.PI * 1000) / (SWAY_PERIOD_MS * 1.3));

  const baseX = params.figureX * w + offsetXPx;
  const baseY = params.figureY * h;
  const figH = h * 0.34 * params.figureScale * breathe;
  const figW = figH * 0.42;
  const cx = baseX + swayX;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = "#0a0a0a";
  ctx.beginPath();
  ctx.ellipse(cx, baseY - figH * 0.38, figW * 0.5, figH * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, baseY - figH * 0.82, figW * 0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawGrainAndGrade(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  // Crushed blacks + a warm, sickly cast — old, under-processed film
  // stock rather than clean digital video.
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(x, y, w, h);
  ctx.globalCompositeOperation = "overlay";
  ctx.fillStyle = "rgba(255,170,80,0.12)";
  ctx.fillRect(x, y, w, h);
  ctx.restore();

  // Grain — heavier than a clean digital source, unifies the real
  // footage with the synthetic figure under one shared texture.
  ctx.save();
  ctx.globalAlpha = 1;
  const count = Math.round((w * h) / 900);
  for (let i = 0; i < count; i++) {
    const gx = x + Math.random() * w;
    const gy = y + Math.random() * h;
    const v = Math.random();
    ctx.fillStyle = v > 0.5 ? `rgba(255,255,255,${Math.random() * 0.12})` : `rgba(0,0,0,${Math.random() * 0.12})`;
    ctx.fillRect(gx, gy, 1, 1);
  }
  // Occasional single-frame dropout / scratch — rare and brief.
  if (Math.random() < 0.05) {
    ctx.fillStyle = `rgba(230,230,230,${0.15 + Math.random() * 0.2})`;
    ctx.fillRect(x + Math.random() * w, y, 1 + Math.random(), h);
  }
  ctx.restore();
}

export default function VideoStage({
  videoUrl,
  durationMs,
  seed,
  playToken,
  onDone,
}: {
  videoUrl: string;
  /** Requested clip length; clamped to the source video's own length. */
  durationMs: number;
  seed: number;
  /** Increment to (re)start playback with a fresh seed. */
  playToken: number;
  onDone?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(0);
  const stopAudioRef = useRef<(() => void) | null>(null);
  const heldFrameAtRef = useRef(-Infinity);
  const jitterRef = useRef({ dx: 0, dy: 0 });
  const frozenRef = useRef(false);
  const [dims, setDims] = useState({ w: 640, h: 360 });
  const [staticBurst, setStaticBurst] = useState(false);
  const [revealFlash, setRevealFlash] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      stopAudioRef.current?.();
    };
  }, []);

  function handleLoadedMetadata() {
    const video = videoRef.current;
    if (!video) return;
    const scale = Math.min(1, MAX_CANVAS_W / video.videoWidth);
    setDims({ w: Math.round(video.videoWidth * scale), h: Math.round(video.videoHeight * scale) });
  }

  useEffect(() => {
    if (playToken === 0) return;
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;

    // videoUrl can change on every Generate click (a fresh random clip),
    // so wait for its metadata (duration, dimensions) to actually load
    // before reading video.duration in startClip() — otherwise the very
    // first play of a newly-picked clip would race a still-loading src.
    function onLoaded() {
      video!.removeEventListener("loadedmetadata", onLoaded);
      if (!cancelled) startClip();
    }
    video.addEventListener("loadedmetadata", onLoaded);
    video.load();

    return () => {
      cancelled = true;
      video.removeEventListener("loadedmetadata", onLoaded);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      stopAudioRef.current?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playToken]);

  function startClip() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    stopAudioRef.current?.();

    const params = pickCreepyParams(seed);
    const videoDurationMs = Number.isFinite(video.duration) ? video.duration * 1000 : durationMs;
    // Cut before the source would naturally end — leave a little slack for
    // the freeze hold.
    const clipDurationMs = Math.min(durationMs, Math.max(1000, videoDurationMs - 200));
    // Freeze can't eat more than half the clip — guards short clips
    // against a freezeHoldMs that would otherwise swallow everything.
    const freezeHoldMs = Math.min(params.freezeHoldMs, clipDurationMs * 0.5);
    const freezeStartMs = clipDurationMs - freezeHoldMs;

    // The motion-loop: replay whole sway cycles verbatim so entry/exit
    // are seamless (same phase), fit entirely before freeze starts.
    const loopWindowMs = SWAY_PERIOD_MS * params.loopCycles;
    const latestLoopStart = Math.max(0, freezeStartMs - 200 - loopWindowMs);
    const loopStartMs = Math.min(params.loopStartFrac * clipDurationMs, latestLoopStart);

    frozenRef.current = false;
    heldFrameAtRef.current = -Infinity;
    jitterRef.current = { dx: 0, dy: 0 };
    setIsPlaying(true);
    setRevealFlash(false);
    // A cheap, DOM-only phase marker (not React state, so it costs no
    // extra render) — lets a test drive its sampling off the pipeline's
    // actual phase instead of guessing wall-clock offsets.
    canvas.dataset.phase = "mundane";

    video.currentTime = 0;
    video.pause();

    stopAudioRef.current = getAudioEngine().playVideoClip({
      video,
      durationMs: clipDurationMs,
      droneStartHz: params.droneStartHz,
      droneEndHz: params.droneEndHz,
      droneGainTarget: params.droneGainTarget,
      droneSweepFrac: params.droneSweepFrac,
      warpRate: params.warpRate,
    });
    void video.play();
    startRef.current = performance.now();

    function pulseBurst() {
      setStaticBurst(true);
      setTimeout(() => setStaticBurst(false), 180);
    }

    function innerRect(canvasW: number, canvasH: number) {
      const innerH = canvasH;
      const innerW = Math.min(canvasW, canvasH * TARGET_ASPECT);
      return { x: (canvasW - innerW) / 2, y: 0, w: innerW, h: innerH };
    }

    function drawVideoCover(ctx: CanvasRenderingContext2D, rect: { x: number; y: number; w: number; h: number }) {
      const vw = video!.videoWidth || rect.w;
      const vh = video!.videoHeight || rect.h;
      const targetAspect = rect.w / rect.h;
      let sw = vw;
      let sh = vh;
      if (vw / vh > targetAspect) {
        sw = vh * targetAspect;
      } else {
        sh = vw / targetAspect;
      }
      const sx = (vw - sw) / 2;
      const sy = (vh - sh) / 2;
      ctx.drawImage(video!, sx, sy, sw, sh, rect.x, rect.y, rect.w, rect.h);
    }

    function renderFrame(elapsed: number, figureOpacity: number, duplicate: boolean) {
      const canvasEl = canvas!;
      const ctx = canvasEl.getContext("2d")!;
      const rect = innerRect(canvasEl.width, canvasEl.height);

      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);

      ctx.save();
      ctx.beginPath();
      ctx.rect(rect.x, rect.y, rect.w, rect.h);
      ctx.clip();
      ctx.translate(jitterRef.current.dx, jitterRef.current.dy);

      drawVideoCover(ctx, rect);

      const animMs = loopedAnimMs(elapsed, loopStartMs, loopWindowMs);
      drawFigure(ctx, canvasEl.width, canvasEl.height, animMs, figureOpacity, params, 0);
      if (duplicate) {
        drawFigure(ctx, canvasEl.width, canvasEl.height, animMs, figureOpacity * 0.85, params, params.figureDuplicateOffsetFrac * canvasEl.width);
      }

      drawGrainAndGrade(ctx, rect.x, rect.y, rect.w, rect.h);
      ctx.restore();
    }

    function tick() {
      const elapsed = performance.now() - startRef.current;

      if (elapsed >= clipDurationMs) {
        // Hard cut — instant, no fade, in sync with the audio's own cutoff.
        canvas!.dataset.phase = "cut";
        const ctx = canvas!.getContext("2d")!;
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, canvas!.width, canvas!.height);
        video!.pause();
        stopAudioRef.current?.();
        stopAudioRef.current = null;
        setIsPlaying(false);
        onDone?.();
        return;
      }

      if (elapsed >= freezeStartMs) {
        if (!frozenRef.current) {
          frozenRef.current = true;
          canvas!.dataset.phase = "freeze";
          video!.pause();
          // The reveal: the figure snaps from barely-there to
          // unmistakable, duplicated, and holds — frozen — through the
          // cut. One concentrated jolt: static burst, light-leak flash,
          // and a sparse dissonant stinger, all at once.
          renderFrame(elapsed, params.figureRevealOpacity, true);
          pulseBurst();
          setRevealFlash(true);
          setTimeout(() => setRevealFlash(false), 220);
          getAudioEngine().playRevealStinger();
        }
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      if (elapsed - heldFrameAtRef.current >= FRAME_HOLD_MS) {
        heldFrameAtRef.current = elapsed;
        jitterRef.current = {
          dx: (Math.random() - 0.5) * 2 * GATE_WEAVE_PX,
          dy: (Math.random() - 0.5) * 2 * GATE_WEAVE_PX,
        };
        renderFrame(elapsed, params.figureBaseOpacity, false);
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
  }

  return (
    <div style={{ position: "relative" }}>
      {/* Never display:none or visibility:hidden here — several browsers
          throttle or stop decoding new video frames for an element that
          isn't in the paint tree, which would leave drawImage() copying
          the same stale frame forever (audio would keep playing fine,
          masking the bug). Off-screen + zero-opacity keeps it decoding
          while staying invisible to the viewer. */}
      <video
        ref={videoRef}
        src={videoUrl}
        onLoadedMetadata={handleLoadedMetadata}
        muted={false}
        playsInline
        style={{ position: "fixed", top: 0, left: 0, width: 2, height: 2, opacity: 0, pointerEvents: "none" }}
      />
      <canvas
        ref={canvasRef}
        width={dims.w}
        height={dims.h}
        style={{
          width: "100%",
          height: "auto",
          aspectRatio: `${dims.w} / ${dims.h}`,
          background: "#000",
          borderRadius: 8,
          display: "block",
        }}
      />
      {isPlaying && (
        <>
          <NoiseCanvas boost={staticBurst} />
          <div
            aria-hidden
            className="pointer-events-none fixed inset-0 z-10 opacity-[0.05]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(to bottom, rgba(255,255,255,0.5) 0px, rgba(255,255,255,0.5) 1px, transparent 1px, transparent 3px)",
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none fixed inset-0 z-10"
            style={{
              background: "radial-gradient(ellipse at center, transparent 38%, rgba(0,0,0,0.6) 100%)",
            }}
          />
          {staticBurst && <div className="pointer-events-none fixed inset-0 z-30 bg-white/10 mix-blend-difference" />}
          {revealFlash && (
            <div
              aria-hidden
              className="pointer-events-none fixed inset-0 z-20"
              style={{ background: "rgba(255,210,150,0.35)", mixBlendMode: "screen" }}
            />
          )}
        </>
      )}
    </div>
  );
}
