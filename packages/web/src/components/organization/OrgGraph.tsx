"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Agent } from "@/lib/AuthContext";

// -----------------------------------------------------------------------------
// OrgGraph — 2D Obsidian-style graph of the org.
//
//   • Each person is a node. Their primary department is the cluster center.
//   • A central "You" node sits at the origin in claret.
//   • Edges:
//       - dept→dept: subtle structural ties between cluster centers.
//       - person→person: drawn when two people in different departments
//         share at least one knowledge area (the "data flow" connection).
//   • Live pulses: SSE-driven; every real from→to event fires a bone-coloured
//     pulse traveling along the inferred dept-to-dept edge.
//   • Hover: highlights the node + its direct neighbours, dims everything else.
//   • Search: nodes that don't match dim out.
//   • Click person: invokes onSelect(agent) — page routes to /chat?to=…
//
// Layout: tiny force-directed simulation (Coulomb repulsion + spring edges +
// gentle pull toward the cluster centroid), seeded with departments arranged
// in a ring around the "You" node. Settles in ~2s, then freezes.
// -----------------------------------------------------------------------------

type ActivityEvent = {
  type: string;
  from_agent?: string | null;
  to_agent?: string | null;
};

type NodeKind = "you" | "dept" | "person";

interface SimNode {
  id: string;
  kind: NodeKind;
  label: string;
  dept: string;
  agent?: Agent;
  // physics
  x: number;
  y: number;
  vx: number;
  vy: number;
  // anchor for the cluster — pulls each person toward their dept centroid
  ax: number;
  ay: number;
}

interface SimEdge {
  source: string;
  target: string;
  weight: number;
  kind: "dept" | "person";
}

interface Pulse {
  id: number;
  fromKey: string;
  toKey: string;
  startedAt: number;
}

const W = 960;
const H = 620;
const CX = W / 2;
const CY = H / 2;

const RING_R = 200;
const PERSON_R = 64;
const PULSE_DURATION = 2400;

export default function OrgGraph({
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
  const [hovered, setHovered] = useState<string | null>(null);
  const [sim, setSim] = useState<SimNode[]>([]);
  const rafRef = useRef<number | null>(null);

  // Group agents by primary department, excluding "me".
  const { departments, deptCentroids, edges } = useMemo(() => {
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
    const me = agents.find((a) => a.id === myAgentId);
    const myDept = me?.departments?.[0];

    // Move user's dept to position 0 so it sits closest to the center.
    if (myDept && order.includes(myDept)) {
      order.splice(order.indexOf(myDept), 1);
      order.unshift(myDept);
    }

    // Compute centroid positions for each department, evenly around a ring.
    const centroids: Record<string, { x: number; y: number }> = {};
    const N = order.length || 1;
    order.forEach((name, i) => {
      const angle = (i / N) * Math.PI * 2 - Math.PI / 2;
      centroids[name] = {
        x: CX + Math.cos(angle) * RING_R,
        y: CY + Math.sin(angle) * RING_R,
      };
    });

    // Edges: dept-to-dept (light structural) + person-to-person across depts
    // when knowledge areas overlap (this is the data-flow signal).
    const edgeList: SimEdge[] = [];

    // Dept↔dept (each dept connected to its 2 nearest neighbours)
    for (let i = 0; i < order.length; i++) {
      const a = order[i];
      const distances = order
        .filter((b) => b !== a)
        .map((b) => {
          const dx = centroids[a].x - centroids[b].x;
          const dy = centroids[a].y - centroids[b].y;
          return { b, d: dx * dx + dy * dy };
        })
        .sort((x, y) => x.d - y.d);
      for (const { b } of distances.slice(0, 2)) {
        const seen = edgeList.some(
          (e) =>
            (e.source === `dept:${a}` && e.target === `dept:${b}`) ||
            (e.source === `dept:${b}` && e.target === `dept:${a}`),
        );
        if (!seen) {
          edgeList.push({
            source: `dept:${a}`,
            target: `dept:${b}`,
            weight: 0.4,
            kind: "dept",
          });
        }
      }
    }

    // Person↔person edges via shared knowledge areas (cross-department only)
    const peopleFlat = agents.filter((a) => a.id !== myAgentId);
    for (let i = 0; i < peopleFlat.length; i++) {
      for (let j = i + 1; j < peopleFlat.length; j++) {
        const a = peopleFlat[i];
        const b = peopleFlat[j];
        const ad = a.departments?.[0];
        const bd = b.departments?.[0];
        if (!ad || !bd || ad === bd) continue;
        const ak = new Set(a.knowledge_areas ?? []);
        const shared = (b.knowledge_areas ?? []).filter((k) => ak.has(k));
        if (shared.length === 0) continue;
        edgeList.push({
          source: `person:${a.id}`,
          target: `person:${b.id}`,
          weight: Math.min(1, 0.3 + shared.length * 0.15),
          kind: "person",
        });
      }
    }

    return {
      departments: order,
      deptCentroids: centroids,
      edges: edgeList,
    };
  }, [agents, myAgentId]);

  // Index agents by id so live SSE can look them up.
  const agentsById = useMemo(() => {
    const m: Record<string, Agent> = {};
    for (const a of agents) m[a.id] = a;
    return m;
  }, [agents]);

  // Seed nodes and run a short force simulation.
  useEffect(() => {
    if (departments.length === 0 && agents.length === 0) return;

    const nodes: SimNode[] = [];

    // You node — pinned at the centre
    nodes.push({
      id: "you",
      kind: "you",
      label: myAgentName ?? "You",
      dept: "you",
      x: CX,
      y: CY,
      vx: 0,
      vy: 0,
      ax: CX,
      ay: CY,
    });

    // Dept nodes — pinned at centroids (they don't move, they anchor people)
    for (const d of departments) {
      const c = deptCentroids[d];
      nodes.push({
        id: `dept:${d}`,
        kind: "dept",
        label: d,
        dept: d,
        x: c.x,
        y: c.y,
        vx: 0,
        vy: 0,
        ax: c.x,
        ay: c.y,
      });
    }

    // Person nodes — seeded in a small disc around their dept centroid.
    for (const a of agents) {
      if (a.id === myAgentId) continue;
      const d = a.departments?.[0] || "Other";
      const c = deptCentroids[d] ?? { x: CX, y: CY };
      const angle = Math.random() * Math.PI * 2;
      const r = 28 + Math.random() * 26;
      nodes.push({
        id: `person:${a.id}`,
        kind: "person",
        label: a.name,
        dept: d,
        agent: a,
        x: c.x + Math.cos(angle) * r,
        y: c.y + Math.sin(angle) * r,
        vx: 0,
        vy: 0,
        ax: c.x,
        ay: c.y,
      });
    }

    setSim(nodes);

    const byId = new Map(nodes.map((n) => [n.id, n]));
    let ticks = 0;
    const MAX_TICKS = 220;

    const step = () => {
      ticks += 1;
      // Coulomb repulsion only between person nodes
      const people = nodes.filter((n) => n.kind === "person");
      for (let i = 0; i < people.length; i++) {
        for (let j = i + 1; j < people.length; j++) {
          const a = people[i];
          const b = people[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d2 = dx * dx + dy * dy + 0.01;
          // soft, short-range push so labels don't overlap
          if (d2 > 6400) continue; // skip far pairs (~80px cutoff)
          const force = 1400 / d2;
          const d = Math.sqrt(d2);
          const fx = (dx / d) * force;
          const fy = (dy / d) * force;
          a.vx -= fx;
          a.vy -= fy;
          b.vx += fx;
          b.vy += fy;
        }
      }

      // Spring attraction along edges (person↔person only)
      for (const e of edges) {
        if (e.kind !== "person") continue;
        const a = byId.get(e.source);
        const b = byId.get(e.target);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
        const rest = 140 - e.weight * 30;
        const k = 0.015 * e.weight;
        const f = (d - rest) * k;
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }

      // Anchor pull (pulls each person toward their dept centroid)
      for (const n of nodes) {
        if (n.kind !== "person") continue;
        n.vx += (n.ax - n.x) * 0.018;
        n.vy += (n.ay - n.y) * 0.018;
        n.vx *= 0.82;
        n.vy *= 0.82;
        n.x += n.vx;
        n.y += n.vy;
        // clamp inside the box (with margin for label)
        n.x = Math.max(36, Math.min(W - 36, n.x));
        n.y = Math.max(36, Math.min(H - 36, n.y));
      }

      setSim([...nodes]);
      if (ticks < MAX_TICKS) {
        rafRef.current = requestAnimationFrame(step);
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [agents, myAgentId, myAgentName, departments, deptCentroids, edges]);

  // Live SSE pulses — animate a dot along the dept-to-dept line.
  const [pulses, setPulses] = useState<Pulse[]>([]);
  const pulseIdRef = useRef(0);
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
      const fa = data.from_agent ? agentsById[data.from_agent] : undefined;
      const ta = data.to_agent ? agentsById[data.to_agent] : undefined;
      const fd = fa?.departments?.[0];
      const td = ta?.departments?.[0];
      if (!fd || !td || fd === td) return;
      if (!deptCentroids[fd] || !deptCentroids[td]) return;
      const id = ++pulseIdRef.current;
      setPulses((prev) => [
        ...prev,
        {
          id,
          fromKey: `dept:${fd}`,
          toKey: `dept:${td}`,
          startedAt: performance.now(),
        },
      ]);
      window.setTimeout(() => {
        setPulses((prev) => prev.filter((p) => p.id !== id));
      }, PULSE_DURATION + 200);
    };

    es.addEventListener("message", onMessage);
    es.onerror = () => {
      /* EventSource auto-retries */
    };
    return () => {
      es.removeEventListener("message", onMessage);
      es.close();
    };
  }, [agentsById, deptCentroids]);

  // Animation loop for pulse positions
  const [pulseTick, setPulseTick] = useState(0);
  useEffect(() => {
    if (pulses.length === 0) return;
    let raf = 0;
    const loop = () => {
      setPulseTick((t) => t + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [pulses.length]);

  // Search + neighbour set
  const q = searchQuery.trim().toLowerCase();
  const matched = useMemo(() => {
    if (!q) return null;
    const set = new Set<string>();
    for (const n of sim) {
      if (n.kind === "you") {
        set.add(n.id);
        continue;
      }
      const a = n.agent;
      const hit =
        n.label.toLowerCase().includes(q) ||
        (a?.role?.toLowerCase().includes(q) ?? false) ||
        (a?.knowledge_areas?.some((k) => k.toLowerCase().includes(q)) ?? false) ||
        n.dept.toLowerCase().includes(q);
      if (hit) set.add(n.id);
    }
    return set;
  }, [q, sim]);

  const neighbours = useMemo(() => {
    if (!hovered) return null;
    const out = new Set<string>([hovered]);
    // "You" is connected to every dept
    if (hovered === "you") {
      for (const d of departments) out.add(`dept:${d}`);
      return out;
    }
    // dept node — connect to its people + sibling depts via edges
    if (hovered.startsWith("dept:")) {
      const deptName = hovered.slice(5);
      for (const n of sim) {
        if (n.kind === "person" && n.dept === deptName) out.add(n.id);
      }
      for (const e of edges) {
        if (e.kind !== "dept") continue;
        if (e.source === hovered) out.add(e.target);
        if (e.target === hovered) out.add(e.source);
      }
      out.add("you");
      return out;
    }
    // person — direct edges
    for (const e of edges) {
      if (e.source === hovered) out.add(e.target);
      if (e.target === hovered) out.add(e.source);
    }
    // and the person's department
    const me = sim.find((n) => n.id === hovered);
    if (me) out.add(`dept:${me.dept}`);
    return out;
  }, [hovered, sim, edges, departments]);

  const nodeById = useMemo(() => {
    const m = new Map<string, SimNode>();
    for (const n of sim) m.set(n.id, n);
    return m;
  }, [sim]);

  // Lines from You → dept centroids (the "trunks")
  const trunks = departments.map((d) => ({
    from: { x: CX, y: CY },
    to: deptCentroids[d],
    name: d,
  }));

  return (
    <div className="relative w-full rounded-xl overflow-hidden bg-gradient-to-b from-[#0B0B0D] to-[#000] border border-white/[0.04]">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto select-none"
        role="img"
        aria-label="Organization graph"
      >
        <defs>
          {/* radial gradient for the You core */}
          <radialGradient id="youCore" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#E4768A" stopOpacity="1" />
            <stop offset="60%" stopColor="#B23246" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#5D0F1D" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Trunks — You → each department centroid */}
        {trunks.map((t) => {
          const isDim =
            hovered !== null &&
            !(neighbours?.has(`dept:${t.name}`) || hovered === "you");
          return (
            <line
              key={`trunk-${t.name}`}
              x1={t.from.x}
              y1={t.from.y}
              x2={t.to.x}
              y2={t.to.y}
              stroke="#8B1E2F"
              strokeOpacity={isDim ? 0.08 : 0.4}
              strokeWidth={1}
            />
          );
        })}

        {/* Dept↔dept structural edges */}
        {edges
          .filter((e) => e.kind === "dept")
          .map((e) => {
            const a = nodeById.get(e.source);
            const b = nodeById.get(e.target);
            if (!a || !b) return null;
            const hit =
              hovered !== null &&
              (neighbours?.has(e.source) || neighbours?.has(e.target));
            const dim = hovered !== null && !hit;
            return (
              <line
                key={`${e.source}-${e.target}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="#6B0F1A"
                strokeOpacity={dim ? 0.05 : 0.28}
                strokeWidth={1}
              />
            );
          })}

        {/* Person↔person knowledge-overlap edges */}
        {edges
          .filter((e) => e.kind === "person")
          .map((e) => {
            const a = nodeById.get(e.source);
            const b = nodeById.get(e.target);
            if (!a || !b) return null;
            const hit =
              hovered !== null &&
              (neighbours?.has(e.source) || neighbours?.has(e.target));
            const dim = hovered !== null && !hit;
            const base = 0.08 + e.weight * 0.18;
            return (
              <line
                key={`${e.source}-${e.target}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="#D25A6D"
                strokeOpacity={dim ? 0.03 : hit ? 0.55 : base}
                strokeWidth={hit ? 1.2 : 0.7}
              />
            );
          })}

        {/* Live SSE pulses traveling along dept-to-dept trunks */}
        {pulses.map((p) => {
          const a = nodeById.get(p.fromKey);
          const b = nodeById.get(p.toKey);
          if (!a || !b) return null;
          const elapsed = performance.now() - p.startedAt;
          const t = Math.min(1, elapsed / PULSE_DURATION);
          const fade =
            t < 0.08 ? t / 0.08 : t > 0.88 ? Math.max(0, (1 - t) / 0.12) : 1;
          const x = a.x + (b.x - a.x) * t;
          const y = a.y + (b.y - a.y) * t;
          return (
            <g key={`pulse-${p.id}-${pulseTick}`}>
              <circle
                cx={x}
                cy={y}
                r={6}
                fill="#F5F0E6"
                fillOpacity={fade * 0.55}
              />
              <circle
                cx={x}
                cy={y}
                r={2.5}
                fill="#FFFFFF"
                fillOpacity={fade}
              />
            </g>
          );
        })}

        {/* You node halo + core */}
        {(() => {
          const me = nodeById.get("you");
          if (!me) return null;
          const dim =
            hovered !== null && !(neighbours?.has("you") ?? true);
          return (
            <g
              onMouseEnter={() => setHovered("you")}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: "default", opacity: dim ? 0.35 : 1 }}
            >
              <circle cx={me.x} cy={me.y} r={36} fill="url(#youCore)" />
              <circle
                cx={me.x}
                cy={me.y}
                r={11}
                fill="#E4768A"
                stroke="#F5F0E6"
                strokeWidth={1}
                strokeOpacity={0.45}
              />
              <text
                x={me.x}
                y={me.y + 28}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill="#F5F0E6"
                pointerEvents="none"
              >
                {me.label}
              </text>
              <text
                x={me.x}
                y={me.y + 42}
                textAnchor="middle"
                fontSize={9}
                fill="#9A9287"
                pointerEvents="none"
              >
                your agent
              </text>
            </g>
          );
        })()}

        {/* Department nodes */}
        {sim
          .filter((n) => n.kind === "dept")
          .map((n) => {
            const active = hovered === n.id;
            const inHood = hovered && neighbours?.has(n.id);
            const dim =
              (q && matched && !matched.has(n.id)) ||
              (hovered !== null && !active && !inHood);
            return (
              <g
                key={n.id}
                onMouseEnter={() => setHovered(n.id)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  cursor: "default",
                  opacity: dim ? 0.22 : 1,
                  transition: "opacity 180ms",
                }}
              >
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={active ? 11 : 9}
                  fill="#2A2830"
                  stroke={active ? "#D25A6D" : "#8B1E2F"}
                  strokeWidth={active ? 1.6 : 1}
                />
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={3.5}
                  fill={active ? "#D25A6D" : "#B23246"}
                />
                <text
                  x={n.x}
                  y={n.y - 14}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={500}
                  fill={active ? "#F5F0E6" : "#D6CFC0"}
                  pointerEvents="none"
                >
                  {n.label}
                </text>
              </g>
            );
          })}

        {/* Person nodes */}
        {sim
          .filter((n) => n.kind === "person")
          .map((n) => {
            const active = hovered === n.id;
            const inHood = hovered && neighbours?.has(n.id);
            const dim =
              (q && matched && !matched.has(n.id)) ||
              (hovered !== null && !active && !inHood);
            const r = active ? 7 : 5;
            return (
              <g
                key={n.id}
                onMouseEnter={() => setHovered(n.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => n.agent && onSelect(n.agent)}
                style={{
                  cursor: "pointer",
                  opacity: dim ? 0.18 : 1,
                  transition: "opacity 180ms",
                }}
              >
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={r}
                  fill={active ? "#F5F0E6" : "#D6CFC0"}
                  stroke="#8B1E2F"
                  strokeWidth={active ? 1.2 : 0.6}
                />
                <text
                  x={n.x}
                  y={n.y + r + 11}
                  textAnchor="middle"
                  fontSize={9.5}
                  fontWeight={active ? 500 : 400}
                  fill={active ? "#F5F0E6" : "#9A9287"}
                  pointerEvents="none"
                >
                  {n.label}
                </text>
              </g>
            );
          })}
      </svg>

      {/* Hover detail card */}
      {hovered && (() => {
        const n = nodeById.get(hovered);
        if (!n || n.kind === "you") return null;
        if (n.kind === "dept") {
          const peopleInDept = sim.filter(
            (s) => s.kind === "person" && s.dept === n.dept,
          );
          return (
            <div className="absolute top-3 right-3 bg-ink/95 backdrop-blur border border-white/[0.08] rounded-lg px-3 py-2 text-xs min-w-[200px] max-w-[260px] pointer-events-none">
              <div className="text-bone font-medium">{n.label}</div>
              <div className="text-dusk text-[10px]">
                {peopleInDept.length}{" "}
                {peopleInDept.length === 1 ? "person" : "people"}
              </div>
              <div className="mt-1.5 flex flex-col gap-0.5">
                {peopleInDept.slice(0, 4).map((p) => (
                  <span key={p.id} className="text-[10px] text-smoke">
                    {p.label}
                    {p.agent?.role ? ` · ${p.agent.role}` : ""}
                  </span>
                ))}
                {peopleInDept.length > 4 && (
                  <span className="text-[10px] text-dusk">
                    +{peopleInDept.length - 4} more
                  </span>
                )}
              </div>
            </div>
          );
        }
        const a = n.agent;
        if (!a) return null;
        return (
          <div className="absolute top-3 right-3 bg-ink/95 backdrop-blur border border-white/[0.08] rounded-lg px-3 py-2 text-xs min-w-[220px] max-w-[280px] pointer-events-none">
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
      })()}

      {/* Legend */}
      <div className="absolute bottom-3 left-3 text-[10px] text-dusk pointer-events-none select-none font-mono">
        hover to isolate · click a person to reach out
      </div>
    </div>
  );
}
