"use client";

import { useState, useEffect, useCallback } from "react";
import { Filter } from "lucide-react";
import Link from "next/link";
import ActivityItem, { ActivityType } from "@/components/ActivityItem";
import { fetchActivity } from "@/lib/api";
import { timeAgo } from "@/lib/utils";

const FILTER_OPTIONS: { label: string; value: ActivityType | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Routes", value: "route" },
  { label: "Answers", value: "answer" },
  { label: "Approvals", value: "approval" },
  { label: "Doc Requests", value: "doc_request" },
];

interface ActivityEntry {
  type: ActivityType;
  from_agent: string;
  to_agent?: string;
  description: string;
  created_at: string;
}

export default function ActivityPage() {
  const [filter, setFilter] = useState<ActivityType | "all">("all");
  const [items, setItems] = useState<ActivityEntry[]>([]);

  const load = useCallback(() => {
    const type = filter === "all" ? undefined : filter;
    fetchActivity(type, 50)
      .then((data) => setItems(data.items ?? []))
      .catch(() => {});
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

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
        {items.length > 0 ? (
          items.map((item, i) => (
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
          <div className="text-center py-8 text-sm text-gray-600">
            No activity yet.{" "}
            <Link href="/demo" className="text-blue-400 hover:text-blue-300">
              Try the Chat Demo
            </Link>{" "}
            to generate some.
          </div>
        )}
      </div>
    </div>
  );
}
