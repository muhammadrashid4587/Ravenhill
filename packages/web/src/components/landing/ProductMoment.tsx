"use client";

import { useEffect, useReducer, useRef } from "react";
import { Check } from "lucide-react";

// -----------------------------------------------------------------------------
// ProductMoment — live agent-reasoning animation on the landing page.
//
// One loop: user question appears → reasoning steps tick through → agent
// response types out → pause → loop. Honors `prefers-reduced-motion` by
// rendering the final complete state immediately.
//
// No external libraries. Single rAF loop driven by elapsed time.
// Paused when off-screen (IntersectionObserver) so it doesn't burn the
// main thread on long pages.
// -----------------------------------------------------------------------------

const STEPS = [
  { label: "Classifying question", detail: "Cross-team query" },
  { label: "Resolving topic", detail: "payments · stripe" },
  { label: "Ranking experts", detail: "Sam Torres · 0.82" },
  { label: "Consulting graph", detail: "2 edges · 18 events" },
  { label: "Drafting response", detail: "with sources" },
] as const;

const USER_QUESTION = "Who knows about the Stripe Connect integration?";

// Split the agent response into parts so we can style the highlighted
// terms while still typing character-by-character across the whole thing.
const RESPONSE_PARTS: { text: string; kind: "plain" | "mark" | "break" }[] = [
  { text: "Sam Torres leads the Stripe Connect integration. He's posted the most in ", kind: "plain" },
  { text: "#payments", kind: "mark" },
  { text: " over the last 30 days and owns ", kind: "plain" },
  { text: "API_Integration_Spec_Stripe_Connect.pdf", kind: "mark" },
  { text: ".", kind: "plain" },
  { text: "", kind: "break" },
  { text: "Want me to ask Sam's agent for the current status?", kind: "plain" },
];

const RESPONSE_TOTAL_CHARS = RESPONSE_PARTS
  .filter((p) => p.kind !== "break")
  .reduce((sum, p) => sum + p.text.length, 0);

// Timeline (ms) — tuned by hand. Total loop ≈ 11s.
const T = {
  idle: 0,
  userMsg: 600,
  step0: 1300,
  step1: 1850,
  step2: 2400,
  step3: 2950,
  step4: 3500,
  typingStart: 3650,
  typingEnd: 3650 + 3400, // ~3.4s of typing
  hold: 3650 + 3400 + 3200,
  loop: 3650 + 3400 + 3200, // reset at this point
};

interface Frame {
  showUser: boolean;
  stepProgress: number; // number of completed steps (0..5)
  typingChars: number; // 0..RESPONSE_TOTAL_CHARS
  showAgent: boolean;
  showCursor: boolean;
}

const COMPLETE: Frame = {
  showUser: true,
  stepProgress: 5,
  typingChars: RESPONSE_TOTAL_CHARS,
  showAgent: true,
  showCursor: false,
};

function frameFor(elapsed: number): Frame {
  const e = elapsed % T.loop;
  return {
    showUser: e >= T.userMsg,
    stepProgress: [T.step0, T.step1, T.step2, T.step3, T.step4].filter(
      (t) => e >= t,
    ).length,
    typingChars:
      e < T.typingStart
        ? 0
        : e >= T.typingEnd
          ? RESPONSE_TOTAL_CHARS
          : Math.floor(
              ((e - T.typingStart) / (T.typingEnd - T.typingStart)) *
                RESPONSE_TOTAL_CHARS,
            ),
    showAgent: e >= T.typingStart,
    showCursor: e >= T.typingStart && e < T.typingEnd,
  };
}

function useLiveFrame(reduced: boolean, visible: boolean): Frame {
  // We use a reducer as a cheap force-rerender; actual state lives in a ref
  // for the rAF loop to avoid reducer spam.
  const [, tick] = useReducer((x: number) => x + 1, 0);
  const frameRef = useRef<Frame>(reduced ? COMPLETE : frameFor(0));

  useEffect(() => {
    if (reduced) {
      frameRef.current = COMPLETE;
      tick();
      return;
    }
    if (!visible) return;

    let start = performance.now();
    let raf = 0;
    let lastJson = "";

    const step = (now: number) => {
      const elapsed = now - start;
      const next = frameFor(elapsed);
      const json = JSON.stringify(next);
      if (json !== lastJson) {
        lastJson = json;
        frameRef.current = next;
        tick();
      }
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [reduced, visible]);

  return frameRef.current;
}

// Walk RESPONSE_PARTS, emitting styled spans up to `chars` characters.
function renderTypedResponse(chars: number) {
  const nodes: React.ReactNode[] = [];
  let remaining = chars;

  for (let i = 0; i < RESPONSE_PARTS.length; i++) {
    const part = RESPONSE_PARTS[i];
    if (part.kind === "break") {
      nodes.push(<div key={i} className="h-2" />);
      continue;
    }
    if (remaining <= 0) break;
    const take = Math.min(part.text.length, remaining);
    const slice = part.text.slice(0, take);
    remaining -= take;
    if (part.kind === "mark") {
      nodes.push(
        <span key={i} className="text-claret">
          {slice}
        </span>,
      );
    } else {
      nodes.push(<span key={i}>{slice}</span>);
    }
  }
  return nodes;
}

export default function ProductMoment() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [visibleTick, setVisible] = useReducer(
    (_: boolean, v: boolean) => v,
    true,
  );
  const [reducedTick, setReduced] = useReducer(
    (_: boolean, v: boolean) => v,
    false,
  );

  // IntersectionObserver — only animate while visible.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          setVisible(entry.isIntersecting);
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // prefers-reduced-motion
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, []);

  const frame = useLiveFrame(reducedTick, visibleTick);

  return (
    <div ref={rootRef} className="relative max-w-5xl mx-auto px-6">
      <div className="relative rounded-2xl border border-white/[0.08] bg-ink overflow-hidden shadow-[0_40px_100px_-20px_rgba(0,0,0,0.7)]">
        {/* Chrome */}
        <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-white/[0.06] bg-graphite">
          <span className="w-2.5 h-2.5 rounded-full bg-white/[0.08]" />
          <span className="w-2.5 h-2.5 rounded-full bg-white/[0.08]" />
          <span className="w-2.5 h-2.5 rounded-full bg-white/[0.08]" />
          <span className="ml-3 text-[10px] text-smoke font-mono">
            ravenhill.app / chat
          </span>
          {!reducedTick && (
            <span className="ml-auto flex items-center gap-1.5 text-[10px] text-dusk font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-[#3FA46A] animate-pulse-subtle" />
              live
            </span>
          )}
        </div>

        {/* Three-panel layout */}
        <div className="grid grid-cols-[1fr_280px] min-h-[420px]">
          {/* Main: chat */}
          <div className="border-r border-white/[0.06] p-6 flex flex-col">
            <div className="flex-1 space-y-4 min-h-[300px]">
              {/* User message */}
              {frame.showUser && (
                <div
                  className="flex gap-3 justify-end animate-fade-up"
                  style={{ animationDuration: "350ms" }}
                  key="user-msg"
                >
                  <div className="max-w-[70%] rounded-lg px-3.5 py-2.5 bg-oxblood/90 text-bone text-[13px] leading-relaxed">
                    {USER_QUESTION}
                  </div>
                </div>
              )}

              {/* Agent response */}
              {frame.showAgent && (
                <div
                  className="flex gap-3 animate-fade-up"
                  style={{ animationDuration: "350ms" }}
                  key="agent-msg"
                >
                  <div className="w-7 h-7 rounded-full bg-graphite border border-white/[0.08] flex items-center justify-center text-[9px] font-semibold text-parchment shrink-0">
                    R
                  </div>
                  <div className="flex-1">
                    <div className="text-[11px] text-smoke mb-1">Your agent</div>
                    <div className="rounded-lg px-3.5 py-2.5 bg-graphite border border-white/[0.06] text-[13px] leading-relaxed text-parchment min-h-[48px]">
                      {renderTypedResponse(frame.typingChars)}
                      {frame.showCursor && (
                        <span
                          className="inline-block w-[2px] h-[14px] bg-claret ml-[1px] align-middle"
                          style={{ animation: "type-caret 0.9s steps(2) infinite" }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Pre-typing thinking placeholder so the space doesn't collapse */}
              {frame.showUser && !frame.showAgent && (
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-graphite border border-white/[0.08] flex items-center justify-center text-[9px] font-semibold text-parchment shrink-0">
                    R
                  </div>
                  <div className="flex-1">
                    <div className="text-[11px] text-smoke mb-1">Your agent</div>
                    <div className="rounded-lg px-3.5 py-2.5 bg-graphite/60 border border-white/[0.06] inline-flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-smoke animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-smoke animate-bounce" style={{ animationDelay: "120ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-smoke animate-bounce" style={{ animationDelay: "240ms" }} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Composer */}
            <div className="mt-6 pt-4 border-t border-white/[0.06]">
              <div className="flex items-center gap-2 rounded-lg bg-graphite border border-white/[0.06] px-3 py-2">
                <span className="text-[12px] text-dusk flex-1">
                  Ask your agent anything…
                </span>
                <span className="text-[10px] text-dusk font-mono">⌘ K</span>
              </div>
            </div>
          </div>

          {/* Side: reasoning panel */}
          <div className="p-5 bg-obsidian/60">
            <div className="eyebrow mb-4">Reasoning</div>
            <ol className="space-y-3">
              {STEPS.map((step, i) => {
                const done = i < frame.stepProgress;
                const active = i === frame.stepProgress && frame.stepProgress < STEPS.length;
                return (
                  <li
                    key={i}
                    className="flex items-start gap-3 transition-opacity duration-300"
                    style={{ opacity: done || active ? 1 : 0.35 }}
                  >
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-semibold shrink-0 mt-0.5 transition-all duration-300 ${
                        done
                          ? "bg-oxblood text-bone"
                          : active
                            ? "bg-oxblood/30 text-claret ring-2 ring-oxblood/40"
                            : "bg-graphite border border-white/[0.08] text-smoke"
                      }`}
                    >
                      {done ? (
                        <Check className="w-2.5 h-2.5" strokeWidth={3} />
                      ) : active ? (
                        <span className="w-1.5 h-1.5 rounded-full bg-claret animate-pulse-subtle" />
                      ) : (
                        i + 1
                      )}
                    </div>
                    <div className="min-w-0">
                      <div
                        className={`text-[12px] leading-tight transition-colors ${
                          active ? "text-bone" : "text-parchment"
                        }`}
                      >
                        {step.label}
                      </div>
                      <div className="text-[10px] text-dusk font-mono mt-0.5">
                        {step.detail}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>

      {/* Caption */}
      <div className="mt-4 text-center text-[11px] text-dusk font-mono">
        one question · routed agent-to-agent · sources + reasoning + audit trail
      </div>
    </div>
  );
}
