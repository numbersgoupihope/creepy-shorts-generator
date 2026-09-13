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
  droneStartHz: number;
  droneEndHz: number;
  /** Peak drone loudness relative to the clip's own audio — dreadful,
   * not cartoonish. */
  droneGainTarget: number;
  /** Fraction of the clip duration over which the drone's pitch sweep
   * completes before holding at droneEndHz. */
  droneSweepFrac: number;
  /** Video playbackRate — <1 links a slight pitch-down to a slight
   * time-stretch, for free, on the video's own audio. */
  warpRate: number;

  /** The shadow figure's anchor point (base of its "feet"), as fractions
   * of frame size. */
  figureX: number;
  figureY: number;
  figureScale: number;
  /** How visible it is during the mundane phase — barely there, could be
   * mistaken for background clutter. */
  figureBaseOpacity: number;
  /** How visible it is once revealed at the freeze — unmistakable. */
  figureRevealOpacity: number;
  /** How far the duplicated second silhouette sits from the first at the
   * reveal, as a fraction of frame width. */
  figureDuplicateOffsetFrac: number;

  /** Where in the clip (0..1 of duration) the motion-loop begins. */
  loopStartFrac: number;
  /** How many full sway cycles get replayed verbatim during the loop —
   * long enough that a careful viewer can catch the repeat. */
  loopCycles: 2 | 3;

  /** How long the held freeze/reveal lasts right before the hard cut. */
  freezeHoldMs: number;
}

/** Picks effect parameters within a pre-tuned "creepy zone" — dreadful
 * and unmistakable, never cartoonish, never invisible. Same seed always
 * yields the same params; Regenerate just picks a new seed. */
export function pickCreepyParams(seed: number): CreepyParams {
  const rng = mulberry32(seed);
  return {
    droneStartHz: randRange(rng, 150, 240),
    droneEndHz: randRange(rng, 20, 30),
    droneGainTarget: randRange(rng, 0.35, 0.45),
    droneSweepFrac: randRange(rng, 0.5, 0.7),
    warpRate: randRange(rng, 0.9, 0.96),

    figureX: randRange(rng, 0.42, 0.58),
    figureY: randRange(rng, 0.68, 0.8),
    figureScale: randRange(rng, 0.85, 1.15),
    figureBaseOpacity: randRange(rng, 0.08, 0.16),
    figureRevealOpacity: randRange(rng, 0.85, 0.95),
    figureDuplicateOffsetFrac: randRange(rng, 0.12, 0.22),

    loopStartFrac: randRange(rng, 0.32, 0.46),
    loopCycles: rng() < 0.5 ? 2 : 3,

    freezeHoldMs: randRange(rng, 1000, 1400),
  };
}
