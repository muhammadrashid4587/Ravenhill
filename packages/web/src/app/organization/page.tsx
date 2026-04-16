"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  MessageSquare,
  Search,
  Users,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { useAgent, type Agent } from "@/lib/AgentContext";
import { fetchAgents } from "@/lib/api";
import DeptAvatar from "@/components/ui/DeptAvatar";
import Chip from "@/components/ui/Chip";

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

  const byDepartment: Record<string, Agent[]> = {};
  for (const agent of filtered) {
    const dept = agent.departments?.[0] || "Other";
    if (!byDepartment[dept]) byDepartment[dept] = [];
    byDepartment[dept].push(agent);
  }

  const handleReachOut = (agent: Agent) => {
    router.push(`/chat?to=${agent.id}`);
  };

  const toggleBtn = (active: boolean) =>
    `px-3 py-1.5 rounded-md text-xs transition press-scale ${
      active
        ? "bg-graphite text-bone border border-white/[0.08]"
        : "text-smoke hover:text-parchment"
    }`;

  return (
    <div className="min-h-screen bg-obsidian text-parchment">
      {/* Header */}
      <header className="border-b border-white/[0.06] px-6 py-4 animate-fade-up">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-bone">Organization</h1>
            <p className="text-xs text-smoke mt-0.5">
              {agents.length} people in the organization — reach out through your agent
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setView("department")} className={toggleBtn(view === "department")}>
              By department
            </button>
            <button onClick={() => setView("grid")} className={toggleBtn(view === "grid")}>
              Grid
            </button>
          </div>
        </div>

        <div className="mt-3 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dusk" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, role, department, or expertise…"
            className="w-full bg-ink border border-white/[0.06] rounded-lg pl-10 pr-4 py-2 text-sm text-parchment input-focus-glow transition placeholder:text-dusk"
          />
        </div>
      </header>

      {/* Content */}
      <div className="p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-5 h-5 text-claret animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <Users className="w-8 h-8 text-dusk mx-auto mb-3" strokeWidth={1.5} />
            <p className="text-sm text-smoke">
              {search ? "No people match your search" : "No agents in the organization"}
            </p>
          </div>
        ) : view === "department" ? (
          <div className="space-y-8">
            {Object.entries(byDepartment).map(([dept, deptAgents], deptIdx) => (
              <div
                key={dept}
                className="animate-fade-up"
                style={{ animationDelay: `${deptIdx * 80}ms` }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-1 h-4 rounded-sm bg-oxblood" />
                  <h2 className="text-sm font-medium text-parchment">{dept}</h2>
                  <span className="text-[11px] text-dusk font-mono">
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

  return (
    <div
      className={`bg-ink border rounded-xl p-4 transition card-lift hover-glow animate-fade-up ${
        isMe
          ? "border-oxblood/50 shadow-[0_0_24px_-8px_rgba(139,30,47,0.35)]"
          : "border-white/[0.06] hover:border-white/[0.12]"
      }`}
    >
      <div className="flex items-start gap-3">
        <DeptAvatar name={agent.name} size="md" />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-bone truncate">
              {agent.name}
            </h3>
            {isMe && <Chip tone="brand">You</Chip>}
          </div>
          <p className="text-xs text-smoke truncate">{agent.role}</p>
          <div className="flex items-center gap-1.5 mt-1.5">
            <Chip>{dept}</Chip>
            {agent.is_active ? (
              <span className="flex items-center gap-1 text-[10px] text-[#88D3A4]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#3FA46A]" />
                Active
              </span>
            ) : (
              <span className="text-[10px] text-dusk">Inactive</span>
            )}
          </div>
        </div>
      </div>

      {agent.knowledge_areas && agent.knowledge_areas.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {agent.knowledge_areas.slice(0, 4).map((area) => (
            <span
              key={area}
              className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.04] text-smoke border border-white/[0.06]"
            >
              {area}
            </span>
          ))}
          {agent.knowledge_areas.length > 4 && (
            <span className="text-[10px] text-dusk">
              +{agent.knowledge_areas.length - 4} more
            </span>
          )}
        </div>
      )}

      {!isMe && (
        <div className="mt-3 pt-3 border-t border-white/[0.06]">
          <button
            onClick={onReachOut}
            className="flex items-center gap-1.5 text-xs text-claret hover:text-[#D6596C] transition press-scale"
          >
            <MessageSquare className="w-3.5 h-3.5" strokeWidth={1.75} />
            Reach out via agent
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}
