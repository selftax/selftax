/**
 * Background service worker — handles server communication that
 * must survive popup close/reopen cycles.
 *
 * The popup is ephemeral (destroyed on click-away). Any long-running
 * fetch (e.g., LLM extraction via /extract) must happen here.
 *
 * Flow:
 *   1. Popup sends EXTRACT_REQUEST with documents + profile
 *   2. Worker fetches /extract, stores result in chrome.storage
 *   3. Popup reopens → checks for stored result → calculates locally
 */

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'EXTRACT_REQUEST') {
    handleExtract(message.payload).then(sendResponse);
    return true; // Keep channel open for async
  }

  if (message.type === 'EXTRACT_STATUS') {
    chrome.storage.local.get('extractionStatus', (data) => {
      sendResponse(data.extractionStatus ?? null);
    });
    return true;
  }
});

interface ExtractPayload {
  profile: { filingStatus: string; stateOfResidence: string; dependentCount: number };
  documents: Array<{
    type: string;
    redactedText: string;
    fields: Record<string, unknown>;
    fileName: string;
    fileData?: string;
    pdfBase64?: string;
  }>;
}

async function handleExtract(payload: ExtractPayload): Promise<{ ok: boolean; error?: string }> {
  // Mark extraction as in-progress
  await chrome.storage.local.set({
    extractionStatus: { state: 'extracting', startedAt: Date.now() },
  });

  try {
    const stored = await chrome.storage.local.get('serverPort');
    const port = (stored.serverPort as number) ?? 3742;
    const response = await fetch(`http://localhost:${port}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Server error' }));
      await chrome.storage.local.set({
        extractionStatus: { state: 'error', error: err.error ?? 'Extraction failed' },
      });
      return { ok: false, error: err.error ?? 'Extraction failed' };
    }

    const { extractedFields } = await response.json();

    // Store the server result — popup will pick it up and calculate
    await chrome.storage.local.set({
      storedServerOverrides: extractedFields,
      extractionStatus: { state: 'done', completedAt: Date.now() },
    });

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed';
    const userMsg = msg.includes('fetch') ? `Server not running on port ${await chrome.storage.local.get('serverPort').then(s => (s.serverPort as number) ?? 3742)}. Check Settings.` : msg;
    await chrome.storage.local.set({
      extractionStatus: { state: 'error', error: userMsg },
    });
    return { ok: false, error: userMsg };
  }
}
