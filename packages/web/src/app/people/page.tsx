"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, Mail, RefreshCw, AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { fetchPeople, type Person } from "@/lib/api";
import DeptAvatar from "@/components/ui/DeptAvatar";

export default function PeoplePage() {
  const { agent: myAgent, loading: authLoading } = useAuth();
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (authLoading || !myAgent) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchPeople()
      .then((data) => {
        if (cancelled) return;
        setPeople(Array.isArray(data) ? data : []);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load people");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [myAgent, authLoading, reloadTick]);

  if (!authLoading && !myAgent) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-parchment">
        <p className="text-sm text-dusk mb-4">Sign in to see your people</p>
        <Link
          href="/login"
          className="bg-parchment text-obsidian px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-bone transition"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const domainOf = (email: string) =>
    email && email.includes("@") ? email.split("@", 2)[1] : "";
  const myDomain = myAgent ? domainOf(myAgent.email || "") : "";

  return (
    <div className="min-h-screen bg-obsidian text-parchment">
      <header className="border-b border-[var(--border)] px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold font-display">People</h1>
          <p className="text-xs text-dusk mt-0.5">
            Ravenhill agents from your Google contacts
            {myDomain ? ` or @${myDomain}` : ""}
          </p>
        </div>
        <button
          onClick={() => setReloadTick((t) => t + 1)}
          className="flex items-center gap-2 bg-ink hover:bg-graphite border border-[var(--border)] px-3.5 py-2 rounded-lg text-xs font-medium transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </header>

      <div className="p-6">
        {error && (
          <div className="mb-4 flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg px-3 py-2.5 text-[12px]">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <span className="w-5 h-5 border-2 border-parchment/30 border-t-parchment rounded-full animate-spin" />
          </div>
        ) : people.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-2xl bg-ink border border-[var(--border)] flex items-center justify-center mb-4">
              <Users className="w-7 h-7 text-dusk" />
            </div>
            <h2 className="text-base font-medium mb-1 font-display">
              No matching people yet
            </h2>
            <p className="text-sm text-smoke max-w-sm mb-6">
              We surface people who (a) have a Ravenhill account and (b) are in
              your Google contacts or share your email domain. Connect Google
              in Settings, or invite a teammate to sign up.
            </p>
            <Link
              href="/settings"
              className="flex items-center gap-2 bg-claret hover:bg-[var(--brand-hover)] px-5 py-2.5 rounded-lg text-sm font-medium text-white transition"
            >
              <Mail className="w-4 h-4" />
              Connect Google
            </Link>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-smoke">
                {people.length} {people.length === 1 ? "person" : "people"}
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {people.map((p) => (
                <div
                  key={p.id}
                  className="bg-ink border border-[var(--border)] hover:border-smoke/20 rounded-xl p-4 transition"
                >
                  <div className="flex items-start gap-3">
                    <DeptAvatar name={p.name} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <h3 className="text-sm font-medium text-bone truncate">
                          {p.name}
                        </h3>
                      </div>
                      <p className="text-[11px] text-dusk truncate">
                        {p.role}
                      </p>
                      <p className="text-[11px] text-smoke truncate font-mono mt-0.5">
                        {p.email}
                      </p>
                      {p.departments.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {p.departments.slice(0, 3).map((d) => (
                            <span
                              key={d}
                              className="text-[10px] px-2 py-0.5 rounded-full bg-graphite text-smoke border border-[var(--border)]"
                            >
                              {d}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1 mt-2">
                        {p.sources.includes("contact") && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/30">
                            in your contacts
                          </span>
                        )}
                        {p.sources.includes("domain") && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                            same domain
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
