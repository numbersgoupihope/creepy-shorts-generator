# Creepy Shorts Generator

A small local dev tool: click **Generate clip**, a random built-in clip runs through a dread pipeline — an ambiguous shadow figure, a motion loop, a Super-8 found-footage grade, a dissonant reveal — then cuts hard to black. No upload needed, no AI-generated imagery.

## Run it

```sh
npm install
npm run dev
```

Open the printed local URL and hit **Generate clip** — screen-record the result (with sound), there's no built-in export yet.

## Why a shadow figure, not a photorealistic person

Early rounds tried to make real, otherwise-empty b-roll (an ordinary hallway, a room corner) read as wrong by distorting the footage itself — freezing it, replaying a region from a moment earlier. On locked-off static shots that distortion is invisible: a patch sampled "a second ago" looks identical to "now" when nothing in frame ever moved (confirmed by directly diffing two source frames a second apart — the difference was black even at 15x contrast). The technique needs something moving to violate.

Rather than render a photorealistic human — which nothing in this pipeline can do well (canvas primitives don't get you there) and which would undercut the effect anyway — the pipeline composites an ambiguous, procedurally-animated dark silhouette into the real footage. Obey the Walrus and Sinister's Super-8 reels aren't scary because of realistic gore or CGI; they're scary because something mundane gets subtly, unmistakably wrong and the mind fills in the rest. A crisp "realistic" figure would break that faster than a shadow does.

## Pipeline

1. **Pick a clip** — each Generate/Regenerate click picks one of the bundled clips in `public/clips/` at random (see "Bundled clips" below).
2. **Canvas playback, Super-8 graded** — the video is drawn to `<canvas>` frame-by-frame (not a plain `<video>` tag), pillarboxed to a narrower 4:3 frame, with crushed blacks, a warm/sickly color cast, heavy per-frame grain, occasional scratch/dropout lines, a ~13fps judder (frames are held ~75ms instead of redrawn every tick), and a few pixels of random gate-weave jitter per held frame. The source `<video>` element is kept off-screen via `opacity:0` + fixed positioning — **never `display:none` or `visibility:hidden`**, both of which cause some browsers to throttle or stop decoding new frames for an element outside the paint tree (the actual cause of a real bug in an earlier round: audio played fine while the canvas silently redrew the same first frame forever).
3. **The shadow figure** — an ambiguous dark silhouette (`drawFigure()` in `VideoStage.tsx`), composited with a `multiply` blend so it reads as part of the scene's own lighting, standing in the lower-mid frame with a slow idle sway. It's barely visible at first (could be clutter, could be a shadow) — the reveal is what makes it unmistakable.
4. **The motion loop (the Obey the Walrus trick)** — the figure's sway motion replays a few seconds of itself verbatim partway through the clip. The loop window is a whole multiple of the sway's own period, so both edges land on the same phase — no visible jump-cut, just a small idle motion that, on a rewatch, is clearly the same motion happening twice.
5. **The reveal / held freeze-frame** — video playback actually pauses (`video.pause()` + the render loop stops redrawing), and in that same instant the figure snaps from barely-visible to unmistakable and duplicates — a second identical silhouette appears a short distance away. A light-leak flash and a burst of static fire at the same moment. All of it holds, frozen, for a little over a second.
6. **Hard cut** — instant cut to black, cutting the video before it would naturally end; audio cuts in the same instant, no fade.

Audio (`src/lib/audio.ts`):
- `playVideoClip()` routes the video's own audio through Web Audio (not played directly): a slow "approach" (rising volume + drifting stereo pan) and a linked slight pitch-down/time-stretch (`video.playbackRate < 1` with pitch correction disabled).
- A separate, always-present drone descends in pitch over roughly half the clip, then holds low — loud enough to be unmistakable without drowning out the clip's own sound.
- `playRevealStinger()` fires exactly at the reveal: two closely-mistuned oscillators beating against each other, fast attack, hard cutoff — a jolt, not a musical note.
- Every layer shares one hard cutoff at the cut to black.

## Bundled clips

`public/clips/` (VP9/WebM, 960px wide — see "Why WebM" below):

- `hallway.webm` (5.5s)
- `room-corner.webm` (6.5s)
- `corridor.webm` (15s)
- `garage-corridor.webm` (9.8s)

Lengths vary because they're trimmed from whatever each source clip actually offered rather than padded/looped to a fixed length — Medium/Long only become meaningful once a longer clip (corridor or garage-corridor) gets picked; on the two short clips they just clamp down to the clip's own length (see Duration below).

**Why WebM, not the sources' original H.264/MP4:** Playwright's bundled Chromium (the open-source build most CI runs on, and the one `test:visual` below uses) can't decode H.264 at all — confirmed directly on a `<video>` element (`DEMUXER_ERROR_NO_SUPPORTED_STREAMS`). Real end-user browsers handle H.264 fine, but shipping it would make the automated regression check silently useless in the most common test environment. VP9/WebM plays everywhere without that landmine.

`scripts/generate-clips.mjs` is a fallback: it procedurally renders plain placeholder scenes to different filenames (not used by default — see the script's header) for whenever no real footage is on hand.

## Human-facing controls (no raw parameters)

- **Duration** — Short (~5s) / Medium (~10s) / Long (~15s) buttons. Actual clip length is clamped to whatever the picked clip can support (see Bundled clips above).
- **Generate clip / Regenerate** — one button. Each click picks a random bundled clip AND derives a fresh set of effect parameters (figure position/size, loop timing, drone pitch/volume, freeze length) from a new random seed, landing them inside a pre-tuned "creepy zone" (`src/lib/random.ts`'s `pickCreepyParams()`) — never maxed out, never fully unbounded. Same seed always reproduces the same params; only the seed (and clip pick) is random per click.
- `?clip=<id>&seed=<n>` as a URL query string forces a specific clip/seed instead of a random pick — a small escape hatch for reproducing one exact run while iterating.

There are no sliders in the UI. The underlying parameters still exist in code (see `random.ts`), just randomized within a tight internal range instead of exposed — tune the ranges there after watching a few outputs.

## Visual regression check

`npm run test:visual` (Playwright, starts its own dev server on an ephemeral port) exists to catch a repeat of an earlier bug where the video pipeline silently did nothing visually while audio kept working. It drives its sampling off `canvas.dataset.phase` — a cheap DOM attribute `VideoStage.tsx` sets to `"mundane"` / `"freeze"` / `"cut"` as those phases actually begin — rather than guessing wall-clock offsets: an earlier version polled on a timer, which broke twice, first when the freeze window's position shifted with randomized params, then again when `canvas.toDataURL()`/`getImageData` calls in a tight polling loop turned out to be expensive enough to perturb the polling script's own timing (a real ~1-2s freeze window, confirmed firing exactly on schedule via direct in-app logging, was sampled zero times because of it). Sampling only once the app's own ground truth says the right phase has begun sidesteps both problems. Requires Playwright's Chromium (`npx playwright install chromium` if you don't already have it cached).

## What's also here (forked engine primitives)

This project was forked from [Anomaly](https://github.com/numbersgoupihope/anomaly-game)'s rendering engine, stripped of all chat/story/game-state logic:

- `src/lib/audio.ts` — `getAudioEngine()`, a Web Audio singleton (ambient drone, stingers, and the clip-audio pipeline above).
- `src/lib/useAnalogGlitch.ts` / `src/lib/useScrollbackGlitch.ts` — glitch-timing hooks, not currently used by the video pipeline.
- `src/components/NoiseCanvas.tsx` — wired into the video stage. `Atmosphere.tsx` / `SoundToggle.tsx` are not used directly: `Atmosphere` bundles `SoundToggle`, which auto-starts a separate ambient background drone on first interaction — that would compete with the clip's own dedicated drone, so `VideoStage.tsx` reimplements Atmosphere's scanline/vignette visual layers inline instead of importing it.
- `src/components/HomeVideoClip.tsx`, `src/components/CorruptedAttachment.tsx` — the original click-to-play warped-clip components; superseded by the video pipeline for this app but kept as reference.

Tailwind is configured (`tailwind.config.js`, `postcss.config.js`, `src/index.css`) specifically so `NoiseCanvas.tsx`'s utility classes actually render.

## What's not here yet

No automatic video export/download (screen-recording remains the plan), no video upload, no multiple effect "styles," no accounts/public UI, no live model calls, no photorealistic imagery (see above).
