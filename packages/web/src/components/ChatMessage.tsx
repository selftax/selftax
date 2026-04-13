import type { ChatMessageData } from '../stores/chatStore';

interface ChatMessageProps {
  message: ChatMessageData;
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div
      data-testid={`chat-message-${message.id}`}
      data-role={message.role}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}
    >
      <div
        className={`max-w-[75%] rounded-lg px-4 py-3 ${
          isUser
            ? 'bg-blue-600 text-white'
            : 'bg-gray-100 text-gray-800'
        }`}
      >
        {!isUser && (
          <span className="mb-1 block text-xs font-semibold text-gray-500">
            Tax Advisor
          </span>
        )}
        <p className="whitespace-pre-wrap text-sm">{message.content}</p>
        <span className="mt-1 block text-right text-xs opacity-60">
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
}
