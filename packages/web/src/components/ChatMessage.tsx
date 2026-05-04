import { Download, FileText } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { ChatAttachment } from "@/lib/types";

interface ChatMessageProps {
  sender: string;
  content: string;
  isAgent: boolean;
  timestamp?: string;
  attachments?: ChatAttachment[];
  channel?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentCard({
  attachment,
  isAgent,
}: {
  attachment: ChatAttachment;
  isAgent: boolean;
}) {
  const sourceLabel =
    attachment.source === "agent_reply"
      ? "From agent"
      : attachment.source === "drive"
        ? "Drive"
        : attachment.source === "slack"
          ? "Slack"
          : attachment.source === "shared"
            ? "Shared"
            : "Uploaded";

  const cardBg = isAgent
    ? "bg-ink/60 border-white/[0.08]"
    : "bg-black/20 border-white/[0.12]";

  return (
    <a
      href={attachment.url ?? "#"}
      target={attachment.url ? "_blank" : undefined}
      rel="noreferrer"
      download={attachment.source === "upload" ? attachment.name : undefined}
      className={`flex items-center gap-2.5 mt-2 px-3 py-2 rounded-lg border ${cardBg} hover:border-white/[0.2] transition`}
    >
      <div className="w-8 h-8 rounded-md bg-graphite border border-white/[0.06] flex items-center justify-center shrink-0">
        <FileText className="w-4 h-4 text-parchment" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-bone truncate">
          {attachment.name}
        </div>
        <div className="text-[10px] text-dusk flex items-center gap-1.5">
          <span>{sourceLabel}</span>
          <span>·</span>
          <span>{formatBytes(attachment.size_bytes)}</span>
        </div>
      </div>
      {attachment.url && <Download className="w-3.5 h-3.5 text-dusk shrink-0" />}
    </a>
  );
}

function MarkdownContent({ content, isAgent }: { content: string; isAgent: boolean }) {
  if (!isAgent) {
    return <div className="text-sm leading-relaxed whitespace-pre-wrap">{content}</div>;
  }

  return (
    <div className="prose-raven text-sm leading-relaxed">
      <ReactMarkdown
        components={{
          h1: ({ children }) => (
            <h3 className="text-[15px] font-semibold text-bone mt-3 mb-1.5">{children}</h3>
          ),
          h2: ({ children }) => (
            <h3 className="text-[14px] font-semibold text-bone mt-3 mb-1.5">{children}</h3>
          ),
          h3: ({ children }) => (
            <h4 className="text-[13px] font-semibold text-bone mt-2.5 mb-1">{children}</h4>
          ),
          p: ({ children }) => (
            <p className="mb-2 last:mb-0">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="text-sm leading-relaxed">{children}</li>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-bone">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-parchment/90">{children}</em>
          ),
          code: ({ children }) => (
            <code className="text-[12px] bg-ink px-1.5 py-0.5 rounded font-mono text-parchment">{children}</code>
          ),
          pre: ({ children }) => (
            <pre className="bg-ink rounded-lg p-3 overflow-x-auto mb-2 text-[12px]">{children}</pre>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-claret hover:text-[#D6596C] underline underline-offset-2"
            >
              {children}
            </a>
          ),
          hr: () => <hr className="border-white/[0.08] my-3" />,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-claret/40 pl-3 text-smoke italic my-2">
              {children}
            </blockquote>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export default function ChatMessage({
  sender,
  content,
  isAgent,
  timestamp,
  attachments,
  channel,
}: ChatMessageProps) {
  const isRouting = sender.includes("→") && isAgent;

  if (isRouting) {
    return (
      <div className="flex justify-center mb-3">
        <div className="bg-ink border border-white/[0.06] rounded-lg px-3 py-2 max-w-[90%]">
          <div className="text-[10px] font-medium text-claret mb-0.5">
            {sender}
          </div>
          <div className="text-xs text-parchment italic">{content}</div>
          {timestamp && (
            <div className="text-[10px] text-dusk mt-1 font-mono">
              {timestamp}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isAgent ? "justify-start" : "justify-end"} mb-3`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
          isAgent
            ? "bg-graphite/80 text-parchment border border-white/[0.06]"
            : "bg-oxblood text-bone"
        }`}
      >
        <div
          className={`text-[11px] font-medium mb-1 flex items-center gap-1.5 ${
            isAgent ? "text-smoke" : "text-bone/75"
          }`}
        >
          <span>{sender}</span>
          {channel && (
            <span
              className={`text-[9px] px-1.5 py-0.5 rounded border ${
                isAgent
                  ? "bg-[#611f69]/20 text-[#c7a5d1] border-[#611f69]/40"
                  : "bg-black/20 text-bone/75 border-white/[0.15]"
              }`}
              title={`via Slack ${channel}`}
            >
              Slack · {channel}
            </span>
          )}
        </div>
        {content && <MarkdownContent content={content} isAgent={isAgent} />}
        {attachments && attachments.length > 0 && (
          <div className="space-y-1">
            {attachments.map((att) => (
              <AttachmentCard
                key={att.id}
                attachment={att}
                isAgent={isAgent}
              />
            ))}
          </div>
        )}
        {timestamp && (
          <div className="text-[10px] opacity-50 mt-1.5 font-mono">
            {timestamp}
          </div>
        )}
      </div>
    </div>
  );
}
