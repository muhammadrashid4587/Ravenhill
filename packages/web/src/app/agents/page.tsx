"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Search, Plus, X, Pencil, Trash2, MessageSquare } from "lucide-react";
import {
  fetchAgents,
  createAgent,
  updateAgent,
  deleteAgent,
  CreateAgentPayload,
} from "@/lib/api";
import AgentPicker from "@/components/AgentPicker";
import { useAgent } from "@/lib/AgentContext";
import type { Agent } from "@/lib/AgentContext";

const DEPT_COLORS: Record<string, string> = {
  Sales: "bg-blue-500",
  Finance: "bg-purple-500",
  Marketing: "bg-emerald-500",
  Engineering: "bg-orange-500",
  Product: "bg-pink-500",
  HR: "bg-cyan-500",
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

const EMPTY_FORM: CreateAgentPayload = {
  name: "",
  role: "",
  departments: [],
  knowledge_areas: [],
  knowledge_base: "",
  scopes: ["read:public"],
};

export default function AgentsPage() {
  return (
    <Suspense>
      <AgentsPageInner />
    </Suspense>
  );
}

function AgentsPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { setMyAgent } = useAgent();

  const [agents, setAgents] = useState<Agent[]>([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateAgentPayload>(EMPTY_FORM);
  const [areasInput, setAreasInput] = useState("");
  const [saving, setSaving] = useState(false);

  // Open picker modal when navigated here with ?pick=true
  useEffect(() => {
    if (searchParams.get("pick") === "true") {
      setShowPicker(true);
    }
  }, [searchParams]);

  const handlePickAgent = (agent: Agent) => {
    setMyAgent(agent);
    setShowPicker(false);
    router.replace("/agents");
  };

  const handleClosePicker = () => {
    setShowPicker(false);
    router.replace("/agents");
  };

  const loadAgents = useCallback(() => {
    fetchAgents()
      .then((data: Agent[]) => setAgents(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  const filtered = agents.filter(
    (a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      (a.departments?.[0] ?? "").toLowerCase().includes(search.toLowerCase()) ||
      a.role.toLowerCase().includes(search.toLowerCase()),
  );

  const onlineCount = agents.filter((a) => a.is_active).length;

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setAreasInput("");
    setShowForm(true);
  };

  const openEdit = (agent: Agent) => {
    setEditingId(agent.id);
    setForm({
      name: agent.name,
      role: agent.role,
      departments: agent.departments,
      knowledge_areas: agent.knowledge_areas,
      knowledge_base: agent.knowledge_base,
      scopes: agent.scopes,
    });
    setAreasInput(agent.knowledge_areas.join(", "));
    setShowForm(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      ...form,
      knowledge_areas: areasInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };

    try {
      if (editingId) {
        await updateAgent(editingId, payload);
      } else {
        await createAgent(payload);
      }
      setShowForm(false);
      loadAgents();
    } catch {
      // TODO: show error toast
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete agent "${name}"? This cannot be undone.`)) return;
    try {
      await deleteAgent(id);
      loadAgents();
    } catch {
      // TODO: show error toast
    }
  };

  const handleToggleActive = async (agent: Agent) => {
    try {
      await updateAgent(agent.id, { is_active: !agent.is_active });
      loadAgents();
    } catch {
      // TODO: show error toast
    }
  };

  return (
    <div className="p-8 max-w-6xl page-gradient">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-100 mb-1">
            Agents
          </h1>
          <p className="text-sm text-zinc-500">
            Manage your AI workforce &middot; {agents.length} agents
            &middot; {onlineCount} online
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-violet-500 hover:from-blue-400 hover:to-violet-400 px-4 py-2 rounded-lg text-sm font-medium text-white transition"
        >
          <Plus className="w-4 h-4" />
          Add Agent
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-6 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
        <input
          type="text"
          placeholder="Search agents by name, role, or department..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg pl-9 pr-3 py-2 text-sm text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-white/[0.15] transition"
        />
      </div>

      {/* Agent Grid */}
      <div className="grid grid-cols-3 gap-4">
        {filtered.map((agent) => (
          <div
            key={agent.id}
            className="glass rounded-xl p-5 hover:bg-white/[0.05] hover:border-white/[0.1] transition-all duration-200 cursor-default group"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-full ${DEPT_COLORS[agent.departments?.[0]] ?? "bg-zinc-600"} flex items-center justify-center text-sm font-semibold text-white shrink-0`}
                >
                  {getInitials(agent.name)}
                </div>
                <div>
                  <div className="text-sm font-medium text-zinc-100">
                    {agent.name}
                  </div>
                  <div className="text-xs text-zinc-500">{agent.role}</div>
                </div>
              </div>
              <button
                onClick={() => handleToggleActive(agent)}
                className="flex items-center gap-1.5"
                title={agent.is_active ? "Set offline" : "Set online"}
              >
                <span
                  className={`w-2 h-2 rounded-full ${agent.is_active ? "bg-emerald-500" : "bg-zinc-600"}`}
                />
                <span className="text-[11px] text-zinc-500">
                  {agent.is_active ? "Online" : "Offline"}
                </span>
              </button>
            </div>

            {/* Department + Knowledge pills */}
            <div className="flex items-center gap-1.5 flex-wrap mb-4">
              <span className="bg-white/[0.06] rounded-full px-2 py-0.5 text-[11px] text-zinc-400">
                {agent.departments?.[0]}
              </span>
              {agent.knowledge_areas.slice(0, 3).map((area) => (
                <span
                  key={area}
                  className="bg-white/[0.06] rounded-full px-2 py-0.5 text-[11px] text-zinc-400"
                >
                  {area}
                </span>
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition">
              <button
                onClick={() => router.push(`/chat`)}
                className="hover:bg-white/[0.06] text-zinc-400 hover:text-zinc-200 rounded-lg px-3 py-1.5 text-sm flex items-center gap-1 transition"
              >
                <MessageSquare className="w-3 h-3" /> Chat
              </button>
              <button
                onClick={() => openEdit(agent)}
                className="hover:bg-white/[0.06] text-zinc-400 hover:text-zinc-200 rounded-lg px-3 py-1.5 text-sm flex items-center gap-1 transition"
              >
                <Pencil className="w-3 h-3" /> Edit
              </button>
              <button
                onClick={() => handleDelete(agent.id, agent.name)}
                className="hover:bg-white/[0.06] text-zinc-400 hover:text-red-400 rounded-lg px-3 py-1.5 text-sm flex items-center gap-1 transition"
              >
                <Trash2 className="w-3 h-3" /> Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-zinc-600 text-sm">
          No agents match your search.
        </div>
      )}

      {/* Create / Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="glass rounded-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-zinc-100">
                {editingId ? "Edit Agent" : "Create Agent"}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="text-zinc-500 hover:text-zinc-200 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Jordan Chen"
                    className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-white/[0.15] transition placeholder:text-zinc-600"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">
                    Department
                  </label>
                  <input
                    type="text"
                    value={form.departments?.[0] ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        departments: e.target.value ? [e.target.value] : [],
                      })
                    }
                    placeholder="e.g. Sales"
                    className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-white/[0.15] transition placeholder:text-zinc-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-zinc-500 mb-1">Role</label>
                <input
                  type="text"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  placeholder="e.g. Senior Sales Representative"
                  className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-white/[0.15] transition placeholder:text-zinc-600"
                />
              </div>

              <div>
                <label className="block text-xs text-zinc-500 mb-1">
                  Knowledge Areas (comma-separated)
                </label>
                <input
                  type="text"
                  value={areasInput}
                  onChange={(e) => setAreasInput(e.target.value)}
                  placeholder="e.g. pipeline, accounts, revenue targets"
                  className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-white/[0.15] transition placeholder:text-zinc-600"
                />
              </div>

              <div>
                <label className="block text-xs text-zinc-500 mb-1">
                  Knowledge Base
                </label>
                <textarea
                  value={form.knowledge_base}
                  onChange={(e) =>
                    setForm({ ...form, knowledge_base: e.target.value })
                  }
                  placeholder="What does this agent know? One fact per line."
                  rows={4}
                  className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-white/[0.15] resize-none transition placeholder:text-zinc-600"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowForm(false)}
                className="bg-white/[0.06] hover:bg-white/[0.1] text-zinc-300 rounded-lg px-4 py-2 text-sm transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={
                  saving || !form.name || !form.role || !form.departments?.length
                }
                className="bg-gradient-to-r from-blue-500 to-violet-500 hover:from-blue-400 hover:to-violet-400 disabled:opacity-30 disabled:cursor-not-allowed px-5 py-2 rounded-lg text-sm font-medium text-white transition"
              >
                {saving
                  ? "Saving..."
                  : editingId
                    ? "Update Agent"
                    : "Create Agent"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Agent Picker Modal */}
      <AgentPicker
        open={showPicker}
        onSelect={handlePickAgent}
        onClose={handleClosePicker}
      />
    </div>
  );
}
