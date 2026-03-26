"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Users,
  MessageSquare,
  ShieldCheck,
  Zap,
  ArrowRight,
  Activity,
} from "lucide-react";
import StatCard from "@/components/StatCard";
import ActivityItem, { ActivityType } from "@/components/ActivityItem";
import { fetchStats, fetchActivity, fetchHealth } from "@/lib/api";
import { timeAgo } from "@/lib/utils";

interface Stats {
  active_agents: number;
  messages_today: number;
  pending_approvals: number;
  auto_resolved: number;
}

interface HealthStatus {
  status: string;
  llm_provider: string;
}

interface ActivityEntry {
  type: ActivityType;
  from_agent: string;
  to_agent?: string;
  description: string;
  created_at: string;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [apiDown, setApiDown] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchStats().catch(() => null),
      fetchActivity(undefined, 5).catch(() => null),
      fetchHealth().catch(() => null),
    ]).then(([s, a, h]) => {
      if (s) setStats(s);
      if (a) setActivity(a.items ?? []);
      if (h) setHealth(h);
      if (!s && !a && !h) setApiDown(true);
    });
  }, []);

  const llmLabel =
    health?.llm_provider === "mock"
      ? "Mock Mode"
      : health?.llm_provider
        ? health.llm_provider.charAt(0).toUpperCase() +
          health.llm_provider.slice(1)
        : "Unknown";
  const llmIsLive = health?.llm_provider && health.llm_provider !== "mock";

  return (
    <div className="p-8 max-w-6xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold mb-1">Dashboard</h1>
        <p className="text-sm text-gray-500">
          Overview of your agent network and recent activity
        </p>
      </div>

      {apiDown && (
        <div className="mb-6 p-4 bg-red-900/20 border border-red-800 rounded-xl text-sm text-red-400">
          Cannot connect to API server. Is the backend running on localhost:8000?
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Active Agents"
          value={String(stats?.active_agents ?? 0)}
          change={stats ? `${stats.active_agents} online` : "Loading..."}
          changeType="up"
          icon={Users}
        />
        <StatCard
          label="Messages Today"
          value={String(stats?.messages_today ?? 0)}
          changeType="up"
          icon={MessageSquare}
        />
        <StatCard
          label="Approvals Pending"
          value={String(stats?.pending_approvals ?? 0)}
          changeType="neutral"
          icon={ShieldCheck}
        />
        <StatCard
          label="Auto-Resolved"
          value={String(stats?.auto_resolved ?? 0)}
          changeType="up"
          icon={Zap}
        />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-3 gap-6">
        {/* Activity Feed */}
        <div className="col-span-2 bg-gray-900 border border-gray-800 rounded-xl">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-gray-500" />
              <h2 className="text-sm font-medium">Recent Activity</h2>
            </div>
            <Link
              href="/activity"
              className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
            >
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="px-5 py-2">
            {activity.length > 0 ? (
              activity.map((item, i) => (
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
              <div className="py-8 text-center text-sm text-gray-600">
                No activity yet.{" "}
                <Link href="/demo" className="text-blue-400 hover:text-blue-300">
                  Try the Chat Demo
                </Link>{" "}
                to generate some.
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="space-y-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="text-sm font-medium mb-4">Quick Actions</h2>
            <div className="space-y-2">
              <Link
                href="/demo"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-blue-600/10 border border-blue-800/30 hover:border-blue-700 transition text-sm"
              >
                <MessageSquare className="w-4 h-4 text-blue-400" />
                <span className="text-blue-300">Open Chat Demo</span>
              </Link>
              <Link
                href="/agents"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-gray-800/50 border border-gray-800 hover:border-gray-700 transition text-sm"
              >
                <Users className="w-4 h-4 text-gray-400" />
                <span className="text-gray-300">View Agents</span>
              </Link>
              <Link
                href="/activity"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-gray-800/50 border border-gray-800 hover:border-gray-700 transition text-sm"
              >
                <Activity className="w-4 h-4 text-gray-400" />
                <span className="text-gray-300">Activity Log</span>
              </Link>
            </div>
          </div>

          {/* System Status */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="text-sm font-medium mb-4">System Status</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">API Server</span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full border ${
                    health
                      ? "bg-green-900/50 text-green-400 border-green-800"
                      : "bg-red-900/50 text-red-400 border-red-800"
                  }`}
                >
                  {health ? "Healthy" : "Offline"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">LLM Provider</span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full border ${
                    llmIsLive
                      ? "bg-green-900/50 text-green-400 border-green-800"
                      : "bg-yellow-900/50 text-yellow-400 border-yellow-800"
                  }`}
                >
                  {llmLabel}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">ETO Messaging</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-900/50 text-yellow-400 border border-yellow-800">
                  Stubbed
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
