"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Inbox,
  Search,
  Mail,
  ExternalLink,
  Sparkles,
  CheckCircle2,
  Circle,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import {
  fetchGmailThreads,
  fetchGoogleStatus,
  ingestGmailTopics,
  type GoogleStatus,
} from "@/lib/api";
import type { WorkspaceEmail } from "@/lib/types";

interface IngestResult {
  threads_scanned: number;
  topics_detected: string[];
  connected: boolean;
}

function formatReceived(iso: string) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const diff = Date.now() - d.getTime();
    if (diff < 3600_000) return `${Math.max(1, Math.round(diff / 60_000))}m ago`;
    if (diff < 86400_000) return `${Math.round(diff / 3600_000)}h ago`;
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

export default function InboxPage() {
  const { agent: myAgent } = useAuth();
  const [threads, setThreads] = useState<WorkspaceEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<WorkspaceEmail | null>(null);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [ingesting, setIngesting] = useState(false);
  const [ingest, setIngest] = useState<IngestResult | null>(null);
  const [google, setGoogle] = useState<GoogleStatus | null>(null);

  useEffect(() => {
    fetchGmailThreads(myAgent?.id)
      .then(setThreads)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [myAgent]);

  useEffect(() => {
    fetchGoogleStatus(myAgent?.id)
      .then(setGoogle)
      .catch(() => setGoogle(null));
  }, [myAgent]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return threads
      .filter((t) => (filter === "unread" ? t.unread : true))
      .filter((t) => {
        if (!q) return true;
        return (
          t.subject.toLowerCase().includes(q) ||
          t.from.toLowerCase().includes(q) ||
          t.snippet.toLowerCase().includes(q)
        );
      });
  }, [threads, search, filter]);

  const unreadCount = threads.filter((t) => t.unread).length;

  const handleIngest = async () => {
    setIngesting(true);
    try {
      const res = await ingestGmailTopics(myAgent?.id);
      setIngest(res as IngestResult);
    } catch {
      setIngest(null);
    } finally {
      setIngesting(false);
    }
  };

  return (
    <div className="min-h-screen bg-obsidian text-parchment">
      <header className="border-b border-white/[0.06] px-6 py-4 animate-fade-up">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-bone flex items-center gap-2">
              <Inbox className="w-4 h-4 text-claret" /> Inbox
            </h1>
            <p className="text-xs text-smoke mt-0.5">
              Gmail threads your agent can see — read-only in V1
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleIngest}
              disabled={ingesting}
              className="flex items-center gap-1.5 text-xs bg-oxblood hover:bg-claret text-bone rounded-md px-3 py-1.5 transition disabled:opacity-50"
            >
              {ingesting ? (
                <>
                  <span className="w-3 h-3 border-2 border-bone border-t-transparent rounded-full animate-spin" />
                  Ingesting…
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" /> Ingest into graph
                </>
              )}
            </button>
            <div
              role="tablist"
              aria-label="Filter"
              className="flex items-center bg-ink border border-white/[0.06] rounded-lg p-0.5"
            >
              <button
                role="tab"
                aria-selected={filter === "all"}
                onClick={() => setFilter("all")}
                className={`text-[11px] px-2.5 py-1 rounded-md transition ${
                  filter === "all"
                    ? "bg-white/[0.08] text-bone"
                    : "text-smoke hover:text-parchment"
                }`}
              >
                All {threads.length}
              </button>
              <button
                role="tab"
                aria-selected={filter === "unread"}
                onClick={() => setFilter("unread")}
                className={`text-[11px] px-2.5 py-1 rounded-md transition ${
                  filter === "unread"
                    ? "bg-white/[0.08] text-bone"
                    : "text-smoke hover:text-parchment"
                }`}
              >
                Unread {unreadCount}
              </button>
            </div>
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-dusk" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search subject, sender, snippet…"
                className="w-full bg-ink border border-white/[0.06] rounded-lg pl-9 pr-3 py-1.5 text-xs text-parchment input-focus-glow placeholder:text-dusk"
              />
            </div>
          </div>
        </div>

        {ingest && (
          <div className="mt-3 bg-ink border border-[rgba(34,197,94,0.30)] rounded-lg px-3 py-2 flex items-center gap-2 flex-wrap">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#4ADE80]" />
            <span className="text-xs text-bone">
              Scanned {ingest.threads_scanned} threads · {ingest.topics_detected.length} topics forwarded to the graph
              {!ingest.connected && " — connect Gmail in Settings to scan real threads"}
            </span>
            <div className="flex items-center gap-1 flex-wrap ml-auto">
              {ingest.topics_detected.slice(0, 6).map((t) => (
                <span
                  key={t}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.04] text-smoke border border-white/[0.08]"
                >
                  {t}
                </span>
              ))}
              {ingest.topics_detected.length > 6 && (
                <span className="text-[10px] text-dusk">+{ingest.topics_detected.length - 6}</span>
              )}
            </div>
          </div>
        )}
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-12 min-h-[calc(100vh-65px)]">
          <section className="col-span-12 md:col-span-7 border-r border-white/[0.06] p-5">
            {filtered.length === 0 ? (
              <div className="bg-ink border border-white/[0.06] rounded-xl p-10 text-center">
                <Mail className="w-7 h-7 text-dusk mx-auto mb-3" />
                {search || filter === "unread" ? (
                  <p className="text-sm text-smoke">No threads match</p>
                ) : threads.length === 0 && google && !google.connected ? (
                  <>
                    <p className="text-sm text-bone mb-1">Connect Gmail to see threads</p>
                    <p className="text-xs text-smoke max-w-xs mx-auto mb-4">
                      Your agent reads Gmail in read-only mode and surfaces
                      threads it can act on here.
                    </p>
                    <Link
                      href="/settings"
                      className="inline-flex items-center gap-1.5 text-xs bg-oxblood hover:bg-claret text-bone rounded-md px-3 py-1.5 transition"
                    >
                      Open Settings
                      <ChevronRight className="w-3 h-3" />
                    </Link>
                  </>
                ) : (
                  <p className="text-sm text-smoke">Inbox zero</p>
                )}
              </div>
            ) : (
              <div className="space-y-1.5 stagger">
                {filtered.map((t) => {
                  const active = selected?.id === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setSelected(t)}
                      className={`w-full text-left rounded-lg px-4 py-3 transition animate-fade-up border ${
                        active
                          ? "bg-white/[0.06] border-claret/40"
                          : "bg-ink border-white/[0.06] hover:border-white/[0.14]"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {t.unread ? (
                          <span className="w-1.5 h-1.5 rounded-full bg-claret mt-2 shrink-0" />
                        ) : (
                          <Circle className="w-2 h-2 text-dusk mt-1.5 shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-sm truncate ${
                                t.unread ? "text-bone font-medium" : "text-parchment"
                              }`}
                            >
                              {t.subject}
                            </span>
                            <span className="text-[10px] text-dusk ml-auto shrink-0">
                              {formatReceived(t.received_at)}
                            </span>
                          </div>
                          <div className="text-[11px] text-dusk truncate">
                            {t.from}
                          </div>
                          <p className="text-xs text-smoke line-clamp-1 mt-0.5">
                            {t.snippet}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <aside className="col-span-12 md:col-span-5 p-5 bg-ink/30">
            {selected ? (
              <ThreadPreview thread={selected} />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <Mail className="w-8 h-8 text-dusk mb-3" />
                <p className="text-xs text-smoke">
                  Select a thread to see the preview
                </p>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

function ThreadPreview({ thread }: { thread: WorkspaceEmail }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-medium text-bone break-words">
          {thread.subject}
        </h2>
        <p className="text-[11px] text-dusk mt-1">
          {thread.from} · {formatReceived(thread.received_at)}
        </p>
      </div>
      <div className="bg-ink border border-white/[0.06] rounded-lg p-3">
        <p className="text-xs text-parchment leading-relaxed">
          {thread.snippet}
        </p>
      </div>
      <div className="bg-ink border border-white/[0.06] rounded-lg p-3">
        <p className="text-[10px] uppercase tracking-wide text-dusk mb-2">
          Agent summary
        </p>
        <p className="text-xs text-smoke leading-relaxed">
          When the Gmail adapter is fully connected, the agent will extract
          owners, deadlines, and open questions from the thread — and surface
          them as pending items on your dashboard.
        </p>
      </div>
      <div className="flex gap-2">
        <a
          href={thread.thread_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-1.5 text-xs bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] rounded-md px-3 py-2 transition"
        >
          <ExternalLink className="w-3 h-3" /> Open in Gmail
        </a>
        <Link
          href="/chat"
          className="flex-1 flex items-center justify-center gap-1.5 text-xs bg-oxblood hover:bg-claret text-bone rounded-md px-3 py-2 transition"
        >
          Ask agent about this
        </Link>
      </div>
    </div>
  );
}
