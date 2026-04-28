"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Hash,
  Lock,
  Loader2,
  MessageSquare,
  AlertCircle,
} from "lucide-react";
import {
  fetchSlackStatus,
  listSlackChannels,
  listSlackChannelMessages,
  type SlackChannel,
  type SlackChannelMessage,
  type SlackStatus,
} from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";

export default function SlackChannelsPage() {
  const { agent: myAgent } = useAuth();
  const [status, setStatus] = useState<SlackStatus | null>(null);
  const [channels, setChannels] = useState<SlackChannel[] | null>(null);
  const [channelsError, setChannelsError] = useState<string | null>(null);
  const [activeChannel, setActiveChannel] = useState<SlackChannel | null>(null);
  const [messages, setMessages] = useState<SlackChannelMessage[] | null>(null);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!myAgent?.id) return;
    fetchSlackStatus(myAgent.id)
      .then((s) => {
        setStatus(s);
        if (s.connected) {
          listSlackChannels(myAgent.id)
            .then((res) => setChannels(res.channels || []))
            .catch((e) =>
              setChannelsError(
                e instanceof Error ? e.message : "Failed to load channels.",
              ),
            );
        }
      })
      .catch(() => setStatus(null));
  }, [myAgent?.id]);

  useEffect(() => {
    if (!activeChannel || !myAgent?.id) return;
    setMessagesLoading(true);
    setMessages(null);
    setMessagesError(null);
    listSlackChannelMessages(myAgent.id, activeChannel.id)
      .then((res) => setMessages(res.messages || []))
      .catch((e) =>
        setMessagesError(
          e instanceof Error ? e.message : "Failed to load messages.",
        ),
      )
      .finally(() => setMessagesLoading(false));
  }, [activeChannel, myAgent?.id]);

  const filteredChannels = useMemo(() => {
    if (!channels) return null;
    const q = query.trim().toLowerCase();
    if (!q) return channels;
    return channels.filter((c) => c.name.toLowerCase().includes(q));
  }, [channels, query]);

  if (!myAgent) {
    return (
      <div className="min-h-screen bg-obsidian text-parchment flex items-center justify-center">
        <div className="text-sm text-dusk">Sign in to view your Slack channels.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-obsidian text-parchment">
      <header className="border-b border-white/[0.06] px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <Link
              href="/settings"
              className="inline-flex items-center gap-1 text-[11px] text-dusk hover:text-smoke"
            >
              <ArrowLeft className="w-3 h-3" /> Settings
            </Link>
            <h1 className="text-lg font-semibold text-bone mt-1">Slack</h1>
            <p className="text-[11px] text-smoke">
              {status?.connected
                ? `Connected to ${status.team_name ?? "your workspace"}.`
                : "Not connected."}
            </p>
          </div>
        </div>
      </header>

      {!status?.connected ? (
        <div className="max-w-5xl mx-auto p-6">
          <div className="rounded-xl border border-white/[0.06] bg-ink p-5">
            <p className="text-sm text-smoke">
              You haven&apos;t connected Slack yet.
            </p>
            <Link
              href="/settings"
              className="inline-block mt-3 text-xs text-claret hover:text-[#D6596C]"
            >
              Connect from Settings →
            </Link>
          </div>
        </div>
      ) : (
        <div className="max-w-5xl mx-auto p-6 grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4">
          {/* Channel list */}
          <aside className="bg-ink border border-white/[0.06] rounded-xl p-3 h-fit">
            <input
              type="text"
              placeholder="Search channels…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-graphite border border-white/[0.06] rounded-md px-2.5 py-1.5 text-[12px] text-parchment placeholder:text-dusk outline-none focus:border-claret/40"
            />
            <div className="mt-3 max-h-[60vh] overflow-y-auto -mx-1 px-1">
              {channelsError ? (
                <div className="flex items-start gap-2 text-[11px] text-red-300 px-2 py-2">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>{channelsError}</span>
                </div>
              ) : !filteredChannels ? (
                <div className="flex items-center gap-2 text-[11px] text-dusk px-2 py-3">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Loading channels…
                </div>
              ) : filteredChannels.length === 0 ? (
                <p className="text-[11px] text-dusk px-2 py-3">
                  No channels match.
                </p>
              ) : (
                <ul className="space-y-0.5">
                  {filteredChannels.map((c) => {
                    const active = activeChannel?.id === c.id;
                    return (
                      <li key={c.id}>
                        <button
                          onClick={() => setActiveChannel(c)}
                          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-[12px] transition ${
                            active
                              ? "bg-claret/15 text-bone"
                              : "text-parchment hover:bg-white/[0.03]"
                          }`}
                        >
                          {c.is_private ? (
                            <Lock className="w-3 h-3 text-dusk" />
                          ) : (
                            <Hash className="w-3 h-3 text-dusk" />
                          )}
                          <span className="truncate flex-1">{c.name}</span>
                          {c.num_members > 0 && (
                            <span className="text-[10px] text-dusk font-mono">
                              {c.num_members}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </aside>

          {/* Messages */}
          <main className="bg-ink border border-white/[0.06] rounded-xl p-4 min-h-[60vh]">
            {!activeChannel ? (
              <div className="flex flex-col items-center justify-center text-center py-16">
                <MessageSquare className="w-6 h-6 text-dusk mb-2" />
                <p className="text-sm text-smoke">
                  Pick a channel to see recent messages.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 border-b border-white/[0.06] pb-3 mb-3">
                  {activeChannel.is_private ? (
                    <Lock className="w-3.5 h-3.5 text-dusk" />
                  ) : (
                    <Hash className="w-3.5 h-3.5 text-dusk" />
                  )}
                  <h2 className="text-sm font-medium text-bone">
                    {activeChannel.name}
                  </h2>
                  {activeChannel.topic && (
                    <span className="text-[11px] text-dusk truncate">
                      — {activeChannel.topic}
                    </span>
                  )}
                </div>

                {messagesError ? (
                  <div className="flex items-start gap-2 text-[12px] text-red-300">
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>{messagesError}</span>
                  </div>
                ) : messagesLoading ? (
                  <div className="flex items-center gap-2 text-[12px] text-dusk">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Loading messages…
                  </div>
                ) : !messages || messages.length === 0 ? (
                  <p className="text-[12px] text-dusk">
                    No recent messages in this channel.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {messages.map((m) => (
                      <li
                        key={m.ts}
                        className="text-[12px] text-parchment leading-relaxed"
                      >
                        <div className="flex items-baseline gap-2 mb-0.5">
                          <span className="text-[10px] font-mono text-dusk">
                            {formatSlackTs(m.ts)}
                          </span>
                          {m.user && (
                            <span className="text-[11px] text-smoke">
                              {m.user}
                            </span>
                          )}
                        </div>
                        <div className="whitespace-pre-wrap">{m.text}</div>
                        {m.reply_count > 0 && (
                          <div className="text-[10px] text-dusk mt-0.5">
                            {m.reply_count} {m.reply_count === 1 ? "reply" : "replies"}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </main>
        </div>
      )}
    </div>
  );
}

function formatSlackTs(ts: string): string {
  const sec = parseFloat(ts);
  if (Number.isNaN(sec)) return ts;
  try {
    return new Date(sec * 1000).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}
