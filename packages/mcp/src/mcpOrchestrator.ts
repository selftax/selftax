/**
 * MCP Orchestrator — determines calculate_taxes overrides from distilled summaries.
 *
 * Stage 3: receives concise summaries, returns structured JSON overrides.
 */

import {
  runClaude,
  createStats,
  addToStats,
  formatStats,
  isClaudeAvailable,
  type ClaudeStats,
} from './claudeRunner.js';
import type { CalculateTaxesInput } from './tools/calculateTaxes.js';

export { isClaudeAvailable };

export interface OrchestratorInput {
  documents: Array<{ fileName: string; summary: string }>;
  dependentCount: number;
  filingStatus: string;
  stateOfResidence: string;
}

export interface OrchestratorResult {
  overrides: CalculateTaxesInput;
  reasoning?: string;
  stats: ClaudeStats;
}

export async function runOrchestrator(input: OrchestratorInput): Promise<OrchestratorResult> {
  const summarySection = input.documents
    .map((d) => `=== ${d.fileName} ===\n${d.summary}`)
    .join('\n\n');

  const prompt = `You are a tax analyst. Below are summaries of a taxpayer's documents. Determine the inputs for their tax calculation.

TAXPAYER: ${input.filingStatus}, ${input.stateOfResidence}, ${input.dependentCount} dependents

DOCUMENT SUMMARIES:
${summarySection}

From these summaries, determine ALL tax calculation inputs. Combine information across documents (e.g., sum rental income from all units, use depreciation from prior year return for current year). Only include fields that have non-zero values.

Respond with ONLY a JSON object — no markdown fences, no text before or after. Include any of these fields that apply:

{
  "wages": null,
  "qualifiedDividends": null,
  "ordinaryDividends": null,
  "longTermCapitalGains": null,
  "shortTermCapitalGains": null,
  "taxableIraDistributions": null,
  "taxablePensions": null,
  "socialSecurityBenefits": null,
  "nontaxableInterest": null,
  "selfEmploymentIncome": null,
  "unemploymentCompensation": null,
  "alimonyReceived": null,
  "farmIncome": null,
  "k1OrdinaryIncome": null,
  "k1RentalIncome": null,
  "form4797Gain": null,
  "scheduleEInput": {"grossRentalIncome":0,"insurance":0,"mortgageInterest":0,"repairs":0,"propertyTaxes":0,"depreciation":0,"managementFees":0,"utilities":0,"otherExpenses":0},
  "stateWithholding": null,
  "primaryPropertyTax": null,
  "dependentCareExpenses": null,
  "capitalLossCarryforward": null,
  "qbiIncome": null,
  "hsaDeduction": null,
  "studentLoanInterest": null,
  "educationExpenses": null,
  "educationCreditType": null,
  "foreignTaxCredit": null,
  "premiumTaxCredit": null,
  "retirementContributions": null,
  "cleanEnergyCredit": null,
  "energyImprovementCredit": null,
  "educatorExpenses": null,
  "estimatedPayments": null,
  "reasoning": "brief explanation of key numbers and sources"
}

Omit fields that are null/zero/not found in the documents.`;

  const summaryChars = summarySection.length;
  const promptChars = prompt.length;
  console.log(`[Orchestrator] Prompt: ${promptChars.toLocaleString()} chars (${summaryChars.toLocaleString()} from summaries, ${input.documents.length} docs)`);

  const stats = createStats();

  try {
    const result = await runClaude(prompt, { timeout: 600000, model: 'sonnet' });
    addToStats(stats, result);
    console.log(`[Orchestrator] Claude responded in ${(result.durationMs / 1000).toFixed(1)}s (${result.text.length} chars, $${result.cost.toFixed(4)})`);

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log('[Orchestrator] Could not parse JSON from Claude response');
      console.log('[Orchestrator] Raw response (first 500 chars):', result.text.slice(0, 500));
      return { overrides: {}, stats };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const { reasoning, ...overrides } = parsed;
    return { overrides, reasoning, stats };
  } catch (err) {
    console.error('[Orchestrator] Error:', err instanceof Error ? err.message : err);
    return { overrides: {}, stats };
  }
}
