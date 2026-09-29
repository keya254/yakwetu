"use client";

import { useEffect, useState } from "react";
import Confetti from "react-confetti";


export function ConfettiBurst({ onDone }: { onDone?: () => void }) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const measure = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  if (!size.width) return null;
  const reducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <div className="pointer-events-none fixed inset-0 z-200" aria-hidden>
      <Confetti
        width={size.width}
        height={size.height}
        recycle={false}
        numberOfPieces={reducedMotion ? 80 : Math.min(500, Math.round(size.width / 3))}
        gravity={0.22}
        tweenDuration={4000}
        colors={["#f5a524", "#ffd27a", "#e8793a", "#fff4e0", "#c2410c", "#fde68a"]}
        onConfettiComplete={(confetti) => {
          confetti?.reset();
          onDone?.();
        }}
      />
    </div>
  );
}
