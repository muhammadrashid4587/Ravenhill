"use client";

import { useState } from "react";
import { Search, Plus, GitBranch } from "lucide-react";
import AgentCard from "@/components/AgentCard";

const AGENTS = [
  {
    name: "Jordan Chen",
    role: "Senior Sales Rep",
    departments: ["Sales"],
    initials: "JC",
    color: "bg-blue-600",
    status: "online" as const,
    lastAction: "Answered Acme Corp deal inquiry",
  },
  {
    name: "Karen Park",
    role: "Finance Analyst",
    departments: ["Finance"],
    initials: "KP",
    color: "bg-purple-600",
    status: "online" as const,
    lastAction: "Shared Q4 revenue forecast",
  },
  {
    name: "Alex Rivera",
    role: "Marketing Manager",
    departments: ["Marketing", "Sales"],
    initials: "AR",
    color: "bg-emerald-600",
    status: "idle" as const,
    lastAction: "Updated campaign metrics",
  },
  {
    name: "Sam Nakamura",
    role: "Engineering Lead",
    departments: ["Engineering"],
    initials: "SN",
    color: "bg-orange-600",
    status: "offline" as const,
    lastAction: "Sprint standup summary sent",
  },
  {
    name: "Priya Sharma",
    role: "Product Manager",
    departments: ["Product", "Engineering"],
    initials: "PS",
    color: "bg-pink-600",
    status: "idle" as const,
    lastAction: "Shared roadmap update",
  },
  {
    name: "David Kim",
    role: "HR Business Partner",
    departments: ["HR"],
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
      a.departments.some((d) => d.toLowerCase().includes(search.toLowerCase())) ||
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

      {/* Organizational Hierarchy */}
      <div className="mt-10">
        <div className="flex items-center gap-2 mb-6">
          <GitBranch className="w-5 h-5 text-gray-400" />
          <h2 className="text-lg font-semibold">Organizational Hierarchy</h2>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8">
          {/* CEO Level */}
          <div className="flex flex-col items-center">
            <div className="bg-gray-800 border border-gray-700 rounded-xl px-6 py-3 text-center">
              <div className="text-sm font-medium text-white">CEO</div>
              <div className="text-[10px] text-gray-500">Executive</div>
            </div>
            {/* Vertical connector */}
            <div className="w-px h-6 bg-gray-700" />
            {/* Horizontal connector */}
            <div className="relative w-full max-w-3xl">
              <div className="absolute top-0 left-1/6 right-1/6 h-px bg-gray-700" style={{ left: "16.6%", right: "16.6%" }} />
              {/* Department heads */}
              <div className="grid grid-cols-3 gap-6">
                {/* Sales & Marketing */}
                <div className="flex flex-col items-center">
                  <div className="w-px h-6 bg-gray-700" />
                  <div className="bg-blue-900/20 border border-blue-800/40 rounded-xl px-4 py-3 text-center w-full">
                    <div className="text-xs font-medium text-blue-400">VP Sales & Marketing</div>
                    <div className="text-[10px] text-gray-500">Revenue</div>
                  </div>
                  <div className="w-px h-4 bg-gray-700" />
                  <div className="relative w-full">
                    <div className="absolute top-0 left-1/4 right-1/4 h-px bg-gray-700" />
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col items-center">
                        <div className="w-px h-4 bg-gray-700" />
                        <div className="bg-blue-900/10 border border-blue-800/30 rounded-lg px-3 py-2 text-center w-full">
                          <div className="text-[11px] font-medium text-blue-300">Jordan Chen</div>
                          <div className="text-[9px] text-gray-500">Sales</div>
                        </div>
                      </div>
                      <div className="flex flex-col items-center">
                        <div className="w-px h-4 bg-gray-700" />
                        <div className="bg-emerald-900/10 border border-emerald-800/30 rounded-lg px-3 py-2 text-center w-full">
                          <div className="text-[11px] font-medium text-emerald-300">Alex Rivera</div>
                          <div className="text-[9px] text-gray-500">Marketing</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Engineering & Product */}
                <div className="flex flex-col items-center">
                  <div className="w-px h-6 bg-gray-700" />
                  <div className="bg-orange-900/20 border border-orange-800/40 rounded-xl px-4 py-3 text-center w-full">
                    <div className="text-xs font-medium text-orange-400">VP Engineering</div>
                    <div className="text-[10px] text-gray-500">Product & Tech</div>
                  </div>
                  <div className="w-px h-4 bg-gray-700" />
                  <div className="relative w-full">
                    <div className="absolute top-0 left-1/4 right-1/4 h-px bg-gray-700" />
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col items-center">
                        <div className="w-px h-4 bg-gray-700" />
                        <div className="bg-orange-900/10 border border-orange-800/30 rounded-lg px-3 py-2 text-center w-full">
                          <div className="text-[11px] font-medium text-orange-300">Sam Nakamura</div>
                          <div className="text-[9px] text-gray-500">Engineering</div>
                        </div>
                      </div>
                      <div className="flex flex-col items-center">
                        <div className="w-px h-4 bg-gray-700" />
                        <div className="bg-pink-900/10 border border-pink-800/30 rounded-lg px-3 py-2 text-center w-full">
                          <div className="text-[11px] font-medium text-pink-300">Priya Sharma</div>
                          <div className="text-[9px] text-gray-500">Product</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Finance & HR */}
                <div className="flex flex-col items-center">
                  <div className="w-px h-6 bg-gray-700" />
                  <div className="bg-purple-900/20 border border-purple-800/40 rounded-xl px-4 py-3 text-center w-full">
                    <div className="text-xs font-medium text-purple-400">VP Operations</div>
                    <div className="text-[10px] text-gray-500">Finance & People</div>
                  </div>
                  <div className="w-px h-4 bg-gray-700" />
                  <div className="relative w-full">
                    <div className="absolute top-0 left-1/4 right-1/4 h-px bg-gray-700" />
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col items-center">
                        <div className="w-px h-4 bg-gray-700" />
                        <div className="bg-purple-900/10 border border-purple-800/30 rounded-lg px-3 py-2 text-center w-full">
                          <div className="text-[11px] font-medium text-purple-300">Karen Park</div>
                          <div className="text-[9px] text-gray-500">Finance</div>
                        </div>
                      </div>
                      <div className="flex flex-col items-center">
                        <div className="w-px h-4 bg-gray-700" />
                        <div className="bg-cyan-900/10 border border-cyan-800/30 rounded-lg px-3 py-2 text-center w-full">
                          <div className="text-[11px] font-medium text-cyan-300">David Kim</div>
                          <div className="text-[9px] text-gray-500">HR</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
