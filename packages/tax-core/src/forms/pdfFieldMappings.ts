/**
 * PDF Field Mappings — maps TaxReturnData property names to actual
 * AcroForm field names in IRS/FTB PDF templates.
 *
 * These field names were discovered by introspecting the fillable PDF
 * templates in packages/tax-core/forms/templates/2024/ using pdf-lib.
 *
 * Convention: keys are TaxReturnData paths (e.g., 'form1040.line1a'),
 * values are the full AcroForm field names in the PDF.
 */

/** Mapping from canonical field name to PDF AcroForm field name */
export type PDFFieldMapping = Record<string, string>;

// ── Form 1040 ──────────────────────────────────────────────────────────

export const FORM_1040_PDF_FIELDS: PDFFieldMapping = {
  // PII fields (merged at final step)
  'pii.primary.firstName':  'topmostSubform[0].Page1[0].f1_01[0]',
  'pii.primary.lastName':   'topmostSubform[0].Page1[0].f1_02[0]',
  'pii.primary.ssn':        'topmostSubform[0].Page1[0].f1_03[0]',
  'pii.spouse.firstName':   'topmostSubform[0].Page1[0].f1_04[0]',
  'pii.spouse.lastName':    'topmostSubform[0].Page1[0].f1_05[0]',
  'pii.spouse.ssn':         'topmostSubform[0].Page1[0].f1_06[0]',
  'pii.address.street':     'topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_10[0]',
  'pii.address.aptNo':      'topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_11[0]',
  'pii.address.city':       'topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_12[0]',
  'pii.address.state':      'topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_13[0]',
  'pii.address.zip':        'topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_14[0]',

  // Filing status checkboxes
  'form1040.filingStatus.single': 'topmostSubform[0].Page1[0].FilingStatus_ReadOrder[0].c1_3[0]',
  'form1040.filingStatus.mfj':    'topmostSubform[0].Page1[0].FilingStatus_ReadOrder[0].c1_3[1]',
  'form1040.filingStatus.mfs':    'topmostSubform[0].Page1[0].FilingStatus_ReadOrder[0].c1_3[2]',
  'form1040.filingStatus.hoh':    'topmostSubform[0].Page1[0].c1_1[0]',
  'form1040.filingStatus.qw':     'topmostSubform[0].Page1[0].c1_2[0]',

  // Dependents (row 1 — verified against 2024 PDF)
  'pii.dependents.0.name':         'topmostSubform[0].Page1[0].Table_Dependents[0].Row1[0].f1_20[0]',
  'pii.dependents.0.ssn':          'topmostSubform[0].Page1[0].Table_Dependents[0].Row1[0].f1_21[0]',
  'pii.dependents.0.relationship': 'topmostSubform[0].Page1[0].Table_Dependents[0].Row1[0].f1_22[0]',
  // Dependents (row 2)
  'pii.dependents.1.name':         'topmostSubform[0].Page1[0].Table_Dependents[0].Row2[0].f1_23[0]',
  'pii.dependents.1.ssn':          'topmostSubform[0].Page1[0].Table_Dependents[0].Row2[0].f1_24[0]',
  'pii.dependents.1.relationship': 'topmostSubform[0].Page1[0].Table_Dependents[0].Row2[0].f1_25[0]',
  // Dependents (row 3)
  'pii.dependents.2.name':         'topmostSubform[0].Page1[0].Table_Dependents[0].Row3[0].f1_26[0]',
  'pii.dependents.2.ssn':          'topmostSubform[0].Page1[0].Table_Dependents[0].Row3[0].f1_27[0]',
  'pii.dependents.2.relationship': 'topmostSubform[0].Page1[0].Table_Dependents[0].Row3[0].f1_28[0]',
  // Dependents (row 4)
  'pii.dependents.3.name':         'topmostSubform[0].Page1[0].Table_Dependents[0].Row4[0].f1_29[0]',
  'pii.dependents.3.ssn':          'topmostSubform[0].Page1[0].Table_Dependents[0].Row4[0].f1_30[0]',
  'pii.dependents.3.relationship': 'topmostSubform[0].Page1[0].Table_Dependents[0].Row4[0].f1_31[0]',

  // Income lines
  'form1040.line1a':  'topmostSubform[0].Page1[0].f1_18[0]',
  'form1040.line2a':  'topmostSubform[0].Page1[0].f1_32[0]',
  'form1040.line2b':  'topmostSubform[0].Page1[0].f1_33[0]',
  'form1040.line3a':  'topmostSubform[0].Page1[0].f1_34[0]',
  'form1040.line3b':  'topmostSubform[0].Page1[0].f1_35[0]',
  'form1040.line4a':  'topmostSubform[0].Page1[0].Line4a-11_ReadOrder[0].f1_46[0]',
  'form1040.line4b':  'topmostSubform[0].Page1[0].Line4a-11_ReadOrder[0].f1_47[0]',
  'form1040.line5a':  'topmostSubform[0].Page1[0].Line4a-11_ReadOrder[0].f1_48[0]',
  'form1040.line5b':  'topmostSubform[0].Page1[0].Line4a-11_ReadOrder[0].f1_49[0]',
  'form1040.line6a':  'topmostSubform[0].Page1[0].Line4a-11_ReadOrder[0].f1_50[0]',
  'form1040.line6b':  'topmostSubform[0].Page1[0].Line4a-11_ReadOrder[0].f1_51[0]',
  'form1040.line7':   'topmostSubform[0].Page1[0].Line4a-11_ReadOrder[0].f1_52[0]',
  'form1040.line8':   'topmostSubform[0].Page1[0].Line4a-11_ReadOrder[0].f1_53[0]',
  'form1040.line9':   'topmostSubform[0].Page1[0].Line4a-11_ReadOrder[0].f1_54[0]',
  'form1040.line10':  'topmostSubform[0].Page1[0].Line4a-11_ReadOrder[0].f1_55[0]',
  'form1040.line11':  'topmostSubform[0].Page1[0].Line4a-11_ReadOrder[0].f1_56[0]',
  'form1040.line12a': 'topmostSubform[0].Page1[0].f1_57[0]',
  'form1040.line13':  'topmostSubform[0].Page1[0].f1_58[0]',
  'form1040.line14':  'topmostSubform[0].Page1[0].f1_59[0]',
  'form1040.line15':  'topmostSubform[0].Page1[0].f1_60[0]',

  // Page 2: Tax, credits, payments
  'form1040.line16':  'topmostSubform[0].Page2[0].f2_01[0]',
  'form1040.line17':  'topmostSubform[0].Page2[0].f2_02[0]',
  'form1040.line18':  'topmostSubform[0].Page2[0].f2_03[0]',
  'form1040.line19':  'topmostSubform[0].Page2[0].f2_04[0]',
  'form1040.line20':  'topmostSubform[0].Page2[0].f2_05[0]',
  'form1040.line21':  'topmostSubform[0].Page2[0].f2_06[0]',
  'form1040.line22':  'topmostSubform[0].Page2[0].f2_07[0]',
  'form1040.line23':  'topmostSubform[0].Page2[0].f2_08[0]',
  'form1040.line24':  'topmostSubform[0].Page2[0].f2_09[0]',
  'form1040.line25a': 'topmostSubform[0].Page2[0].f2_10[0]',
  'form1040.line25b': 'topmostSubform[0].Page2[0].f2_11[0]',
  'form1040.line25c': 'topmostSubform[0].Page2[0].f2_12[0]',
  'form1040.line25d': 'topmostSubform[0].Page2[0].f2_13[0]',
  'form1040.line26':  'topmostSubform[0].Page2[0].f2_14[0]',
  'form1040.line33':  'topmostSubform[0].Page2[0].f2_19[0]',
  'form1040.line34':  'topmostSubform[0].Page2[0].f2_20[0]',
  'form1040.line35a': 'topmostSubform[0].Page2[0].f2_21[0]',
  'form1040.line37':  'topmostSubform[0].Page2[0].f2_24[0]',
};

// ── Schedule 1 ─────────────────────────────────────────────────────────

export const SCHEDULE_1_PDF_FIELDS: PDFFieldMapping = {
  'pii.primary.name':  'form1[0].Page1[0].f1_01[0]',
  'pii.primary.ssn':   'form1[0].Page1[0].f1_02[0]',
  'schedule1.line1':   'form1[0].Page1[0].f1_03[0]',
  'schedule1.line2a':  'form1[0].Page1[0].f1_04[0]',
  'schedule1.line3':   'form1[0].Page1[0].f1_06[0]',
  'schedule1.line4':   'form1[0].Page1[0].f1_07[0]',
  'schedule1.line5':   'form1[0].Page1[0].f1_08[0]',
  'schedule1.line6':   'form1[0].Page1[0].f1_09[0]',
  'schedule1.line7':   'form1[0].Page1[0].f1_10[0]',
  'schedule1.line9':   'form1[0].Page1[0].f1_36[0]',
  'schedule1.line10':  'form1[0].Page1[0].f1_38[0]',
  // Part II
  'schedule1.line11':  'form1[0].Page2[0].f2_01[0]',
  'schedule1.line15':  'form1[0].Page2[0].f2_05[0]',
  'schedule1.line19':  'form1[0].Page2[0].f2_09[0]',
  'schedule1.line25':  'form1[0].Page2[0].f2_29[0]',
  'schedule1.line26':  'form1[0].Page2[0].f2_31[0]',
};

// ── Schedule 2 ─────────────────────────────────────────────────────────

export const SCHEDULE_2_PDF_FIELDS: PDFFieldMapping = {
  'pii.primary.name':  'form1[0].Page1[0].f1_01[0]',
  'pii.primary.ssn':   'form1[0].Page1[0].f1_02[0]',
  'schedule2.line1':   'form1[0].Page1[0].Line1a_ReadOrder[0].f1_03[0]',
  'schedule2.line2':   'form1[0].Page1[0].f1_04[0]',
  'schedule2.line4':   'form1[0].Page1[0].Line5_ReadOrder[0].f1_15[0]',
  'schedule2.line6':   'form1[0].Page1[0].f1_16[0]',
  'schedule2.line21':  'form1[0].Page2[0].f2_25[0]',
};

// ── Schedule 3 ─────────────────────────────────────────────────────────

export const SCHEDULE_3_PDF_FIELDS: PDFFieldMapping = {
  'pii.primary.name':     'topmostSubform[0].Page1[0].f1_01[0]',
  'pii.primary.ssn':      'topmostSubform[0].Page1[0].f1_02[0]',
  'schedule3.line1':      'topmostSubform[0].Page1[0].f1_03[0]',
  'schedule3.line2':      'topmostSubform[0].Page1[0].f1_04[0]',
  'schedule3.line3':      'topmostSubform[0].Page1[0].f1_05[0]',
  'schedule3.line4':      'topmostSubform[0].Page1[0].f1_06[0]',
  'schedule3.line5a':     'topmostSubform[0].Page1[0].f1_07[0]',
  'schedule3.line7':      'topmostSubform[0].Page1[0].f1_21[0]',
  'schedule3.line8':      'topmostSubform[0].Page1[0].f1_24[0]',
  'schedule3.line15':     'topmostSubform[0].Page1[0].f1_39[0]',
};

// ── Schedule A ─────────────────────────────────────────────────────────

export const SCHEDULE_A_PDF_FIELDS: PDFFieldMapping = {
  'pii.primary.name':  'topmostSubform[0].Page1[0].f1_1[0]',
  'pii.primary.ssn':   'topmostSubform[0].Page1[0].f1_2[0]',
  'scheduleA.line1':   'topmostSubform[0].Page1[0].f1_3[0]',
  'scheduleA.line4':   'topmostSubform[0].Page1[0].f1_6[0]',
  'scheduleA.line5a':  'topmostSubform[0].Page1[0].f1_7[0]',
  'scheduleA.line5b':  'topmostSubform[0].Page1[0].f1_8[0]',
  'scheduleA.line5c':  'topmostSubform[0].Page1[0].f1_9[0]',
  'scheduleA.line5d':  'topmostSubform[0].Page1[0].f1_10[0]',
  'scheduleA.line5e':  'topmostSubform[0].Page1[0].f1_11[0]',
  'scheduleA.line6':   'topmostSubform[0].Page1[0].f1_12[0]',
  'scheduleA.line7':   'topmostSubform[0].Page1[0].f1_13[0]',
  'scheduleA.line8a':  'topmostSubform[0].Page1[0].f1_14[0]',
  'scheduleA.line8b':  'topmostSubform[0].Page1[0].f1_15[0]',
  'scheduleA.line8c':  'topmostSubform[0].Page1[0].f1_16[0]',
  'scheduleA.line10':  'topmostSubform[0].Page1[0].f1_18[0]',
  'scheduleA.line11':  'topmostSubform[0].Page1[0].f1_19[0]',
  'scheduleA.line12':  'topmostSubform[0].Page1[0].f1_20[0]',
  'scheduleA.line13':  'topmostSubform[0].Page1[0].f1_21[0]',
  'scheduleA.line14':  'topmostSubform[0].Page1[0].f1_22[0]',
  'scheduleA.line15':  'topmostSubform[0].Page1[0].f1_23[0]',
  'scheduleA.line16':  'topmostSubform[0].Page1[0].f1_25[0]',
  'scheduleA.line17':  'topmostSubform[0].Page1[0].f1_26[0]',
};

// ── Schedule D ─────────────────────────────────────────────────────────

export const SCHEDULE_D_PDF_FIELDS: PDFFieldMapping = {
  'pii.primary.name':  'topmostSubform[0].Page1[0].f1_01[0]',
  'pii.primary.ssn':   'topmostSubform[0].Page1[0].f1_02[0]',
  'scheduleD.line7':   'topmostSubform[0].Page1[0].f1_22[0]',
  'scheduleD.line15':  'topmostSubform[0].Page1[0].f1_43[0]',
  'scheduleD.line16':  'topmostSubform[0].Page2[0].f2_01[0]',
  'scheduleD.line21':  'topmostSubform[0].Page2[0].f2_03[0]',
};

// ── Schedule E (property A only — extend for B/C) ──────────────────────

export const SCHEDULE_E_PDF_FIELDS: PDFFieldMapping = {
  'pii.primary.name':           'topmostSubform[0].Page1[0].f1_1[0]',
  'pii.primary.ssn':            'topmostSubform[0].Page1[0].f1_2[0]',
  // Property A address and type
  'scheduleE.properties.0.address':     'topmostSubform[0].Page1[0].Table_Line1a[0].RowA[0].f1_3[0]',
  'scheduleE.properties.0.propertyType': 'topmostSubform[0].Page1[0].Table_Line1b[0].RowA[0].f1_6[0]',
  // Property A income and expenses (column A — verified against 2024 PDF)
  'scheduleE.properties.0.line3':  'topmostSubform[0].Page1[0].Table_Income[0].Line3[0].f1_16[0]',
  'scheduleE.properties.0.line5':  'topmostSubform[0].Page1[0].Table_Expenses[0].Line5[0].f1_22[0]',
  'scheduleE.properties.0.line6':  'topmostSubform[0].Page1[0].Table_Expenses[0].Line6[0].f1_25[0]',
  'scheduleE.properties.0.line7':  'topmostSubform[0].Page1[0].Table_Expenses[0].Line7[0].f1_28[0]',
  'scheduleE.properties.0.line8':  'topmostSubform[0].Page1[0].Table_Expenses[0].Line8[0].f1_31[0]',
  'scheduleE.properties.0.line9':  'topmostSubform[0].Page1[0].Table_Expenses[0].Line9[0].f1_34[0]',
  'scheduleE.properties.0.line10': 'topmostSubform[0].Page1[0].Table_Expenses[0].Line10[0].f1_37[0]',
  'scheduleE.properties.0.line11': 'topmostSubform[0].Page1[0].Table_Expenses[0].Line11[0].f1_40[0]',
  'scheduleE.properties.0.line12': 'topmostSubform[0].Page1[0].Table_Expenses[0].Line12[0].f1_43[0]',
  'scheduleE.properties.0.line13': 'topmostSubform[0].Page1[0].Table_Expenses[0].Line13[0].f1_46[0]',
  'scheduleE.properties.0.line14': 'topmostSubform[0].Page1[0].Table_Expenses[0].Line14[0].f1_49[0]',
  'scheduleE.properties.0.line15': 'topmostSubform[0].Page1[0].Table_Expenses[0].Line15[0].f1_52[0]',
  'scheduleE.properties.0.line16': 'topmostSubform[0].Page1[0].Table_Expenses[0].Line16[0].f1_55[0]',
  'scheduleE.properties.0.line17': 'topmostSubform[0].Page1[0].Table_Expenses[0].Line17[0].f1_58[0]',
  'scheduleE.properties.0.line18': 'topmostSubform[0].Page1[0].Table_Expenses[0].Line18[0].f1_61[0]',
  'scheduleE.properties.0.line19': 'topmostSubform[0].Page1[0].Table_Expenses[0].Line19[0].f1_64[0]',
  'scheduleE.properties.0.line20': 'topmostSubform[0].Page1[0].Table_Expenses[0].Line20[0].f1_68[0]',
  'scheduleE.properties.0.line21': 'topmostSubform[0].Page1[0].Table_Expenses[0].Line21[0].f1_71[0]',
  // Totals
  'scheduleE.line23a': 'topmostSubform[0].Page1[0].f1_77[0]',
  'scheduleE.line24':  'topmostSubform[0].Page1[0].f1_78[0]',
  'scheduleE.line25':  'topmostSubform[0].Page1[0].f1_79[0]',
  'scheduleE.line26':  'topmostSubform[0].Page1[0].f1_84[0]',
};

// ── Form 2441 ──────────────────────────────────────────────────────────

export const FORM_2441_PDF_FIELDS: PDFFieldMapping = {
  'pii.primary.name':  'topmostSubform[0].Page1[0].f1_1[0]',
  'pii.primary.ssn':   'topmostSubform[0].Page1[0].f1_2[0]',
  'form2441.line4':    'topmostSubform[0].Page1[0].f1_30[0]',
  'form2441.line6':    'topmostSubform[0].Page1[0].f1_32[0]',
  'form2441.line8':    'topmostSubform[0].Page1[0].f1_34[0]',
  'form2441.line9':    'topmostSubform[0].Page1[0].f1_35[0]',
  'form2441.line11':   'topmostSubform[0].Page1[0].f1_40[0]',
};

// ── Form 4562 ──────────────────────────────────────────────────────────

export const FORM_4562_PDF_FIELDS: PDFFieldMapping = {
  'form4562.line22': 'topmostSubform[0].Page1[0].f1_25[0]',
};

// ── CA Form 540 ────────────────────────────────────────────────────────

export const CA_540_PDF_FIELDS: PDFFieldMapping = {
  'pii.primary.name':  '540-1004',
  'pii.primary.ssn':   '540-1006',
  'pii.spouse.name':   '540-1005',
  'pii.spouse.ssn':    '540-1007',
  'pii.address.street': '540-1008',
  'pii.address.city':  '540-1012',
  'pii.address.state': '540-1014',
  'pii.address.zip':   '540-1015',
  'ca540.line13':  '540-1023',
  'ca540.line14':  '540-1024',
  'ca540.line15':  '540-1025',
  'ca540.line18':  '540-1028',
  'ca540.line19':  '540-1030',
  'ca540.line31':  '540-2001',
  'ca540.line35':  '540-2005',
  'ca540.line40':  '540-2010',
  'ca540.line48':  '540-2018',
  'ca540.line71':  '540-2041',
  'ca540.line72':  '540-2042',
  'ca540.line74':  '540-2043',
  'ca540.line91':  '540-5002',
  'ca540.line95':  '540-5007',
};

// ── All mappings by form type ──────────────────────────────────────────

export type FormKey =
  | 'w2'
  | 'form1040'
  | 'schedule1'
  | 'schedule2'
  | 'schedule3'
  | 'scheduleA'
  | 'scheduleC'
  | 'scheduleD'
  | 'scheduleE'
  | 'scheduleSE'
  | 'form2441'
  | 'form4562'
  | 'form6251'
  | 'form8812'
  | 'form8863'
  | 'form8880'
  | 'form8959'
  | 'form8960'
  | 'form8582'
  | 'form8582p2'
  | 'form8582p3'
  | 'form8995'
  | 'form5695'
  | 'ca540';

export const PDF_FIELD_MAPPINGS: Record<FormKey, PDFFieldMapping> = {
  w2: {},  // W-2 doesn't have a PDF template — it's entered on FreeFile directly
  form1040: FORM_1040_PDF_FIELDS,
  schedule1: SCHEDULE_1_PDF_FIELDS,
  schedule2: SCHEDULE_2_PDF_FIELDS,
  schedule3: SCHEDULE_3_PDF_FIELDS,
  scheduleA: SCHEDULE_A_PDF_FIELDS,
  scheduleC: {},
  scheduleD: SCHEDULE_D_PDF_FIELDS,
  scheduleE: SCHEDULE_E_PDF_FIELDS,
  scheduleSE: {},
  form2441: FORM_2441_PDF_FIELDS,
  form4562: FORM_4562_PDF_FIELDS,
  form6251: {},
  form8812: {},
  form8863: {},
  form8880: {},
  form8959: {},
  form8960: {},
  form8582: {},
  form8582p2: {},
  form8582p3: {},
  form8995: {},
  form5695: {},
  ca540: CA_540_PDF_FIELDS,
};

/** Map TaxFormType (used in UI/stores) to FormKey (used in adapters) */
const TAX_FORM_TYPE_TO_FORM_KEY: Record<string, FormKey> = {
  '1040': 'form1040',
  'schedule-a': 'scheduleA',
  'schedule-b': 'schedule1', // Schedule B flows through Schedule 1
  'schedule-d': 'scheduleD',
  'schedule-e': 'scheduleE',
  'form-8949': 'scheduleD', // 8949 data feeds Schedule D
  'form-4562': 'form4562',
  'form-2441': 'form2441',
  'form-6251': 'schedule2', // AMT flows through Schedule 2
  'ca-540': 'ca540',
};

/** Convert a TaxFormType string to the corresponding FormKey for adapter lookup */
export function taxFormTypeToFormKey(formType: string): FormKey | undefined {
  return TAX_FORM_TYPE_TO_FORM_KEY[formType];
}

/** PDF template file paths (relative to packages/tax-core/forms/templates/) */
export const PDF_TEMPLATE_FILES: Record<FormKey, string> = {
  w2: '',  // W-2 is not a PDF we generate — it's entered on FreeFile
  form1040:  '2024/f1040--2024.pdf',
  schedule1: '2024/f1040s1--2024.pdf',
  schedule2: '2024/f1040s2--2024.pdf',
  schedule3: '2024/f1040s3--2024.pdf',
  scheduleA: '2024/f1040sa--2024.pdf',
  scheduleC: '',
  scheduleD: '2024/f1040sd--2024.pdf',
  scheduleE: '2024/f1040se--2024.pdf',
  scheduleSE: '',
  form2441:  '2024/f2441--2024.pdf',
  form4562:  '2024/f4562--2024.pdf',
  form6251:  '',
  form8812:  '',
  form8863:  '',
  form8880:  '',
  form8959:  '',
  form8960:  '',
  form8582:  '',
  form8582p2: '',
  form8582p3: '',
  form8995:  '',
  form5695:  '',
  ca540:     '2024/f540-2024.pdf',
};
