/**
 * ChatMessage — renders a single message in the chat interface.
 * Supports user, agent, and system (inter-agent routing) message styles.
 */

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
  const isSystem = sender.includes("→") && isAgent;

  if (isSystem) {
    return (
      <div className="flex justify-center mb-3">
        <div className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 max-w-[90%]">
          <div className="text-[10px] font-medium text-blue-400 mb-0.5">{sender}</div>
          <div className="text-xs text-gray-400 italic">{content}</div>
          {timestamp && (
            <div className="text-[10px] text-gray-600 mt-1">{timestamp}</div>
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
            ? "bg-gray-800/80 text-gray-100"
            : "bg-blue-600 text-white"
        }`}
      >
        <div className={`text-[11px] font-medium mb-1 ${isAgent ? "text-gray-400" : "text-blue-200"}`}>
          {sender}
        </div>
        <div className="text-sm leading-relaxed">{content}</div>
        {timestamp && (
          <div className="text-[10px] opacity-40 mt-1.5">{timestamp}</div>
        )}
      </div>
    </div>
  );
}
