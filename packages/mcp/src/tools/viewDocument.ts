/**
 * view_document Tool
 *
 * Returns the full redacted text of a single document from the session.
 * Useful for the LLM to do deeper analysis of a specific document
 * (e.g., interpreting a spreadsheet's contents).
 *
 * Only returns REDACTED text — raw text is NEVER returned.
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Session } from '../session.js';
import { getDocument } from '../session.js';

export interface ViewDocumentInput {
  documentId: string;
}

export function handleViewDocument(
  session: Session,
  input: ViewDocumentInput,
): CallToolResult {
  const doc = getDocument(session, input.documentId);

  if (!doc) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: `Document not found: ${input.documentId}`,
          }),
        },
      ],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          id: doc.id,
          fileName: doc.fileName,
          documentType: doc.documentType,
          piiDetectionsCount: doc.piiDetections.length,
          redactedText: doc.redactedText,
          fields: doc.fields,
        }, null, 2),
      },
    ],
  };
}
