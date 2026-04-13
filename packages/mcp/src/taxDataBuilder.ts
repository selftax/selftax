/**
 * Tax Data Builder — MCP Port
 *
 * Bridges SessionDocument data and user profile into a Form1040Input
 * suitable for the tax calculation engine.
 *
 * Port of packages/web/src/services/taxDataBuilder.ts that works with
 * SessionDocument[] instead of DocumentEntry[].
 *
 * Pure function — no side effects.
 */

import {
  mapW2Fields,
  aggregateW2s,
  map1099INTFields,
  map1099DIVFields,
  map1099NECFields,
  map1099BFields,
  map1098Fields,
  aggregateAllDocuments,
  irsRound,
} from '@selftax/core';
import type {
  Form1040Input,
  FilingStatus,
  DocumentType,
  ParsedDocument,
} from '@selftax/core';
import type { SessionDocument, SessionProfile } from './session.js';

/**
 * Build a Form1040Input from session documents and user profile.
 *
 * For each document, calls the appropriate field mapper on its raw text,
 * then aggregates across all documents to produce a single Form1040Input.
 */
export function buildForm1040InputFromSession(
  documents: SessionDocument[],
  profile: SessionProfile,
): Form1040Input {
  // --- W-2 processing ---
  const w2Docs = documents.filter((d) => d.documentType === 'w2');
  const w2Fields = w2Docs.map((d) => mapW2Fields(d.rawText));
  const w2Agg = aggregateW2s(w2Fields);

  // --- 1099/1098 processing via aggregateAllDocuments ---
  const parsedDocs: ParsedDocument[] = [];

  for (const doc of documents) {
    const parsed = parseDocumentFields(doc.documentType, doc.rawText);
    if (parsed) {
      parsedDocs.push(parsed);
    }
  }

  const docAgg = aggregateAllDocuments(parsedDocs);

  // --- Combine withholding from W-2s and 1099s ---
  const totalFederalWithholding = irsRound(
    w2Agg.totalFederalWithholding + docAgg.totalFederalWithholding,
  );

  // --- Capital gains: proceeds - cost basis ---
  const capitalGains = irsRound(docAgg.totalProceeds - docAgg.totalCostBasis);

  // --- Other income: interest + NEC ---
  const otherIncome = irsRound(
    docAgg.totalInterestIncome + docAgg.totalNonemployeeCompensation,
  );

  // --- Itemized deductions from 1098 data ---
  const itemizedDeductions = irsRound(
    docAgg.totalMortgageInterest +
    docAgg.totalPointsPaid +
    docAgg.totalMortgageInsurancePremiums +
    docAgg.totalPropertyTax,
  );

  // --- Build the Form1040Input ---
  const input: Form1040Input = {
    filingStatus: profile.filingStatus as FilingStatus,
    wages: w2Agg.totalWages,
    ordinaryDividends: docAgg.totalOrdinaryDividends || undefined,
    qualifiedDividends: docAgg.totalQualifiedDividends || undefined,
    capitalGains: capitalGains !== 0 ? capitalGains : undefined,
    otherIncome: otherIncome !== 0 ? otherIncome : undefined,
    itemizedDeductions: itemizedDeductions !== 0 ? itemizedDeductions : undefined,
    federalWithholding: totalFederalWithholding !== 0 ? totalFederalWithholding : undefined,
    qualifyingChildren: profile.dependents.length > 0 ? profile.dependents.length : undefined,
  };

  return input;
}

/**
 * Parse a document's extracted text into a ParsedDocument for aggregation.
 * Returns null for document types that don't map to 1099/1098 aggregation
 * (W-2s are handled separately, receipts/other are ignored).
 */
function parseDocumentFields(
  type: DocumentType,
  extractedText: string,
): ParsedDocument | null {
  switch (type) {
    case '1099-int': {
      const fields = map1099INTFields(extractedText);
      return {
        type,
        fields: {
          interestIncome: fields.interestIncome ?? 0,
          federalTaxWithheld: fields.federalTaxWithheld ?? 0,
        },
      };
    }
    case '1099-div': {
      const fields = map1099DIVFields(extractedText);
      return {
        type,
        fields: {
          ordinaryDividends: fields.ordinaryDividends ?? 0,
          qualifiedDividends: fields.qualifiedDividends ?? 0,
          capitalGainsDistributions: fields.capitalGainsDistributions ?? 0,
          federalTaxWithheld: fields.federalTaxWithheld ?? 0,
        },
      };
    }
    case '1099-nec': {
      const fields = map1099NECFields(extractedText);
      return {
        type,
        fields: {
          nonemployeeCompensation: fields.nonemployeeCompensation ?? 0,
          federalTaxWithheld: fields.federalTaxWithheld ?? 0,
        },
      };
    }
    case '1099-b': {
      const fields = map1099BFields(extractedText);
      return {
        type,
        fields: {
          proceeds: fields.proceeds ?? 0,
          costBasis: fields.costBasis ?? 0,
          federalTaxWithheld: fields.federalTaxWithheld ?? 0,
        },
      };
    }
    case '1098': {
      const fields = map1098Fields(extractedText);
      return {
        type,
        fields: {
          mortgageInterest: fields.mortgageInterest ?? 0,
          pointsPaid: fields.pointsPaid ?? 0,
          mortgageInsurancePremiums: fields.mortgageInsurancePremiums ?? 0,
          propertyTax: fields.propertyTax ?? 0,
        },
      };
    }
    default:
      return null;
  }
}
