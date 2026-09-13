# Creepy Shorts Generator

A small local dev tool: click **Generate clip**, a random built-in clip runs through a degradation/effects pipeline with synced Web Audio, then cuts hard to black. No upload needed, no AI-generated content — this only reprocesses a few bundled ordinary clips.

## Run it

```sh
npm install
npm run dev
```

Open the printed local URL and hit **Generate clip** — screen-record the result, there's no built-in export yet.

## Pipeline

1. **Pick a clip** — each Generate/Regenerate click picks one of the bundled clips in `public/clips/` at random (see "Bundled clips" below).
2. **Canvas playback** — the video is drawn to a `<canvas>` frame-by-frame (not a plain `<video>` tag), so effects can be composited on top and one region can be manipulated independently of the rest. The source `<video>` element is kept off-screen via `opacity:0` + fixed positioning — **never `display:none` or `visibility:hidden`**, both of which cause some browsers to throttle or stop decoding new frames for an element outside the paint tree. That was the actual cause of a real bug in the previous round: audio played fine (Web Audio doesn't care about paint), but the canvas kept redrawing the same first frame forever, so the whole visual pipeline looked like it was doing nothing.
3. **Degradation overlay** — `NoiseCanvas.tsx` (grain) plus scanline/vignette layers sit over the playing canvas, full-viewport, only while a clip is playing.
4. **One unnatural-motion moment** — for a short window, one region of the frame is redrawn from a few hundred milliseconds in the past (sampled from a rolling frame buffer) instead of the live frame, so that patch of the image visibly lags/loops relative to the rest. The region's edges are feathered (a radial alpha mask) rather than a hard rectangle, so it reads as the scene misbehaving rather than a pasted overlay.
5. **Held freeze-frame** — playback actually pauses (`video.pause()` + the render loop stops redrawing) on a single frame for several hundred ms right before the cut.
6. **Hard cut** — instant cut to black, cutting the video before it would naturally end; audio cuts in the same instant, no fade.

Audio (`src/lib/audio.ts`'s `playVideoClip()`):
- The video's own audio is routed through Web Audio (not played directly) so it can be shaped: a slow "approach" (rising volume + drifting stereo pan across the whole clip) and a linked slight pitch-down/time-stretch (`video.playbackRate < 1` with pitch correction disabled — slowing playback shifts pitch down for free).
- A separate, always-present drone continuously pitch-shifts down toward the 20–30Hz felt-not-heard range underneath the video's own audio.
- Both layers share one hard cutoff at the cut to black.

## Bundled clips

`public/clips/` ships 4 short (~4.5s) plain, ordinary scenes — a hallway, a room corner, a light fixture, a window — with no built-in wrongness of their own, so the effects pipeline supplies the one anomaly. **These are not real stock footage.** This project has no path to licensed video assets, so each clip is a small procedurally-rendered stand-in (plain shapes/gradients drawn to a canvas and captured with MediaRecorder — see `scripts/generate-clips.mjs`, runnable via `npm run generate-clips`). Swap in real licensed clips at the same paths/filenames whenever they're available; nothing else in the app needs to change. Uploading your own video instead of picking from the bundled set is a reasonable stretch goal but isn't implemented — it's optional, not required to use the tool.

## Human-facing controls (no raw parameters)

- **Duration** — Short (~5s) / Medium (~10s) / Long (~15s) buttons. Actual clip length is clamped to whatever the picked clip can support.
- **Generate clip / Regenerate** — one button. Each click picks a random bundled clip AND derives a fresh set of effect parameters (anomaly region/timing, drone pitch, wrongness intensity, warp amount, freeze length) from a new random seed, landing them inside a pre-tuned "creepy zone" (`src/lib/random.ts`'s `pickCreepyParams()`) — never maxed out, never fully unbounded. Same seed always reproduces the same params; only the seed (and clip pick) is random per click.

There are no sliders in the UI. The underlying parameters still exist in code (see `random.ts`), just randomized within a tight internal range instead of exposed — tune the ranges there after watching a few outputs.

## Visual regression check

`npm run test:visual` (Playwright, starts its own dev server on an ephemeral port) exists specifically to catch a repeat of the v2 bug above: it asserts canvas content actually changes ~250ms apart during normal playback (the video is really decoding), and stays static during the freeze window right before the cut (freeze is really pausing rendering, not just a conceptual step). Requires Playwright's Chromium (`npx playwright install chromium` if you don't already have it cached).

## What's also here (forked engine primitives)

This project was forked from [Anomaly](https://github.com/numbersgoupihope/anomaly-game)'s rendering engine, stripped of all chat/story/game-state logic:

- `src/lib/audio.ts` — `getAudioEngine()`, a Web Audio singleton (ambient drone, stingers, and both clip-audio pipelines above).
- `src/lib/useAnalogGlitch.ts` / `src/lib/useScrollbackGlitch.ts` — glitch-timing hooks, not currently used by the video pipeline.
- `src/components/NoiseCanvas.tsx` — wired into the video stage. `Atmosphere.tsx` / `SoundToggle.tsx` are not used directly: `Atmosphere` bundles `SoundToggle`, which auto-starts a separate ambient background drone on first interaction — that would compete with the clip's own dedicated drone, so `VideoStage.tsx` reimplements Atmosphere's scanline/vignette visual layers inline instead of importing it.
- `src/components/HomeVideoClip.tsx`, `src/components/CorruptedAttachment.tsx` — the original click-to-play warped-clip components; superseded by the video pipeline for this app but kept as reference.

Tailwind is configured (`tailwind.config.js`, `postcss.config.js`, `src/index.css`) specifically so `NoiseCanvas.tsx`'s utility classes actually render.

## What's not here yet

No automatic video export/download (screen-recording remains the plan), no video upload, no multiple effect "styles," no accounts/public UI, no live model calls.
