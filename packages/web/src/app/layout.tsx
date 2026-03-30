import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import { AgentProvider } from "@/lib/AgentContext";

export const metadata: Metadata = {
  title: "Ravenhill",
  description: "Per-employee autonomous agents for enterprise",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-white antialiased">
        <AgentProvider>
          <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <main className="flex-1 overflow-y-auto">{children}</main>
          </div>
        </AgentProvider>
      </body>
    </html>
  );
}
