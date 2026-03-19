"use client";

import { useState } from "react";
import { Filter } from "lucide-react";
import ActivityItem, { ActivityType } from "@/components/ActivityItem";

const ALL_ACTIVITY: {
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
  {
    type: "answer",
    from: "Karen Park",
    description: "Answered: Q4 budget allocation across departments",
    timestamp: "18 min ago",
  },
  {
    type: "route",
    from: "Jordan Chen",
    to: "Karen Park",
    description: "Routed board deck request to Finance",
    timestamp: "22 min ago",
  },
  {
    type: "approval",
    from: "Karen Park",
    description: "Denied document share: Confidential board deck draft",
    timestamp: "25 min ago",
  },
  {
    type: "answer",
    from: "Jordan Chen",
    description: "Answered: West region pipeline summary — $2.4M across 12 deals",
    timestamp: "30 min ago",
  },
  {
    type: "doc_request",
    from: "Jordan Chen",
    to: "Karen Park",
    description: "Requested focus group results PDF",
    timestamp: "35 min ago",
  },
  {
    type: "answer",
    from: "Karen Park",
    description: "Answered: Financial position for Q4 — revenue above plan",
    timestamp: "40 min ago",
  },
  {
    type: "route",
    from: "Jordan Chen",
    to: "Karen Park",
    description: "Routed expense approval question to Finance",
    timestamp: "45 min ago",
  },
];

const FILTER_OPTIONS: { label: string; value: ActivityType | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Routes", value: "route" },
  { label: "Answers", value: "answer" },
  { label: "Approvals", value: "approval" },
  { label: "Doc Requests", value: "doc_request" },
];

export default function ActivityPage() {
  const [filter, setFilter] = useState<ActivityType | "all">("all");

  const filtered =
    filter === "all"
      ? ALL_ACTIVITY
      : ALL_ACTIVITY.filter((a) => a.type === filter);

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Activity</h1>
          <p className="text-sm text-gray-500">
            Full log of agent actions and inter-agent communication
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-6">
        <Filter className="w-4 h-4 text-gray-500" />
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            className={`text-xs px-3 py-1.5 rounded-lg transition ${
              filter === opt.value
                ? "bg-blue-600/10 text-blue-400 border border-blue-800/30"
                : "text-gray-500 hover:text-white border border-gray-800 hover:border-gray-700"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Activity List */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-2">
        {filtered.map((item, i) => (
          <ActivityItem key={i} {...item} />
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-8 text-gray-600 text-sm">
            No activity matching this filter.
          </div>
        )}
      </div>
    </div>
  );
}
