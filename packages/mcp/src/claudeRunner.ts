/**
 * Claude CLI Runner — shared utility for spawning Claude and capturing metrics.
 *
 * Returns the result text plus cost/token/timing metadata from the JSON envelope.
 * Used by both docDistiller and mcpOrchestrator.
 */

import { spawn } from 'child_process';

export interface ClaudeResult {
  text: string;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  model: string;
}

export interface ClaudeRunOptions {
  /** Timeout in milliseconds (default 120000) */
  timeout?: number;
  /** Model override (default: user's configured model) */
  model?: string;
  /** Enable Claude CLI debug output on stderr */
  debug?: boolean;
}

/** Accumulated cost/token stats across multiple calls */
export interface ClaudeStats {
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  calls: number;
}

export function createStats(): ClaudeStats {
  return { totalCost: 0, totalInputTokens: 0, totalOutputTokens: 0, calls: 0 };
}

export function addToStats(stats: ClaudeStats, result: ClaudeResult): void {
  stats.totalCost += result.cost;
  stats.totalInputTokens += result.inputTokens;
  stats.totalOutputTokens += result.outputTokens;
  stats.calls += 1;
}

export function formatStats(stats: ClaudeStats): string {
  return `${stats.calls} calls, ${stats.totalInputTokens.toLocaleString()} in / ${stats.totalOutputTokens.toLocaleString()} out tokens, $${stats.totalCost.toFixed(4)}`;
}

/**
 * Run Claude CLI with file reading capability — sends a PDF visually.
 * Uses --allowedTools Read so the model can read the file with vision.
 */
export function runClaudeWithFile(prompt: string, filePath: string, options: ClaudeRunOptions = {}): Promise<ClaudeResult> {
  const { timeout = 120000, model, debug } = options;
  const dir = filePath.substring(0, filePath.lastIndexOf('/'));

  return new Promise((resolve, reject) => {
    const args = ['-p', '-', '--output-format', 'json', '--max-turns', '3',
      '--allowedTools', 'Read', '--add-dir', dir];
    if (model) args.push('--model', model);
    if (debug) args.push('--debug');

    const spawnStart = Date.now();
    console.log(`[Claude+File] Spawning with Read tool (${filePath}, timeout ${timeout / 1000}s)`);

    const proc = spawn('claude', args, { timeout });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => {
      if (!stdout) console.log(`[Claude+File] First response after ${((Date.now() - spawnStart) / 1000).toFixed(1)}s`);
      stdout += d.toString();
    });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      const elapsed = Date.now() - spawnStart;
      console.log(`[Claude+File] Done in ${(elapsed / 1000).toFixed(1)}s (code ${code})`);
      if (code !== 0 && !stdout) {
        reject(new Error(`claude exited ${code}: ${stderr.slice(0, 500)}`));
        return;
      }
      try {
        const envelope = JSON.parse(stdout);
        resolve({
          text: envelope.result || '',
          cost: envelope.total_cost_usd ?? 0,
          inputTokens: (envelope.usage?.input_tokens ?? 0) +
            (envelope.usage?.cache_creation_input_tokens ?? 0) +
            (envelope.usage?.cache_read_input_tokens ?? 0),
          outputTokens: envelope.usage?.output_tokens ?? 0,
          durationMs: elapsed,
          model: Object.keys(envelope.modelUsage ?? {})[0] ?? 'unknown',
        });
      } catch {
        resolve({ text: stdout, cost: 0, inputTokens: 0, outputTokens: 0, durationMs: elapsed, model: 'unknown' });
      }
    });
    proc.on('error', reject);
    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}

/** Run Claude CLI with prompt piped via stdin. Returns structured result with metrics. */
export function runClaude(prompt: string, options: ClaudeRunOptions = {}): Promise<ClaudeResult> {
  const { timeout = 120000, model, debug } = options;

  return new Promise((resolve, reject) => {
    const args = ['-p', '-', '--output-format', 'json', '--max-turns', '1'];
    if (model) args.push('--model', model);
    if (debug) args.push('--debug');

    const spawnStart = Date.now();
    console.log(`[Claude] Spawning: claude ${args.join(' ')} (${prompt.length.toLocaleString()} chars, timeout ${timeout / 1000}s)`);

    const proc = spawn('claude', args, { timeout });

    proc.on('spawn', () => {
      console.log(`[Claude] Process started in ${Date.now() - spawnStart}ms, writing ${prompt.length.toLocaleString()} chars to stdin...`);
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => {
      if (!stdout) console.log(`[Claude] First stdout chunk after ${((Date.now() - spawnStart) / 1000).toFixed(1)}s`);
      stdout += d.toString();
    });
    proc.stderr.on('data', (d: Buffer) => {
      const chunk = d.toString();
      stderr += chunk;
      if (debug) process.stderr.write(chunk);
    });

    proc.on('close', (code) => {
      console.log(`[Claude] Exited code ${code} after ${((Date.now() - spawnStart) / 1000).toFixed(1)}s (stdout: ${stdout.length} chars, stderr: ${stderr.length} chars)`);
      if (code !== 0 && !stdout) {
        reject(new Error(`claude exited ${code}: ${stderr.slice(0, 500)}`));
        return;
      }
      try {
        const envelope = JSON.parse(stdout);
        resolve({
          text: envelope.result || '',
          cost: envelope.total_cost_usd ?? 0,
          inputTokens: (envelope.usage?.input_tokens ?? 0) +
            (envelope.usage?.cache_creation_input_tokens ?? 0) +
            (envelope.usage?.cache_read_input_tokens ?? 0),
          outputTokens: envelope.usage?.output_tokens ?? 0,
          durationMs: envelope.duration_ms ?? 0,
          model: Object.keys(envelope.modelUsage ?? {})[0] ?? 'unknown',
        });
      } catch {
        resolve({
          text: stdout,
          cost: 0,
          inputTokens: 0,
          outputTokens: 0,
          durationMs: 0,
          model: 'unknown',
        });
      }
    });
    proc.on('error', reject);
    proc.stdin.write(prompt, () => {
      console.log(`[Claude] Stdin written in ${Date.now() - spawnStart}ms`);
    });
    proc.stdin.end();
  });
}

/** Model ID mapping */
const MODEL_IDS: Record<string, string> = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6-20250514',
  opus: 'claude-opus-4-6-20250514',
};

/**
 * Run Claude via direct API with optional document (PDF) support.
 * Much faster than CLI — no process spawn, supports multimodal documents.
 */
export async function runClaudeAPI(
  prompt: string,
  options: ClaudeRunOptions & { pdfBase64?: string } = {},
): Promise<ClaudeResult> {
  const { timeout = 120000, model = 'sonnet', pdfBase64 } = options;

  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic();

  const start = Date.now();
  const modelId = MODEL_IDS[model] ?? model;

  // Build content blocks
  const content: Array<{ type: string; [key: string]: unknown }> = [];

  if (pdfBase64) {
    content.push({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
    });
  }

  content.push({ type: 'text', text: prompt });

  console.log(`[Claude API] ${modelId} (${pdfBase64 ? 'PDF doc + ' : ''}${prompt.length} chars, timeout ${timeout / 1000}s)`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await client.messages.create({
    model: modelId,
    max_tokens: 4096,
    messages: [{ role: 'user', content: content as any }],
  } as any);

  const elapsed = Date.now() - start;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const respContent = (response as any).content as Array<{ type: string; text?: string }>;
  const text = respContent
    .filter((b) => b.type === 'text' && b.text)
    .map((b) => b.text!)
    .join('');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const usage = (response as any).usage as { input_tokens: number; output_tokens: number };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const respModel = (response as any).model as string;

  const result: ClaudeResult = {
    text,
    cost: 0,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    durationMs: elapsed,
    model: respModel,
  };

  // Estimate cost (Sonnet: $3/M input, $15/M output)
  const rates: Record<string, { input: number; output: number }> = {
    haiku: { input: 0.80, output: 4.00 },
    sonnet: { input: 3.00, output: 15.00 },
    opus: { input: 15.00, output: 75.00 },
  };
  const rate = rates[model] ?? rates.sonnet;
  result.cost = (result.inputTokens * rate.input + result.outputTokens * rate.output) / 1_000_000;

  console.log(`[Claude API] Done in ${(elapsed / 1000).toFixed(1)}s (${result.inputTokens} in / ${result.outputTokens} out, $${result.cost.toFixed(4)})`);

  return result;
}

/**
 * Run Gemini with PDF vision — free tier, no credit card needed.
 * Set GEMINI_API_KEY env var (get from aistudio.google.com).
 */
export async function runGeminiWithPDF(
  prompt: string,
  pdfBase64: string,
  options: { timeout?: number } = {},
): Promise<ClaudeResult> {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const start = Date.now();
  console.log(`[Gemini] gemini-2.0-flash (PDF + ${prompt.length} chars)`);

  const result = await model.generateContent([
    { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } },
    { text: prompt },
  ]);

  const elapsed = Date.now() - start;
  const text = result.response.text();
  const usage = result.response.usageMetadata;

  console.log(`[Gemini] Done in ${(elapsed / 1000).toFixed(1)}s (${usage?.promptTokenCount ?? 0} in / ${usage?.candidatesTokenCount ?? 0} out)`);

  return {
    text,
    cost: 0, // free tier
    inputTokens: usage?.promptTokenCount ?? 0,
    outputTokens: usage?.candidatesTokenCount ?? 0,
    durationMs: elapsed,
    model: 'gemini-2.0-flash',
  };
}

/** Check if Claude CLI is available */
export async function isClaudeAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('claude', ['--version']);
    proc.on('close', (code) => resolve(code === 0));
    proc.on('error', () => resolve(false));
    setTimeout(() => { proc.kill(); resolve(false); }, 5000);
  });
}
