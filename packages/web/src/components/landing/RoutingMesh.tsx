"use client";

import { useEffect, useRef } from "react";

// -----------------------------------------------------------------------------
// RoutingMesh
//
// Full-viewport coordination fabric. A structured dot grid sits behind the
// landing page; cursor movement spawns short paths that travel from the grid
// edge toward the cursor, reading as routing decisions resolving in real time.
//
// Visual language — enterprise infrastructure, not crypto/web3:
//   • Structured grid, not random particle field.
//   • Paths travel along grid lines in L-shaped routes (one bend), so every
//     activation reads as a deliberate routing decision, not a drift.
//   • Oxblood for base + trails, bone for lit heads and near-cursor nodes.
//     No neon, no rainbow, no rotating gradients.
//   • One cohesive system: cursor movement, ambient routes, and proximity
//     illumination all operate on the same grid with the same palette.
//
// Performance:
//   • Single <canvas> at viewport size (DPR clamped to 2).
//   • One rAF loop; routes are pooled and capped at ~16 concurrent.
//   • Cursor spawns are throttled per-cell and per-time so fast pointer
//     movement doesn't flood the queue.
//
// Accessibility:
//   • prefers-reduced-motion disables all path animation. The static grid
//     remains, cursor proximity still softly illuminates nearby nodes with
//     no travel, no trails.
//   • Canvas is aria-hidden and has pointer-events: none, so it never
//     intercepts clicks or scrolling.
// -----------------------------------------------------------------------------

type Cell = { col: number; row: number };
type Route = {
  path: Cell[];
  startedAt: number;
  duration: number;
  decay: number;
  intensity: number;
};

const CELL = 46;
const CURSOR_RADIUS = 170;
const MAX_ROUTES = 9;
const AMBIENT_MIN = 2600;
const AMBIENT_MAX = 4200;

export default function RoutingMesh() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = reduce.matches;
    const handleReduce = (e: MediaQueryListEvent) => {
      reducedMotion = e.matches;
    };
    reduce.addEventListener?.("change", handleReduce);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    let width = 0;
    let height = 0;
    let cols = 0;
    let rows = 0;
    let offsetX = 0;
    let offsetY = 0;

    const cursor = { x: -9999, y: -9999, active: false };
    const lastCell: Cell = { col: -1, row: -1 };
    const routes: Route[] = [];
    let lastAmbient = 0;
    let lastSpawn = 0;
    let scrollIntensity = 1;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = width + "px";
      canvas.style.height = height + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      cols = Math.ceil(width / CELL) + 1;
      rows = Math.ceil(height / CELL) + 1;
      offsetX = Math.round((width - (cols - 1) * CELL) / 2);
      offsetY = Math.round((height - (rows - 1) * CELL) / 2);
    };

    const nodeXY = (col: number, row: number) => ({
      x: offsetX + col * CELL,
      y: offsetY + row * CELL,
    });

    const makePath = (from: Cell, to: Cell): Cell[] => {
      // L-shaped route with a single bend — deliberate, not meandering.
      // Randomly choose whether to bend horizontal-first or vertical-first.
      const path: Cell[] = [{ ...from }];
      const horizontalFirst = Math.random() < 0.5;

      const hStep = Math.sign(to.col - from.col) || 1;
      const vStep = Math.sign(to.row - from.row) || 1;

      if (horizontalFirst) {
        for (
          let c = from.col + hStep;
          hStep > 0 ? c <= to.col : c >= to.col;
          c += hStep
        ) {
          path.push({ col: c, row: from.row });
        }
        for (
          let r = from.row + vStep;
          vStep > 0 ? r <= to.row : r >= to.row;
          r += vStep
        ) {
          path.push({ col: to.col, row: r });
        }
      } else {
        for (
          let r = from.row + vStep;
          vStep > 0 ? r <= to.row : r >= to.row;
          r += vStep
        ) {
          path.push({ col: from.col, row: r });
        }
        for (
          let c = from.col + hStep;
          hStep > 0 ? c <= to.col : c >= to.col;
          c += hStep
        ) {
          path.push({ col: c, row: to.row });
        }
      }
      return path;
    };

    const spawnRoute = (target: Cell, intensity = 1) => {
      if (routes.length >= MAX_ROUTES) return;
      if (target.col < 0 || target.col >= cols) return;
      if (target.row < 0 || target.row >= rows) return;

      // Source sits on the grid edge — routes "arrive" from the outside.
      const edge = Math.floor(Math.random() * 4);
      let source: Cell;
      if (edge === 0) source = { col: 0, row: Math.floor(Math.random() * rows) };
      else if (edge === 1) source = { col: cols - 1, row: Math.floor(Math.random() * rows) };
      else if (edge === 2) source = { col: Math.floor(Math.random() * cols), row: 0 };
      else source = { col: Math.floor(Math.random() * cols), row: rows - 1 };

      if (source.col === target.col && source.row === target.row) return;

      const path = makePath(source, target);
      if (path.length < 2) return;

      // Traversal duration — roughly constant per-cell so short routes are
      // fast and long routes feel deliberate.
      const perCell = 85;
      const duration = Math.min(path.length * perCell, 1800);

      routes.push({
        path,
        startedAt: performance.now(),
        duration,
        decay: 900,
        intensity,
      });
    };

    const drawFrame = (t: number) => {
      ctx.clearRect(0, 0, width, height);

      const cx = cursor.active ? cursor.x : -99999;
      const cy = cursor.active ? cursor.y : -99999;

      // ---------- base grid of nodes ----------
      // Nodes within cursor radius gain brightness and take on a bone tint;
      // distant nodes remain dim oxblood. This is the ambient "field."
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          const { x, y } = nodeXY(c, r);
          // Culling: skip nodes slightly outside viewport
          if (x < -10 || x > width + 10 || y < -10 || y > height + 10) continue;

          let proximity = 0;
          if (cursor.active) {
            const dx = x - cx;
            const dy = y - cy;
            const d2 = dx * dx + dy * dy;
            if (d2 < CURSOR_RADIUS * CURSOR_RADIUS) {
              const d = Math.sqrt(d2);
              proximity = 1 - d / CURSOR_RADIUS;
              // ease out — tighter halo around the cursor
              proximity = proximity * proximity;
            }
          }

          const baseAlpha = 0.075 * scrollIntensity;
          const radius = 1.05 + proximity * 1.2;

          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);

          if (proximity > 0.08) {
            // Warm illuminated node — bone with oxblood undertone
            const a = (baseAlpha + proximity * 0.45) * Math.min(1, scrollIntensity + 0.4);
            ctx.fillStyle = `rgba(245, 240, 230, ${a})`;
          } else {
            ctx.fillStyle = `rgba(139, 30, 47, ${baseAlpha * 0.85})`;
          }
          ctx.fill();
        }
      }

      // ---------- active routes ----------
      for (let i = routes.length - 1; i >= 0; i--) {
        const route = routes[i];
        const elapsed = t - route.startedAt;
        const pathLen = route.path.length - 1;
        if (pathLen <= 0) {
          routes.splice(i, 1);
          continue;
        }

        const headProgress = Math.max(0, Math.min(1, elapsed / route.duration));
        const postTime = elapsed - route.duration;
        const fadeAlpha = postTime > 0 ? Math.max(0, 1 - postTime / route.decay) : 1;

        if (headProgress >= 1 && fadeAlpha <= 0) {
          routes.splice(i, 1);
          continue;
        }

        const headIndex = headProgress * pathLen;
        const globalIntensity = route.intensity * fadeAlpha * scrollIntensity;

        // Trail — behind the head, dimming as it gets older
        ctx.lineCap = "round";
        ctx.lineWidth = 1.15;

        for (let seg = 0; seg < pathLen; seg++) {
          if (seg >= headIndex) break;

          const a = route.path[seg];
          const b = route.path[seg + 1];
          const na = nodeXY(a.col, a.row);
          const nb = nodeXY(b.col, b.row);

          const segEnd = Math.min(1, headIndex - seg);
          const endX = na.x + (nb.x - na.x) * segEnd;
          const endY = na.y + (nb.y - na.y) * segEnd;

          // Trail age — segments farther behind the head fade out
          const ageFromHead = headIndex - seg - 0.5;
          const trailFade = Math.max(0, 1 - ageFromHead / Math.max(pathLen, 4));
          const alpha = Math.min(0.55, 0.32 * trailFade * globalIntensity + 0.1 * globalIntensity);
          if (alpha <= 0.01) continue;

          ctx.strokeStyle = `rgba(139, 30, 47, ${alpha})`;
          ctx.beginPath();
          ctx.moveTo(na.x, na.y);
          ctx.lineTo(endX, endY);
          ctx.stroke();
        }

        // Head — bone core + claret halo. Arrived heads linger briefly
        // at the destination while the trail fades out behind them.
        const hi = Math.max(0, Math.min(pathLen - 1, Math.floor(headIndex)));
        const frac = Math.max(0, Math.min(1, headIndex - hi));
        const a = route.path[hi];
        const b = route.path[Math.min(hi + 1, pathLen)];
        if (!a || !b) continue;
        const na = nodeXY(a.col, a.row);
        const nb = nodeXY(b.col, b.row);
        const hx = na.x + (nb.x - na.x) * frac;
        const hy = na.y + (nb.y - na.y) * frac;

        const headAlpha = globalIntensity;
        if (headAlpha > 0.02) {
          ctx.beginPath();
          ctx.arc(hx, hy, 3.8, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(178, 50, 70, ${0.14 * headAlpha})`;
          ctx.fill();

          ctx.beginPath();
          ctx.arc(hx, hy, 1.7, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(245, 240, 230, ${0.72 * headAlpha})`;
          ctx.fill();
        }
      }

      // ---------- ambient routes ----------
      // So the fabric breathes even when idle. Lower intensity than
      // cursor-driven routes so they sit under the focus layer.
      if (!reducedMotion) {
        const nextAmbient = AMBIENT_MIN + Math.random() * (AMBIENT_MAX - AMBIENT_MIN);
        if (t - lastAmbient > nextAmbient) {
          lastAmbient = t;
          const tCol = Math.floor(Math.random() * cols);
          const tRow = Math.floor(Math.random() * rows);
          spawnRoute({ col: tCol, row: tRow }, 0.28);
        }
      }
    };

    let raf = 0;
    let running = true;

    const frame = (t: number) => {
      if (!running) return;
      drawFrame(t);
      raf = requestAnimationFrame(frame);
    };

    const handleMove = (e: PointerEvent) => {
      cursor.x = e.clientX;
      cursor.y = e.clientY;
      cursor.active = true;

      if (reducedMotion) return;

      const col = Math.round((cursor.x - offsetX) / CELL);
      const row = Math.round((cursor.y - offsetY) / CELL);
      if (col === lastCell.col && row === lastCell.row) return;
      lastCell.col = col;
      lastCell.row = row;

      const now = performance.now();
      if (now - lastSpawn < 220) return;
      if (Math.random() > 0.45) return;
      lastSpawn = now;

      spawnRoute({ col, row }, 0.85);
    };

    const handleLeave = () => {
      cursor.active = false;
    };

    const handleScroll = () => {
      const y = window.scrollY;
      const vh = window.innerHeight || 800;
      if (y < vh * 0.5) scrollIntensity = 1;
      else if (y > vh * 2.2) scrollIntensity = 0.45;
      else scrollIntensity = 1 - ((y - vh * 0.5) / (vh * 1.7)) * 0.55;
    };

    resize();
    handleScroll();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", handleMove, { passive: true });
    window.addEventListener("pointerleave", handleLeave);
    window.addEventListener("scroll", handleScroll, { passive: true });

    raf = requestAnimationFrame(frame);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerleave", handleLeave);
      window.removeEventListener("scroll", handleScroll);
      reduce.removeEventListener?.("change", handleReduce);
    };
  }, []);

  return (
    <div className="routing-mesh" aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
}
