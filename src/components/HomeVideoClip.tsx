"use client";

import { useEffect, useRef, useState } from "react";
import { getAudioEngine } from "@/lib/audio";

// Internal render resolution — kept low and scaled up via CSS so the
// per-frame scanline-warble pass (which reads the canvas back) stays cheap
// regardless of the on-screen size.
const CANVAS_W = 400;
const CANVAS_H = 250;

const CLIP_MS = 4800;
const FREEZE_START_MS = 3550;
const FREEZE_HOLD_MS = 750;

function drawFrame(ctx: CanvasRenderingContext2D, w: number, h: number, elapsedMs: number, frozen: boolean) {
  const seconds = elapsedMs / 1000;

  const grad = ctx.createRadialGradient(w / 2, h * 0.55, 20, w / 2, h * 0.55, w * 0.75);
  grad.addColorStop(0, "#3a2410");
  grad.addColorStop(1, "#0b0603");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // The light source sways on a suspiciously smooth, mechanical path —
  // too regular for anything actually hanging or swinging.
  const swayX = w / 2 + Math.sin(seconds * 0.6) * w * 0.22;
  const swayY = h * 0.42 + Math.sin(seconds * 0.9) * h * 0.05;

  function drawGlow(x: number, y: number) {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, 55);
    glow.addColorStop(0, "rgba(255, 214, 140, 0.9)");
    glow.addColorStop(1, "rgba(255, 214, 140, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, 55, 0, Math.PI * 2);
    ctx.fill();
  }

  drawGlow(swayX, swayY);
  if (frozen) {
    // The one impossible thing in the whole clip — a second, identical
    // light where there should only ever be one. Never explained.
    drawGlow(w - swayX, swayY + 36);
  }

  // A shadow that drifts the wrong way relative to the light above it.
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(w / 2 - Math.sin(seconds * 0.6) * w * 0.15, h * 0.86, 65, 16, 0, 0, Math.PI * 2);
  ctx.fill();

  // Scanline warble — thin rows of the frame just drawn, nudged sideways.
  for (let y = 0; y < h; y += 4) {
    const offset = Math.sin(y * 0.09 + seconds * 4.2) * 2.2;
    ctx.drawImage(ctx.canvas, 0, y, w, 2, offset, y, w, 2);
  }

  // Grain.
  for (let i = 0; i < 70; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.08})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
  }

  // Occasional dropout.
  if (Math.random() < 0.035) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, Math.random() * h, w, 4 + Math.random() * 10);
  }
}

export default function HomeVideoClip({
  onPlayed,
  onFreezeFrame,
  initialPlayed,
}: {
  onPlayed: () => void;
  onFreezeFrame?: () => void;
  initialPlayed?: boolean;
}) {
  const [state, setState] = useState<"idle" | "playing" | "done">(initialPlayed ? "done" : "idle");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const startRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const freezeFiredRef = useRef(false);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  function tick() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const elapsed = performance.now() - startRef.current;

    if (elapsed >= CLIP_MS) {
      // Hard, unexplained cut to black — no fade, mid-motion.
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      setState("done");
      setTimeout(onPlayed, 500);
      return;
    }

    const frozen = elapsed >= FREEZE_START_MS && elapsed < FREEZE_START_MS + FREEZE_HOLD_MS;
    if (frozen && !freezeFiredRef.current) {
      freezeFiredRef.current = true;
      onFreezeFrame?.();
    }
    const renderTime = frozen ? FREEZE_START_MS : elapsed;
    drawFrame(ctx, canvas.width, canvas.height, renderTime, frozen);

    rafRef.current = requestAnimationFrame(tick);
  }

  function handlePlay() {
    if (state !== "idle") return;
    setState("playing");
    getAudioEngine().playHomeVideoAudio();
    startRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
  }

  return (
    <div className="flex flex-col items-start gap-1">
      {state === "idle" ? (
        <button
          onClick={handlePlay}
          className="relative flex h-40 w-64 max-w-[85%] items-center justify-center overflow-hidden rounded-lg border border-black/10 bg-[#1a0f08] shadow-lg shadow-black/30"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-300/70 text-sm text-zinc-100">
            ▶
          </span>
          <span className="absolute bottom-1.5 right-2 text-[10px] text-zinc-400">0:05</span>
        </button>
      ) : state === "done" && initialPlayed ? (
        <div className="flex h-40 w-64 max-w-[85%] items-center justify-center rounded-lg border border-black/10 bg-black shadow-lg shadow-black/30">
          <span className="text-[10px] text-zinc-600">clip ended</span>
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="h-40 w-64 max-w-[85%] rounded-lg border border-black/10 shadow-lg shadow-black/30"
          style={{ imageRendering: "pixelated" }}
        />
      )}
    </div>
  );
}
