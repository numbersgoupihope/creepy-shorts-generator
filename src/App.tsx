"use client";

import { useEffect, useRef, useState } from "react";
import VideoStage from "@/components/VideoStage";

type DurationChoice = "short" | "medium" | "long";
const DURATION_MS: Record<DurationChoice, number> = {
  short: 5000,
  medium: 10000,
  long: 15000,
};

const ACCEPTED_TYPES = ["video/mp4", "video/quicktime", "video/webm"];

function DropZone({ onFile }: { onFile: (file: File) => void }) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) onFile(file);
  }

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFiles(e.dataTransfer.files);
      }}
      style={{
        border: `2px dashed ${dragOver ? "#e8e8e8" : "#444"}`,
        borderRadius: 10,
        padding: "64px 24px",
        textAlign: "center",
        cursor: "pointer",
        color: "#9a9a9a",
        background: dragOver ? "#1a1a1c" : "transparent",
        maxWidth: 640,
      }}
    >
      <p style={{ margin: 0, fontSize: 15 }}>Drop a video here, or click to choose one.</p>
      <p style={{ margin: "6px 0 0", fontSize: 12 }}>mp4, mov, or webm</p>
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm"
        style={{ display: "none" }}
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<DurationChoice>("medium");
  const [seed, setSeed] = useState(0);
  const [playToken, setPlayToken] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const hasPlayedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  function handleFile(f: File) {
    if (!ACCEPTED_TYPES.includes(f.type)) return;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setFile(f);
    setVideoUrl(URL.createObjectURL(f));
    setPlayToken(0);
    hasPlayedRef.current = false;
  }

  function handleReset() {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setFile(null);
    setVideoUrl(null);
    setPlayToken(0);
    hasPlayedRef.current = false;
  }

  function handleGenerate() {
    if (isPlaying) return;
    hasPlayedRef.current = true;
    setIsPlaying(true);
    setSeed(Math.floor(Math.random() * 2 ** 31));
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
          Upload a clip, then process it into a short, disturbing found-footage cut. No AI-generated content — this
          only reprocesses footage you already have.
        </p>
      </header>

      <main style={{ flex: 1, padding: 24 }}>
        {!videoUrl ? (
          <DropZone onFile={handleFile} />
        ) : (
          <div style={{ maxWidth: 960 }}>
            <VideoStage
              videoUrl={videoUrl}
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

              <button
                onClick={handleReset}
                disabled={isPlaying}
                style={{
                  padding: "8px 14px",
                  fontSize: 13,
                  borderRadius: 6,
                  border: "1px solid transparent",
                  background: "transparent",
                  color: "#777",
                  cursor: isPlaying ? "default" : "pointer",
                  textDecoration: "underline",
                }}
              >
                choose a different video
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
