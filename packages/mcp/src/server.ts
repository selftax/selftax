/**
 * MCP Server — Tool Registration
 *
 * Registers all 5 SelfTax tools with the MCP SDK. Each tool operates
 * on a shared session that holds the user profile, documents, and results.
 *
 * PII Safety: All tools that return text return REDACTED versions only.
 * Raw text and PII are stored in the session but never sent to the LLM.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createSession, type Session } from './session.js';
import { handleSetProfile } from './tools/setProfile.js';
import { handleScanTaxFolder } from './tools/scanTaxFolder.js';
import { handleViewDocument } from './tools/viewDocument.js';
import { handleCalculateTaxes } from './tools/calculateTaxes.js';
import { handleGenerateForms } from './tools/generateForms.js';

/** Create and configure the MCP server with all SelfTax tools */
export function createMcpServer(): { server: McpServer; session: Session } {
  const session = createSession();

  const server = new McpServer({
    name: 'selftax',
    version: '0.1.0',
  });

  // --- set_profile ---
  server.tool(
    'set_profile',
    'Store user profile (name, SSN, address, filing status). OPTIONAL if scan_tax_folder already auto-extracted the profile. Use this to correct or override auto-extracted data. PII is stored locally and NEVER returned.',
    {
      firstName: z.string().describe('First name'),
      lastName: z.string().describe('Last name'),
      ssn: z.string().describe('Social Security Number (XXX-XX-XXXX)'),
      street: z.string().describe('Street address'),
      city: z.string().describe('City'),
      state: z.string().describe('State (two-letter code)'),
      zip: z.string().describe('ZIP code'),
      filingStatus: z.enum(['single', 'mfj', 'mfs', 'hoh', 'qw']).describe(
        'Filing status: single, mfj (married filing jointly), mfs (married filing separately), hoh (head of household), qw (qualifying widow/er)',
      ),
      stateOfResidence: z.string().describe('State of residence (two-letter code, e.g. CA)'),
      dependents: z.array(z.object({
        firstName: z.string(),
        lastName: z.string(),
        ssn: z.string(),
        relationship: z.string(),
      })).optional().describe('Array of dependents'),
    },
    (args) => handleSetProfile(session, args),
  );

  // --- scan_tax_folder ---
  server.tool(
    'scan_tax_folder',
    'Scan a folder for tax documents (PDF, images, spreadsheets). Extracts text, strips PII, detects document types, and parses fields. Auto-extracts PII profile (name, SSN, address) and saves it locally. Returns REDACTED previews and numeric fields only — raw text is never returned.',
    {
      folderPath: z.string().describe('Absolute path to folder containing tax documents'),
    },
    (args) => handleScanTaxFolder(session, args),
  );

  // --- view_document ---
  server.tool(
    'view_document',
    'View the full redacted text of a document. Use this for deeper analysis of a specific document (e.g., interpreting spreadsheet contents). Returns only REDACTED text.',
    {
      documentId: z.string().describe('Document ID from scan_tax_folder results'),
    },
    (args) => handleViewDocument(session, args),
  );

  // --- calculate_taxes ---
  server.tool(
    'calculate_taxes',
    'Calculate federal (and state if CA) taxes from uploaded documents. Accepts overrides for any income type, deduction, or credit on Form 1040. Returns numeric results only — no PII.',
    {
      // Income
      wages: z.number().optional().describe('W-2 wages'),
      qualifiedDividends: z.number().optional().describe('Qualified dividends (preferential rates)'),
      ordinaryDividends: z.number().optional().describe('Ordinary dividends'),
      longTermCapitalGains: z.number().optional().describe('Long-term capital gains (0%/15%/20% rates)'),
      shortTermCapitalGains: z.number().optional().describe('Short-term capital gains (ordinary rates)'),
      capitalGains: z.number().optional().describe('Capital gains (legacy, treated as short-term)'),
      taxableIraDistributions: z.number().optional().describe('Taxable IRA distributions (1099-R Box 2a)'),
      taxablePensions: z.number().optional().describe('Taxable pension/annuity distributions'),
      socialSecurityBenefits: z.number().optional().describe('Gross Social Security benefits (taxable amount computed by engine)'),
      selfEmploymentIncome: z.number().optional().describe('Net self-employment income (Schedule C)'),
      unemploymentCompensation: z.number().optional().describe('Unemployment compensation'),
      alimonyReceived: z.number().optional().describe('Alimony received (pre-2019 agreements)'),
      farmIncome: z.number().optional().describe('Net farm income (Schedule F)'),
      k1OrdinaryIncome: z.number().optional().describe('K-1 ordinary income (partnerships/S-corps)'),
      k1RentalIncome: z.number().optional().describe('K-1 rental income/loss'),
      form4797Gain: z.number().optional().describe('Form 4797 gain/loss from business property'),
      rentalIncome: z.number().optional().describe('Net rental income override'),
      otherIncome: z.number().optional().describe('Other income'),
      nontaxableInterest: z.number().optional().describe('Tax-exempt interest (for SS combined income calc)'),
      // Rental property detail
      scheduleEInput: z.object({
        grossRentalIncome: z.number().optional(),
        insurance: z.number().optional(),
        mortgageInterest: z.number().optional(),
        repairs: z.number().optional(),
        propertyTaxes: z.number().optional(),
        depreciation: z.number().optional(),
        otherExpenses: z.number().optional(),
        managementFees: z.number().optional(),
        utilities: z.number().optional(),
        advertising: z.number().optional(),
        commissions: z.number().optional(),
        legalFees: z.number().optional(),
        supplies: z.number().optional(),
      }).optional().describe('Detailed rental property expenses for Schedule E'),
      // Deductions
      stateWithholding: z.number().optional().describe('State income tax withheld (overrides W-2 parsing)'),
      primaryPropertyTax: z.number().optional().describe('Primary residence property tax paid'),
      hsaDeduction: z.number().optional().describe('HSA contribution deduction'),
      studentLoanInterest: z.number().optional().describe('Student loan interest paid (max $2,500)'),
      educatorExpenses: z.number().optional().describe('Educator expenses (max $300)'),
      // Credits
      dependentCareExpenses: z.number().optional().describe('Dependent care expenses for Form 2441'),
      educationExpenses: z.number().optional().describe('Qualified education expenses for Form 8863'),
      educationCreditType: z.enum(['aotc', 'llc']).optional().describe('Education credit type'),
      numberOfStudents: z.number().optional().describe('Number of students for AOTC'),
      foreignTaxCredit: z.number().optional().describe('Foreign tax credit (Form 1116)'),
      premiumTaxCredit: z.number().optional().describe('Premium Tax Credit (positive=refund, negative=repay)'),
      retirementContributions: z.number().optional().describe('Retirement contributions for Saver\'s Credit'),
      cleanEnergyCredit: z.number().optional().describe('Residential clean energy credit (Form 5695)'),
      energyImprovementCredit: z.number().optional().describe('Energy improvement credit (Form 5695)'),
      // EITC
      earnedIncome: z.number().optional().describe('Earned income for EITC'),
      qualifyingChildrenForEITC: z.number().optional().describe('Qualifying children for EITC (0-3)'),
      investmentIncomeForEITC: z.number().optional().describe('Investment income for EITC test'),
      // QBI
      qbiIncome: z.number().optional().describe('Qualified business income for Section 199A'),
      qbiW2Wages: z.number().optional().describe('QBI W-2 wages for wage limitation'),
      qbiPropertyBasis: z.number().optional().describe('QBI unadjusted basis of qualified property'),
      isQbiSSTB: z.boolean().optional().describe('Whether QBI is from a Specified Service Trade'),
      // Carryforwards
      capitalLossCarryforward: z.number().optional().describe('Capital loss carryforward from prior year'),
      // Payments
      estimatedPayments: z.number().optional().describe('Estimated tax payments made'),
      federalWithholding: z.number().optional().describe('Federal tax withheld override'),
    },
    (args) => handleCalculateTaxes(session, args),
  );

  // --- generate_forms ---
  server.tool(
    'generate_forms',
    'Generate filled PDF tax forms and save to disk. PII is merged from the stored profile at this final step. Returns file paths only — PDF contents are never returned.',
    {
      outputFolder: z.string().describe('Absolute path to output directory for PDF files'),
      forms: z.array(z.string()).optional().describe('Optional list of form types to generate (defaults to all required forms)'),
    },
    (args) => handleGenerateForms(session, args),
  );

  return { server, session };
}
