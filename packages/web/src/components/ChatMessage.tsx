interface ChatMessageProps {
  sender: string;
  content: string;
  isAgent: boolean;
  timestamp?: string;
}

export default function ChatMessage({
  sender,
  content,
  isAgent,
  timestamp,
}: ChatMessageProps) {
  // Inter-agent routing messages get a distinct style
  const isRouting = sender.includes("\u2192") && isAgent;

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
          className={`text-[11px] font-medium mb-1 ${
            isAgent ? "text-smoke" : "text-bone/75"
          }`}
        >
          {sender}
        </div>
        <div className="text-sm leading-relaxed whitespace-pre-wrap">
          {content}
        </div>
        {timestamp && (
          <div className="text-[10px] opacity-50 mt-1.5 font-mono">
            {timestamp}
          </div>
        )}
      </div>
    </div>
  );
}
