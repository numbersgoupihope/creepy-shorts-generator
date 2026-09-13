# Creepy Shorts Generator

A small local dev tool that generates short, disturbing procedural video clips on demand: click **Generate clip**, a canvas scene renders and plays with synced Web Audio, then cuts hard to black. Nothing here calls a model at generation time — every clip is fully procedural, driven by the three parameters below.

## Run it

```sh
npm install
npm run dev
```

Open the printed local URL, click **Generate clip**, and screen-record — v1 has no built-in export.

## The clip: one scene, four phases

A light source sways in a dark room for a short, adjustable duration (default 7s, 5–10s range) with a deliberate four-phase structure:

1. **Mundane** — the scene reads as ordinary: a warm light, gentle natural sway (two blended sine frequencies), nothing unsettling.
2. **Build** — the light's motion smoothly interpolates from that natural sway toward a single, perfectly regular, too-slow sine — "almost imperceptibly less natural." The audio drone (below) is continuously detuning downward under this the whole time.
3. **Spike** — the frame freezes on the exact moment the build phase ends, and a second, identical light source appears where the scene only ever established one. This is the one wrongness moment — narrow and singular, not stacked with other effects.
4. **Hard cut** — instant cut to black, audio cut in the same instant, no fade.

All motion is a deterministic function of elapsed time and the current parameters (no per-clip randomness in the phase/motion logic — only the grain texture is randomized, same as film grain would be).

## Three tunable parameters

- **Wrongness intensity** (`Spike intensity`, 0–1, default 0.05) — how far the spike's duplicated light deviates from the original: its offset distance and how visible it is. Subtle by default.
- **Pitch-shift-down audio layer** (`Start pitch` / `End pitch`) — a dedicated oscillator, separate from the scene's melody/tone layer, that continuously and audibly sinks in pitch across the whole clip, from an audible start frequency toward the 20–30Hz felt-not-heard range by the spike moment. Always present, hard cutoff at the cut to black.
- **Timeline structure** (`Total duration`, `Mundane %` / `Build %` / `Spike %`) — the four-phase pacing as adjustable percentages (normalized to 100% and applied to the total duration) rather than hardcoded splits.

See `src/components/ClipStage.tsx` for the scene/timeline logic and `src/lib/audio.ts`'s `playGeneratedClip()` for the audio layers.

## What's also here (forked engine primitives)

This project was forked from [Anomaly](https://github.com/numbersgoupihope/anomaly-game)'s rendering engine, stripped of all chat/story/game-state logic. A few framework-agnostic building blocks from that extraction are still present in `src/` even though the v1 app above doesn't use them directly:

- `src/lib/audio.ts` — `getAudioEngine()`, a Web Audio singleton (ambient drone, stingers, and the clip audio described above — nothing here is a recorded/loaded asset).
- `src/lib/useAnalogGlitch.ts` / `src/lib/useScrollbackGlitch.ts` — glitch-timing hooks.
- `src/components/NoiseCanvas.tsx`, `src/components/Atmosphere.tsx`, `src/components/SoundToggle.tsx` — composited grain/scanline/vignette UI chrome (Tailwind-class based; Tailwind itself isn't set up in this repo, so these render unstyled unless you add it).
- `src/components/HomeVideoClip.tsx`, `src/components/CorruptedAttachment.tsx` — the original click-to-play warped-clip components this project's scene design is descended from.

## What's not in v1

No multiple scene types, no accounts/public UI, no automatic video export (MediaRecorder), no live model calls per clip — see the kickoff spec for the full list.
