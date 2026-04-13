/**
 * @jest-environment jsdom
 */
/**
 * Spec: AI Advisor Chat UI
 *
 * Status: hypothesis
 * Confirm: Users can chat with an AI tax advisor that receives ONLY anonymized data.
 *          The chat UI shows message history, suggested questions, initial guidance,
 *          and enforces the PII boundary before sending any data to the API.
 * Invalidate: Chat-based tax advice too confusing for average user
 *
 * Covers:
 * - AdvisorPage renders chat interface with initial guidance message
 * - ChatMessage component renders user and assistant message bubbles
 * - Chat store manages messages, loading state, and message sending
 * - API service only receives redacted data (PII boundary enforcement)
 * - Suggested questions based on tax situation
 * - User can type and send messages
 * - Loading indicator shown while waiting for AI response
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import AdvisorPage from '@selftax/web/pages/AdvisorPage';
import ChatMessage from '@selftax/web/components/ChatMessage';
import { useChatStore } from '@selftax/web/stores/chatStore';
import type { ChatMessageData } from '@selftax/web/stores/chatStore';
import { buildAnonymizedContext, sendAdvisorMessage } from '@selftax/web/services/advisorApi';
import { useDocumentStore } from '@selftax/web/stores/documentStore';
import { redactText } from '@selftax/core';
import type { PIIDetection } from '@selftax/core';

function createMockFile(name: string, size: number, type: string): File {
  const buffer = new ArrayBuffer(size);
  return new File([buffer], name, { type });
}

describe('AI Advisor Chat UI', () => {
  beforeEach(() => {
    useChatStore.setState({ messages: [], isLoading: false });
    useDocumentStore.setState({ documents: [] });
  });

  describe('ChatMessage component', () => {
    test('renders user message with correct styling', () => {
      const msg: ChatMessageData = {
        id: 'msg-1',
        role: 'user',
        content: 'How should I file my rental income?',
        timestamp: new Date(),
      };

      render(<ChatMessage message={msg} />);

      const bubble = screen.getByTestId('chat-message-msg-1');
      expect(bubble).toHaveTextContent('How should I file my rental income?');
      expect(bubble).toHaveAttribute('data-role', 'user');
    });

    test('renders assistant message with correct styling', () => {
      const msg: ChatMessageData = {
        id: 'msg-2',
        role: 'assistant',
        content: 'Based on your tax situation, you should file Schedule E.',
        timestamp: new Date(),
      };

      render(<ChatMessage message={msg} />);

      const bubble = screen.getByTestId('chat-message-msg-2');
      expect(bubble).toHaveTextContent('Schedule E');
      expect(bubble).toHaveAttribute('data-role', 'assistant');
    });
  });

  describe('Chat store (Zustand)', () => {
    test('addMessage appends a message to the store', () => {
      act(() => {
        useChatStore.getState().addMessage('user', 'Hello, advisor');
      });

      const messages = useChatStore.getState().messages;
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toBe('Hello, advisor');
      expect(messages[0].id).toBeTruthy();
      expect(messages[0].timestamp).toBeInstanceOf(Date);
    });

    test('addMessage supports assistant messages', () => {
      act(() => {
        useChatStore.getState().addMessage('assistant', 'I can help with that.');
      });

      const messages = useChatStore.getState().messages;
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('assistant');
    });

    test('setLoading toggles loading state', () => {
      expect(useChatStore.getState().isLoading).toBe(false);

      act(() => {
        useChatStore.getState().setLoading(true);
      });
      expect(useChatStore.getState().isLoading).toBe(true);

      act(() => {
        useChatStore.getState().setLoading(false);
      });
      expect(useChatStore.getState().isLoading).toBe(false);
    });

    test('clearMessages resets the message list', () => {
      act(() => {
        useChatStore.getState().addMessage('user', 'First');
        useChatStore.getState().addMessage('assistant', 'Second');
      });

      expect(useChatStore.getState().messages).toHaveLength(2);

      act(() => {
        useChatStore.getState().clearMessages();
      });

      expect(useChatStore.getState().messages).toHaveLength(0);
    });

    test('multiple messages maintain correct order', () => {
      act(() => {
        useChatStore.getState().addMessage('user', 'Question 1');
        useChatStore.getState().addMessage('assistant', 'Answer 1');
        useChatStore.getState().addMessage('user', 'Question 2');
      });

      const messages = useChatStore.getState().messages;
      expect(messages).toHaveLength(3);
      expect(messages[0].content).toBe('Question 1');
      expect(messages[1].content).toBe('Answer 1');
      expect(messages[2].content).toBe('Question 2');
    });
  });

  describe('PII boundary enforcement', () => {
    test('buildAnonymizedContext uses only redacted text, never raw text', () => {
      const extractedText = 'Jane Doe SSN 000-00-0000 Wages: $50,000';
      const detections: PIIDetection[] = [
        { type: 'name', value: 'Jane Doe', startIndex: 0, endIndex: 8, confidence: 'profile-match' },
        { type: 'ssn', value: '000-00-0000', startIndex: 13, endIndex: 24, confidence: 'pattern' },
      ];

      const redacted = redactText(extractedText, detections);
      const context = buildAnonymizedContext([
        { id: 'doc-1', redactedText: redacted, type: 'w2', fields: {} },
      ]);

      // Context must NOT contain PII
      expect(context).not.toContain('Jane Doe');
      expect(context).not.toContain('000-00-0000');
      // Context SHOULD contain financial data
      expect(context).toContain('$50,000');
      expect(context).toContain('[REDACTED]');
    });

    test('buildAnonymizedContext includes document type information', () => {
      const context = buildAnonymizedContext([
        { id: 'doc-1', redactedText: 'Wages: $50,000', type: 'w2', fields: {} },
        { id: 'doc-2', redactedText: 'Rent received: $12,000', type: 'other', fields: {} },
      ]);

      expect(context).toContain('W-2');
      expect(context).toContain('$50,000');
      expect(context).toContain('$12,000');
    });

    test('sendAdvisorMessage receives only the anonymized context, not raw documents', async () => {
      // The sendAdvisorMessage function signature requires anonymized context string
      // and message — it should never accept a TaxDocument or raw text
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ response: 'Tax advice here' }),
      });

      const result = await sendAdvisorMessage(
        'What forms do I need?',
        'Document type: w2\nWages: $50,000',
        [],
        mockFetch,
      );

      expect(result).toBe('Tax advice here');

      // Verify the fetch was called with the anonymized context, not raw PII
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.messages).toBeDefined();
      expect(JSON.stringify(callBody)).not.toContain('000-00-0000');
    });
  });

  describe('AdvisorPage', () => {
    test('renders the chat interface with title', () => {
      render(
        <MemoryRouter>
          <AdvisorPage />
        </MemoryRouter>,
      );

      expect(screen.getByRole('heading', { name: /ai tax advisor/i })).toBeInTheDocument();
      expect(screen.getByTestId('chat-input')).toBeInTheDocument();
      expect(screen.getByTestId('send-button')).toBeInTheDocument();
    });

    test('displays initial guidance as first assistant message', () => {
      // Add a verified document with financial data to trigger guidance
      const file = createMockFile('w2.pdf', 1024, 'application/pdf');
      act(() => {
        const entry = useDocumentStore.getState().addDocument(file);
        useDocumentStore.getState().setExtractedText(
          entry.id,
          'Wages: $50,000',
        );
        useDocumentStore.getState().setVerified(entry.id, true);
      });

      render(
        <MemoryRouter>
          <AdvisorPage />
        </MemoryRouter>,
      );

      // Should have at least one assistant message (initial guidance/welcome)
      const assistantMessages = screen.getAllByTestId(/^chat-message-/);
      expect(assistantMessages.length).toBeGreaterThanOrEqual(1);
      expect(assistantMessages[0]).toHaveAttribute('data-role', 'assistant');
    });

    test('shows suggested questions based on tax situation', () => {
      render(
        <MemoryRouter>
          <AdvisorPage />
        </MemoryRouter>,
      );

      const suggestions = screen.getByTestId('suggested-questions');
      expect(suggestions).toBeInTheDocument();
    });

    test('user can type and send a message', () => {
      render(
        <MemoryRouter>
          <AdvisorPage />
        </MemoryRouter>,
      );

      const input = screen.getByTestId('chat-input');
      const sendBtn = screen.getByTestId('send-button');

      fireEvent.change(input, { target: { value: 'Should I itemize deductions?' } });
      expect(input).toHaveValue('Should I itemize deductions?');

      fireEvent.click(sendBtn);

      // Message should appear in the chat
      const messages = useChatStore.getState().messages;
      expect(messages.some((m) => m.content === 'Should I itemize deductions?')).toBe(true);
    });

    test('send button is disabled when input is empty', () => {
      render(
        <MemoryRouter>
          <AdvisorPage />
        </MemoryRouter>,
      );

      const sendBtn = screen.getByTestId('send-button');
      expect(sendBtn).toBeDisabled();
    });

    test('shows loading indicator while waiting for AI response', () => {
      act(() => {
        useChatStore.getState().setLoading(true);
      });

      render(
        <MemoryRouter>
          <AdvisorPage />
        </MemoryRouter>,
      );

      expect(screen.getByTestId('chat-loading')).toBeInTheDocument();
    });

    test('clicking a suggested question populates the input', () => {
      render(
        <MemoryRouter>
          <AdvisorPage />
        </MemoryRouter>,
      );

      const suggestions = screen.getByTestId('suggested-questions');
      const firstSuggestion = suggestions.querySelector('button');
      expect(firstSuggestion).toBeTruthy();

      fireEvent.click(firstSuggestion!);

      const input = screen.getByTestId('chat-input') as HTMLInputElement;
      expect(input.value.length).toBeGreaterThan(0);
    });

    test('has navigation links to verify and review pages', () => {
      render(
        <MemoryRouter>
          <AdvisorPage />
        </MemoryRouter>,
      );

      expect(screen.getByText(/back/i)).toBeInTheDocument();
      expect(screen.getByText(/continue/i)).toBeInTheDocument();
    });
  });
});
