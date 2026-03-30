"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { fetchAgents } from "@/lib/api";

const STORAGE_KEY = "ravenhill_agent_id";

export interface Agent {
  id: string;
  name: string;
  role: string;
  departments: string[];
  knowledge_areas: string[];
  knowledge_base: string;
  scopes: string[];
  is_active: boolean;
}

interface AgentContextValue {
  myAgent: Agent | null;
  setMyAgent: (agent: Agent) => void;
  clearAgent: () => void;
}

const AgentContext = createContext<AgentContextValue>({
  myAgent: null,
  setMyAgent: () => {},
  clearAgent: () => {},
});

export function useAgent() {
  return useContext(AgentContext);
}

export function AgentProvider({ children }: { children: ReactNode }) {
  const [myAgent, setMyAgentState] = useState<Agent | null>(null);

  // On mount, restore agent from localStorage
  useEffect(() => {
    const storedId = localStorage.getItem(STORAGE_KEY);
    if (!storedId) return;

    fetchAgents()
      .then((agents: Agent[]) => {
        const match = agents.find((a) => a.id === storedId);
        if (match) {
          setMyAgentState(match);
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      })
      .catch(() => {
        localStorage.removeItem(STORAGE_KEY);
      });
  }, []);

  const setMyAgent = useCallback((agent: Agent) => {
    setMyAgentState(agent);
    localStorage.setItem(STORAGE_KEY, agent.id);
  }, []);

  const clearAgent = useCallback(() => {
    setMyAgentState(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <AgentContext.Provider value={{ myAgent, setMyAgent, clearAgent }}>
      {children}
    </AgentContext.Provider>
  );
}
