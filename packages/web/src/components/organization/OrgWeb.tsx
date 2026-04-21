"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Agent } from "@/lib/AuthContext";

// -----------------------------------------------------------------------------
// OrgWeb — trapezoidal perspective coordination fabric.
//
// Visual language matches the landing-page InfrastructurePlane:
//   • Trapezoidal grid receding to the back.
//   • Departments at stable grid intersections.
//   • Oxblood inter-team edges, bone satellite person dots.
//   • "Your agent" as a brand-colored node at the bottom, trunks rising
//     into the fabric toward the user's own department + top 2 neighbours
//     by shared knowledge areas.
//   • Live activity pulses subscribed to /api/activity/stream — every real
//     from→to event with two resolvable departments fires a bone pulse
//     along the corresponding edge.
// -----------------------------------------------------------------------------

const VIEW_W = 1000;
const VIEW_H = 620;

const TOP_Y = 110;
const BOTTOM_Y = 470;
const TOP_LEFT_X = 280;
const TOP_RIGHT_X = 720;
const BOTTOM_LEFT_X = 40;
const BOTTOM_RIGHT_X = 960;

const ROWS = 5;
const COLS = 6;

const leftX = (t: number) => TOP_LEFT_X + (BOTTOM_LEFT_X - TOP_LEFT_X) * t;
const rightX = (t: number) => TOP_RIGHT_X + (BOTTOM_RIGHT_X - TOP_RIGHT_X) * t;
const gridY = (r: number) => TOP_Y + (BOTTOM_Y - TOP_Y) * (r / ROWS);
const gridX = (r: number, c: number) => {
  const t = r / ROWS;
  return leftX(t) + (rightX(t) - leftX(t)) * (c / COLS);
};

// Department slots, ordered by priority (front-row + center first).
// The first N of this list are used, so departments always land on tidy
// intersections regardless of how many teams exist.
type Slot = { r: number; c: number };
const SLOTS: Slot[] = [
  { r: 3, c: 4 },   // Sales-equivalent (front-right center)
  { r: 3, c: 1 },   // Marketing-equivalent (front-left center)
  { r: 4, c: 5 },   // Finance-equivalent (far-right front)
  { r: 4, c: 2 },   // Support-equivalent (far-left front)
  { r: 2, c: 3 },   // Ops-equivalent (mid center)
  { r: 2, c: 6 },   // Legal-equivalent (mid right edge)
  { r: 1, c: 3 },   // Engineering-equivalent (back center)
  { r: 1, c: 1 },   // Product-equivalent (back left)
  { r: 2, c: 0 },   // mid-far-left
  { r: 1, c: 5 },   // back mid-right
  { r: 0, c: 2 },   // back far
  { r: 0, c: 4 },   // back far-right
];

const YOU = { px: VIEW_W / 2, py: VIEW_H - 60, r: 20 };

// ---------------------------------------------------------------------------

type Dept = {
  name: string;
  slot: Slot;
  px: number;
  py: number;
  depth: number; // 0 = back, 1 = front
  people: Agent[];
};

type ActivityEvent = {
  type: string;
  from_agent?: string | null;
  to_agent?: string | null;
  description?: string;
};

type Pulse = {
  id: number;
  fromDept: string;
  toDept: string;
  startedAt: number;
};

export default function OrgWeb({
  agents,
  myAgentId,
  myAgentName,
  searchQuery = "",
  onSelect,
}: {
  agents: Agent[];
  myAgentId: string | null;
  myAgentName?: string;
  searchQuery?: string;
  onSelect: (a: Agent) => void;
}) {
  const [hovered, setHovered] = useState<
    | { kind: "dept"; name: string }
    | { kind: "person"; id: string }
    | null
  >(null);
  const [pulses, setPulses] = useState<Pulse[]>([]);
  const pulseIdRef = useRef(0);

  // Index agents by id for quick lookups.
  const agentsById = useMemo(() => {
    const m: Record<string, Agent> = {};
    for (const a of agents) m[a.id] = a;
    return m;
  }, [agents]);

  const me = myAgentId ? agentsById[myAgentId] : undefined;
  const myDept = me?.departments?.[0];

  // Group agents into departments; exclude "you" from satellite dots (you're
  // the foreground node). Order departments so yours lands in slot 0.
  const departments = useMemo<Dept[]>(() => {
    const buckets: Record<string, Agent[]> = {};
    const order: string[] = [];
    for (const a of agents) {
      if (a.id === myAgentId) continue;
      const d = a.departments?.[0] || "Other";
      if (!buckets[d]) {
        buckets[d] = [];
        order.push(d);
      }
      buckets[d].push(a);
    }

    // Your department gets slot 0 so the trunk is short and obvious.
    const sorted = [...order];
    if (myDept && sorted.includes(myDept)) {
      sorted.splice(sorted.indexOf(myDept), 1);
      sorted.unshift(myDept);
    }

    return sorted.slice(0, SLOTS.length).map((name, i) => {
      const slot = SLOTS[i];
      return {
        name,
        slot,
        px: gridX(slot.r, slot.c),
        py: gridY(slot.r),
        depth: slot.r / ROWS,
        people: buckets[name],
      };
    });
  }, [agents, myAgentId, myDept]);

  const deptByName = useMemo(() => {
    const m: Record<string, Dept> = {};
    for (const d of departments) m[d.name] = d;
    return m;
  }, [departments]);

  // Trunks: from you to your dept + top 2 by shared knowledge areas.
  const trunkTargets = useMemo<Dept[]>(() => {
    const mine = myDept ? deptByName[myDept] : undefined;
    const myAreas = new Set(me?.knowledge_areas ?? []);
    const scored = departments
      .filter((d) => d.name !== myDept)
      .map((d) => {
        const shared = d.people.reduce((acc, p) => {
          return (
            acc +
            (p.knowledge_areas ?? []).filter((k) => myAreas.has(k)).length
          );
        }, 0);
        return { d, shared };
      })
      .sort((a, b) => b.shared - a.shared);
    const top2 = scored.slice(0, 2).map((s) => s.d);
    return [mine, ...top2].filter((d): d is Dept => Boolean(d));
  }, [departments, deptByName, me, myDept]);

  // Inter-team edges: a light ambient mesh connecting "nearby" depts so the
  // fabric reads as a graph rather than unrelated islands. Plus we draw an
  // edge for every dept-pair that has a live pulse currently.
  const ambientEdges = useMemo(() => {
    const edges: { a: Dept; b: Dept }[] = [];
    for (let i = 0; i < departments.length; i++) {
      for (let j = i + 1; j < departments.length; j++) {
        const a = departments[i];
        const b = departments[j];
        const dx = a.slot.c - b.slot.c;
        const dr = a.slot.r - b.slot.r;
        const manhattan = Math.abs(dx) + Math.abs(dr);
        // Keep the density comparable to the landing plane — connect pairs
        // that are grid-adjacent or one step away on both axes.
        if (manhattan <= 3) edges.push({ a, b });
      }
    }
    return edges;
  }, [departments]);

  // Subscribe to /api/activity/stream and turn events into pulses.
  useEffect(() => {
    const apiBase =
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const es = new EventSource(`${apiBase}/api/activity/stream`);

    const onMessage = (msg: MessageEvent) => {
      let data: ActivityEvent;
      try {
        data = JSON.parse(msg.data);
      } catch {
        return;
      }
      if (data.type === "ping") return;
      const fromId = data.from_agent;
      const toId = data.to_agent;
      if (!fromId || !toId) return;
      const fromAgent = agentsById[fromId];
      const toAgent = agentsById[toId];
      const fromDept = fromAgent?.departments?.[0];
      const toDept = toAgent?.departments?.[0];
      if (!fromDept || !toDept || fromDept === toDept) return;
      if (!deptByName[fromDept] || !deptByName[toDept]) return;

      const id = ++pulseIdRef.current;
      setPulses((prev) => [
        ...prev,
        { id, fromDept, toDept, startedAt: performance.now() },
      ]);
      // Pulse expires after 2.4s
      window.setTimeout(() => {
        setPulses((prev) => prev.filter((p) => p.id !== id));
      }, 2600);
    };

    es.addEventListener("message", onMessage);
    es.onerror = () => {
      // EventSource retries automatically; silently let it.
    };

    return () => {
      es.removeEventListener("message", onMessage);
      es.close();
    };
  }, [agentsById, deptByName]);

  // Apply search — when the user types, we dim every dept/person that doesn't
  // match, so the fabric acts like a live filter too.
  const q = searchQuery.trim().toLowerCase();
  const matches = (a: Agent) =>
    !q ||
    a.name.toLowerCase().includes(q) ||
    a.role.toLowerCase().includes(q) ||
    a.departments?.some((d) => d.toLowerCase().includes(q)) ||
    a.knowledge_areas?.some((k) => k.toLowerCase().includes(q));

  const deptMatches = (d: Dept) =>
    !q ||
    d.name.toLowerCase().includes(q) ||
    d.people.some(matches);

  return (
    <div className="relative mx-auto" style={{ maxWidth: 1100 }}>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="w-full"
        role="img"
        aria-label="Organization coordination fabric"
        style={{ filter: "drop-shadow(0 12px 40px rgba(0,0,0,0.55))" }}
      >
        <defs>
          <radialGradient id="ow-you" cx="50%" cy="30%" r="60%">
            <stop offset="0%" stopColor="#D25A6D" />
            <stop offset="100%" stopColor="#5D0F1D" />
          </radialGradient>
          <radialGradient id="ow-peer" cx="50%" cy="30%" r="60%">
            <stop offset="0%" stopColor="#2A2830" />
            <stop offset="100%" stopColor="#141316" />
          </radialGradient>
          <radialGradient id="ow-bgglow" cx="50%" cy="85%" r="55%">
            <stop offset="0%" stopColor="rgba(139,30,47,0.22)" />
            <stop offset="60%" stopColor="rgba(139,30,47,0.05)" />
            <stop offset="100%" stopColor="rgba(139,30,47,0)" />
          </radialGradient>
        </defs>

        <rect x={0} y={0} width={VIEW_W} height={VIEW_H} fill="url(#ow-bgglow)" />

        {/* Trapezoidal grid — horizontal rows */}
        {Array.from({ length: ROWS + 1 }, (_, r) => {
          const t = r / ROWS;
          return (
            <line
              key={`h-${r}`}
              x1={leftX(t)}
              y1={gridY(r)}
              x2={rightX(t)}
              y2={gridY(r)}
              stroke={`rgba(255,255,255,${(0.035 + 0.06 * t).toFixed(3)})`}
              strokeWidth={0.6}
            />
          );
        })}

        {/* Trapezoidal grid — vertical converging */}
        {Array.from({ length: COLS + 1 }, (_, c) => (
          <line
            key={`v-${c}`}
            x1={gridX(0, c)}
            y1={gridY(0)}
            x2={gridX(ROWS, c)}
            y2={gridY(ROWS)}
            stroke="rgba(255,255,255,0.05)"
            strokeWidth={0.5}
          />
        ))}

        {/* Ambient inter-team edges */}
        {ambientEdges.map((e, i) => {
          const depth = (e.a.depth + e.b.depth) / 2;
          const dim =
            (q && (!deptMatches(e.a) || !deptMatches(e.b))) ||
            (hovered?.kind === "dept" &&
              hovered.name !== e.a.name &&
              hovered.name !== e.b.name);
          return (
            <line
              key={`ae-${i}`}
              x1={e.a.px}
              y1={e.a.py}
              x2={e.b.px}
              y2={e.b.py}
              stroke={`rgba(139,30,47,${(0.12 + 0.22 * depth).toFixed(2)})`}
              strokeWidth={0.6 + 0.5 * depth}
              style={{
                opacity: dim ? 0.15 : 1,
                transition: "opacity 200ms",
              }}
            />
          );
        })}

        {/* Trunks — You → your dept + top 2 */}
        {trunkTargets.map((d, i) => (
          <line
            key={`trunk-${i}`}
            x1={YOU.px}
            y1={YOU.py - YOU.r}
            x2={d.px}
            y2={d.py}
            stroke="rgba(178,50,70,0.55)"
            strokeWidth={1.2}
          />
        ))}

        {/* Ambient trunk pulses (decorative, low intensity) */}
        {trunkTargets.map((d, i) => (
          <circle
            key={`trunkpulse-${i}`}
            r={2.6}
            fill="#B23246"
            style={{ filter: "drop-shadow(0 0 6px rgba(178,50,70,0.6))" }}
          >
            <animate
              attributeName="cx"
              from={YOU.px}
              to={d.px}
              dur="2.8s"
              begin={`${(i * 0.9).toFixed(2)}s`}
              repeatCount="indefinite"
            />
            <animate
              attributeName="cy"
              from={YOU.py - YOU.r}
              to={d.py}
              dur="2.8s"
              begin={`${(i * 0.9).toFixed(2)}s`}
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0;0.9;0.9;0"
              keyTimes="0;0.12;0.86;1"
              dur="2.8s"
              begin={`${(i * 0.9).toFixed(2)}s`}
              repeatCount="indefinite"
            />
          </circle>
        ))}

        {/* Live pulses from real activity events */}
        {pulses.map((p) => {
          const a = deptByName[p.fromDept];
          const b = deptByName[p.toDept];
          if (!a || !b) return null;
          return (
            <g key={`pulse-${p.id}`}>
              {/* brief edge glow */}
              <line
                x1={a.px}
                y1={a.py}
                x2={b.px}
                y2={b.py}
                stroke="rgba(245,240,230,0.55)"
                strokeWidth={1.4}
              >
                <animate
                  attributeName="opacity"
                  values="0;0.8;0"
                  keyTimes="0;0.25;1"
                  dur="2.4s"
                  begin="0s"
                  repeatCount="1"
                  fill="freeze"
                />
              </line>
              {/* bone core pulse */}
              <circle
                r={3.2}
                fill="#F5F0E6"
                style={{ filter: "drop-shadow(0 0 8px rgba(245,240,230,0.7))" }}
              >
                <animate
                  attributeName="cx"
                  from={a.px}
                  to={b.px}
                  dur="2.4s"
                  begin="0s"
                  repeatCount="1"
                  fill="freeze"
                />
                <animate
                  attributeName="cy"
                  from={a.py}
                  to={b.py}
                  dur="2.4s"
                  begin="0s"
                  repeatCount="1"
                  fill="freeze"
                />
                <animate
                  attributeName="opacity"
                  values="0;1;1;0"
                  keyTimes="0;0.1;0.85;1"
                  dur="2.4s"
                  begin="0s"
                  repeatCount="1"
                  fill="freeze"
                />
              </circle>
            </g>
          );
        })}

        {/* Satellite person dots around each dept */}
        {departments.map((d) =>
          d.people.map((p, i) => {
            const angle = (i / Math.max(1, d.people.length)) * Math.PI * 2;
            const rad = 18 + d.depth * 6;
            const px = d.px + Math.cos(angle) * rad;
            const py = d.py + Math.sin(angle) * rad;
            const active =
              (hovered?.kind === "person" && hovered.id === p.id) ||
              (hovered?.kind === "dept" && hovered.name === d.name);
            const match = matches(p);
            const dim = (q && !match) || (hovered && !active);
            return (
              <g
                key={`sat-${p.id}`}
                onMouseEnter={() => setHovered({ kind: "person", id: p.id })}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onSelect(p)}
                style={{
                  cursor: "pointer",
                  opacity: dim ? 0.2 : 1,
                  transition: "opacity 200ms",
                }}
              >
                <circle
                  cx={px}
                  cy={py}
                  r={active ? 3.5 : 2.2}
                  fill={active ? "#F5F0E6" : "rgba(245,240,230,0.35)"}
                  stroke={
                    active ? "rgba(212,95,114,0.9)" : "rgba(139,30,47,0.45)"
                  }
                  strokeWidth={0.8}
                  style={{
                    transition: "r 180ms, fill 180ms, stroke 180ms",
                    filter: active
                      ? "drop-shadow(0 0 6px rgba(245,240,230,0.55))"
                      : "none",
                  }}
                />
              </g>
            );
          }),
        )}

        {/* Department nodes + labels */}
        {departments.map((d) => {
          const active =
            hovered?.kind === "dept" && hovered.name === d.name;
          const size = 6 + d.depth * 3;
          const dim = q && !deptMatches(d);
          return (
            <g
              key={`dept-${d.name}`}
              onMouseEnter={() => setHovered({ kind: "dept", name: d.name })}
              onMouseLeave={() => setHovered(null)}
              style={{
                cursor: "default",
                opacity: dim ? 0.2 : 1,
                transition: "opacity 200ms",
              }}
            >
              {active && (
                <circle
                  cx={d.px}
                  cy={d.py}
                  r={size + 10}
                  fill="rgba(178,50,70,0.18)"
                />
              )}
              <circle
                cx={d.px}
                cy={d.py}
                r={size}
                fill="url(#ow-peer)"
                stroke={
                  active
                    ? "rgba(212,95,114,0.85)"
                    : "rgba(178,50,70,0.55)"
                }
                strokeWidth={1}
              />
              <text
                x={d.px + size + 8}
                y={d.py + 4}
                fontSize={11}
                fill={active ? "#F5F0E6" : "rgba(232,228,220,0.75)"}
                fontFamily="var(--font-inter), sans-serif"
                letterSpacing="0.03em"
                style={{ pointerEvents: "none", transition: "fill 200ms" }}
              >
                {d.name}
              </text>
              <text
                x={d.px + size + 8}
                y={d.py + 17}
                fontSize={9}
                fill="rgba(160,155,145,0.6)"
                fontFamily="var(--font-inter), sans-serif"
                style={{ pointerEvents: "none" }}
              >
                {d.people.length}{" "}
                {d.people.length === 1 ? "person" : "people"}
              </text>
            </g>
          );
        })}

        {/* "Your agent" — foreground brand node */}
        <circle
          cx={YOU.px}
          cy={YOU.py}
          r={YOU.r + 14}
          fill="rgba(178,50,70,0.12)"
        />
        <circle
          cx={YOU.px}
          cy={YOU.py}
          r={YOU.r}
          fill="url(#ow-you)"
          stroke="rgba(212,95,114,0.7)"
          strokeWidth={1.2}
        />
        <circle
          cx={YOU.px}
          cy={YOU.py}
          r={YOU.r}
          fill="none"
          stroke="rgba(178,50,70,0.35)"
          strokeWidth={1}
        >
          <animate
            attributeName="r"
            values={`${YOU.r};${YOU.r + 14};${YOU.r}`}
            dur="3.4s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="0.6;0;0.6"
            dur="3.4s"
            repeatCount="indefinite"
          />
        </circle>
        <text
          x={YOU.px}
          y={YOU.py + YOU.r + 22}
          textAnchor="middle"
          fontSize={12}
          fill="#F5F0E6"
          fontFamily="var(--font-inter), sans-serif"
          letterSpacing="0.04em"
          fontWeight={500}
        >
          {myAgentName ? myAgentName : "Your agent"}
        </text>
        {myAgentName && (
          <text
            x={YOU.px}
            y={YOU.py + YOU.r + 37}
            textAnchor="middle"
            fontSize={10}
            fill="rgba(160,155,145,0.7)"
            fontFamily="var(--font-inter), sans-serif"
          >
            Your agent
          </text>
        )}
      </svg>

      {/* Hover card — positioned over the SVG */}
      {hovered && <OrgHoverCard hovered={hovered} deptByName={deptByName} agentsById={agentsById} />}
    </div>
  );
}

function OrgHoverCard({
  hovered,
  deptByName,
  agentsById,
}: {
  hovered: { kind: "dept"; name: string } | { kind: "person"; id: string };
  deptByName: Record<string, Dept>;
  agentsById: Record<string, Agent>;
}) {
  if (hovered.kind === "dept") {
    const d = deptByName[hovered.name];
    if (!d) return null;
    return (
      <div className="absolute top-2 right-2 bg-ink/95 backdrop-blur border border-white/[0.08] rounded-lg px-3 py-2 text-xs min-w-[200px] max-w-[260px] animate-fade-up pointer-events-none">
        <div className="text-bone font-medium">{d.name}</div>
        <div className="text-dusk text-[10px]">
          {d.people.length} {d.people.length === 1 ? "person" : "people"}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {d.people.slice(0, 4).map((p) => (
            <span
              key={p.id}
              className="text-[10px] text-smoke"
            >
              {p.name}
            </span>
          ))}
        </div>
      </div>
    );
  }
  const a = agentsById[hovered.id];
  if (!a) return null;
  return (
    <div className="absolute top-2 right-2 bg-ink/95 backdrop-blur border border-white/[0.08] rounded-lg px-3 py-2 text-xs min-w-[220px] max-w-[280px] animate-fade-up pointer-events-none">
      <div className="text-bone font-medium">{a.name}</div>
      <div className="text-dusk text-[10px]">{a.role}</div>
      {a.knowledge_areas && a.knowledge_areas.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {a.knowledge_areas.slice(0, 5).map((k) => (
            <span
              key={k}
              className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.04] text-smoke border border-white/[0.06]"
            >
              {k}
            </span>
          ))}
        </div>
      )}
      <div className="mt-1.5 text-[10px] text-claret">
        Click to reach out →
      </div>
    </div>
  );
}
