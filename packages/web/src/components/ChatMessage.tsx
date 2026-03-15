/**
 * ChatMessage — renders a single message in the chat interface.
 * Used in the dual-agent demo view.
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
  return (
    <div className={`flex ${isAgent ? "justify-start" : "justify-end"} mb-4`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
          isAgent
            ? "bg-gray-800 text-gray-100"
            : "bg-blue-600 text-white"
        }`}
      >
        <div className="text-xs font-medium opacity-70 mb-1">{sender}</div>
        <div className="text-sm leading-relaxed">{content}</div>
        {timestamp && (
          <div className="text-xs opacity-50 mt-1">{timestamp}</div>
        )}
      </div>
    </div>
  );
}
