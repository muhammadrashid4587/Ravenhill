import Link from "next/link";
import { Shield, GitBranch, ScrollText, Plug } from "lucide-react";
import HeroLive from "@/components/landing/HeroLive";
import ProductMoment from "@/components/landing/ProductMoment";
import InfrastructurePlane from "@/components/landing/InfrastructurePlane";
import RoutingMesh from "@/components/landing/RoutingMesh";
import {
  LandingFooterAuthLink,
  LandingNavCTAs,
  LandingPrimaryCTA,
} from "@/components/landing/LandingAuthCTAs";

// -----------------------------------------------------------------------------
// Landing — Ravenhill V1
// Editorial dark aesthetic, oxblood brand, one static glow, no perpetual motion.
// -----------------------------------------------------------------------------

function Wordmark({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="w-7 h-7 rounded-md bg-oxblood flex items-center justify-center shadow-[0_0_20px_-4px_rgba(139,30,47,0.6)]">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L3 12l9 10 9-10L12 2z" fill="#F5F0E6" />
        </svg>
      </div>
      <span className="text-sm font-semibold tracking-tight text-bone">
        Ravenhill
      </span>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-obsidian text-parchment overflow-x-hidden">
      {/* Live coordination fabric — cursor-reactive node grid behind the page */}
      <RoutingMesh />

      {/* Subtle global film grain — premium texture, not noise */}
      <div className="grain-overlay" aria-hidden="true" />

      {/* ============================================================
          NAV
          ============================================================ */}
      <nav className="relative z-20 max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
        <Wordmark />
        <div className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/manifesto"
            className="hidden sm:inline-flex btn btn-ghost text-[13px] px-3 py-1.5"
          >
            Guidelines
          </Link>
          <Link
            href="/trust"
            className="hidden sm:inline-flex btn btn-ghost text-[13px] px-3 py-1.5"
          >
            Trust
          </Link>
          <span className="hidden sm:block w-px h-4 bg-white/[0.08] mx-1" />
          <LandingNavCTAs />
        </div>
      </nav>

      {/* ============================================================
          HERO — cursor-reactive spotlight, micro-parallax on copy
          ============================================================ */}
      <HeroLive>
        <div className="relative z-10 max-w-5xl mx-auto px-6 pt-28 pb-24 text-center">
          <div
            className="hero-parallax inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/[0.08] bg-white/[0.03] text-[11px] text-smoke mb-8 animate-fade-up backdrop-blur-sm"
            style={{ animationDelay: "40ms" }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-oxblood" />
            Early access · 2026
          </div>

          <h1
            className="hero-parallax font-display font-normal text-display-xl text-bone mb-8 animate-fade-up max-w-4xl mx-auto"
            style={{ animationDelay: "120ms" }}
          >
            The agent that handles your{" "}
            <span className="display-italic text-claret">coordination.</span>
          </h1>

          <p
            className="hero-parallax text-lg text-smoke leading-relaxed max-w-xl mx-auto mb-10 animate-fade-up"
            style={{ animationDelay: "220ms" }}
          >
            Every person at your company gets an AI agent. The agents handle
            the questions, files, and follow-ups between teams — so your
            people do real work.
          </p>

          <div
            className="hero-parallax flex items-center justify-center gap-3 animate-fade-up"
            style={{ animationDelay: "300ms" }}
          >
            <LandingPrimaryCTA className="btn btn-primary text-sm px-5 py-2.5" />
            <Link
              href="#how"
              className="btn btn-secondary text-sm px-5 py-2.5"
            >
              See how it works
            </Link>
          </div>
        </div>
      </HeroLive>

      {/* ============================================================
          PRODUCT MOMENT — live agent-reasoning animation
          ============================================================ */}
      <section className="relative z-10 pb-20 animate-fade-up" style={{ animationDelay: "380ms" }}>
        <ProductMoment />
      </section>

      {/* ============================================================
          INFRASTRUCTURE PLANE — the coordination fabric underneath
          ============================================================ */}
      <section className="relative z-10 pb-28 pt-12 border-t border-white/[0.05] animate-fade-up">
        <InfrastructurePlane />
      </section>

      {/* ============================================================
          HOW IT WORKS
          ============================================================ */}
      <section
        id="how"
        className="relative z-10 max-w-4xl mx-auto px-6 py-24 border-t border-white/[0.06]"
      >
        <div className="text-center mb-16">
          <div className="eyebrow mb-3">How it works</div>
          <h2 className="font-display text-display-lg text-bone">
            Agents that{" "}
            <span className="display-italic text-claret">know</span> your
            company.
          </h2>
        </div>

        <ol className="space-y-12">
          {[
            {
              n: "01",
              title: "Your agent watches the signals you already produce.",
              body:
                "Starting with Slack and Google Meet, with more on the way. No new behavior for your team — the agent learns from the work that's already happening.",
            },
            {
              n: "02",
              title: "It builds a quiet map of who knows what.",
              body:
                "Conversations, documents, meetings, threads. All become expertise signal. Your agent learns the shape of your organization.",
            },
            {
              n: "03",
              title: "When a question comes up, the right agent is reached.",
              body:
                "Not a person. The answer comes back — with sources, with reasoning, and with the paper trail for sensitive requests.",
            },
          ].map((step, i) => (
            <li
              key={step.n}
              className="grid grid-cols-[auto_1fr] gap-6 md:gap-10 items-start"
            >
              <div className="font-display text-4xl text-oxblood tabular-nums">
                {step.n}
              </div>
              <div className="pt-1">
                <h3 className="text-lg md:text-xl text-bone font-medium mb-2 leading-tight">
                  {step.title}
                </h3>
                <p className="text-sm md:text-[15px] text-smoke leading-relaxed max-w-xl">
                  {step.body}
                </p>
              </div>
              {i < 2 && (
                <>
                  <div />
                  <div className="h-px bg-white/[0.06] mt-8 -mb-2" />
                </>
              )}
            </li>
          ))}
        </ol>
      </section>

      {/* ============================================================
          WHAT'S BUILT IN (grounded in real code)
          ============================================================ */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 py-24 border-t border-white/[0.06]">
        <div className="text-center mb-14">
          <div className="eyebrow mb-3">Built in, not bolted on</div>
          <h2 className="font-display text-display-lg text-bone">
            Trust is not an afterthought.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 stagger">
          {[
            {
              icon: Shield,
              title: "Human approvals for sensitive actions",
              body:
                "File shares, cross-team requests, and data transfers route through the owner before they happen. No silent access.",
            },
            {
              icon: ScrollText,
              title: "Full audit trail, every interaction",
              body:
                "Every question, routing decision, and approval is captured in a queryable log you can review at any time.",
            },
            {
              icon: GitBranch,
              title: "Event-level scope and classification",
              body:
                "Every signal carries its own confidentiality class, directional scope, and hop count — enforced at the edge.",
            },
            {
              icon: Plug,
              title: "Works with tools you already use",
              body:
                "Slack and Google Meet integrations today, more on the way. No rip-and-replace of your existing stack.",
            },
          ].map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-xl border border-white/[0.06] bg-ink p-6 animate-fade-up hover:border-white/[0.12] transition"
            >
              <div className="w-9 h-9 rounded-lg bg-graphite border border-white/[0.06] flex items-center justify-center mb-4">
                <Icon className="w-4 h-4 text-claret" strokeWidth={1.75} />
              </div>
              <h3 className="text-[15px] text-bone font-medium mb-2">
                {title}
              </h3>
              <p className="text-sm text-smoke leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ============================================================
          CLOSING CTA
          ============================================================ */}
      <section className="relative z-10 max-w-3xl mx-auto px-6 py-28 border-t border-white/[0.06] text-center">
        <h2 className="font-display text-display-lg text-bone mb-5">
          Less coordination. <span className="display-italic text-claret">More work.</span>
        </h2>
        <p className="text-smoke text-base max-w-md mx-auto mb-9 leading-relaxed">
          Ravenhill is in early access. We&apos;re onboarding our first design
          partners this quarter.
        </p>
        <LandingPrimaryCTA className="btn btn-primary text-sm px-6 py-3 inline-flex" />
      </section>

      {/* ============================================================
          FOOTER
          ============================================================ */}
      <footer className="relative z-10 max-w-6xl mx-auto px-6 py-10 border-t border-white/[0.06] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
        <Wordmark />
        <div className="flex items-center gap-5 text-[13px]">
          <Link href="/manifesto" className="text-smoke hover:text-parchment transition">
            Guidelines
          </Link>
          <Link href="/trust" className="text-smoke hover:text-parchment transition">
            Trust
          </Link>
          <LandingFooterAuthLink />
          <span className="text-[11px] text-dusk font-mono">© 2026 Ravenhill</span>
        </div>
      </footer>
    </div>
  );
}
