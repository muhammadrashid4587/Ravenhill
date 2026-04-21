"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Loader2, Search, Users } from "lucide-react";
import { useAuth, type Agent } from "@/lib/AuthContext";
import { fetchAgents } from "@/lib/api";

// Three.js pulls in `window` at module init, so load client-only.
const OrgWorld = dynamic(
  () => import("@/components/organization/OrgWorld"),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 text-claret animate-spin" />
      </div>
    ),
  },
);

export default function OrganizationPage() {
  const router = useRouter();
  const { agent: myAgent } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchAgents()
      .then(setAgents)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleReachOut = (agent: Agent) => {
    router.push(`/chat?to=${agent.id}`);
  };

  return (
    <div className="min-h-screen bg-obsidian text-parchment">
      <header className="border-b border-white/[0.06] px-6 py-4 animate-fade-up">
        <div>
          <h1 className="text-lg font-semibold text-bone">Organization</h1>
          <p className="text-xs text-smoke mt-0.5">
            {agents.length} people — drag to orbit, pinch to zoom, click a
            person to reach out
          </p>
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

      <div className="p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-5 h-5 text-claret animate-spin" />
          </div>
        ) : agents.length === 0 ? (
          <div className="text-center py-20">
            <Users className="w-8 h-8 text-dusk mx-auto mb-3" strokeWidth={1.5} />
            <p className="text-sm text-smoke">
              No agents in the organization
            </p>
          </div>
        ) : (
          <OrgWorld
            agents={agents}
            myAgentId={myAgent?.id ?? null}
            myAgentName={myAgent?.name}
            searchQuery={search}
            onSelect={handleReachOut}
          />
        )}
      </div>
    </div>
  );
}
