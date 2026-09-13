"use client";

import { useEffect, useRef } from "react";

const SIZE = 100;
const FRAME_MS = 90;

export default function NoiseCanvas({ boost }: { boost?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    canvas.width = SIZE;
    canvas.height = SIZE;
    const imageData = ctx.createImageData(SIZE, SIZE);

    let raf = 0;
    let last = 0;

    function draw(time: number) {
      raf = requestAnimationFrame(draw);
      if (time - last < FRAME_MS) return;
      last = time;

      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const v = Math.random() * 255;
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
        data[i + 3] = 255;
      }
      ctx!.putImageData(imageData, 0, 0);
    }

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`pointer-events-none fixed inset-0 z-10 h-full w-full mix-blend-overlay transition-opacity duration-150 ${
        boost ? "opacity-30" : "opacity-[0.075]"
      }`}
    />
  );
}
