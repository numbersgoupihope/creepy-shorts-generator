/** Deterministic PRNG (mulberry32) so a given seed always reproduces the
 * same effect parameters — the randomness lives in picking a fresh seed
 * per Regenerate click, not in the params derivation itself. */
function mulberry32(seed: number) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randRange(rng: () => number, min: number, max: number) {
  return min + rng() * (max - min);
}

export interface CreepyParams {
  /** How visible the frame's one anomaly reads — kept in a subtle band. */
  wrongnessIntensity: number;
  droneStartHz: number;
  droneEndHz: number;
  /** Video playbackRate — <1 links a slight pitch-down to a slight
   * time-stretch, for free, on the video's own audio. */
  warpRate: number;
  /** How far in the past (ms) the lagging region's frame is sampled from. */
  lagMs: number;
  /** The one region of the frame that moves unnaturally, as fractions of
   * frame size. */
  anomalyRegion: { x: number; y: number; w: number; h: number };
  /** Where in the clip (0..1 of duration) the anomaly window starts. */
  anomalyStartFrac: number;
  anomalyDurMs: number;
  /** How long the held freeze-frame lasts right before the hard cut. */
  freezeHoldMs: number;
}

/** Picks effect parameters within a pre-tuned "creepy zone" — never the
 * most extreme setting, never fully random/unbounded. Same seed always
 * yields the same params; Regenerate just picks a new seed. */
export function pickCreepyParams(seed: number): CreepyParams {
  const rng = mulberry32(seed);
  return {
    wrongnessIntensity: randRange(rng, 0.35, 0.6),
    droneStartHz: randRange(rng, 150, 260),
    droneEndHz: randRange(rng, 18, 28),
    warpRate: randRange(rng, 0.94, 0.985),
    lagMs: randRange(rng, 650, 1300),
    anomalyRegion: {
      x: randRange(rng, 0.12, 0.5),
      y: randRange(rng, 0.12, 0.5),
      w: randRange(rng, 0.24, 0.36),
      h: randRange(rng, 0.24, 0.36),
    },
    anomalyStartFrac: randRange(rng, 0.5, 0.66),
    anomalyDurMs: randRange(rng, 1400, 2200),
    freezeHoldMs: randRange(rng, 420, 680),
  };
}
