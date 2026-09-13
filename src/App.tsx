"use client";

import { useRef, useState } from "react";
import VideoStage from "@/components/VideoStage";

type DurationChoice = "short" | "medium" | "long";
const DURATION_MS: Record<DurationChoice, number> = {
  short: 5000,
  medium: 10000,
  long: 15000,
};

// Bundled footage — plain, ordinary scenes with no built-in wrongness of
// their own, so the effects pipeline supplies the one anomaly. Clip
// lengths vary (5.5s-15s); VideoStage clamps the chosen duration bucket
// to whatever the picked clip can actually support.
const CLIPS = [
  { id: "hallway", src: "/clips/hallway.webm" },
  { id: "room-corner", src: "/clips/room-corner.webm" },
  { id: "corridor", src: "/clips/corridor.webm" },
  { id: "garage-corridor", src: "/clips/garage-corridor.webm" },
];

export default function App() {
  const [clipIndex, setClipIndex] = useState(0);
  const [duration, setDuration] = useState<DurationChoice>("medium");
  const [seed, setSeed] = useState(0);
  const [playToken, setPlayToken] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const hasPlayedRef = useRef(false);

  function handleGenerate() {
    if (isPlaying) return;
    hasPlayedRef.current = true;
    setIsPlaying(true);
    // ?clip=<id>&seed=<n> force a specific clip/seed instead of a random
    // pick — a small escape hatch for reproducing one exact run.
    const params = new URLSearchParams(window.location.search);
    const forcedClip = params.get("clip");
    const forcedIdx = forcedClip ? CLIPS.findIndex((c) => c.id === forcedClip) : -1;
    const forcedSeed = params.get("seed");
    setClipIndex(forcedIdx >= 0 ? forcedIdx : Math.floor(Math.random() * CLIPS.length));
    setSeed(forcedSeed ? Number(forcedSeed) : Math.floor(Math.random() * 2 ** 31));
    setPlayToken((t) => t + 1);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0b0b0d",
        color: "#e8e8e8",
        fontFamily: "system-ui, sans-serif",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header style={{ padding: "16px 24px", borderBottom: "1px solid #222" }}>
        <h1 style={{ fontSize: 18, margin: 0 }}>Creepy Shorts Generator</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#9a9a9a" }}>
          Click Generate: a random plain clip runs through the effects pipeline and cuts hard to black. No AI-generated
          content, no upload required.
        </p>
      </header>

      <main style={{ flex: 1, padding: 24 }}>
        <div style={{ maxWidth: 960 }}>
          <VideoStage
            videoUrl={CLIPS[clipIndex].src}
            durationMs={DURATION_MS[duration]}
            seed={seed}
            playToken={playToken}
            onDone={() => setIsPlaying(false)}
          />

          <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
            <button
              onClick={handleGenerate}
              disabled={isPlaying}
              style={{
                padding: "10px 20px",
                fontSize: 15,
                fontWeight: 600,
                borderRadius: 6,
                border: "1px solid #444",
                background: isPlaying ? "#2a2a2a" : "#e8e8e8",
                color: isPlaying ? "#888" : "#111",
                cursor: isPlaying ? "default" : "pointer",
              }}
            >
              {isPlaying ? "Playing…" : hasPlayedRef.current ? "Regenerate" : "Generate clip"}
            </button>

            <div style={{ display: "flex", gap: 8 }}>
              {(["short", "medium", "long"] as DurationChoice[]).map((choice) => (
                <button
                  key={choice}
                  onClick={() => setDuration(choice)}
                  disabled={isPlaying}
                  style={{
                    padding: "8px 14px",
                    fontSize: 13,
                    borderRadius: 6,
                    border: `1px solid ${duration === choice ? "#e8e8e8" : "#444"}`,
                    background: duration === choice ? "#2a2a2a" : "transparent",
                    color: duration === choice ? "#e8e8e8" : "#9a9a9a",
                    cursor: isPlaying ? "default" : "pointer",
                    textTransform: "capitalize",
                  }}
                >
                  {choice} (~{DURATION_MS[choice] / 1000}s)
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
