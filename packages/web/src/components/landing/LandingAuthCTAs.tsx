"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";

/**
 * Landing-page CTAs that flip based on session state.
 *
 * The landing page is otherwise a server component; these tiny islands
 * live in it to react to /api/auth/me without client-ifying the whole
 * marketing page.
 */

export function LandingNavCTAs() {
  const { agent, loading, logout } = useAuth();

  if (loading) {
    return <div className="w-[140px] h-[30px]" aria-hidden="true" />;
  }

  if (agent) {
    return (
      <>
        <Link
          href="/home"
          className="btn btn-ghost text-[13px] px-3 py-1.5"
        >
          Home
        </Link>
        <button
          type="button"
          onClick={() => {
            void logout();
          }}
          className="btn btn-ghost text-[13px] px-3 py-1.5"
        >
          Sign out
        </button>
        <Link
          href="/chat"
          className="btn btn-primary text-[13px] px-3.5 py-1.5"
        >
          Open app
        </Link>
      </>
    );
  }

  return (
    <>
      <Link href="/login" className="btn btn-ghost text-[13px] px-3 py-1.5">
        Sign in
      </Link>
      <Link
        href="/login?mode=signup"
        className="btn btn-primary text-[13px] px-3.5 py-1.5"
      >
        Get started
      </Link>
    </>
  );
}

export function LandingPrimaryCTA({
  className = "btn btn-primary text-sm px-5 py-2.5",
}: {
  className?: string;
}) {
  const { agent, loading } = useAuth();

  if (loading) {
    return <div className="h-[42px] w-[160px]" aria-hidden="true" />;
  }

  if (agent) {
    return (
      <Link href="/home" className={className}>
        Go to your home
        <ArrowUpRight className="w-4 h-4" />
      </Link>
    );
  }

  return (
    <Link href="/login?mode=signup" className={className}>
      Get started
      <ArrowUpRight className="w-4 h-4" />
    </Link>
  );
}

export function LandingFooterAuthLink() {
  const { agent } = useAuth();
  return (
    <Link
      href={agent ? "/home" : "/login"}
      className="text-smoke hover:text-parchment transition"
    >
      {agent ? "Home" : "Sign in"}
    </Link>
  );
}
