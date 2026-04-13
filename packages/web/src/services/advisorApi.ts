/**
 * AI Advisor API service.
 *
 * This module handles communication with the Claude API using ONLY anonymized data.
 * It never accepts TaxDocument or UserProfile — only redacted document info and
 * anonymized context.
 *
 * PII Boundary: buildAnonymizedContext() creates the system context from redacted documents.
 * sendAdvisorMessage() sends a user message + anonymized context to the API.
 */

import type { DocumentType } from '@selftax/core';
import type { ChatMessageData } from '../stores/chatStore';

/** Minimal redacted document info for building context */
export interface AnonymizedDocumentInfo {
  id: string;
  redactedText: string;
  type: DocumentType;
  fields: Record<string, string | number>;
}

const TYPE_LABELS: Record<string, string> = {
  w2: 'W-2 (Wage and Tax Statement)',
  '1099-b': '1099-B (Proceeds from Broker)',
  '1099-int': '1099-INT (Interest Income)',
  '1099-div': '1099-DIV (Dividends)',
  '1099-misc': '1099-MISC (Miscellaneous Income)',
  '1099-nec': '1099-NEC (Nonemployee Compensation)',
  '1098': '1098 (Mortgage Interest)',
  receipt: 'Receipt',
  spreadsheet: 'Spreadsheet',
  statement: 'Statement',
  other: 'Other Document',
};

/**
 * Builds an anonymized context string from redacted documents.
 * This is the ONLY data that gets sent to the external API.
 * Never pass raw/unredacted text to this function.
 */
export function buildAnonymizedContext(documents: AnonymizedDocumentInfo[]): string {
  if (documents.length === 0) {
    return 'No documents uploaded yet.';
  }

  const sections = documents.map((doc, index) => {
    const typeLabel = TYPE_LABELS[doc.type] ?? doc.type;
    const lines = [`--- Document ${index + 1}: ${typeLabel} ---`];

    if (doc.redactedText.trim()) {
      lines.push(doc.redactedText);
    }

    const fieldEntries = Object.entries(doc.fields);
    if (fieldEntries.length > 0) {
      lines.push('Extracted fields:');
      for (const [key, value] of fieldEntries) {
        lines.push(`  ${key}: ${value}`);
      }
    }

    return lines.join('\n');
  });

  return sections.join('\n\n');
}

/** Type for the fetch function — allows injection for testing */
type FetchFn = typeof fetch;

/**
 * Sends a message to the AI advisor via the Claude API.
 *
 * @param userMessage - The user's question
 * @param anonymizedContext - Pre-built anonymized context (from buildAnonymizedContext)
 * @param conversationHistory - Previous messages for multi-turn conversation
 * @param fetchFn - Optional fetch function (for testing)
 * @returns The assistant's response text
 */
export async function sendAdvisorMessage(
  userMessage: string,
  anonymizedContext: string,
  conversationHistory: ChatMessageData[],
  fetchFn: FetchFn = fetch,
): Promise<string> {
  const systemPrompt = [
    'You are a CPA-level AI tax advisor. You help users prepare their taxes accurately.',
    'You have access to the user\'s anonymized financial documents (PII has been redacted).',
    'Provide specific, actionable tax guidance based on their situation.',
    'If you need more information, ask specific questions.',
    'Never ask for SSN, names, addresses, or other PII — you don\'t need it.',
    '',
    'User\'s anonymized documents:',
    anonymizedContext,
  ].join('\n');

  const messages = [
    ...conversationHistory.map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    })),
    { role: 'user' as const, content: userMessage },
  ];

  const response = await fetchFn('/api/advisor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system: systemPrompt,
      messages,
    }),
  });

  if (!response.ok) {
    throw new Error(`Advisor API error: ${response.status}`);
  }

  const data = await response.json();
  return data.response;
}
