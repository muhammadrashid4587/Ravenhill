import type { Metadata } from "next";
import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  ShieldCheck,
  ScrollText,
  GitBranch,
  Plug,
  Server,
  Mail,
  type LucideIcon,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Trust",
  description:
    "What Ravenhill does — and does not — do with your company's data today. Written plainly.",
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

function Section({
  icon: Icon,
  title,
  children,
  delay,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
  delay: number;
}) {
  return (
    <section
      className="animate-fade-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-graphite border border-white/[0.06] flex items-center justify-center">
          <Icon className="w-4 h-4 text-claret" strokeWidth={1.75} />
        </div>
        <h2 className="text-xl font-display font-normal text-bone">
          {title}
        </h2>
      </div>
      <div className="pl-12 text-[15px] leading-relaxed text-parchment space-y-3">
        {children}
      </div>
    </section>
  );
}

export default function TrustPage() {
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
      <header className="max-w-3xl mx-auto px-6 pt-16 pb-10 animate-fade-up">
        <div className="eyebrow mb-3">Trust</div>
        <h1 className="font-display font-normal text-display-lg text-bone leading-[1.05] tracking-tight mb-6">
          What we do, and{" "}
          <span className="display-italic text-claret">don&apos;t do</span>,
          with your data.
        </h1>
        <p className="text-[16px] text-smoke leading-relaxed max-w-xl">
          Ravenhill is early. This page describes exactly what the product
          does with your company&apos;s data today, and where the edges are.
          We&apos;d rather be specific than sound complete.
        </p>
        <div className="mt-4 text-[11px] text-dusk font-mono">
          Last updated · April 16, 2026
        </div>
      </header>

      {/* Body */}
      <main className="max-w-3xl mx-auto px-6 pb-24 space-y-14">
        <Section icon={Plug} title="What we ingest" delay={60}>
          <p>
            Ravenhill ingests signals from the tools your team already uses.
            Today, that means <strong className="text-bone">Slack</strong> and{" "}
            <strong className="text-bone">Google Meet</strong>. You connect
            each workspace explicitly, and nothing is ingested before that
            connection is made.
          </p>
          <p>
            From Slack: messages in channels you authorize, thread replies,
            and basic metadata (author, channel, timestamp). We do not read
            private DMs, and we skip organization-noise channels (general,
            random, announcements) from expertise signal by default.
          </p>
          <p>
            From Google Meet: meeting transcripts your team explicitly sends
            to Ravenhill. We do not join meetings without an invitation.
          </p>
          <p>
            Every ingested signal is stored with a unique source identifier
            and a content hash, so duplicates are dropped at the edge and any
            tampering would be detectable.
          </p>
        </Section>

        <Section icon={GitBranch} title="What the product does with signals" delay={120}>
          <p>
            Signals are used for two things: (1) to give your personal agent
            a sense of the work you&apos;re doing, and (2) to build an
            organization-wide map of who-knows-what.
          </p>
          <p>
            The map is a graph of people, teams, and topics. Edges between
            them carry a weight that updates over time based on sustained
            activity — not a single message. The graph is derived signal; it
            does not expose raw message content to other users&apos; agents.
          </p>
          <p>
            When another person&apos;s agent needs your expertise, it sees
            that you&apos;re a likely source — not the underlying messages.
            Raw content only leaves your agent&apos;s context when you
            explicitly approve it.
          </p>
        </Section>

        <Section icon={ShieldCheck} title="Who can see what" delay={180}>
          <p>
            Every signal in Ravenhill carries what we call a{" "}
            <strong className="text-bone">trust envelope</strong>: a
            classification (public / internal / restricted / confidential),
            a scope (which people or teams it&apos;s addressed to), a maximum
            forwarding depth, and a source confidence.
          </p>
          <p>
            The trust envelope can only be narrowed as the signal moves
            through the system — never widened. A confidential signal stays
            confidential; an internal one can&apos;t be promoted to public
            without human action.
          </p>
          <p>
            Access is enforced structurally, not in an LLM prompt.
          </p>
        </Section>

        <Section icon={CheckCircle2} title="How sensitive actions work" delay={240}>
          <p>
            Any cross-agent action that would share a file, transfer data,
            or touch something owned by another person pauses and asks that
            person&apos;s human owner to approve.
          </p>
          <p>
            Approvals are not a convenience layer — they are the enforcement
            point. If the owner does not approve, the action does not happen.
            There is no &quot;silent&quot; pathway.
          </p>
        </Section>

        <Section icon={ScrollText} title="Audit trail" delay={300}>
          <p>
            Every question, every routing decision, every agent-to-agent
            message, and every approval is written to a persistent activity
            log. Each entry carries an actor, a target, a timestamp, and a
            trace identifier that ties the whole chain together.
          </p>
          <p>
            The log is queryable in-app. In the product today, it powers the
            <span className="text-parchment"> Activity</span> and{" "}
            <span className="text-parchment">Audit</span> surfaces. You don&apos;t
            have to ask us for it — you see it.
          </p>
        </Section>

        <Section icon={Server} title="Where the data lives" delay={360}>
          <p>
            Ravenhill runs today on PostgreSQL, in a single region, hosted on
            managed infrastructure. Data is encrypted in transit and at rest
            by the hosting layer.
          </p>
          <p>
            Language model calls are made to third-party model providers
            (Anthropic, and optionally Groq or Google Gemini as fallbacks).
            Which provider is active depends on configuration. We can also
            run in a local-only &quot;mock mode&quot; with no external model
            calls — this is what we use for demos and internal testing.
          </p>
          <p>
            No model provider is given access to your graph. Only the
            specific context needed to answer a specific question is passed,
            per call.
          </p>
        </Section>

        <Section icon={Circle} title="What we do not yet offer" delay={420}>
          <p>
            We&apos;re going to be specific here, because honesty is cheaper
            than rework:
          </p>
          <ul className="space-y-2 mt-2">
            {[
              "SOC 2 is not yet in progress. We will begin when we have a small number of design partners and the scope is stable.",
              "SAML / enterprise SSO is not yet supported. Today we sign in via the in-app flow; Google OAuth is the next step.",
              "Self-hosted / bring-your-own-cloud deployments are not available.",
              "Customer-configurable data residency is not available — single region today.",
              "No ISO 27001, no HIPAA, no FedRAMP. These aren't on the near roadmap.",
              "No dedicated customer VPC or tenant isolation beyond row-level org scoping.",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span className="w-1 h-1 rounded-full bg-dusk mt-2.5 shrink-0" />
                <span className="text-smoke">{item}</span>
              </li>
            ))}
          </ul>
          <p className="pt-2">
            If one of these is a blocker for you, we&apos;d rather know
            before you&apos;re onboarded than after.
          </p>
        </Section>

        <Section icon={Mail} title="How to reach us" delay={480}>
          <p>
            Security questions, data-handling questions, anything on this
            page you want to push on — email us at{" "}
            <a
              href="mailto:security@raven-hill.org"
              className="text-claret hover:text-[#D6596C] transition underline-offset-4 hover:underline"
            >
              security@raven-hill.org
            </a>
            . A founder will answer.
          </p>
        </Section>

        {/* Footer CTA */}
        <div
          className="pt-6 border-t border-white/[0.06] animate-fade-up"
          style={{ animationDelay: "540ms" }}
        >
          <p className="text-smoke text-sm mb-4">
            This page will be updated as the product evolves. If there&apos;s
            a version of it you read three months ago and a claim is no
            longer accurate, that&apos;s on us — tell us and we&apos;ll fix it.
          </p>
          <Link href="/manifesto" className="btn btn-ghost text-sm px-4 py-2">
            Read the manifesto →
          </Link>
        </div>
      </main>

      <footer className="max-w-3xl mx-auto px-6 py-10 border-t border-white/[0.06] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
        <Wordmark />
        <div className="flex items-center gap-5 text-[13px]">
          <Link href="/" className="text-smoke hover:text-parchment transition">
            Home
          </Link>
          <Link href="/manifesto" className="text-smoke hover:text-parchment transition">
            Manifesto
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
