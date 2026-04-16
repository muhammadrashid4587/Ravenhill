"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * HeroLive — wraps the landing hero with a cursor-reactive oxblood spotlight
 * and a subtle parallax hook for the inner content.
 *
 * All live behavior disables automatically under `prefers-reduced-motion`.
 * No WebGL, no libraries — a single rAF loop that lerps the spotlight
 * position toward the pointer.
 */
export default function HeroLive({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return;

    const reduced =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    // Initial rest position
    el.style.setProperty("--spot-x", "50%");
    el.style.setProperty("--spot-y", "38%");
    el.style.setProperty("--parallax-x", "0px");
    el.style.setProperty("--parallax-y", "0px");

    if (reduced) return;

    let targetX = 50;
    let targetY = 38;
    let currentX = 50;
    let currentY = 38;
    let raf = 0;

    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      targetX = (x / rect.width) * 100;
      targetY = (y / rect.height) * 100;
    };

    const onLeave = () => {
      targetX = 50;
      targetY = 38;
    };

    const tick = () => {
      // Soft lerp for premium feel
      currentX += (targetX - currentX) * 0.08;
      currentY += (targetY - currentY) * 0.08;
      el.style.setProperty("--spot-x", `${currentX.toFixed(2)}%`);
      el.style.setProperty("--spot-y", `${currentY.toFixed(2)}%`);

      // Tiny parallax — 3px max on each axis. Subtle depth, not motion sickness.
      const px = ((currentX - 50) / 50) * 3;
      const py = ((currentY - 38) / 38) * 2;
      el.style.setProperty("--parallax-x", `${px.toFixed(2)}px`);
      el.style.setProperty("--parallax-y", `${py.toFixed(2)}px`);

      raf = requestAnimationFrame(tick);
    };

    el.addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointerleave", onLeave, { passive: true });
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div ref={ref} className={`hero-live ${className}`} aria-hidden={false}>
      {children}
    </div>
  );
}
