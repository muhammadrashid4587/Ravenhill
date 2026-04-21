"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

const PROD_API = "https://ravenhill-api.fly.dev";
function resolveApiBase(): string {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (
      host === "raven-hill.org" ||
      host === "www.raven-hill.org" ||
      host.endsWith(".vercel.app")
    ) {
      return PROD_API;
    }
  }
  const fromEnv = (process.env.NEXT_PUBLIC_API_URL || "")
    .trim()
    .replace(/\/+$/, "");
  return fromEnv || "http://localhost:8000";
}
const SESSION_COOKIE = "ravenhill_session";
function clearMiddlewareCookie() {
  if (typeof document === "undefined") return;
  document.cookie = `${SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

/**
 * Agent shape used across the app.
 *
 * The `/api/auth/me` endpoint populates the identity-relevant subset
 * (id/name/email/role/departments/scopes). List/detail pages hydrate the
 * richer optional fields via /api/agents.
 */
export interface Agent {
  id: string;
  name: string;
  email: string;
  role: string;
  departments: string[];
  scopes: string[];
  role_description?: string;
  knowledge_areas?: string[];
  knowledge_base?: string;
  is_active?: boolean;
}

interface AuthContextValue {
  agent: Agent | null;
  loading: boolean;
  isAuthenticated: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  agent: null,
  loading: true,
  isAuthenticated: false,
  refresh: async () => {},
  logout: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${resolveApiBase()}/api/auth/me`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!mountedRef.current) return;
      if (res.ok) {
        const data = await res.json();
        setAgent(data.agent);
      } else {
        setAgent(null);
      }
    } catch {
      if (!mountedRef.current) return;
      setAgent(null);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(`${resolveApiBase()}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // ignore — worst case the cookie stays until expiry
    }
    clearMiddlewareCookie();
    setAgent(null);
    // Full navigation so any in-memory state tied to the session is dropped.
    if (typeof window !== "undefined") {
      window.location.href = "/";
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    return () => {
      mountedRef.current = false;
    };
  }, [refresh]);

  return (
    <AuthContext.Provider
      value={{
        agent,
        loading,
        isAuthenticated: agent !== null,
        refresh,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
