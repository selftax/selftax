import { irsRound } from '../engine/form1040';
import type { DocumentType } from '../types';

/** Aggregated totals from all tax documents, suitable for Form1040Input */
export interface AggregatedTaxData {
  // From 1099-INT
  totalInterestIncome: number;
  // From 1099-DIV
  totalOrdinaryDividends: number;
  totalQualifiedDividends: number;
  totalCapitalGainsDistributions: number;
  // From 1099-B
  totalProceeds: number;
  totalCostBasis: number;
  // From 1099-NEC
  totalNonemployeeCompensation: number;
  // From 1098
  totalMortgageInterest: number;
  totalPointsPaid: number;
  totalMortgageInsurancePremiums: number;
  totalPropertyTax: number;
  // Combined withholding from all 1099s
  totalFederalWithholding: number;
}

/** A parsed document with its type and extracted numeric fields */
export interface ParsedDocument {
  type: DocumentType;
  fields: Record<string, number>;
}

/** Supported types for aggregation */
const AGGREGATABLE_TYPES = new Set<DocumentType>([
  '1099-int',
  '1099-div',
  '1099-b',
  '1099-nec',
  '1098',
]);

/** Safely get a numeric field, defaulting to 0 */
function getField(fields: Record<string, number>, key: string): number {
  return fields[key] ?? 0;
}

/**
 * Aggregate all parsed documents into combined totals for tax form input.
 * Only processes known 1099/1098 types; ignores W-2s (use aggregateW2s),
 * receipts, and other unrecognized types.
 */
export function aggregateAllDocuments(
  documents: ParsedDocument[],
): AggregatedTaxData {
  const result: AggregatedTaxData = {
    totalInterestIncome: 0,
    totalOrdinaryDividends: 0,
    totalQualifiedDividends: 0,
    totalCapitalGainsDistributions: 0,
    totalProceeds: 0,
    totalCostBasis: 0,
    totalNonemployeeCompensation: 0,
    totalMortgageInterest: 0,
    totalPointsPaid: 0,
    totalMortgageInsurancePremiums: 0,
    totalPropertyTax: 0,
    totalFederalWithholding: 0,
  };

  for (const doc of documents) {
    if (!AGGREGATABLE_TYPES.has(doc.type)) continue;

    // Federal withholding from any supported type
    result.totalFederalWithholding += getField(
      doc.fields,
      'federalTaxWithheld',
    );

    switch (doc.type) {
      case '1099-int':
        result.totalInterestIncome += getField(doc.fields, 'interestIncome');
        break;

      case '1099-div':
        result.totalOrdinaryDividends += getField(
          doc.fields,
          'ordinaryDividends',
        );
        result.totalQualifiedDividends += getField(
          doc.fields,
          'qualifiedDividends',
        );
        result.totalCapitalGainsDistributions += getField(
          doc.fields,
          'capitalGainsDistributions',
        );
        break;

      case '1099-b':
        result.totalProceeds += getField(doc.fields, 'proceeds');
        result.totalCostBasis += getField(doc.fields, 'costBasis');
        break;

      case '1099-nec':
        result.totalNonemployeeCompensation += getField(
          doc.fields,
          'nonemployeeCompensation',
        );
        break;

      case '1098':
        result.totalMortgageInterest += getField(
          doc.fields,
          'mortgageInterest',
        );
        result.totalPointsPaid += getField(doc.fields, 'pointsPaid');
        result.totalMortgageInsurancePremiums += getField(
          doc.fields,
          'mortgageInsurancePremiums',
        );
        result.totalPropertyTax += getField(doc.fields, 'propertyTax');
        break;
    }
  }

  // IRS rounding on all totals
  result.totalInterestIncome = irsRound(result.totalInterestIncome);
  result.totalOrdinaryDividends = irsRound(result.totalOrdinaryDividends);
  result.totalQualifiedDividends = irsRound(result.totalQualifiedDividends);
  result.totalCapitalGainsDistributions = irsRound(
    result.totalCapitalGainsDistributions,
  );
  result.totalProceeds = irsRound(result.totalProceeds);
  result.totalCostBasis = irsRound(result.totalCostBasis);
  result.totalNonemployeeCompensation = irsRound(
    result.totalNonemployeeCompensation,
  );
  result.totalMortgageInterest = irsRound(result.totalMortgageInterest);
  result.totalPointsPaid = irsRound(result.totalPointsPaid);
  result.totalMortgageInsurancePremiums = irsRound(
    result.totalMortgageInsurancePremiums,
  );
  result.totalPropertyTax = irsRound(result.totalPropertyTax);
  result.totalFederalWithholding = irsRound(result.totalFederalWithholding);

  return result;
}
