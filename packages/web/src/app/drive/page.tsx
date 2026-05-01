"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  FolderOpen,
  Folder,
  FileText,
  FileSpreadsheet,
  Presentation,
  Film,
  File,
  Search,
  Star,
  Share2,
  Clock,
  Video,
  ExternalLink,
  HardDriveUpload,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import {
  fetchGoogleStatus,
  fetchWorkspaceDriveFiles,
  fetchWorkspaceDriveFolders,
  type GoogleStatus,
} from "@/lib/api";
import type { WorkspaceFile } from "@/lib/types";

// Folder shape matches what `/api/workspace/drive/folders` returns.
// (Inlined here so this page does not depend on `lib/mocks`.)
interface DriveFolder {
  id: string;
  name: string;
  file_ids: string[];
  shared_with?: string[];
}

const FOLDER_ICONS: Record<string, typeof Folder> = {
  root: FolderOpen,
  shared: Share2,
  starred: Star,
  recent: Clock,
  meet: Video,
};

function fileIcon(mime: string) {
  if (mime.includes("presentation")) return Presentation;
  if (mime.includes("spreadsheet") || mime.includes("csv")) return FileSpreadsheet;
  if (mime.includes("video")) return Film;
  if (mime.includes("document") || mime.includes("markdown")) return FileText;
  return File;
}

function fileKind(mime: string) {
  if (mime.includes("presentation")) return "Slides";
  if (mime.includes("spreadsheet")) return "Sheet";
  if (mime.includes("csv")) return "CSV";
  if (mime.includes("video")) return "Video";
  if (mime.includes("markdown")) return "Markdown";
  if (mime.includes("document")) return "Doc";
  return mime.split("/").pop() ?? "File";
}

function formatAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const days = diff / 86400000;
  if (days < 1) return `${Math.max(1, Math.round(days * 24))}h ago`;
  if (days < 30) return `${Math.round(days)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function DrivePage() {
  const { agent: myAgent } = useAuth();
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [activeFolder, setActiveFolder] = useState<string>("root");
  const [selected, setSelected] = useState<WorkspaceFile | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [google, setGoogle] = useState<GoogleStatus | null>(null);

  useEffect(() => {
    // Real Google Drive. Backend returns [] when the agent has not connected
    // Google — see `9ef21d6` which removed sample-data fallbacks.
    const id = myAgent?.id;
    if (!id) {
      setLoading(false);
      return;
    }
    Promise.all([
      fetchWorkspaceDriveFiles(id).catch(() => []),
      fetchWorkspaceDriveFolders(id).catch(() => []),
    ]).then(([f, fs]) => {
      setFiles((f || []) as WorkspaceFile[]);
      setFolders((fs || []) as DriveFolder[]);
      setLoading(false);
    });
  }, [myAgent]);

  useEffect(() => {
    fetchGoogleStatus(myAgent?.id)
      .then(setGoogle)
      .catch(() => setGoogle(null));
  }, [myAgent]);

  const filesById = useMemo(() => {
    const m = new Map<string, WorkspaceFile>();
    for (const f of files) m.set(f.id, f);
    return m;
  }, [files]);

  const folder = folders.find((f) => f.id === activeFolder);
  const folderFiles = (folder?.file_ids ?? [])
    .map((id) => filesById.get(id))
    .filter((f): f is WorkspaceFile => Boolean(f))
    .filter((f) => f.name.toLowerCase().includes(search.toLowerCase()))
    .sort(
      (a, b) =>
        new Date(b.last_modified).getTime() - new Date(a.last_modified).getTime(),
    );

  return (
    <div className="min-h-screen bg-obsidian text-parchment">
      <header className="border-b border-white/[0.06] px-6 py-4 animate-fade-up">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-bone flex items-center gap-2">
              <HardDriveUpload className="w-4 h-4 text-claret" /> Drive
            </h1>
            <p className="text-xs text-smoke mt-0.5">
              Files surfaced from your agent&apos;s read-only Google Drive access
            </p>
          </div>
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-dusk" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search files…"
              className="w-full bg-ink border border-white/[0.06] rounded-lg pl-9 pr-3 py-1.5 text-xs text-parchment input-focus-glow placeholder:text-dusk"
            />
          </div>
        </div>

        {google && !google.connected && (
          <div className="mt-3 flex items-center gap-2 text-[11px] text-dusk bg-ink border border-white/[0.06] rounded-md px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 text-[#FACC15]" />
            <span>
              Google Drive isn&apos;t connected yet.{" "}
              <Link href="/settings" className="text-claret hover:text-[#D6596C]">
                Connect in Settings
              </Link>{" "}
              to sync your files.
            </span>
          </div>
        )}
        {google?.connected && (
          <div className="mt-3 flex items-center gap-2 text-[11px] text-[#88D3A4]">
            <CheckCircle2 className="w-3 h-3" />
            Synced live with your Google Drive.
          </div>
        )}
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      ) : folders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center px-6">
          <div className="w-14 h-14 rounded-2xl bg-ink border border-white/[0.06] flex items-center justify-center mb-4">
            <HardDriveUpload className="w-7 h-7 text-dusk" />
          </div>
          <h2 className="text-base font-medium text-bone mb-1">
            {google?.connected ? "No files yet" : "Connect Google Drive"}
          </h2>
          <p className="text-sm text-smoke max-w-sm mb-6">
            {google?.connected
              ? "Your agent has read-only access but didn't find any files in your Drive yet."
              : "Connect Google in Settings and your agent will surface files it can read here — no copies, no uploads."}
          </p>
          {!google?.connected && (
            <Link
              href="/settings"
              className="flex items-center gap-2 bg-oxblood hover:bg-claret text-bone px-5 py-2.5 rounded-lg text-sm font-medium transition"
            >
              Open Settings
              <ChevronRight className="w-4 h-4" />
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-0 min-h-[calc(100vh-65px)]">
          {/* Folders sidebar */}
          <aside className="col-span-3 md:col-span-2 border-r border-white/[0.06] p-3">
            <p className="text-[10px] uppercase tracking-wide text-dusk px-2 mb-2">
              Folders
            </p>
            <nav className="space-y-0.5">
              {folders.map((f) => {
                const Icon = FOLDER_ICONS[f.id] ?? Folder;
                const active = f.id === activeFolder;
                return (
                  <button
                    key={f.id}
                    onClick={() => {
                      setActiveFolder(f.id);
                      setSelected(null);
                    }}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition ${
                      active
                        ? "bg-white/[0.06] text-bone"
                        : "text-smoke hover:text-parchment hover:bg-white/[0.03]"
                    }`}
                  >
                    <Icon
                      className={`w-3.5 h-3.5 ${active ? "text-claret" : ""}`}
                    />
                    <span className="truncate">{f.name}</span>
                    <span className="ml-auto text-[10px] text-dusk">
                      {f.file_ids.length}
                    </span>
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* File list */}
          <section className="col-span-9 md:col-span-6 border-r border-white/[0.06] p-5">
            <div className="flex items-center gap-2 text-xs text-dusk mb-4">
              <FolderOpen className="w-3.5 h-3.5" />
              <span>{folder?.name}</span>
              <ChevronRight className="w-3 h-3" />
              <span className="text-smoke">{folderFiles.length} files</span>
            </div>

            {folderFiles.length === 0 ? (
              <div className="bg-ink border border-white/[0.06] rounded-xl p-10 text-center">
                <FileText className="w-7 h-7 text-dusk mx-auto mb-3" />
                <p className="text-sm text-smoke">
                  {search ? "No files match your search" : "Empty folder"}
                </p>
              </div>
            ) : (
              <div className="space-y-1.5 stagger">
                {folderFiles.map((f) => {
                  const Icon = fileIcon(f.mime_type);
                  const active = selected?.id === f.id;
                  return (
                    <button
                      key={f.id}
                      onClick={() => setSelected(f)}
                      className={`w-full flex items-center gap-3 rounded-lg px-4 py-2.5 text-left transition animate-fade-up ${
                        active
                          ? "bg-white/[0.06] border border-claret/40"
                          : "bg-ink border border-white/[0.06] hover:border-white/[0.14]"
                      }`}
                    >
                      <Icon className="w-4 h-4 text-smoke shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-bone truncate">
                            {f.name}
                          </span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded border bg-white/[0.04] text-smoke border-white/[0.08]">
                            {fileKind(f.mime_type)}
                          </span>
                        </div>
                        <span className="text-[11px] text-dusk">
                          {f.owner} · {formatAgo(f.last_modified)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Preview pane */}
          <aside className="col-span-12 md:col-span-4 p-5 bg-ink/30">
            {selected ? (
              <FilePreview file={selected} />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <File className="w-8 h-8 text-dusk mb-3" />
                <p className="text-xs text-smoke">
                  Select a file to see what your agent can read from it
                </p>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

function FilePreview({ file }: { file: WorkspaceFile }) {
  const Icon = fileIcon(file.mime_type);
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-graphite border border-white/[0.06] flex items-center justify-center">
          <Icon className="w-4 h-4 text-claret" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-medium text-bone break-words">
            {file.name}
          </h2>
          <p className="text-[11px] text-dusk mt-0.5">
            {fileKind(file.mime_type)} · {file.owner}
          </p>
        </div>
      </div>

      <div className="bg-ink border border-white/[0.06] rounded-lg p-3 space-y-2">
        <Row label="Last modified" value={formatAgo(file.last_modified)} />
        <Row label="Source" value="Google Drive" />
        <Row label="Mime type" value={file.mime_type} />
      </div>

      <div className="bg-ink border border-white/[0.06] rounded-lg p-3">
        <p className="text-[10px] uppercase tracking-wide text-dusk mb-2">
          Agent summary
        </p>
        <p className="text-xs text-smoke leading-relaxed">
          Open the file in Drive and your agent will pick it up next time you
          ask about this topic — owners, deadlines, and open questions surface
          in the topic graph automatically.
        </p>
      </div>

      <div className="flex gap-2">
        <a
          href={file.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-1.5 text-xs bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] rounded-md px-3 py-2 transition"
        >
          <ExternalLink className="w-3 h-3" /> Open in Drive
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[11px]">
      <span className="text-dusk">{label}</span>
      <span className="text-parchment truncate">{value}</span>
    </div>
  );
}
