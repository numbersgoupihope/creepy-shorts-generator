"use client";

import { useEffect, useRef, useState } from "react";

// Delay range at rest (intensity 0) vs. at full tension (intensity 1) —
// glitches ramp up from rare to frequent as the episode escalates, instead
// of firing at one flat rare rate the whole time.
const MIN_DELAY_MS_COLD = 18000;
const MAX_DELAY_MS_COLD = 38000;
const MIN_DELAY_MS_HOT = 4000;
const MAX_DELAY_MS_HOT = 9500;

/**
 * Brief interface corruption — an avatar flicker, a static burst, or (more
 * often as `intensity` climbs) both together. Frequency and the odds of a
 * combined hit both scale with `intensity` (0–1).
 */
export function useAnalogGlitch(intensity: number = 0) {
  const [avatarGlitch, setAvatarGlitch] = useState(false);
  const [staticBurst, setStaticBurst] = useState(false);
  const intensityRef = useRef(intensity);

  useEffect(() => {
    intensityRef.current = intensity;
  }, [intensity]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    function scheduleNext() {
      const t = Math.min(1, Math.max(0, intensityRef.current));
      const minDelay = MIN_DELAY_MS_COLD + t * (MIN_DELAY_MS_HOT - MIN_DELAY_MS_COLD);
      const maxDelay = MAX_DELAY_MS_COLD + t * (MAX_DELAY_MS_HOT - MAX_DELAY_MS_COLD);
      const delay = minDelay + Math.random() * (maxDelay - minDelay);

      timeoutId = setTimeout(() => {
        const bothChance = 0.1 + t * 0.35;
        const roll = Math.random();
        if (roll < bothChance) {
          setAvatarGlitch(true);
          setStaticBurst(true);
          setTimeout(() => {
            setAvatarGlitch(false);
            setStaticBurst(false);
          }, 180);
        } else if (roll < bothChance + 0.45) {
          setAvatarGlitch(true);
          setTimeout(() => setAvatarGlitch(false), 130);
        } else {
          setStaticBurst(true);
          setTimeout(() => setStaticBurst(false), 180);
        }
        scheduleNext();
      }, delay);
    }

    scheduleNext();
    return () => clearTimeout(timeoutId);
  }, []);

  return { avatarGlitch, staticBurst };
}
