"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Brain,
  Eye,
  Clock,
  MessageSquare,
  Mail,
  Calendar as CalIcon,
  Users,
  Sparkles,
  Lock,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { fetchShadowProfile, fetchExpertiseGraph } from "@/lib/mocks";
import type { ExpertiseGraph, ShadowProfile } from "@/lib/types";

const CHANNEL_ICONS: Record<string, typeof MessageSquare> = {
  slack: MessageSquare,
  email: Mail,
  calendar: CalIcon,
};

export default function KnowledgePage() {
  const { agent: myAgent } = useAuth();
  const [profile, setProfile] = useState<ShadowProfile | null>(null);
  const [graph, setGraph] = useState<ExpertiseGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetchShadowProfile().catch(() => null),
      fetchExpertiseGraph().catch(() => null),
    ]).then(([p, g]) => {
      setProfile(p);
      setGraph(g);
      setLoading(false);
    });
  }, []);

  // Build the user's ego graph: me at center, topics + collaborators around
  const layout = useMemo(() => {
    if (!profile) return null;

    const me = { id: "me", label: myAgent?.name ?? "You", kind: "me" as const };

    const topics = profile.top_topics.map((t, i) => ({
      id: `topic:${t.topic}`,
      label: t.topic,
      kind: "topic" as const,
      weight: t.weight,
      idx: i,
      count: profile.top_topics.length,
    }));

    const collaborators = profile.collaboration.map((c, i) => ({
      id: `person:${c.person_id}`,
      label: c.person_name,
      kind: "person" as const,
      weight: c.strength,
      idx: i,
      count: profile.collaboration.length,
    }));

    const W = 520;
    const H = 420;
    const cx = W / 2;
    const cy = H / 2;
    const innerR = 110;
    const outerR = 180;

    const positioned = [
      { ...me, x: cx, y: cy, r: 22 },
      ...topics.map((t) => {
        const a = (Math.PI * 2 * t.idx) / t.count - Math.PI / 2;
        return {
          ...t,
          x: cx + Math.cos(a) * innerR,
          y: cy + Math.sin(a) * innerR,
          r: 10 + t.weight * 8,
        };
      }),
      ...collaborators.map((c) => {
        const a = (Math.PI * 2 * c.idx) / c.count + Math.PI / c.count;
        return {
          ...c,
          x: cx + Math.cos(a) * outerR,
          y: cy + Math.sin(a) * outerR,
          r: 12 + c.weight * 8,
        };
      }),
    ];

    const edges = [
      ...topics.map((t) => ({
        source: "me",
        target: t.id,
        weight: t.weight,
      })),
      ...collaborators.map((c) => ({
        source: "me",
        target: c.id,
        weight: c.weight,
      })),
    ];

    return { nodes: positioned, edges, W, H };
  }, [profile, myAgent]);

  if (loading) {
    return (
      <div className="min-h-screen bg-obsidian text-parchment flex items-center justify-center">
        <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile || !graph) {
    return (
      <div className="min-h-screen bg-obsidian text-parchment flex items-center justify-center p-6">
        <p className="text-sm text-smoke">Your shadow profile is still being built.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-obsidian text-parchment">
      <header className="border-b border-white/[0.06] px-6 py-4 animate-fade-up">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-bone flex items-center gap-2">
              <Brain className="w-4 h-4 text-claret" /> What your agent knows about you
            </h1>
            <p className="text-xs text-smoke mt-0.5">
              Built from your comms graph. Only you can see this — not your manager, not the admin.
            </p>
          </div>
          <span className="flex items-center gap-1.5 text-[11px] text-[#4ADE80] bg-[rgba(34,197,94,0.10)] border border-[rgba(34,197,94,0.30)] px-2.5 py-1 rounded-full">
            <Lock className="w-3 h-3" /> private to you
          </span>
        </div>
      </header>

      <div className="p-6 grid grid-cols-12 gap-6">
        {/* Graph */}
        <section className="col-span-12 lg:col-span-7 animate-fade-up">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-3.5 h-3.5 text-smoke" />
            <h2 className="text-sm font-medium text-parchment">Knowledge graph</h2>
            <span className="text-[11px] text-dusk">
              {profile.top_topics.length} topics · {profile.collaboration.length} collaborators
            </span>
          </div>
          <div className="bg-ink border border-white/[0.06] rounded-xl p-3">
            {layout && <EgoGraph layout={layout} hovered={hovered} setHovered={setHovered} />}
            <p className="text-[11px] text-dusk text-center mt-3">
              Node size = weight. Hover a node to see detail.
            </p>
          </div>
        </section>

        {/* Side: how you work */}
        <aside className="col-span-12 lg:col-span-5 space-y-4 animate-fade-up">
          <div className="bg-ink border border-white/[0.06] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Eye className="w-3.5 h-3.5 text-smoke" />
              <h3 className="text-sm font-medium text-parchment">How you work</h3>
            </div>
            <div className="space-y-3">
              <Stat
                label="Median response"
                value={`${profile.response_patterns.avg_response_minutes}m`}
                icon={<Clock className="w-3.5 h-3.5" />}
              />
              <Stat
                label="Active hours"
                value={`${profile.response_patterns.active_hours.start_hour}:00 – ${profile.response_patterns.active_hours.end_hour}:00`}
                icon={<Clock className="w-3.5 h-3.5" />}
              />
              <div>
                <div className="text-[11px] text-dusk uppercase tracking-wide mb-2">
                  Preferred channels
                </div>
                <div className="space-y-2">
                  {profile.response_patterns.preferred_channels.map((c) => {
                    const Icon = CHANNEL_ICONS[c.channel] ?? MessageSquare;
                    return (
                      <div key={c.channel} className="flex items-center gap-2">
                        <Icon className="w-3 h-3 text-smoke" />
                        <span className="text-xs text-parchment capitalize w-16">
                          {c.channel}
                        </span>
                        <div className="flex-1 h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-oxblood to-claret"
                            style={{ width: `${c.share * 100}%` }}
                          />
                        </div>
                        <span className="text-[11px] text-dusk tabular-nums w-9 text-right">
                          {Math.round(c.share * 100)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-ink border border-white/[0.06] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Brain className="w-3.5 h-3.5 text-smoke" />
              <h3 className="text-sm font-medium text-parchment">Top topics</h3>
            </div>
            <div className="space-y-2">
              {profile.top_topics.map((t) => (
                <div key={t.topic} className="flex items-center gap-2">
                  <span className="text-xs text-parchment flex-1 truncate">
                    {t.topic}
                  </span>
                  <div className="w-20 h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                    <div
                      className="h-full bg-[#F87171]"
                      style={{ width: `${t.weight * 100}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-dusk tabular-nums w-9 text-right">
                    {Math.round(t.weight * 100)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-ink border border-white/[0.06] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-3.5 h-3.5 text-smoke" />
              <h3 className="text-sm font-medium text-parchment">Close collaborators</h3>
            </div>
            <div className="space-y-2">
              {profile.collaboration.map((c) => (
                <div key={c.person_id} className="flex items-center gap-2">
                  <Link
                    href={`/chat?to=${c.person_id}`}
                    className="text-xs text-parchment flex-1 truncate hover:text-claret transition"
                  >
                    {c.person_name}
                  </Link>
                  <div className="w-20 h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                    <div
                      className="h-full bg-[#FACC15]"
                      style={{ width: `${c.strength * 100}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-dusk tabular-nums w-9 text-right">
                    {Math.round(c.strength * 100)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-[11px] text-dusk leading-relaxed">
            {profile.note} When Obsidian-backed knowledge graph storage ships,
            this view will read from there — and you&apos;ll be able to edit the
            graph (pin, mute topics, correct owners) directly.
          </p>
        </aside>
      </div>
    </div>
  );
}

interface LayoutNode {
  id: string;
  label: string;
  kind: "me" | "topic" | "person";
  x: number;
  y: number;
  r: number;
  weight?: number;
}

interface LayoutEdge {
  source: string;
  target: string;
  weight: number;
}

function EgoGraph({
  layout,
  hovered,
  setHovered,
}: {
  layout: { nodes: LayoutNode[]; edges: LayoutEdge[]; W: number; H: number };
  hovered: string | null;
  setHovered: (id: string | null) => void;
}) {
  const nodeById = new Map(layout.nodes.map((n) => [n.id, n]));

  return (
    <svg
      viewBox={`0 0 ${layout.W} ${layout.H}`}
      className="w-full h-auto"
      role="img"
      aria-label="Knowledge graph"
    >
      <defs>
        <radialGradient id="me-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#8B1E2F" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#8B1E2F" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* edges */}
      {layout.edges.map((e) => {
        const a = nodeById.get(e.source);
        const b = nodeById.get(e.target);
        if (!a || !b) return null;
        const active = hovered === e.target || hovered === e.source;
        return (
          <line
            key={`${e.source}-${e.target}`}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={active ? "#C9443A" : "rgba(255,255,255,0.12)"}
            strokeWidth={active ? 1.5 : 1}
          />
        );
      })}

      {/* glow under me-node */}
      {layout.nodes
        .filter((n) => n.kind === "me")
        .map((n) => (
          <circle key={`glow-${n.id}`} cx={n.x} cy={n.y} r={60} fill="url(#me-glow)" />
        ))}

      {/* nodes */}
      {layout.nodes.map((n) => {
        const active = hovered === n.id;
        const fill =
          n.kind === "me"
            ? "#8B1E2F"
            : n.kind === "topic"
              ? "#F87171"
              : "#FACC15";
        return (
          <g
            key={n.id}
            onMouseEnter={() => setHovered(n.id)}
            onMouseLeave={() => setHovered(null)}
            style={{ cursor: "pointer" }}
          >
            <circle
              cx={n.x}
              cy={n.y}
              r={n.r + (active ? 3 : 0)}
              fill={fill}
              fillOpacity={n.kind === "me" ? 1 : 0.22}
              stroke={fill}
              strokeWidth={active ? 2 : 1}
            />
            <text
              x={n.x}
              y={n.y + n.r + 12}
              textAnchor="middle"
              fontSize={n.kind === "me" ? 12 : 10}
              fontWeight={n.kind === "me" ? 600 : 400}
              fill={active || n.kind === "me" ? "#F5F0E6" : "#9A9287"}
            >
              {n.label}
            </text>
            {active && n.kind !== "me" && typeof n.weight === "number" && (
              <text
                x={n.x}
                y={n.y + 3}
                textAnchor="middle"
                fontSize={10}
                fill="#F5F0E6"
                fontWeight={600}
              >
                {Math.round(n.weight * 100)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-smoke">{icon}</span>
      <span className="text-[11px] text-dusk uppercase tracking-wide w-32">
        {label}
      </span>
      <span className="text-xs text-parchment font-medium">{value}</span>
    </div>
  );
}
