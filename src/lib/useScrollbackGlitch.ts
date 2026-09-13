"use client";

import { useEffect, useRef, useState } from "react";

const REVERT_MS = 2500;

/** Scrolling up past a target message once shows it with slightly different
 * text, then reverts — a single occurrence per playthrough. */
export function useScrollbackGlitch(targetId: string) {
  const [glitched, setGlitched] = useState(false);
  const usedRef = useRef(false);
  const lastYRef = useRef(0);

  useEffect(() => {
    lastYRef.current = window.scrollY;

    function handleScroll() {
      const y = window.scrollY;
      const scrollingUp = y < lastYRef.current - 4;
      lastYRef.current = y;

      if (!scrollingUp || usedRef.current) return;

      const el = document.getElementById(targetId);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const inView = rect.top >= 0 && rect.top < window.innerHeight;
      if (!inView) return;

      usedRef.current = true;
      setGlitched(true);
      setTimeout(() => setGlitched(false), REVERT_MS);
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [targetId]);

  return glitched;
}
