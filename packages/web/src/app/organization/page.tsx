"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  MessageSquare,
  Search,
  Users,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { useAgent, type Agent } from "@/lib/AgentContext";
import { fetchAgents } from "@/lib/api";

const DEPT_COLORS: Record<string, string> = {
  "Executive": "bg-amber-500",
  "Sales": "bg-blue-500",
  "Finance": "bg-purple-500",
  "Marketing": "bg-emerald-500",
  "Engineering": "bg-orange-500",
  "Product": "bg-pink-500",
  "Operations": "bg-cyan-500",
  "HR": "bg-teal-500",
};

const DEPT_BORDER_COLORS: Record<string, string> = {
  "Executive": "border-amber-500/30",
  "Sales": "border-blue-500/30",
  "Finance": "border-purple-500/30",
  "Marketing": "border-emerald-500/30",
  "Engineering": "border-orange-500/30",
  "Product": "border-pink-500/30",
  "Operations": "border-cyan-500/30",
  "HR": "border-teal-500/30",
};

const DEPT_GLOW_COLORS: Record<string, string> = {
  "Executive": "hover:shadow-[0_0_25px_-5px_rgba(251,191,36,0.12)]",
  "Sales": "hover:shadow-[0_0_25px_-5px_rgba(59,130,246,0.12)]",
  "Finance": "hover:shadow-[0_0_25px_-5px_rgba(139,92,246,0.12)]",
  "Marketing": "hover:shadow-[0_0_25px_-5px_rgba(52,211,153,0.12)]",
  "Engineering": "hover:shadow-[0_0_25px_-5px_rgba(249,115,22,0.12)]",
  "Product": "hover:shadow-[0_0_25px_-5px_rgba(236,72,153,0.12)]",
  "Operations": "hover:shadow-[0_0_25px_-5px_rgba(34,211,238,0.12)]",
  "HR": "hover:shadow-[0_0_25px_-5px_rgba(45,212,191,0.12)]",
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export default function OrganizationPage() {
  const router = useRouter();
  const { myAgent } = useAgent();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "department">("department");

  useEffect(() => {
    fetchAgents()
      .then(setAgents)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = agents.filter(
    (a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.role.toLowerCase().includes(search.toLowerCase()) ||
      a.departments?.some((d) => d.toLowerCase().includes(search.toLowerCase())) ||
      a.knowledge_areas?.some((k) => k.toLowerCase().includes(search.toLowerCase())),
  );

  // Group by department
  const byDepartment: Record<string, Agent[]> = {};
  for (const agent of filtered) {
    const dept = agent.departments?.[0] || "Other";
    if (!byDepartment[dept]) byDepartment[dept] = [];
    byDepartment[dept].push(agent);
  }

  const handleReachOut = (agent: Agent) => {
    // Navigate to chat with a pre-filled intent to reach this person
    router.push(`/chat?to=${agent.id}`);
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      {/* Header */}
      <header className="border-b border-white/[0.06] px-6 py-4 animate-fade-up">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold font-display">Organization</h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              {agents.length} people in the organization — reach out through your agent
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setView("department")}
              className={`px-3 py-1.5 rounded-md text-xs transition press-scale ${
                view === "department"
                  ? "bg-elevated text-white"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              By Department
            </button>
            <button
              onClick={() => setView("grid")}
              className={`px-3 py-1.5 rounded-md text-xs transition press-scale ${
                view === "grid"
                  ? "bg-elevated text-white"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Grid
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="mt-3 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, role, department, or expertise..."
            className="w-full bg-surface border border-white/[0.06] rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none input-focus-glow transition placeholder:text-zinc-600"
          />
        </div>
      </header>

      {/* Content */}
      <div className="p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <Users className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
            <p className="text-sm text-zinc-500">
              {search ? "No people match your search" : "No agents in the organization"}
            </p>
          </div>
        ) : view === "department" ? (
          <div className="space-y-8">
            {Object.entries(byDepartment).map(([dept, deptAgents], deptIdx) => (
              <div key={dept} className="animate-fade-up" style={{ animationDelay: `${deptIdx * 80}ms` }}>
                <div className="flex items-center gap-2 mb-3">
                  <div
                    className={`w-2 h-2 rounded-full ${DEPT_COLORS[dept] || "bg-zinc-500"}`}
                  />
                  <h2 className="text-sm font-medium text-zinc-300 font-display">{dept}</h2>
                  <span className="text-[11px] text-zinc-600">
                    {deptAgents.length} {deptAgents.length === 1 ? "person" : "people"}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 stagger">
                  {deptAgents.map((agent) => (
                    <AgentCard
                      key={agent.id}
                      agent={agent}
                      isMe={myAgent?.id === agent.id}
                      onReachOut={() => handleReachOut(agent)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 stagger">
            {filtered.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                isMe={myAgent?.id === agent.id}
                onReachOut={() => handleReachOut(agent)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AgentCard({
  agent,
  isMe,
  onReachOut,
}: {
  agent: Agent;
  isMe: boolean;
  onReachOut: () => void;
}) {
  const dept = agent.departments?.[0] || "Other";
  const color = DEPT_COLORS[dept] || "bg-zinc-500";
  const borderColor = DEPT_BORDER_COLORS[dept] || "border-zinc-500/30";
  const glowColor = DEPT_GLOW_COLORS[dept] || "";

  return (
    <div
      className={`bg-surface border rounded-xl p-4 transition-all duration-300 card-lift hover-glow animate-fade-up ${glowColor} ${
        isMe ? `${borderColor} border-2` : "border-white/[0.06] hover:border-white/[0.12]"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div
          className={`w-10 h-10 rounded-full ${color} flex items-center justify-center text-xs font-bold text-white shrink-0`}
        >
          {getInitials(agent.name)}
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-white truncate">
              {agent.name}
            </h3>
            {isMe && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                You
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500 truncate">{agent.role}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full bg-elevated text-zinc-400`}
            >
              {dept}
            </span>
            {agent.is_active ? (
              <span className="flex items-center gap-1 text-[10px] text-emerald-500">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Active
              </span>
            ) : (
              <span className="text-[10px] text-zinc-600">Inactive</span>
            )}
          </div>
        </div>
      </div>

      {/* Knowledge areas */}
      {agent.knowledge_areas && agent.knowledge_areas.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {agent.knowledge_areas.slice(0, 4).map((area) => (
            <span
              key={area}
              className="text-[10px] px-1.5 py-0.5 rounded bg-elevated text-zinc-500"
            >
              {area}
            </span>
          ))}
          {agent.knowledge_areas.length > 4 && (
            <span className="text-[10px] text-zinc-600">
              +{agent.knowledge_areas.length - 4} more
            </span>
          )}
        </div>
      )}

      {/* Actions */}
      {!isMe && (
        <div className="mt-3 pt-3 border-t border-white/[0.06]">
          <button
            onClick={onReachOut}
            className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition press-scale"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Reach out via agent
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}
