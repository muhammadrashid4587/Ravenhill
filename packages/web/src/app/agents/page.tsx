"use client";

import { useState } from "react";
import { Search, Plus } from "lucide-react";
import AgentCard from "@/components/AgentCard";

const AGENTS = [
  {
    name: "Jordan Chen",
    role: "Senior Sales Rep",
    department: "Sales",
    initials: "JC",
    color: "bg-blue-600",
    status: "online" as const,
    lastAction: "Answered Acme Corp deal inquiry",
  },
  {
    name: "Karen Park",
    role: "Finance Analyst",
    department: "Finance",
    initials: "KP",
    color: "bg-purple-600",
    status: "online" as const,
    lastAction: "Shared Q4 revenue forecast",
  },
  {
    name: "Alex Rivera",
    role: "Marketing Manager",
    department: "Marketing",
    initials: "AR",
    color: "bg-emerald-600",
    status: "idle" as const,
    lastAction: "Updated campaign metrics",
  },
  {
    name: "Sam Nakamura",
    role: "Engineering Lead",
    department: "Engineering",
    initials: "SN",
    color: "bg-orange-600",
    status: "offline" as const,
    lastAction: "Sprint standup summary sent",
  },
  {
    name: "Priya Sharma",
    role: "Product Manager",
    department: "Product",
    initials: "PS",
    color: "bg-pink-600",
    status: "idle" as const,
    lastAction: "Shared roadmap update",
  },
  {
    name: "David Kim",
    role: "HR Business Partner",
    department: "HR",
    initials: "DK",
    color: "bg-cyan-600",
    status: "offline" as const,
    lastAction: "Onboarding checklist sent",
  },
];

export default function AgentsPage() {
  const [search, setSearch] = useState("");

  const filtered = AGENTS.filter(
    (a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.department.toLowerCase().includes(search.toLowerCase()) ||
      a.role.toLowerCase().includes(search.toLowerCase())
  );

  const onlineCount = AGENTS.filter((a) => a.status === "online").length;

  return (
    <div className="p-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Agents</h1>
          <p className="text-sm text-gray-500">
            {AGENTS.length} agents &middot; {onlineCount} online
          </p>
        </div>
        <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg text-sm font-medium transition">
          <Plus className="w-4 h-4" />
          Add Agent
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text"
          placeholder="Search agents by name, role, or department..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition placeholder:text-gray-600"
        />
      </div>

      {/* Agent Grid */}
      <div className="grid grid-cols-3 gap-4">
        {filtered.map((agent) => (
          <AgentCard key={agent.name} {...agent} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-gray-600 text-sm">
          No agents match your search.
        </div>
      )}
    </div>
  );
}
