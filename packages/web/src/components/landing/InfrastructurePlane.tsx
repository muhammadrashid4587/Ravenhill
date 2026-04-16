"use client";

import { useEffect, useState } from "react";

// -----------------------------------------------------------------------------
// InfrastructurePlane
//
// A dark, perspective-tapered coordination grid with labeled team nodes,
// oxblood inter-team edges carrying traveling pulses, and a foreground
// "your agent" node plugged into the fabric via trunk lines.
//
// The visual language is deliberately:
//   - structured (grid + named nodes), not a random particle cloud
//   - monochrome oxblood, not rainbow-neon — avoids crypto palette
//   - labeled with real team names, so the meaning is concrete
//   - pulses carry product meaning: cross-team routing, approvals
//
// Pure SVG + SMIL. No libraries. Pulses + breathing ring are disabled
// under `prefers-reduced-motion`.
// -----------------------------------------------------------------------------

// -- Grid geometry -----------------------------------------------------------

const VIEW_W = 800;
const VIEW_H = 480;

const TOP_Y = 80;
const BOTTOM_Y = 380;
const TOP_LEFT_X = 220;
const TOP_RIGHT_X = 580;
const BOTTOM_LEFT_X = 40;
const BOTTOM_RIGHT_X = 760;

const ROWS = 5; // rows 0..5 (6 horizontal lines)
const COLS = 6; // cols 0..6 (7 vertical lines)

function leftX(t: number) {
  return TOP_LEFT_X + (BOTTOM_LEFT_X - TOP_LEFT_X) * t;
}
function rightX(t: number) {
  return TOP_RIGHT_X + (BOTTOM_RIGHT_X - TOP_RIGHT_X) * t;
}
function gridY(r: number) {
  return TOP_Y + (BOTTOM_Y - TOP_Y) * (r / ROWS);
}
function gridX(r: number, c: number) {
  const t = r / ROWS;
  const l = leftX(t);
  const rr = rightX(t);
  return l + (rr - l) * (c / COLS);
}

// -- Nodes -------------------------------------------------------------------
//
// Placed at (r, c) grid intersections. Back-row nodes are smaller to
// reinforce depth. Eight are labeled with team names; the others read as
// density.

interface Node {
  r: number;
  c: number;
  size: number;
  label?: string;
}

const NODES: Node[] = [
  { r: 0, c: 2, size: 2.5 },
  { r: 0, c: 4, size: 2.5 },
  { r: 1, c: 1, size: 3.5, label: "Product" },
  { r: 1, c: 3, size: 3.5, label: "Engineering" },
  { r: 1, c: 5, size: 3 },
  { r: 2, c: 0, size: 3 },
  { r: 2, c: 3, size: 4, label: "Ops" },
  { r: 2, c: 6, size: 3.5, label: "Legal" },
  { r: 3, c: 1, size: 4.5, label: "Marketing" },
  { r: 3, c: 4, size: 4.5, label: "Sales" },
  { r: 4, c: 2, size: 5, label: "Support" },
  { r: 4, c: 5, size: 5, label: "Finance" },
];

interface PositionedNode extends Node {
  px: number;
  py: number;
}
const POSITIONED: PositionedNode[] = NODES.map((n) => ({
  ...n,
  px: gridX(n.r, n.c),
  py: gridY(n.r),
}));

// -- Edges -------------------------------------------------------------------
//
// Each edge is a concrete cross-team coordination relationship. Six of them
// carry a periodic pulse; the rest sit static to give the graph density.

interface Edge {
  a: number;
  b: number;
  pulseDelay?: number;
}

const EDGES: Edge[] = [
  { a: 2, b: 3, pulseDelay: 0.0 },    // Product → Engineering
  { a: 3, b: 6, pulseDelay: 1.6 },    // Engineering → Ops
  { a: 3, b: 7, pulseDelay: 6.4 },    // Engineering → Legal
  { a: 6, b: 8 },                      // Ops → Marketing
  { a: 8, b: 9, pulseDelay: 4.8 },    // Marketing → Sales
  { a: 9, b: 10 },                     // Sales → Support
  { a: 9, b: 11, pulseDelay: 3.2 },   // Sales → Finance
  { a: 10, b: 11, pulseDelay: 8.0 },  // Support → Finance
  { a: 0, b: 2 },                      // density
  { a: 5, b: 2 },                      // density
  { a: 4, b: 7 },                      // density
];

// -- Foreground "Your agent" -------------------------------------------------

const YOU = { px: 400, py: 440, r: 18 };
// Trunks fan up from "Your agent" into three nearby team nodes.
const TRUNK_TARGETS = [10, 9, 11]; // Support, Sales, Finance

// ---------------------------------------------------------------------------

export default function InfrastructurePlane() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, []);

  return (
    <section className="relative max-w-6xl mx-auto px-6 py-4" aria-label="Coordination infrastructure">
      <div className="eyebrow text-center mb-3">Underneath</div>
      <h2 className="font-display text-display-lg text-bone text-center max-w-3xl mx-auto mb-5">
        A live{" "}
        <span className="display-italic text-claret">coordination fabric</span>.
      </h2>
      <p className="text-center text-smoke text-[15px] max-w-xl mx-auto mb-12 leading-relaxed">
        Every routing decision, every approval, every hand-off moves along a
        real coordination layer. Your agent is one of the nodes.
      </p>

      <div className="relative mx-auto" style={{ maxWidth: 1000 }}>
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          width="100%"
          className="overflow-visible select-none"
          role="img"
          aria-hidden="true"
        >
          <defs>
            {/* Foreground "Your agent" brand gradient */}
            <radialGradient id="infra-node-brand" cx="50%" cy="32%" r="60%">
              <stop offset="0%" stopColor="#B23246" />
              <stop offset="100%" stopColor="#5D0F1D" />
            </radialGradient>
            {/* Peer team node gradient */}
            <radialGradient id="infra-node-peer" cx="50%" cy="32%" r="60%">
              <stop offset="0%" stopColor="#2A2830" />
              <stop offset="100%" stopColor="#141316" />
            </radialGradient>
            {/* Soft background glow under the fabric */}
            <radialGradient id="infra-bg-glow" cx="50%" cy="82%" r="55%">
              <stop offset="0%" stopColor="rgba(139,30,47,0.22)" />
              <stop offset="60%" stopColor="rgba(139,30,47,0.05)" />
              <stop offset="100%" stopColor="rgba(139,30,47,0)" />
            </radialGradient>
          </defs>

          {/* Subtle warm glow behind the "Your agent" area */}
          <rect x={0} y={0} width={VIEW_W} height={VIEW_H} fill="url(#infra-bg-glow)" />

          {/* ---------- Grid: horizontal rows ---------- */}
          {Array.from({ length: ROWS + 1 }, (_, r) => {
            const t = r / ROWS;
            return (
              <line
                key={`h-${r}`}
                x1={leftX(t)}
                y1={gridY(r)}
                x2={rightX(t)}
                y2={gridY(r)}
                stroke={`rgba(255,255,255,${(0.04 + 0.06 * t).toFixed(2)})`}
                strokeWidth={0.6}
              />
            );
          })}

          {/* ---------- Grid: vertical converging lines ---------- */}
          {Array.from({ length: COLS + 1 }, (_, c) => (
            <line
              key={`v-${c}`}
              x1={gridX(0, c)}
              y1={gridY(0)}
              x2={gridX(ROWS, c)}
              y2={gridY(ROWS)}
              stroke="rgba(255,255,255,0.055)"
              strokeWidth={0.5}
            />
          ))}

          {/* ---------- Inter-team edges ---------- */}
          {EDGES.map((edge, i) => {
            const a = POSITIONED[edge.a];
            const b = POSITIONED[edge.b];
            // Depth factor: 0 = back of plane, 1 = near
            const depth = (a.r + b.r) / (ROWS * 2);
            return (
              <line
                key={`edge-${i}`}
                x1={a.px}
                y1={a.py}
                x2={b.px}
                y2={b.py}
                stroke={`rgba(139,30,47,${(0.14 + 0.24 * depth).toFixed(2)})`}
                strokeWidth={0.7 + 0.5 * depth}
              />
            );
          })}

          {/* ---------- Trunk lines: Your agent → near teams ---------- */}
          {TRUNK_TARGETS.map((ni, i) => {
            const n = POSITIONED[ni];
            return (
              <line
                key={`trunk-${i}`}
                x1={YOU.px}
                y1={YOU.py - YOU.r}
                x2={n.px}
                y2={n.py}
                stroke="rgba(139,30,47,0.42)"
                strokeWidth={1.1}
              />
            );
          })}

          {/* ---------- Animated edge pulses ---------- */}
          {!reduced &&
            EDGES.filter((e) => e.pulseDelay !== undefined).map((edge, i) => {
              const a = POSITIONED[edge.a];
              const b = POSITIONED[edge.b];
              return (
                <circle
                  key={`edge-pulse-${i}`}
                  r={2.4}
                  fill="#B23246"
                  style={{ filter: "drop-shadow(0 0 5px rgba(178,50,70,0.6))" }}
                >
                  <animate
                    attributeName="cx"
                    from={a.px}
                    to={b.px}
                    dur="2.8s"
                    begin={`${edge.pulseDelay}s`}
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="cy"
                    from={a.py}
                    to={b.py}
                    dur="2.8s"
                    begin={`${edge.pulseDelay}s`}
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0;1;1;0"
                    keyTimes="0;0.15;0.85;1"
                    dur="2.8s"
                    begin={`${edge.pulseDelay}s`}
                    repeatCount="indefinite"
                  />
                </circle>
              );
            })}

          {/* ---------- Animated trunk pulses: You → teams ---------- */}
          {!reduced &&
            TRUNK_TARGETS.map((ni, i) => {
              const n = POSITIONED[ni];
              return (
                <circle
                  key={`trunk-pulse-${i}`}
                  r={3}
                  fill="#B23246"
                  style={{ filter: "drop-shadow(0 0 8px rgba(178,50,70,0.7))" }}
                >
                  <animate
                    attributeName="cx"
                    from={YOU.px}
                    to={n.px}
                    dur="2.4s"
                    begin={`${(i * 0.8).toFixed(2)}s`}
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="cy"
                    from={YOU.py - YOU.r}
                    to={n.py}
                    dur="2.4s"
                    begin={`${(i * 0.8).toFixed(2)}s`}
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0;1;1;0"
                    keyTimes="0;0.15;0.85;1"
                    dur="2.4s"
                    begin={`${(i * 0.8).toFixed(2)}s`}
                    repeatCount="indefinite"
                  />
                </circle>
              );
            })}

          {/* ---------- Nodes ---------- */}
          {POSITIONED.map((n, i) => (
            <circle
              key={`node-${i}`}
              cx={n.px}
              cy={n.py}
              r={n.size}
              fill="url(#infra-node-peer)"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth={0.6}
            />
          ))}

          {/* ---------- Labels ---------- */}
          {POSITIONED.map((n, i) =>
            n.label ? (
              <text
                key={`label-${i}`}
                x={n.px + n.size + 6}
                y={n.py + 3}
                fontSize={9.5}
                fill="rgba(232,228,220,0.7)"
                fontFamily="var(--font-inter), sans-serif"
                letterSpacing="0.03em"
              >
                {n.label}
              </text>
            ) : null,
          )}

          {/* ---------- "Your agent" — foreground node ---------- */}
          <circle
            cx={YOU.px}
            cy={YOU.py}
            r={YOU.r}
            fill="url(#infra-node-brand)"
            stroke="rgba(178,50,70,0.55)"
            strokeWidth={1}
          />
          {!reduced && (
            <circle
              cx={YOU.px}
              cy={YOU.py}
              r={YOU.r}
              fill="none"
              stroke="rgba(178,50,70,0.28)"
              strokeWidth={1}
            >
              <animate
                attributeName="r"
                values={`${YOU.r};${YOU.r + 12};${YOU.r}`}
                dur="3.4s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values="0.55;0;0.55"
                dur="3.4s"
                repeatCount="indefinite"
              />
            </circle>
          )}
          <text
            x={YOU.px}
            y={YOU.py + YOU.r + 20}
            textAnchor="middle"
            fontSize={11}
            fill="#F5F0E6"
            fontFamily="var(--font-inter), sans-serif"
            letterSpacing="0.04em"
            fontWeight={500}
          >
            Your agent
          </text>
        </svg>
      </div>
    </section>
  );
}
