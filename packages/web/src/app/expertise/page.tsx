"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Network, Search, Users, Hash, MessageSquare } from "lucide-react";
import { fetchExpertiseGraph } from "@/lib/api";
import type { ExpertiseGraph, ExpertiseNode, ExpertiseEdge } from "@/lib/types";
import { useTheme } from "@/lib/ThemeContext";

type Filter = "all" | "person" | "topic";

interface SimNode extends ExpertiseNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const W = 720;
const H = 520;

const PERSON_COLOR = "#FACC15";
const TOPIC_COLOR = "#F87171";
const EDGE_EXPERT = "rgba(248,113,113,0.35)";
const EDGE_COLLAB = "rgba(250,204,21,0.25)";

// Mention edges use the page "ink" color so they stay visible on both themes
// (was rgba(255,255,255,*) which disappears on light bg). Caller passes the
// already-resolved "r,g,b" tuple so we have one source of truth per render.
function edgeMentionColor(inkRgb: string): string {
  return `rgba(${inkRgb},0.10)`;
}

const EDGE_LABEL: Record<ExpertiseEdge["kind"], string> = {
  EXPERT_IN: "expert in",
  COLLABORATED_WITH: "collaborated",
  MENTIONED: "mentions",
};

function edgeColor(kind: ExpertiseEdge["kind"], inkRgb: string) {
  if (kind === "EXPERT_IN") return EDGE_EXPERT;
  if (kind === "COLLABORATED_WITH") return EDGE_COLLAB;
  return edgeMentionColor(inkRgb);
}

export default function ExpertisePage() {
  const { theme } = useTheme();
  // Theme-aware "ink" — the same flip used in OrgWeb.tsx so overlay colors
  // (edges, label backgrounds) stay visible on light and dark backgrounds.
  const inkRgb = theme === "light" ? "20,20,24" : "255,255,255";
  const [graph, setGraph] = useState<ExpertiseGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [hovered, setHovered] = useState<string | null>(null);
  const [showEdgeLabels, setShowEdgeLabels] = useState(true);
  const [sim, setSim] = useState<SimNode[]>([]);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    fetchExpertiseGraph()
      .then((g) => {
        setGraph(g);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Seed positions + run a tiny force simulation client-side (no new dep).
  useEffect(() => {
    if (!graph) return;
    const cx = W / 2;
    const cy = H / 2;
    const nodes: SimNode[] = graph.nodes.map((n, i) => {
      const a = (Math.PI * 2 * i) / graph.nodes.length;
      return {
        ...n,
        x: cx + Math.cos(a) * 160 + (Math.random() - 0.5) * 20,
        y: cy + Math.sin(a) * 160 + (Math.random() - 0.5) * 20,
        vx: 0,
        vy: 0,
      };
    });
    setSim(nodes);

    const byId = new Map(nodes.map((n) => [n.id, n]));
    let ticks = 0;
    const MAX_TICKS = 240;

    const step = () => {
      ticks += 1;
      // Repulsion (Coulomb-ish, O(n^2) is fine at this size).
      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d2 = dx * dx + dy * dy + 0.01;
          const force = 1800 / d2;
          const d = Math.sqrt(d2);
          const fx = (dx / d) * force;
          const fy = (dy / d) * force;
          a.vx -= fx;
          a.vy -= fy;
          b.vx += fx;
          b.vy += fy;
        }
      }
      // Spring attraction along edges.
      graph.edges.forEach((e) => {
        const a = byId.get(e.source);
        const b = byId.get(e.target);
        if (!a || !b) return;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
        const rest = 110 - e.weight * 35;
        const k = 0.04 * e.weight;
        const f = (d - rest) * k;
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      });
      // Gentle pull to center + velocity damping + integrate.
      nodes.forEach((n) => {
        n.vx += (cx - n.x) * 0.002;
        n.vy += (cy - n.y) * 0.002;
        n.vx *= 0.82;
        n.vy *= 0.82;
        n.x += n.vx;
        n.y += n.vy;
        n.x = Math.max(24, Math.min(W - 24, n.x));
        n.y = Math.max(24, Math.min(H - 24, n.y));
      });
      setSim([...nodes]);
      if (ticks < MAX_TICKS) {
        rafRef.current = requestAnimationFrame(step);
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [graph]);

  const matched = useMemo(() => {
    const q = query.trim().toLowerCase();
    return new Set(
      sim
        .filter(
          (n) =>
            (filter === "all" || n.kind === filter) &&
            (!q || n.label.toLowerCase().includes(q)),
        )
        .map((n) => n.id),
    );
  }, [sim, filter, query]);

  const neighbors = useMemo(() => {
    if (!hovered || !graph) return new Set<string>();
    const out = new Set<string>([hovered]);
    graph.edges.forEach((e) => {
      if (e.source === hovered) out.add(e.target);
      if (e.target === hovered) out.add(e.source);
    });
    return out;
  }, [hovered, graph]);

  const stats = graph
    ? {
        people: graph.nodes.filter((n) => n.kind === "person").length,
        topics: graph.nodes.filter((n) => n.kind === "topic").length,
        edges: graph.edges.length,
      }
    : null;

  const hoveredNode = sim.find((n) => n.id === hovered) ?? null;

  return (
    <div className="min-h-screen bg-obsidian text-parchment">
      <header className="border-b border-white/[0.06] px-6 py-4 animate-fade-up">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-bone flex items-center gap-2">
              <Network className="w-4 h-4 text-claret" /> Expertise map
            </h1>
            <p className="text-xs text-smoke mt-0.5">
              Who knows what, across the org. Edges grow from the comms graph.
            </p>
          </div>
          {stats && (
            <div className="flex items-center gap-4 text-[11px] text-dusk">
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" /> {stats.people} people
              </span>
              <span className="flex items-center gap-1">
                <Hash className="w-3 h-3" /> {stats.topics} topics
              </span>
              <span>{stats.edges} edges</span>
            </div>
          )}
        </div>
      </header>

      <div className="p-6 grid grid-cols-12 gap-6">
        <section className="col-span-12 lg:col-span-8 animate-fade-up">
          <div className="flex items-center gap-2 mb-3">
            <div className="inline-flex rounded-md border border-white/[0.08] overflow-hidden">
              {(["all", "person", "topic"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`text-[11px] px-2.5 py-1 transition capitalize ${
                    filter === f
                      ? "bg-white/[0.08] text-bone"
                      : "text-smoke hover:text-parchment hover:bg-white/[0.04]"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1.5 flex-1 max-w-xs px-2.5 py-1 rounded-md border border-white/[0.08] bg-white/[0.02]">
              <Search className="w-3 h-3 text-dusk" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search people or topics"
                className="bg-transparent text-[12px] text-parchment placeholder:text-dusk outline-none flex-1"
              />
            </label>
            <button
              onClick={() => setShowEdgeLabels((v) => !v)}
              className={`text-[11px] px-2.5 py-1 rounded-md border transition ${
                showEdgeLabels
                  ? "border-white/[0.16] bg-white/[0.08] text-bone"
                  : "border-white/[0.08] text-smoke hover:text-parchment hover:bg-white/[0.04]"
              }`}
              aria-pressed={showEdgeLabels}
              title="Toggle relationship labels on edges"
            >
              Labels
            </button>
          </div>

          <div className="bg-ink border border-white/[0.06] rounded-xl p-3">
            {loading ? (
              <div className="h-[520px] flex items-center justify-center">
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              </div>
            ) : !graph ? (
              <div className="h-[520px] flex items-center justify-center">
                <p className="text-sm text-smoke">
                  Graph topology is still being built.
                </p>
              </div>
            ) : (
              <svg
                viewBox={`0 0 ${W} ${H}`}
                className="w-full h-auto select-none"
                role="img"
                aria-label="Org-wide expertise graph"
              >
                {/* edges */}
                {graph.edges.map((e) => {
                  const a = sim.find((n) => n.id === e.source);
                  const b = sim.find((n) => n.id === e.target);
                  if (!a || !b) return null;
                  const active =
                    hovered &&
                    (hovered === e.source || hovered === e.target);
                  return (
                    <line
                      key={`${e.source}-${e.target}-${e.kind}`}
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke={active ? "#C9443A" : edgeColor(e.kind, inkRgb)}
                      strokeWidth={
                        active ? 1.6 : Math.max(0.5, e.weight * 1.5)
                      }
                      strokeDasharray={
                        e.kind === "COLLABORATED_WITH" ? "3 3" : undefined
                      }
                    />
                  );
                })}

                {/* Rendered between edges and nodes so labels sit above the
                    edge line but below node circles. */}
                {showEdgeLabels &&
                  graph.edges.map((e) => {
                    const a = sim.find((n) => n.id === e.source);
                    const b = sim.find((n) => n.id === e.target);
                    if (!a || !b) return null;
                    const mx = (a.x + b.x) / 2;
                    const my = (a.y + b.y) / 2;
                    let angle = Math.atan2(b.y - a.y, b.x - a.x);
                    // Keep text upright: never rotate past vertical.
                    if (angle > Math.PI / 2) angle -= Math.PI;
                    if (angle < -Math.PI / 2) angle += Math.PI;
                    const deg = (angle * 180) / Math.PI;
                    const active =
                      hovered && (hovered === e.source || hovered === e.target);
                    const dim = hovered && !active;
                    const label = EDGE_LABEL[e.kind];
                    const halfW = label.length * 2.6 + 4;
                    return (
                      <g
                        key={`edge-label-${e.source}-${e.target}-${e.kind}`}
                        transform={`translate(${mx}, ${my}) rotate(${deg})`}
                        style={{
                          opacity: dim ? 0.15 : active ? 1 : 0.6,
                          transition: "opacity 180ms",
                          pointerEvents: "none",
                        }}
                      >
                        <rect
                          x={-halfW}
                          y={-6}
                          width={halfW * 2}
                          height={12}
                          rx={2}
                          // Background uses the page bg, not ink — flips to
                          // a near-white plate on light mode so labels stay
                          // legible instead of stamping a black blob.
                          fill={theme === "light" ? "#F5F0E6" : "#0A0A0A"}
                          fillOpacity={0.8}
                        />
                        <text
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fontSize={8.5}
                          fill={active ? "#F5F0E6" : "#9A9287"}
                          fontWeight={active ? 500 : 400}
                          style={{ letterSpacing: "0.02em" }}
                        >
                          {label}
                        </text>
                      </g>
                    );
                  })}

                {/* nodes */}
                {sim.map((n) => {
                  const active = hovered === n.id;
                  const dim = hovered
                    ? !neighbors.has(n.id)
                    : !matched.has(n.id);
                  const r =
                    n.kind === "person"
                      ? 11 + (n.weight ?? 0.5) * 4
                      : 8 + (n.weight ?? 0.5) * 6;
                  const fill = n.kind === "person" ? PERSON_COLOR : TOPIC_COLOR;
                  return (
                    <g
                      key={n.id}
                      onMouseEnter={() => setHovered(n.id)}
                      onMouseLeave={() => setHovered(null)}
                      style={{
                        cursor: "pointer",
                        opacity: dim ? 0.22 : 1,
                        transition: "opacity 180ms",
                      }}
                    >
                      <circle
                        cx={n.x}
                        cy={n.y}
                        r={r + (active ? 3 : 0)}
                        fill={fill}
                        fillOpacity={n.kind === "person" ? 0.9 : 0.28}
                        stroke={fill}
                        strokeWidth={active ? 2 : 1}
                      />
                      <text
                        x={n.x}
                        y={n.y + r + 11}
                        textAnchor="middle"
                        fontSize={10}
                        fontWeight={n.kind === "person" ? 500 : 400}
                        fill={active ? "#F5F0E6" : "#9A9287"}
                      >
                        {n.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
            )}
            <div className="flex items-center justify-between mt-3 text-[11px] text-dusk">
              <div className="flex items-center gap-3">
                <Legend color={PERSON_COLOR} label="Person" />
                <Legend color={TOPIC_COLOR} label="Topic" />
                <LegendLine color="#F87171" label="Expert in" />
                <LegendLine color="#FACC15" label="Collaborated" dashed />
              </div>
              <span>
                Hover a node to isolate. Edges are labeled with the
                relationship type — toggle with <em className="not-italic text-parchment">Labels</em>.
              </span>
            </div>
          </div>
        </section>

        {/* Right rail: hovered detail */}
        <aside className="col-span-12 lg:col-span-4 space-y-4 animate-fade-up">
          <div className="bg-ink border border-white/[0.06] rounded-xl p-4">
            <div className="text-[11px] text-dusk uppercase tracking-wide mb-2">
              Selection
            </div>
            {hoveredNode ? (
              <>
                <div className="text-sm font-medium text-bone">
                  {hoveredNode.label}
                </div>
                <div className="text-[11px] text-smoke capitalize mt-0.5">
                  {hoveredNode.kind}
                  {hoveredNode.department ? ` · ${hoveredNode.department}` : ""}
                </div>
                <div className="mt-3 space-y-1.5">
                  {graph?.edges
                    .filter(
                      (e) =>
                        e.source === hoveredNode.id ||
                        e.target === hoveredNode.id,
                    )
                    .sort((a, b) => b.weight - a.weight)
                    .slice(0, 8)
                    .map((e) => {
                      const otherId =
                        e.source === hoveredNode.id ? e.target : e.source;
                      const other = graph.nodes.find((n) => n.id === otherId);
                      if (!other) return null;
                      return (
                        <div
                          key={`${e.source}-${e.target}-${e.kind}`}
                          className="flex items-center gap-2 text-[12px]"
                        >
                          <span className="text-parchment flex-1 truncate">
                            {other.label}
                          </span>
                          <span className="text-[10px] text-dusk">
                            {e.kind.replace(/_/g, " ").toLowerCase()}
                          </span>
                          <span className="text-[11px] text-dusk tabular-nums w-8 text-right">
                            {Math.round(e.weight * 100)}
                          </span>
                        </div>
                      );
                    })}
                </div>
                {hoveredNode.kind === "person" && (
                  <Link
                    href={`/chat?to=${hoveredNode.id}`}
                    className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-claret hover:text-[#E8B5BD] transition"
                  >
                    <MessageSquare className="w-3 h-3" /> Ask agent about this
                    person
                  </Link>
                )}
              </>
            ) : (
              <p className="text-[12px] text-smoke">
                Hover a node in the graph to see its top relationships.
              </p>
            )}
          </div>

          <div className="bg-ink border border-white/[0.06] rounded-xl p-4">
            <div className="text-[11px] text-dusk uppercase tracking-wide mb-2">
              About this view
            </div>
            <p className="text-[12px] text-smoke leading-relaxed">
              Backend endpoint <code className="text-parchment">/graph/topology</code>{" "}
              is mocked. When the real endpoint ships, swap the fetcher in
              <code className="text-parchment"> lib/api.ts</code>; the node/edge
              shape is already locked in <code className="text-parchment">types.ts</code>.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="w-2 h-2 rounded-full"
        style={{ background: color, opacity: 0.85 }}
      />
      {label}
    </span>
  );
}

function LegendLine({
  color,
  label,
  dashed,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="18" height="4" aria-hidden>
        <line
          x1="0"
          y1="2"
          x2="18"
          y2="2"
          stroke={color}
          strokeWidth="1.5"
          strokeDasharray={dashed ? "3 3" : undefined}
        />
      </svg>
      {label}
    </span>
  );
}
