"use client";

import NoiseCanvas from "@/components/NoiseCanvas";
import SoundToggle from "@/components/SoundToggle";

export default function Atmosphere({
  tension = 0,
  staticBurst = false,
}: {
  tension?: number;
  staticBurst?: boolean;
}) {
  return (
    <>
      <NoiseCanvas boost={staticBurst} />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-10 opacity-[0.05]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to bottom, rgba(255,255,255,0.5) 0px, rgba(255,255,255,0.5) 1px, transparent 1px, transparent 3px)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-10 transition-[background] duration-700 ease-out"
        style={{
          background: `radial-gradient(ellipse at center, transparent ${
            42 - tension * 22
          }%, rgba(0,0,0,${0.5 + tension * 0.4}) 100%)`,
        }}
      />
      {staticBurst && (
        <div className="pointer-events-none fixed inset-0 z-30 bg-white/10 mix-blend-difference" />
      )}
      <SoundToggle />
    </>
  );
}
