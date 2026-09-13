# Creepy Shorts Generator

A small local dev tool that turns a video you upload into a short, disturbing found-footage cut: drop in a clip, hit **Generate clip**, and it plays back through an effects pipeline with synced Web Audio, then cuts hard to black. Nothing here calls a model or generates video — it only reprocesses footage you already have.

## Run it

```sh
npm install
npm run dev
```

Open the printed local URL, drop in an mp4/mov/webm, hit **Generate clip**, and screen-record — there's no built-in export yet.

## Pipeline

1. **Upload** — a drop zone / file picker loads your video into a hidden `<video>` element.
2. **Canvas playback** — the video is drawn to a `<canvas>` frame-by-frame (not a plain `<video>` tag), so effects can be composited on top and one region can be manipulated independently of the rest.
3. **Degradation overlay** — `NoiseCanvas.tsx` (grain) plus scanline and vignette layers (adapted from `Atmosphere.tsx`) sit over the playing canvas, full-viewport, only while a clip is playing.
4. **One unnatural-motion moment** — for a short window, one region of the frame is redrawn from a few hundred milliseconds in the past (sampled from a rolling frame buffer) instead of the live frame, so that patch of the image visibly lags/loops relative to the rest. The region's edges are feathered (a radial alpha mask) rather than a hard rectangle, so it reads as the scene misbehaving rather than a pasted overlay.
5. **Held freeze-frame** — playback pauses on a single frame for several hundred ms right before the cut.
6. **Hard cut** — instant cut to black, cutting the video before it would naturally end; audio cuts in the same instant, no fade.

Audio (`src/lib/audio.ts`'s `playVideoClip()`):
- The video's own audio is routed through Web Audio (not played directly) so it can be shaped: a slow "approach" (rising volume + drifting stereo pan across the whole clip) and a linked slight pitch-down/time-stretch (`video.playbackRate < 1` with pitch correction disabled — slowing playback shifts pitch down for free).
- A separate, always-present drone continuously pitch-shifts down toward the 20–30Hz felt-not-heard range underneath the video's own audio, same as v1.
- Both layers share one hard cutoff at the cut to black.

## Human-facing controls (no raw parameters)

- **Duration** — Short (~5s) / Medium (~10s) / Long (~15s) buttons. Actual clip length is clamped to whatever the source video can support.
- **Generate clip / Regenerate** — one button. Each click derives a fresh set of effect parameters (anomaly region/timing, drone pitch, wrongness intensity, warp amount, freeze length) from a new random seed, landing them inside a pre-tuned "creepy zone" (`src/lib/random.ts`'s `pickCreepyParams()`) — never maxed out, never fully unbounded. Same seed always reproduces the same params; only the seed itself is random per click.

There are no sliders in the UI. The underlying parameters still exist in code (see `random.ts`), just randomized within a tight internal range instead of exposed — tune the ranges there after watching a few outputs.

## What's also here (forked engine primitives)

This project was forked from [Anomaly](https://github.com/numbersgoupihope/anomaly-game)'s rendering engine, stripped of all chat/story/game-state logic:

- `src/lib/audio.ts` — `getAudioEngine()`, a Web Audio singleton (ambient drone, stingers, and both clip-audio pipelines above).
- `src/lib/useAnalogGlitch.ts` / `src/lib/useScrollbackGlitch.ts` — glitch-timing hooks, not currently used by the video pipeline.
- `src/components/NoiseCanvas.tsx` — wired into the video stage (see above). `Atmosphere.tsx` / `SoundToggle.tsx` are not used directly: `Atmosphere` bundles `SoundToggle`, which auto-starts a separate ambient background drone on first interaction — that would compete with the clip's own dedicated drone, so `VideoStage.tsx` reimplements Atmosphere's scanline/vignette visual layers inline instead of importing it.
- `src/components/HomeVideoClip.tsx`, `src/components/CorruptedAttachment.tsx` — the original click-to-play warped-clip components; superseded by the video-upload pipeline for this app but kept as reference.

Tailwind is now configured (`tailwind.config.js`, `postcss.config.js`, `src/index.css`) specifically so `NoiseCanvas.tsx`'s utility classes actually render — it wasn't set up before v2.

## What's not here yet

No automatic video export/download (screen-recording remains the plan), no multiple effect "styles," no accounts/public UI, no live model calls.
