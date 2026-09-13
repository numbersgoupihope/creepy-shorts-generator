# anomaly-fx

Canvas rendering, procedural Web Audio synthesis, and warp/glitch effects extracted from [Anomaly](https://github.com/numbersgoupihope/anomaly-game). This is deliberately just the rendering/audio engine — no chat UI, no dialogue system (Mom's AI persona/prompting), and no story or state-machine logic came along with it. Everything here is framework-agnostic React + Web Audio; no external assets, no audio files, no image files.

## What's here

### `src/lib/audio.ts` — procedural audio engine
A `getAudioEngine()` singleton (`AudioEngine` class) built entirely on the Web Audio API — every sound is synthesized at runtime, nothing is a recorded/loaded asset:
- `enable()` / `disable()` — starts/stops a persistent low ambient drone (two detuned sine oscillators). Must be called from a user gesture (click/keydown) per browser autoplay policy.
- `setTension(t: number)` — `t` in `[0, 1]`; smoothly detunes and raises the drone's gain as tension climbs.
- `playCorrect()` / `playIncorrect()` — short discrete stingers.
- `playCorruptedVoice()` — a warped, stuttering, garbled tone: pitch distortion (custom waveshaper curve), a granular stutter envelope, stereo pan sweep (simulating something "approaching"), and a hard cutoff (no fade-out).
- `playHomeVideoAudio()` — the opening phrase of "Twinkle Twinkle Little Star" (public domain — the melody is the 18th-century French folk tune "Ah! vous dirai-je, maman"), synthesized note-by-note, played in reverse, pitched down, with each note dragging longer than the last (a "tape slowing down" effect), then a hard cutoff. No copyrighted or recognizable modern melody — safe to warp/reverse/pitch-shift without any audio-fingerprinting risk.

### `src/lib/useAnalogGlitch.ts` — glitch timing hook
`useAnalogGlitch(intensity: number)` schedules brief, randomly-timed "interface corruption" events — returns `{ avatarGlitch, staticBurst }` booleans a consumer flips visual state on. Frequency and the odds of both firing together scale with `intensity` (0–1): rare and isolated at low intensity, frequent and often simultaneous at high intensity.

### `src/lib/useScrollbackGlitch.ts` — one-shot scroll-triggered glitch
`useScrollbackGlitch(targetId: string)` watches for the user scrolling back up past a target DOM element and returns `true` for ~2.5s the one time that happens per mount — useful for "that text was different a second ago" effects.

### `src/components/NoiseCanvas.tsx` — film-grain canvas
A `<canvas>` that continuously renders random grayscale static at low frame rate via `putImageData`, composited with `mix-blend-overlay`. Takes a `boost` prop to spike the opacity for a "static burst."

### `src/components/Atmosphere.tsx` — composited visual atmosphere layer
Stacks `NoiseCanvas`, a scanline overlay, a tension-reactive vignette (`radial-gradient`), an optional static-burst flash, and `SoundToggle`. Takes `tension` (0–1) and `staticBurst` props.

### `src/components/SoundToggle.tsx` — audio enable/disable UI
A small fixed-position button. Also wires the drone to auto-enable on the very first `pointerdown`/`keydown` anywhere on the page (satisfies the autoplay-gesture requirement transparently).

### `src/components/HomeVideoClip.tsx` — the centerpiece: an abstract "found footage" clip
Click-to-play. Renders a short (~4.8s) fully abstract/generative canvas clip — no photographic or person-shaped content — depicting a warm, glowing light source swaying on a suspiciously smooth path, with grain, scanline warble, and occasional dropout layered on top (all drawn procedurally every frame, including a cheap self-referential `drawImage` pass for the warble). Partway through, the frame freezes for ~750ms on one impossible detail (a duplicated light source where the scene only ever established one) — an `onFreezeFrame` callback fires exactly once at that moment for a caller to hook a companion visual effect (e.g. a chromatic-aberration flash) to. The clip ends in a hard, instant cut to black — no fade — synced with `audio.ts`'s `playHomeVideoAudio()`. Props: `onPlayed`, `onFreezeFrame?`, `initialPlayed?` (renders a static "clip ended" placeholder instead of a replayable canvas, for scrollback/history views).

### `src/components/CorruptedAttachment.tsx` — voice-memo-style audio player
Click-to-play UI (waveform bars, play/pause icon) that triggers `audio.ts`'s `playCorruptedVoice()` and reveals a garbled caption line once playback completes. Same `onPlayed` / `initialPlayed` prop shape as `HomeVideoClip`.

## Usage notes

- Everything is `"use client"` — written for Next.js App Router, but the directive is a no-op outside Next and every component is plain React + DOM APIs otherwise. No Next-specific imports anywhere.
- The `@/*` → `./src/*` path alias is set up in `tsconfig.json`; mirror it in your bundler config (Next.js/Vite/webpack) or rewrite the `@/lib/audio` imports to relative paths.
- Call `getAudioEngine().enable()` (or mount `SoundToggle`, which does it for you) from a real user gesture before any sound will play — browsers block autoplay otherwise.
- `HomeVideoClip` and `CorruptedAttachment` are the two "trigger a warped media clip" building blocks — both are self-contained (no external state beyond their own props) and use the same click-to-play → play audio → advance-on-completion pattern, so they're a reasonable template for adding new clip types.
- Nothing here makes a network call, reads any external asset, or depends on any other file from the original project.

## What's deliberately not here

Anomaly's chat UI (`MessageBubble`, `ChatHeader`, `LiveReplyComposer`, `TypingIndicator`, `ImageCard`, `TimeDivider`), Mom's AI dialogue system (`mom-ai.ts`, the `chat-reply` API route), and all story/state-machine logic (`chat-script.ts`, `evidence.ts`, the `evidence-extract`/`evidence-transform` routes, `ChatEpisode.tsx`) were intentionally left out — this repo is just the rendering and audio engine underneath one beat of that game, decoupled from the game itself.
