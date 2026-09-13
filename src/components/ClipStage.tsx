"use client";

import { useEffect, useRef } from "react";
import { getAudioEngine } from "@/lib/audio";

export interface ClipParams {
  /** 0..1 — how far the spike moment's duplicated light deviates from the
   * original; default is subtle (near 0). */
  wrongnessIntensity: number;
  /** Phase split as percentages of durationMs — need not sum to exactly
   * 100; ClipStage normalizes them at playback time. */
  mundanePct: number;
  buildPct: number;
  spikePct: number;
  durationMs: number;
  /** The pitch-shift-down drone's start/end frequency, Hz. */
  droneStartHz: number;
  droneEndHz: number;
}

// Internal render resolution, scaled up via CSS — keeps the per-frame
// grain pass cheap regardless of on-screen size.
const CANVAS_W = 960;
const CANVAS_H = 540;

type Phase = "mundane" | "build" | "spike";

function phaseBoundaries(params: ClipParams) {
  const total = params.mundanePct + params.buildPct + params.spikePct || 1;
  const mundaneMs = (params.durationMs * params.mundanePct) / total;
  const buildMs = (params.durationMs * params.buildPct) / total;
  return { buildStartMs: mundaneMs, spikeStartMs: mundaneMs + buildMs };
}

function drawScene(ctx: CanvasRenderingContext2D, elapsedMs: number, params: ClipParams, phase: Phase, spikeStartMs: number) {
  const w = CANVAS_W;
  const h = CANVAS_H;
  // Frozen mid-motion through the spike — the render clock stops advancing
  // the instant the spike begins, instead of continuing to animate.
  const renderMs = phase === "spike" ? spikeStartMs : elapsedMs;
  const seconds = renderMs / 1000;

  const room = ctx.createRadialGradient(w / 2, h * 0.55, 20, w / 2, h * 0.55, w * 0.7);
  room.addColorStop(0, "#2c1c10");
  room.addColorStop(1, "#07050a");
  ctx.fillStyle = room;
  ctx.fillRect(0, 0, w, h);

  // 0 through mundane, ramps 0→1 across the build phase, then holds.
  const { buildStartMs } = phaseBoundaries(params);
  const buildEndMs = spikeStartMs;
  const unnatural =
    renderMs <= buildStartMs ? 0 : renderMs >= buildEndMs ? 1 : (renderMs - buildStartMs) / (buildEndMs - buildStartMs || 1);

  // Natural sway blends two independent frequencies, like a real hanging
  // light. Smooth sway is a single slow, perfectly regular frequency —
  // "too smooth, too slow" as the build phase takes over.
  const naturalX = Math.sin(seconds * 0.7) * 0.6 + Math.sin(seconds * 1.7 + 1.2) * 0.4;
  const naturalY = Math.sin(seconds * 0.9 + 0.4) * 0.5 + Math.sin(seconds * 2.3) * 0.3;
  const smoothX = Math.sin(seconds * 0.35);
  const smoothY = Math.sin(seconds * 0.35 + Math.PI / 2) * 0.4;

  const mixX = naturalX * (1 - unnatural) + smoothX * unnatural;
  const mixY = naturalY * (1 - unnatural) + smoothY * unnatural;

  const lightX = w / 2 + mixX * w * 0.22;
  const lightY = h * 0.42 + mixY * h * 0.12;

  function drawGlow(x: number, y: number, alpha = 1) {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, 70);
    glow.addColorStop(0, `rgba(255, 214, 150, ${0.9 * alpha})`);
    glow.addColorStop(1, "rgba(255, 214, 150, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, 70, 0, Math.PI * 2);
    ctx.fill();
  }

  drawGlow(lightX, lightY);

  if (phase === "spike") {
    // The one wrongness moment: a second, identical light where the scene
    // only ever established one. Offset and visibility scale with the
    // wrongness intensity parameter — near-invisible by default.
    const offset = w * (0.06 + 0.34 * params.wrongnessIntensity);
    const alpha = 0.12 + 0.7 * params.wrongnessIntensity;
    const dupX = w - lightX - offset;
    const dupY = lightY - h * 0.08 * params.wrongnessIntensity;
    drawGlow(dupX, dupY, alpha);
  }

  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(lightX, h * 0.86, 90, 20, 0, 0, Math.PI * 2);
  ctx.fill();

  // Grain — texture only, doesn't affect the deterministic phase/motion
  // logic above.
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.06})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
  }
}

export default function ClipStage({
  params,
  playToken,
  onDone,
}: {
  params: ClipParams;
  /** Increment to start a new clip render/playback. */
  playToken: number;
  onDone?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(0);
  const stopAudioRef = useRef<(() => void) | null>(null);
  const paramsRef = useRef(params);
  paramsRef.current = params;

  useEffect(() => {
    // playToken starts at 0 ("idle"); only fire on an actual Generate click.
    if (playToken === 0) return;
    startClip();
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      stopAudioRef.current?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playToken]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      stopAudioRef.current?.();
    };
  }, []);

  function startClip() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    stopAudioRef.current?.();

    // Snapshot params for the duration of this clip — mid-clip control
    // changes shouldn't distort a render already in flight.
    const clipParams = paramsRef.current;

    stopAudioRef.current = getAudioEngine().playGeneratedClip({
      durationMs: clipParams.durationMs,
      droneStartHz: clipParams.droneStartHz,
      droneEndHz: clipParams.droneEndHz,
    });
    startRef.current = performance.now();

    function tick() {
      const ctx = canvas!.getContext("2d");
      if (!ctx) return;
      const elapsed = performance.now() - startRef.current;

      if (elapsed >= clipParams.durationMs) {
        // Hard cut — instant, no fade, in sync with the audio's own cutoff.
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, canvas!.width, canvas!.height);
        stopAudioRef.current?.();
        stopAudioRef.current = null;
        onDone?.();
        return;
      }

      const { buildStartMs, spikeStartMs } = phaseBoundaries(clipParams);
      const phase: Phase = elapsed < buildStartMs ? "mundane" : elapsed < spikeStartMs ? "build" : "spike";

      drawScene(ctx, elapsed, clipParams, phase, spikeStartMs);
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
  }

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_W}
      height={CANVAS_H}
      style={{
        width: "100%",
        height: "auto",
        aspectRatio: `${CANVAS_W} / ${CANVAS_H}`,
        background: "#000",
        borderRadius: 8,
        display: "block",
      }}
    />
  );
}
