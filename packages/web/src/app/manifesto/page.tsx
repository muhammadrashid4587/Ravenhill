import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Manifesto",
  description:
    "Most of the work inside a company is routing work. Ravenhill is the quiet substrate underneath.",
};

function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2 group">
      <div className="w-7 h-7 rounded-md bg-oxblood flex items-center justify-center group-hover:bg-claret transition shadow-[0_0_20px_-4px_rgba(139,30,47,0.6)]">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L3 12l9 10 9-10L12 2z" fill="#F5F0E6" />
        </svg>
      </div>
      <span className="text-sm font-semibold tracking-tight text-bone">
        Ravenhill
      </span>
    </Link>
  );
}

export default function ManifestoPage() {
  return (
    <div className="min-h-screen bg-obsidian text-parchment">
      {/* Nav */}
      <nav className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
        <Wordmark />
        <Link
          href="/login"
          className="btn btn-secondary text-[13px] px-3.5 py-1.5"
        >
          Request access
        </Link>
      </nav>

      {/* Hero */}
      <header className="max-w-3xl mx-auto px-6 pt-16 pb-12 animate-fade-up">
        <div className="eyebrow mb-3">Manifesto</div>
        <h1 className="font-display font-normal text-display-lg text-bone leading-[1.05] tracking-tight">
          Most of the work inside a company is{" "}
          <span className="display-italic text-claret">routing work.</span>
        </h1>
      </header>

      {/* Body */}
      <article className="max-w-2xl mx-auto px-6 pb-24 space-y-8 text-[17px] leading-[1.75] text-parchment">
        <p className="animate-fade-up" style={{ animationDelay: "60ms" }}>
          A salesperson wants to close; finance approves the pricing. A PM
          wants to ship; legal reviews the clause. An engineer wants to build;
          operations schedules the access. Every company runs on a quiet web
          of who-asks-who — and most of it is not work, it&apos;s friction.
        </p>

        <p className="animate-fade-up" style={{ animationDelay: "120ms" }}>
          Each hand-off is small. A Slack message, a follow-up, a calendar
          invite, a &quot;can we sync for 15 minutes.&quot; Added up across an
          organization, these hand-offs dwarf the actual work they&apos;re
          supposed to be supporting. The senior people spend their days as
          routers. The junior people spend their days waiting.
        </p>

        <div
          className="border-l-2 border-oxblood pl-5 py-1 my-10 animate-fade-up"
          style={{ animationDelay: "180ms" }}
        >
          <p className="font-display text-xl md:text-2xl text-bone leading-snug">
            The bet behind Ravenhill is simple: if every person had a capable
            AI agent that understood their role, their context, and the shape
            of their organization — the coordination could happen{" "}
            <span className="display-italic text-claret">agent-to-agent</span>.
            Not instead of people. On behalf of them.
          </p>
        </div>

        <p className="animate-fade-up" style={{ animationDelay: "240ms" }}>
          We&apos;re not building a smarter chat interface. We&apos;re not
          selling a copilot. We&apos;re building the substrate that makes
          coordination happen quietly — so the human on the other end is only
          pulled in when something genuinely needs them.
        </p>

        <h2
          className="font-display text-2xl text-bone mt-14 mb-2 animate-fade-up"
          style={{ animationDelay: "300ms" }}
        >
          What we believe.
        </h2>

        <ul className="space-y-5 animate-fade-up" style={{ animationDelay: "340ms" }}>
          {[
            {
              k: "Enterprise AI that matters looks like infrastructure, not chatbots.",
              v: "A chat box is the interface. The substrate underneath — who sees what, who owns what, how context gets to the model — is the product.",
            },
            {
              k: "Agents that don't know your company will always be shallow.",
              v: "Generic AI gives generic answers. The hard, durable work is turning your organization's actual signals into expertise the agent can draw on.",
            },
            {
              k: "Human approval is a feature, not friction.",
              v: "When something sensitive happens, a person should decide. That's not a cost we tolerate — it's why companies can trust this at all.",
            },
            {
              k: "Signal beats prompts.",
              v: "The best context for an agent isn't what someone types into a box. It's the work that's already happening — the Slack threads, the meetings, the docs.",
            },
            {
              k: "Trust is the product.",
              v: "Every message, every routing decision, every approval — observable, explainable, auditable. Without that, none of this ships.",
            },
          ].map((item, i) => (
            <li key={i} className="pl-5 border-l border-white/[0.08]">
              <div className="text-bone font-medium">{item.k}</div>
              <div className="text-smoke text-[15px] mt-1 leading-relaxed">
                {item.v}
              </div>
            </li>
          ))}
        </ul>

        <p
          className="pt-10 animate-fade-up"
          style={{ animationDelay: "400ms" }}
        >
          We&apos;re at the beginning. The product is narrow on purpose.
          It does a few things well — watches the signals you already produce,
          builds a graph of who knows what, routes questions between agents,
          and gates the sensitive work on a human. We&apos;d rather be honest
          about the edges of what we&apos;ve built than sell a bigger version
          that doesn&apos;t exist yet.
        </p>

        <p
          className="text-smoke animate-fade-up"
          style={{ animationDelay: "460ms" }}
        >
          If this resonates with how you think your company should work,
          we&apos;d love to hear from you.
        </p>

        <div
          className="flex items-center gap-3 pt-4 animate-fade-up"
          style={{ animationDelay: "520ms" }}
        >
          <Link href="/login" className="btn btn-primary text-sm px-5 py-2.5">
            Request access
            <ArrowUpRight className="w-4 h-4" />
          </Link>
          <Link href="/trust" className="btn btn-ghost text-sm px-4 py-2.5">
            How we handle your data
          </Link>
        </div>

        <div
          className="pt-14 border-t border-white/[0.06] mt-14 text-sm text-smoke animate-fade-up"
          style={{ animationDelay: "580ms" }}
        >
          <div>— Muhammad, Max, and Likitha</div>
          <div className="text-dusk text-[11px] font-mono mt-1">
            founders · 2026
          </div>
        </div>
      </article>

      {/* Footer */}
      <footer className="max-w-3xl mx-auto px-6 py-10 border-t border-white/[0.06] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
        <Wordmark />
        <div className="flex items-center gap-5 text-[13px]">
          <Link href="/" className="text-smoke hover:text-parchment transition">
            Home
          </Link>
          <Link href="/trust" className="text-smoke hover:text-parchment transition">
            Trust
          </Link>
          <Link href="/login" className="text-smoke hover:text-parchment transition">
            Sign in
          </Link>
          <span className="text-[11px] text-dusk font-mono">© 2026 Ravenhill</span>
        </div>
      </footer>
    </div>
  );
}
