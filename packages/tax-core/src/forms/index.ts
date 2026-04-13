export { mapW2Fields, aggregateW2s, findAmountNearLabel } from './w2Mapper';
export type { W2Fields } from './w2Mapper';
export {
  map1099BFields,
  map1099DIVFields,
  map1099INTFields,
  map1099NECFields,
  map1098Fields,
} from './form1099Mapper';
export type {
  Form1099BFields,
  Form1099DIVFields,
  Form1099INTFields,
  Form1099NECFields,
  Form1098Fields,
} from './form1099Mapper';
export { aggregateAllDocuments } from './aggregateDocuments';
export type { AggregatedTaxData, ParsedDocument } from './aggregateDocuments';
export {
  buildCategorizationPrompt,
  aggregateExpenses,
  parseCategorizedExpenses,
  CATEGORY_TO_LINE,
} from './expenseCategorizer';
export type { ExpenseCategory, CategorizedExpense } from './expenseCategorizer';
export {
  build1040Fields,
  buildScheduleAFields,
  buildScheduleDFields,
  buildScheduleEFields,
  buildForm8949Fields,
  buildForm540Fields,
  buildPIIFields,
  assembleTaxReturn,
} from './pdfDataBuilder';
export type { PDFFormData, TaxReturnPackage } from './pdfDataBuilder';
export { buildTaxReturn } from './buildTaxReturn';
export type { BuildTaxReturnInput, RentalPropertyInput } from './buildTaxReturn';
export { toPDFFieldMap, toFreeFileFieldMap } from './taxReturnAdapters';
export { PDF_FIELD_MAPPINGS, PDF_TEMPLATE_FILES, taxFormTypeToFormKey } from './pdfFieldMappings';
export type { FormKey, PDFFieldMapping } from './pdfFieldMappings';
export { FREE_FILE_FIELD_MAPPINGS } from './freeFileFieldMappings';
export { extractStructuredFields } from './structuredExtractor';
export type { StructuredExtraction } from './structuredExtractor';
export { mergeStructuredExtractions } from './structuredMerger';
export type { MergedTaxInput } from './structuredMerger';
