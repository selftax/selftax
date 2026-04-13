import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { redactText, generateGuidance } from '@selftax/core';
import type { TaxSituation } from '@selftax/core';
import ChatMessage from '../components/ChatMessage';
import { useChatStore } from '../stores/chatStore';
import { useDocumentStore } from '../stores/documentStore';
import {
  buildAnonymizedContext,
  sendAdvisorMessage,
} from '../services/advisorApi';
import type { AnonymizedDocumentInfo } from '../services/advisorApi';

const DEFAULT_SUGGESTIONS = [
  'What tax forms do I need to file?',
  'Should I take the standard deduction or itemize?',
  'Are there any deductions I might be missing?',
  'Can you explain my tax situation?',
];

/** Build a basic TaxSituation from document fields for initial guidance */
function buildSituationFromDocs(
  documents: AnonymizedDocumentInfo[],
): TaxSituation {
  const hasW2 = documents.some((d) => d.type === 'w2');
  return {
    filingStatus: 'single',
    hasW2Income: hasW2,
    hasRentalProperty: false,
    hasStockSales: documents.some(
      (d) => d.type === '1099-b',
    ),
    hasISOs: false,
    hasDependentCareFSA: false,
  };
}

export default function AdvisorPage() {
  const { messages, isLoading, addMessage, setLoading } = useChatStore();
  const { documents } = useDocumentStore();
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);

  // Build anonymized documents from store
  const anonymizedDocs: AnonymizedDocumentInfo[] = documents
    .filter((d) => d.verified)
    .map((d) => ({
      id: d.id,
      redactedText: redactText(d.extractedText, d.piiDetections),
      type: d.type,
      fields: {},
    }));

  const anonymizedContext = buildAnonymizedContext(anonymizedDocs);

  // Generate initial guidance message on mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const situation = buildSituationFromDocs(anonymizedDocs);
    const guidanceItems = generateGuidance(situation);

    let welcomeContent: string;
    if (guidanceItems.length > 0) {
      const guidanceText = guidanceItems
        .map((g) => `**${g.topic}**: ${g.advice}`)
        .join('\n\n');
      welcomeContent = `Welcome! I've reviewed your documents. Here's my initial analysis:\n\n${guidanceText}\n\nFeel free to ask me any questions about your tax situation.`;
    } else {
      welcomeContent =
        "Welcome! I'm your AI tax advisor. I can help you understand your tax situation, identify deductions, and determine which forms you need to file.\n\nAsk me anything about your taxes, or try one of the suggested questions below.";
    }

    addMessage('assistant', welcomeContent);
  }, []); // Only run once on mount

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current && typeof messagesEndRef.current.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSend = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || isLoading) return;

    addMessage('user', trimmed);
    setInputValue('');
    setLoading(true);

    try {
      const currentMessages = useChatStore.getState().messages;
      const response = await sendAdvisorMessage(
        trimmed,
        anonymizedContext,
        currentMessages,
      );
      addMessage('assistant', response);
    } catch {
      addMessage(
        'assistant',
        'Sorry, I encountered an error. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestionClick = (question: string) => {
    setInputValue(question);
  };

  return (
    <div className="mx-auto flex h-screen max-w-3xl flex-col p-4">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">AI Tax Advisor</h1>
        <div className="flex gap-2">
          <Link
            to="/verify"
            className="rounded-lg bg-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-300"
          >
            Back
          </Link>
          <Link
            to="/review"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
          >
            Continue to Review
          </Link>
        </div>
      </div>

      {/* Privacy notice */}
      <div className="mb-4 rounded-lg bg-green-50 px-4 py-2 text-xs text-green-700">
        Your personal information (SSN, name, address) is never sent to the AI.
        Only anonymized financial data is shared.
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto rounded-lg border border-gray-200 p-4">
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}

        {isLoading && (
          <div data-testid="chat-loading" className="flex justify-start mb-3">
            <div className="rounded-lg bg-gray-100 px-4 py-3">
              <span className="text-sm text-gray-500">Thinking...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested questions */}
      <div data-testid="suggested-questions" className="my-3 flex flex-wrap gap-2">
        {DEFAULT_SUGGESTIONS.map((question) => (
          <button
            key={question}
            onClick={() => handleSuggestionClick(question)}
            className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs text-blue-700 hover:bg-blue-100"
          >
            {question}
          </button>
        ))}
      </div>

      {/* Input area */}
      <div className="flex gap-2">
        <input
          data-testid="chat-input"
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your taxes..."
          className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
          disabled={isLoading}
        />
        <button
          data-testid="send-button"
          onClick={handleSend}
          disabled={!inputValue.trim() || isLoading}
          className="rounded-lg bg-blue-600 px-6 py-3 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          Send
        </button>
      </div>
    </div>
  );
}
