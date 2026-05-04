"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Circle,
  MessageSquare,
  Check,
  ArrowRight,
} from "lucide-react";
import { useAuth, type Agent } from "@/lib/AuthContext";
import { fetchAgent, fetchActivity } from "@/lib/api";
import ActivityItem, { ActivityType } from "@/components/ActivityItem";
import { timeAgo } from "@/lib/utils";

const AVATAR_CLS =
  "bg-graphite border border-white/[0.08] text-parchment";

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

interface ActivityEntry {
  type: ActivityType;
  from_agent: string;
  to_agent?: string;
  description: string;
  created_at: string;
}

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { agent: myAgent } = useAuth();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);

  const agentId = params.id as string;
  const isMyAgent = myAgent?.id === agentId;

  const loadAgent = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAgent(agentId);
      setAgent(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  const loadActivity = useCallback(async () => {
    try {
      const data = await fetchActivity(undefined, 50);
      setActivity(data.items ?? []);
    } catch {
      // Activity is non-critical
    }
  }, []);

  useEffect(() => {
    loadAgent();
    loadActivity();
  }, [loadAgent, loadActivity]);

  // Impersonation removed — the signed-in identity is authoritative.
  // "View in chat" simply opens your own chat view; the detail page is
  // now purely for browsing another agent's public profile.
  const handleOpenChat = () => {
    router.push("/chat");
  };

  if (loading) {
    return (
      <div className="p-8 max-w-3xl">
        <div className="animate-pulse space-y-6">
          <div className="h-4 bg-graphite rounded w-20" />
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-full bg-graphite" />
            <div className="space-y-2">
              <div className="h-6 bg-graphite rounded w-40" />
              <div className="h-4 bg-graphite rounded w-56" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="p-8 max-w-3xl">
        <Link
          href="/agents"
          className="flex items-center gap-2 text-sm text-smoke hover:text-white transition mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Agents
        </Link>
        <div className="text-center py-16">
          <p className="text-dusk text-sm">Agent not found or could not be loaded.</p>
          <Link
            href="/agents"
            className="text-blue-400 hover:text-blue-300 text-sm mt-2 inline-block"
          >
            View all agents
          </Link>
        </div>
      </div>
    );
  }

  const avatarColor = AVATAR_CLS;

  // Filter activity entries that mention this agent
  const agentActivity = activity.filter(
    (a) => a.from_agent === agent.name || a.to_agent === agent.name
  );
  const recentActivity = agentActivity.slice(0, 10);

  return (
    <div className="p-8 max-w-3xl">
      {/* Back link */}
      <Link
        href="/agents"
        className="flex items-center gap-2 text-sm text-smoke hover:text-white transition mb-8"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Agents
      </Link>

      {/* Profile header */}
      <div className="flex items-start gap-5 mb-8">
        <div
          className={`w-20 h-20 rounded-full ${avatarColor} flex items-center justify-center text-2xl font-semibold shrink-0`}
        >
          {getInitials(agent.name)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-semibold">{agent.name}</h1>
            <div className="flex items-center gap-1.5">
              <Circle
                className={`w-2.5 h-2.5 fill-current ${agent.is_active ? "text-green-400" : "text-dusk"}`}
              />
              <span
                className={`text-xs ${agent.is_active ? "text-green-400" : "text-dusk"}`}
              >
                {agent.is_active ? "Online" : "Offline"}
              </span>
            </div>
          </div>
          <p className="text-sm text-smoke mb-1">{agent.role}</p>
          <span
            className="inline-block text-[11px] px-2.5 py-0.5 rounded-full bg-white/[0.04] text-parchment border border-white/[0.08]"
          >
            {agent.departments?.[0]}
          </span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 mb-8">
        {isMyAgent && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-oxblood/15 border border-oxblood/40 text-sm text-claret">
            <Check className="w-4 h-4" />
            This is you
          </div>
        )}
        <button
          onClick={handleOpenChat}
          className="btn btn-secondary text-sm px-4 py-2"
        >
          <MessageSquare className="w-4 h-4" />
          Open chat
        </button>
      </div>

      {/* Knowledge Areas */}
      {(agent.knowledge_areas ?? []).length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-medium text-smoke mb-3">Knowledge Areas</h2>
          <div className="flex flex-wrap gap-2">
            {(agent.knowledge_areas ?? []).map((area) => (
              <span
                key={area}
                className="text-xs px-3 py-1.5 rounded-lg bg-ink text-parchment border border-gray-800"
              >
                {area}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Knowledge Base */}
      {agent.knowledge_base && (
        <section className="mb-6">
          <h2 className="text-sm font-medium text-smoke mb-3">Knowledge Base</h2>
          <div className="bg-ink border border-gray-800 rounded-xl p-4">
            <div className="text-sm text-parchment leading-relaxed whitespace-pre-wrap">
              {agent.knowledge_base}
            </div>
          </div>
        </section>
      )}

      {/* Scopes */}
      {agent.scopes.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-medium text-smoke mb-3">Scopes</h2>
          <div className="flex flex-wrap gap-2">
            {agent.scopes.map((scope) => (
              <span
                key={scope}
                className="text-xs px-3 py-1.5 rounded-lg bg-ink text-parchment border border-gray-800 font-mono"
              >
                {scope}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Recent Activity */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-smoke">Recent Activity</h2>
          {agentActivity.length > 10 && (
            <Link
              href="/activity"
              className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
            >
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          )}
        </div>
        <div className="bg-ink border border-gray-800 rounded-xl px-5 py-2">
          {recentActivity.length > 0 ? (
            recentActivity.map((item, i) => (
              <ActivityItem
                key={i}
                type={item.type}
                from={item.from_agent}
                to={item.to_agent}
                description={item.description}
                timestamp={timeAgo(item.created_at)}
              />
            ))
          ) : (
            <div className="text-center py-8 text-sm text-dusk">
              No activity for this agent yet.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
