"use client";

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

const RECENT_ACTIVITY: {
  type: ActivityType;
  from: string;
  to?: string;
  description: string;
  timestamp: string;
}[] = [
  {
    type: "route",
    from: "Jordan Chen",
    to: "Karen Park",
    description: "Routed revenue forecast query to Finance",
    timestamp: "2 min ago",
  },
  {
    type: "approval",
    from: "Karen Park",
    description: "Approved document share: Focus Group Results",
    timestamp: "5 min ago",
  },
  {
    type: "answer",
    from: "Jordan Chen",
    description: "Answered: Acme Corp deal status — $450K, closing next week",
    timestamp: "8 min ago",
  },
  {
    type: "doc_request",
    from: "Jordan Chen",
    to: "Karen Park",
    description: "Requested Q4 revenue forecast spreadsheet",
    timestamp: "12 min ago",
  },
  {
    type: "route",
    from: "Jordan Chen",
    to: "Karen Park",
    description: "Routed budget inquiry to Finance",
    timestamp: "15 min ago",
  },
];

export default function Dashboard() {
  return (
    <div className="p-8 max-w-6xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold mb-1">Dashboard</h1>
        <p className="text-sm text-gray-500">
          Overview of your agent network and recent activity
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Active Agents"
          value="2"
          change="Both online"
          changeType="up"
          icon={Users}
        />
        <StatCard
          label="Messages Today"
          value="24"
          change="+12% from yesterday"
          changeType="up"
          icon={MessageSquare}
        />
        <StatCard
          label="Approvals Pending"
          value="1"
          change="1 awaiting review"
          changeType="neutral"
          icon={ShieldCheck}
        />
        <StatCard
          label="Auto-Resolved"
          value="18"
          change="75% resolution rate"
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
            {RECENT_ACTIVITY.map((item, i) => (
              <ActivityItem key={i} {...item} />
            ))}
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
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-900/50 text-green-400 border border-green-800">
                  Healthy
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Claude API</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-900/50 text-green-400 border border-green-800">
                  Connected
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
