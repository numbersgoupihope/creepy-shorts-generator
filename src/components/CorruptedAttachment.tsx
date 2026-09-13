"use client";

import { useState } from "react";
import { getAudioEngine } from "@/lib/audio";

const CAPTION = "mm— ...outside... it's not—... okay";
const PLAY_MS = 3850;

export default function CorruptedAttachment({
  onPlayed,
  initialPlayed,
}: {
  onPlayed: () => void;
  initialPlayed?: boolean;
}) {
  const [state, setState] = useState<"idle" | "playing" | "played">(
    initialPlayed ? "played" : "idle"
  );

  function handlePlay() {
    if (state !== "idle") return;
    setState("playing");
    getAudioEngine().playCorruptedVoice();
    setTimeout(() => {
      setState("played");
      setTimeout(onPlayed, 1200);
    }, PLAY_MS);
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={handlePlay}
        className="flex items-center gap-3 rounded-2xl rounded-bl-sm bg-zinc-800/80 px-4 py-3 text-left"
      >
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-zinc-500 text-sm text-zinc-200 ${
            state === "playing" ? "animate-pulse" : ""
          }`}
        >
          {state === "idle" ? "▶" : state === "playing" ? "■" : "▶"}
        </span>
        <span className="flex items-end gap-[2px]">
          {Array.from({ length: 18 }).map((_, i) => (
            <span
              key={i}
              className={`w-[2px] rounded-full bg-zinc-500 ${
                state === "playing" ? "animate-bounce" : ""
              }`}
              style={{
                height: `${6 + ((i * 7) % 16)}px`,
                animationDelay: `${i * 60}ms`,
                animationDuration: "600ms",
              }}
            />
          ))}
        </span>
        <span className="text-xs text-zinc-500">0:03</span>
      </button>
      {state === "played" && (
        <p className="anomaly-fade-in max-w-[78%] px-1 text-xs italic text-zinc-600">
          &ldquo;{CAPTION}&rdquo;
        </p>
      )}
    </div>
  );
}
