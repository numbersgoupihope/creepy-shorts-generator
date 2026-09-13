"use client";

import { useMemo, useState } from "react";
import ClipStage, { type ClipParams } from "@/components/ClipStage";

const DEFAULT_PARAMS: ClipParams = {
  wrongnessIntensity: 0.05,
  mundanePct: 60,
  buildPct: 30,
  spikePct: 10,
  durationMs: 7000,
  droneStartHz: 220,
  droneEndHz: 25,
};

function Slider({
  label,
  value,
  min,
  max,
  step,
  unit,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
        <span>{label}</span>
        <span style={{ color: "#9a9a9a" }}>
          {value}
          {unit ?? ""}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%" }}
      />
    </label>
  );
}

export default function App() {
  const [params, setParams] = useState<ClipParams>(DEFAULT_PARAMS);
  const [playToken, setPlayToken] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const totalPct = params.mundanePct + params.buildPct + params.spikePct;
  const normalized = useMemo(() => {
    const total = totalPct || 1;
    return {
      mundaneMs: (params.durationMs * params.mundanePct) / total,
      buildMs: (params.durationMs * params.buildPct) / total,
      spikeMs: (params.durationMs * params.spikePct) / total,
    };
  }, [params, totalPct]);

  function set<K extends keyof ClipParams>(key: K, value: ClipParams[K]) {
    setParams((p) => ({ ...p, [key]: value }));
  }

  function handleGenerate() {
    if (isPlaying) return;
    setIsPlaying(true);
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
          Procedural short clips: mundane → build → spike → hard cut. No live model calls — everything below is
          driven directly by the three parameters.
        </p>
      </header>

      <main style={{ flex: 1, display: "flex", gap: 24, padding: 24, flexWrap: "wrap" }}>
        <section style={{ flex: "1 1 640px", minWidth: 320 }}>
          <div style={{ maxWidth: 960 }}>
            <ClipStage params={params} playToken={playToken} onDone={() => setIsPlaying(false)} />
          </div>
          <button
            onClick={handleGenerate}
            disabled={isPlaying}
            style={{
              marginTop: 16,
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
            {isPlaying ? "Playing…" : "Generate clip"}
          </button>
        </section>

        <section style={{ flex: "0 0 320px", minWidth: 280 }}>
          <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: 0.5, color: "#9a9a9a" }}>
            Wrongness
          </h2>
          <Slider
            label="Spike intensity"
            value={params.wrongnessIntensity}
            min={0}
            max={1}
            step={0.01}
            disabled={isPlaying}
            onChange={(v) => set("wrongnessIntensity", v)}
          />

          <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: 0.5, color: "#9a9a9a", marginTop: 20 }}>
            Audio drone
          </h2>
          <Slider
            label="Start pitch"
            value={params.droneStartHz}
            min={80}
            max={440}
            step={5}
            unit=" Hz"
            disabled={isPlaying}
            onChange={(v) => set("droneStartHz", v)}
          />
          <Slider
            label="End pitch (felt, not heard)"
            value={params.droneEndHz}
            min={15}
            max={35}
            step={1}
            unit=" Hz"
            disabled={isPlaying}
            onChange={(v) => set("droneEndHz", v)}
          />

          <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: 0.5, color: "#9a9a9a", marginTop: 20 }}>
            Timeline
          </h2>
          <Slider
            label="Total duration"
            value={params.durationMs}
            min={5000}
            max={10000}
            step={250}
            unit=" ms"
            disabled={isPlaying}
            onChange={(v) => set("durationMs", v)}
          />
          <Slider
            label="Mundane %"
            value={params.mundanePct}
            min={0}
            max={100}
            step={1}
            disabled={isPlaying}
            onChange={(v) => set("mundanePct", v)}
          />
          <Slider
            label="Build %"
            value={params.buildPct}
            min={0}
            max={100}
            step={1}
            disabled={isPlaying}
            onChange={(v) => set("buildPct", v)}
          />
          <Slider
            label="Spike %"
            value={params.spikePct}
            min={0}
            max={100}
            step={1}
            disabled={isPlaying}
            onChange={(v) => set("spikePct", v)}
          />
          <p style={{ fontSize: 12, color: "#777", marginTop: -6 }}>
            Normalized to {(params.durationMs / 1000).toFixed(1)}s: mundane {(normalized.mundaneMs / 1000).toFixed(1)}s ·
            build {(normalized.buildMs / 1000).toFixed(1)}s · spike {(normalized.spikeMs / 1000).toFixed(1)}s, then an
            instant cut.
          </p>
        </section>
      </main>
    </div>
  );
}
