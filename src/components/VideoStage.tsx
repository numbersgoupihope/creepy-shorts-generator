"use client";

import { useEffect, useRef, useState } from "react";
import { getAudioEngine } from "@/lib/audio";
import { pickCreepyParams } from "@/lib/random";
import NoiseCanvas from "@/components/NoiseCanvas";

const MAX_CANVAS_W = 960;
const LAG_SAMPLE_INTERVAL_MS = 120;
const LAG_BUFFER_MAX_MS = 2200;

interface BufferedFrame {
  t: number;
  canvas: HTMLCanvasElement;
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
  const bufferRef = useRef<BufferedFrame[]>([]);
  const lastSampleRef = useRef(0);
  const frozenRef = useRef(false);
  const burstFiredRef = useRef({ anomaly: false, freeze: false });
  const featherMaskRef = useRef<HTMLCanvasElement | null>(null);
  const regionScratchRef = useRef<HTMLCanvasElement | null>(null);
  const [dims, setDims] = useState({ w: 640, h: 360 });
  const [staticBurst, setStaticBurst] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  // TEMP diagnostic readout (v4) — on-screen elapsed-time counter so a
  // screen capture can show exactly when the cut fires relative to the
  // timeline, rather than relying on eyeballing it.
  const [debugElapsedMs, setDebugElapsedMs] = useState(0);

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
    // Fit the anomaly inside whatever's left before freeze starts (minus
    // a small gap so the two never touch), instead of independently
    // clamping its start and end against freezeStartMs — that used to
    // let a long freeze hold squeeze the anomaly's actual on-screen
    // duration down to a sliver (or effectively zero) without anything
    // signaling it had happened, which read as "the anomaly never fires"
    // even though the code path did run.
    const anomalyBudgetMs = Math.max(0, freezeStartMs - 300);
    const anomalyDurMs = Math.min(params.anomalyDurMs, anomalyBudgetMs);
    const anomalyStartMs = Math.min(params.anomalyStartFrac * clipDurationMs, anomalyBudgetMs - anomalyDurMs);
    const anomalyEndMs = anomalyStartMs + anomalyDurMs;

    bufferRef.current = [];
    lastSampleRef.current = -Infinity;
    frozenRef.current = false;
    burstFiredRef.current = { anomaly: false, freeze: false };
    setIsPlaying(true);

    // Pixel size of the anomaly region on this canvas, plus a soft radial
    // feather mask sized to match — compositing the lagged patch through
    // it avoids a hard rectangular seam, so it reads as the scene moving
    // wrong rather than a visibly pasted overlay.
    const regionPx = {
      x: Math.round(params.anomalyRegion.x * canvas.width),
      y: Math.round(params.anomalyRegion.y * canvas.height),
      w: Math.round(params.anomalyRegion.w * canvas.width),
      h: Math.round(params.anomalyRegion.h * canvas.height),
    };
    const feather = document.createElement("canvas");
    feather.width = regionPx.w;
    feather.height = regionPx.h;
    const fctx = feather.getContext("2d")!;
    const cx = regionPx.w / 2;
    const cy = regionPx.h / 2;
    const grad = fctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(cx, cy));
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.6, "rgba(255,255,255,1)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    fctx.fillStyle = grad;
    fctx.fillRect(0, 0, regionPx.w, regionPx.h);
    featherMaskRef.current = feather;

    const scratch = document.createElement("canvas");
    scratch.width = regionPx.w;
    scratch.height = regionPx.h;
    regionScratchRef.current = scratch;

    // TEMP diagnostic logging (v4) — exact computed phase boundaries for
    // this run, so a screen capture can be cross-referenced frame-for-
    // frame against what the pipeline actually scheduled.
    console.log("[creepy-debug] clip:", videoUrl, {
      clipDurationMs: Math.round(clipDurationMs),
      freezeStartMs: Math.round(freezeStartMs),
      freezeHoldMs: Math.round(freezeHoldMs),
      anomalyStartMs: Math.round(anomalyStartMs),
      anomalyEndMs: Math.round(anomalyEndMs),
      wrongnessIntensity: params.wrongnessIntensity.toFixed(2),
      droneStartHz: Math.round(params.droneStartHz),
      droneEndHz: Math.round(params.droneEndHz),
      warpRate: params.warpRate,
    });

    video.currentTime = 0;
    video.pause();

    stopAudioRef.current = getAudioEngine().playVideoClip({
      video,
      durationMs: clipDurationMs,
      droneStartHz: params.droneStartHz,
      droneEndHz: params.droneEndHz,
      warpRate: params.warpRate,
    });
    void video.play();
    startRef.current = performance.now();

    function pulseBurst() {
      setStaticBurst(true);
      setTimeout(() => setStaticBurst(false), 160);
    }

    function sampleBuffer(elapsed: number) {
      if (elapsed - lastSampleRef.current < LAG_SAMPLE_INTERVAL_MS) return;
      lastSampleRef.current = elapsed;
      const snap = document.createElement("canvas");
      snap.width = canvas!.width;
      snap.height = canvas!.height;
      snap.getContext("2d")!.drawImage(canvas!, 0, 0);
      bufferRef.current.push({ t: elapsed, canvas: snap });
      const cutoff = elapsed - LAG_BUFFER_MAX_MS;
      while (bufferRef.current.length && bufferRef.current[0].t < cutoff) bufferRef.current.shift();
    }

    function findBufferedFrame(targetT: number): BufferedFrame | null {
      const arr = bufferRef.current;
      if (arr.length === 0) return null;
      let best = arr[0];
      for (const f of arr) {
        if (f.t <= targetT) best = f;
        else break;
      }
      return best;
    }

    function tick() {
      const ctx = canvas!.getContext("2d");
      if (!ctx) return;
      const elapsed = performance.now() - startRef.current;

      if (elapsed >= clipDurationMs) {
        // Hard cut — instant, no fade, in sync with the audio's own cutoff.
        console.log(
          `[creepy-debug] CUT at elapsed=${Math.round(elapsed)}ms (scheduled clipDurationMs=${Math.round(clipDurationMs)}, source video.duration=${Math.round(video!.duration * 1000)}ms) — cut fired ${Math.round(video!.duration * 1000 - elapsed)}ms before the source's own end.`,
        );
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
        // Held freeze-frame right before the cut — stop advancing the
        // video, keep redrawing the frame it froze on.
        if (!frozenRef.current) {
          frozenRef.current = true;
          console.log(`[creepy-debug] FREEZE start at elapsed=${Math.round(elapsed)}ms`);
          video!.pause();
          if (!burstFiredRef.current.freeze) {
            burstFiredRef.current.freeze = true;
            pulseBurst();
          }
        }
        setDebugElapsedMs(Math.round(elapsed));
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      ctx.drawImage(video!, 0, 0, canvas!.width, canvas!.height);
      sampleBuffer(elapsed);
      setDebugElapsedMs(Math.round(elapsed));

      if (elapsed >= anomalyStartMs && elapsed <= anomalyEndMs) {
        // The one unnatural-motion moment: one region of the frame lags
        // behind real time, sampled from a moment in the recent past,
        // while the rest of the frame plays normally.
        if (!burstFiredRef.current.anomaly) {
          burstFiredRef.current.anomaly = true;
          console.log(`[creepy-debug] ANOMALY start at elapsed=${Math.round(elapsed)}ms`);
          pulseBurst();
        }
        const buffered = findBufferedFrame(elapsed - params.lagMs);
        const scratch = regionScratchRef.current;
        const mask = featherMaskRef.current;
        if (buffered && scratch && mask) {
          const x = Math.round(params.anomalyRegion.x * canvas!.width);
          const y = Math.round(params.anomalyRegion.y * canvas!.height);
          const w = scratch.width;
          const h = scratch.height;
          const sctx = scratch.getContext("2d")!;
          sctx.clearRect(0, 0, w, h);
          sctx.drawImage(buffered.canvas, x, y, w, h, 0, 0, w, h);
          sctx.globalCompositeOperation = "destination-in";
          sctx.drawImage(mask, 0, 0);
          sctx.globalCompositeOperation = "source-over";

          ctx.globalAlpha = params.wrongnessIntensity;
          ctx.drawImage(scratch, x, y);
          ctx.globalAlpha = 1;
        }
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
              background: "radial-gradient(ellipse at center, transparent 42%, rgba(0,0,0,0.55) 100%)",
            }}
          />
          {staticBurst && <div className="pointer-events-none fixed inset-0 z-30 bg-white/10 mix-blend-difference" />}
          {/* TEMP diagnostic readout (v4) — remove once the pipeline's
              perceptibility on real footage is confirmed. */}
          <div
            aria-hidden
            className="pointer-events-none fixed z-40 rounded bg-black/70 px-2 py-1 font-mono text-xs text-lime-300"
            style={{ top: 8, left: 8 }}
          >
            {(debugElapsedMs / 1000).toFixed(2)}s
          </div>
        </>
      )}
    </div>
  );
}
