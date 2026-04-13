/**
 * Free File Field Mappings — maps TaxReturnData property names to
 * actual field names on IRS Free File Fillable Forms.
 *
 * Discovered by scraping freefilefillableforms.com field catalog.
 * Field naming convention: txt=text, chk=checkbox, cbo=dropdown.
 *
 * Note: Primary filer name/SSN fields have random IDs per session.
 * The content script handles those by position (before cboSuffix).
 */

import type { FormKey } from './pdfFieldMappings';

export type FreeFileFieldMapping = Record<string, string>;

export const FREE_FILE_FIELD_MAPPINGS: Record<FormKey, FreeFileFieldMapping> = {
  w2: {
    'w2.employerEin':        'txtEmployerIdNum',
    'w2.employerName':       'txtEmployerName',
    'w2.employerAddress':    'txtEmployerAddress',
    'w2.employerCity':       'txtEmployerCity',
    'w2.employerState':      'cboEmployerState',
    'w2.employerZip':        'txtEmployerZip',
    'w2.wages':              'txtWagesTips',
    'w2.federalWithholding': 'txtFedIncTaxWithheld',
    'w2.ssWages':            'txtSocSecWages',
    'w2.ssTax':              'txtSocSecTaxWithheld',
    'w2.medicareWages':      'txtMedicareWagesTips',
    'w2.medicareTax':        'txtMedicareTaxWithheld',
    'w2.empFirstName':       'txtEmpFirstName',
    'w2.empLastName':        'txtEmpLastName',
    'w2.empAddress':         'txtEmpAddress',
    'w2.empCity':             'txtEmpCity',
    'w2.empState':            'cboEmpState',
    'w2.empZip':              'txtEmpZip',
    'w2.empSSN':              'txtEmplyerSSN',
    'w2.stateId':             'txtSt1EmployerId',
    'w2.stateWages':          'txtSt1WagesTips',
    'w2.stateTax':            'txtSt1IncTax',
    'w2.state':               'cboW2State1',
    'w2.depCareBenefits':     'txtDepCareBenefits',
  },

  form1040: {
    // PII — primary name/SSN have random IDs, handled by content script
    'pii.primary.firstName':  'pos:primaryFirstName',
    'pii.primary.lastName':   'pos:primaryLastName',
    'pii.primary.ssn':        'pos:primarySSN',
    'pii.spouse.firstName':   'txtSpFirstName',
    'pii.spouse.lastName':    'txtSpLastName',
    'pii.spouse.ssn':         'txtSpSSN',
    'pii.occupation':         'txtOccupation',
    'pii.address.street':     'txtAddress1',
    'pii.address.aptNo':      'txtApartment',
    'pii.address.city':       'txtCity',
    'pii.address.state':      'cboState',
    'pii.address.zip':        'txtZip',

    // Dependents
    'pii.dependents.0.firstName': 'txtDepFirstName1',
    'pii.dependents.0.lastName':  'txtDepLastName1',
    'pii.dependents.0.ssn':       'txtDepSSN1',
    'pii.dependents.0.relationship': 'cboDepRelation1',
    'pii.dependents.1.firstName': 'txtDepFirstName2',
    'pii.dependents.1.lastName':  'txtDepLastName2',
    'pii.dependents.1.ssn':       'txtDepSSN2',
    'pii.dependents.1.relationship': 'cboDepRelation2',

    // Income lines — send all, read-only check in setFieldValue skips computed ones
    'form1040.line1a':  'txtWagesSalariesTips',
    'form1040.line1z':  'txtToTLine1z',
    'form1040.line2a':  'txtTaxExemptInt',
    'form1040.line2b':  'txtTaxableInt',
    'form1040.line3a':  'txtQualDiv',
    'form1040.line3b':  'txtOrdDiv',
    'form1040.line4a':  'txtTotIraDist',
    'form1040.line4b':  'txtTaxTotIraDist',
    'form1040.line5a':  'txtTotPen',
    'form1040.line5b':  'txtTaxTotPen',
    'form1040.line6a':  'txtSsBenefits',
    'form1040.line6b':  'txtTaxSsBenefits',
    'form1040.line7':   'txtCapitalGains',
    'form1040.line8':   'txtOtherInc',
    'form1040.line9':   'txtTotalIncome',
    'form1040.line10':  'txtTotAdj',
    'form1040.line11':  'txtTotAdjGrossInc',
    'form1040.line12a': 'txtStdDed',
    'form1040.line13':  'txtQualBusIncDed',
    'form1040.line14':  'txtTotalDeduction',
    'form1040.line15':  'txtTaxableIncome',
    'form1040.line16':  'txtTaxWoAmt',
    'form1040.line17':  'txtTotOf6251And8962',
    'form1040.line18':  'txtTax',
    'form1040.line19':  'txtChildTaxCdt',
    'form1040.line20':  'txtTotNonRefCrdt',
    'form1040.line21':  'txtTotCredit',
    'form1040.line22':  'txtTaxAfterCred',
    'form1040.line23':  'txtTotalOtherTax',
    'form1040.line24':  'txtTotalTax',
    'form1040.line25a': 'txtW2TaxWithheld',
    'form1040.line25b': 'txtFedTaxWithheld1099',
    'form1040.line25c': 'txtFedTaxWithheldOther',
    'form1040.line25d': 'txtFedTaxWithheld',
    'form1040.line26':  'txtEstTaxpayDivSpSsn',
    'form1040.line27a': 'txtEIC',
    'form1040.line33':  'txtTotPayments',
    'form1040.line34':  'txtOverPaid',
    'form1040.line35a': 'txtRefund',
    'form1040.line37':  'txtAmtOwe',
  },

  schedule1: {
    'schedule1.line3':   'txtBusinessInc',
    'schedule1.line5':   'txtSuppIncome',
    'schedule1.line7':   'txtUnempComp',
    'schedule1.line10':  'txtLn10TotIncome',
    'schedule1.line11':  'txtEduExp',
    'schedule1.line15':  'txtSelfEmp50Per',
    'schedule1.line19':  'txtStdLoanIntDed',
    'schedule1.line26':  'txtLn26TotAdjInc',
  },

  schedule2: {
    'schedule2.line1':   'txtAltMinTaxAmt',
    'schedule2.line4':   'txtAddLines1and2',
    'schedule2.line6':   'txtSelfEmpTax',
    'schedule2.line11':  'txtF89591040Ln60',
    'schedule2.line21':  'txtTotalOtherTax',
  },

  schedule3: {
    'schedule3.line1':   'txtForTaxCdt',
    'schedule3.line2':   'txtChildDepCareCdt',
    'schedule3.line3':   'txtEduCdt',
    'schedule3.line4':   'txtRetSavContCdt',
    'schedule3.line5a':  'txtResEnergyCdt',
    'schedule3.line7':   'txtTotOthCredit',
    'schedule3.line8':   'txtTotCredit',
    'schedule3.line9':   'txtNetPremTaxCdt',
    'schedule3.line15':  'txtTotPaymentsCdts',
  },

  scheduleA: {
    'scheduleA.line5a':  'txtstLocIncTax',
    'scheduleA.line5c':  'txtRealEstTax',
    'scheduleA.line5d':  'txtschAAddLn5aLn5c',
    'scheduleA.line5e':  'txtSchASmallLine5d',
    'scheduleA.line6':   'txtOtherTax',
    'scheduleA.line7':   'txtTaxesUPaid',
    'scheduleA.line8a':  'txtHomeMortRep',
    'scheduleA.line8b':  'txtHomeMortNrep',
    'scheduleA.line10':  'txtIntUPaid',
    'scheduleA.line11':  'txtGiftsChcq',
    'scheduleA.line12':  'txtGiftsnChcq',
    'scheduleA.line13':  'txtPriorYear',
    'scheduleA.line14':  'txtGiftsToChar',
    'scheduleA.line15':  'txtCasualTheftLoss',
    'scheduleA.line17':  'txtTotItemDed',
  },

  scheduleC: {
    // Income — INPUT fields only
    'scheduleC.line1':   'txtSchCGrossReceiptsSales',  // INPUT: gross receipts
    'scheduleC.line4':   'txtSchcCostGoodsSold',        // INPUT: COGS
    // line5, 7: computed by FreeFile
    // Expenses — INPUT fields only
    'scheduleC.line8':   'txtSchCAdvertising',          // INPUT
    'scheduleC.line9':   'txtCarAndTruckExpense',       // INPUT
    'scheduleC.line10':  'txtSchCCommFees',              // INPUT
    'scheduleC.line11':  'txtSchCContractLabor',         // INPUT
    'scheduleC.line13':  'txtDepreciation',               // INPUT
    'scheduleC.line15':  'txtSchCInsurance',              // INPUT
    'scheduleC.line16a': 'txtSchCMortInterest',          // INPUT
    'scheduleC.line17':  'txtSchCLegalProfServ',          // INPUT
    'scheduleC.line18':  'txtSchCOfficeExp',              // INPUT
    'scheduleC.line20a': 'txtSchCVehicMachiEquip',       // INPUT
    'scheduleC.line20b': 'txtSchCOtherBusiProp',         // INPUT
    'scheduleC.line21':  'txtSchCRepairsMaint',           // INPUT
    'scheduleC.line22':  'txtSchCSupplies',               // INPUT
    'scheduleC.line23':  'txtSchCTaxesLicenses',          // INPUT
    'scheduleC.line24a': 'txtSchCTravel',                  // INPUT
    'scheduleC.line25':  'txtSchCUtilities',               // INPUT
    'scheduleC.line26':  'txtSchCWages',                   // INPUT
    'scheduleC.line27a': 'txtSchcOtherExp',                // INPUT
    'scheduleC.line30':  'txtSchCexpBusiUseHome',           // INPUT: home office deduction
    // line28, 29, 31: computed by FreeFile (totals)
  },

  scheduleD: {
    'scheduleD.line7':   'txtNetShortTermCap',
    'scheduleD.line14':  'txtLongTermLossCo',
    'scheduleD.line15':  'txtNetLongTermCap',
    'scheduleD.line16':  'txtSumShtLngGains',
    'scheduleD.line21':  'txtSmallNetlossLimit',
  },

  scheduleE: {
    'scheduleE.properties.0.address': 'txtScheStreetAddressA',
    'scheduleE.properties.0.city':    'txtScheCityA',
    'scheduleE.properties.0.state':   'cboScheStateA',
    'scheduleE.properties.0.zip':     'txtScheZipA',
    'scheduleE.properties.0.propertyType': 'cboSchdePropertyTypeA',
    'scheduleE.properties.0.fairRentalDays': 'txtScheRentaldayA',
    'scheduleE.properties.0.personalUseDays': 'txtSchePersonaldayA',
    'scheduleE.properties.0.line3':   'txtScheAmountRentA',
    'scheduleE.properties.0.line5':   'txtScheAdvertizeA',
    'scheduleE.properties.0.line6':   'txtScheAutotravelA',
    'scheduleE.properties.0.line7':   'txtScheCleanMaintainenceA',
    'scheduleE.properties.0.line8':   'txtScheCommisionPaideA',
    'scheduleE.properties.0.line9':   'txtScheInsuranceA',
    'scheduleE.properties.0.line10':  'txtScheLegalfeeA',
    'scheduleE.properties.0.line11':  'txtScheManagementFeeA',
    'scheduleE.properties.0.line12':  'txtScheMortageInterestA',
    'scheduleE.properties.0.line13':  'txtScheOtherInterestA',
    'scheduleE.properties.0.line14':  'txtScheRepairA',
    'scheduleE.properties.0.line15':  'txtScheSupplieA',
    'scheduleE.properties.0.line16':  'txtScheTaxesA',
    'scheduleE.properties.0.line17':  'txtScheUtilityA',
    'scheduleE.properties.0.line18':  'txtSchdeDepreciationExpenseA',
    'scheduleE.properties.0.line19':      'txtSchdeOtherExpA',
    'scheduleE.properties.0.line19Desc':  'txtOtherExplain',
    'scheduleE.properties.0.line20':      'txtScheTotalLine20A',
    'scheduleE.properties.0.line21':      'txtScheSubstratLine3A',
    'scheduleE.properties.0.line22':      'txtScheRentalRealestateA',
    // Note: chkMakePay1099Ind checks "Yes" — unchecked means "No" (no explicit No field)
    'scheduleE.properties.0.no1099':  'chkMakePay1099IndNo',
    'scheduleE.line23a': 'txtScheTotincRentalAmt',
    'scheduleE.line26':  'txtScheTotIncomeorloss',
  },

  scheduleSE: {
    'scheduleSE.line2':  'txtSchSENetProfitSchC',
    'scheduleSE.line3':  'txtSchSENetEarnings',
    'scheduleSE.line4':  'txtSchSESelfEmpTax',
    'scheduleSE.line5':  'txtSchSEDedOneHalfSeTax',
  },

  form2441: {
    'form2441.line3':    'txtPart2AddAmt',
    'form2441.line4':    'txtPart2EarnedInc',
    'form2441.line5':    'txtPart2SpEarnedInc',
    'form2441.line6':    'txtPart2Smallest',
    'form2441.line8':    'cboPart2DecimalAmt',
    'form2441.line9':    'txtPart2RefundableCredit',
    'form2441.line10':   'txtPart2Sub1',
    'form2441.line11':   'txtPart2Cdcdt',
    'form2441.solePropNo': 'chkLn22SolePropNoInd',
  },

  form4562: {},

  form6251: {
    'form6251.line1':   'txtIncAmtFr1040',
    'form6251.line2d':  'txtAmtFr1040',
    'form6251.line10':  'txtIncentiveStockOpt',
    'form6251.line26':  'txtAlterMinTaxIncome',
    'form6251.line27':  'txtExemption',
    'form6251.line28':  'txtNetTaxAmt',
    'form6251.line30':  'txtTentativeMinTax',
    'form6251.line31':  'txtTaxFr1040',
    'form6251.line32':  'txtAlterMinTax',
  },

  form8812: {
    // Part I-A: Child Tax Credit calculation
    'form8812.line1':   'txtF8812PartiaAgi',
    'form8812.line3':   'txtF8812PartiaAddLn12D',
    'form8812.line4a':  'txtF8812PartiaNoqcAge18',
    'form8812.line4b':  'txtF8812PartiaLn5WkAmt',
    'form8812.line5':   'txtF8812PartiaNoodAge18',
    'form8812.line6':   'txtF8812PartiaMulLn6500',
    'form8812.line7':   'txtF8812PartiaAddLn57',
    'form8812.line8':   'txtF8812PartiaAmtFilsta',
    'form8812.line9':   'txtF8812PartiaSubLn9Ln3',
    'form8812.line10':  'txtF8812PartiaMulLn105',
    'form8812.line11':  'txtF8812PartiaSubLn11Ln8',
    // Part I-B: credit limitation (2025 form lines 12–14)
    'form8812.creditLimitWsA': 'txtF8812PartibClwaAmt',
    'form8812.credit':         'txtF8812PartIcMinln1215a',
  },

  form8863: {
    'form8863.line9':   'txtRefAocLine9',
    'form8863.line14':  'txtRefAocLine14',
    'form8863.line15':  'txtRefAocLine15',
    'form8863.line17':  'txtNonrefEduCdtLn17',
    'form8863.line19':  'txtTotLearnC',
    'form8863.line28':  'txtEduCdt',
  },

  form8880: {
    'form8880.line1a':  'txtPTIRAAmount',
    'form8880.line1b':  'txtSPIRAAmount',
    'form8880.line7':   'txtLine7Amt',
    'form8880.line8':   'txtLine8Agincome',
    'form8880.line10':  'txtLine10Multiply',
    'form8880.line14':  'txtLine14Creditqualret',
  },

  form8959: {
    'form8959.line1':   'txtF8959MedW2',
    'form8959.line4':   'txtF8959AddLn1Ln3',
    'form8959.line5':   'txtF8959AmtFilStatus1',
    'form8959.line6':   'txtF8959SubLn5Ln4',
    'form8959.line7':   'txtF8959AddMed1',
    'form8959.line18':  'txtF8959TotAddMed',
  },

  form8960: {
    'form8960.line1':   'txtF8960TaxInt',
    'form8960.line2':   'txtF8960OrdDiv',
    'form8960.line8':   'txtF8960TotInv',
    'form8960.line12':  'txtF8960NetInvInc',
    'form8960.line13':  'txtF8960ModAdjGrs',
    'form8960.line14':  'txtF8960ThdFilStatus',
    'form8960.line15':  'txtF8960Sub1413',
    'form8960.line16':  'txtF8960Min1215',
    'form8960.line17':  'txtF8960NetInvIndiv',
  },

  form8582: {
    // Page 1 Part I
    'form8582.line1a':      'txtF8582NetinWkte1',
    'form8582.line1b':      'txtF8582NetlosseWkte1',
    'form8582.line1c':      'txtF8582PrioryearUnallowedlosse',
    'form8582.line1d':      'txtF8582CombineParti',
    // Page 1 Part II
    'form8582.line5':       'txtF8582PartiiLine5',
    'form8582.line6':       'txtF8582PartiiflStatusAmount',
    'form8582.line7':       'txtF8582ModfyAdjincome',
    'form8582.line8':       'txtF8582PartiiSubline7',
    'form8582.line9':       'txtF8582PartiiMultiplyline8',
    'form8582.line10':      'txtF8582PartiiSmallerLine5Nd9',
    // Page 1 Part IV
    'form8582.totalIncome': 'txtF8582PartivTotalincome',
    'form8582.totalLoss':   'txtF8582PartivTotallosse',
  },

  form8582p2: {
    // Page 2 Worksheets 1-5: Rental with Active Participation
    'form8582.ws1Name':          'txtWkth1NameActivity1',
    'form8582.ws1NetIncome':     'txtWkth1NetIncome1',
    'form8582.ws1NetLoss':       'txtWkth1NetLosse1',
    'form8582.ws1UnallowedLoss': 'txtWkth1UnallowedLosse1',
    'form8582.ws1Gain':          'txtWkth1Gain1',
    'form8582.ws1OverallLoss':   'txtWkth1Loss1',
  },

  form8582p3: {
    // Page 3 Worksheet 6: Allowed Losses
    'form8582.ws6Name':          'txtWkth6NameActivity1',
    'form8582.ws6Form':          'txtWkth6SchFormreported1',
    'form8582.ws6Loss':          'txtWkth6Loss1',
    'form8582.ws6UnallowedLoss': 'txtWkth6UnallowedLoss1',
    'form8582.ws6AllowedLoss':   'txtWkth6AllowedLoss1',
  },

  form8995: {
    // Line 1(i)-(v): individual business entries
    // SSN fields (txtTaxpayerSSN, txtBusiActivitySSN1-5) are filled via PII merge in content script
    'form8995.businesses.0.name': 'txtBusiActivityName1',
    'form8995.businesses.0.qbi':  'txtWkshQualBusiIncLn21',
    'form8995.businesses.1.name': 'txtBusiActivityName2',
    'form8995.businesses.1.qbi':  'txtWkshQualBusiIncLn22',
    'form8995.businesses.2.name': 'txtBusiActivityName3',
    'form8995.businesses.2.qbi':  'txtWkshQualBusiIncLn23',
    'form8995.businesses.3.name': 'txtBusiActivityName4',
    'form8995.businesses.3.qbi':  'txtWkshQualBusiIncLn24',
    'form8995.businesses.4.name': 'txtBusiActivityName5',
    'form8995.businesses.4.qbi':  'txtWkshQualBusiIncLn25',
    // Totals
    'form8995.line1':   'txtTotQualBusiIncLoss',
    'form8995.line2':   'txtQualBusiIncomeComp',
    'form8995.line4':   'txtIncBfrQBIDeduction',
    'form8995.line5':   'txtNetCapitalGainsAmt',
    'form8995.line6':   'txtWkshTaxIncomeLn1',
    'form8995.line7':   'txtWksh20percentLn1Ln4',
    'form8995.line10':  'txtQualSmallLn4Ln25',
  },

  form5695: {
    'form5695.p1TotalCost':    'txtF5695P2SoltotLn12To15',
    'form5695.p1Credit':       'txtF5695P2ResiEngEffCrd',
    'form5695.p1Carryforward': 'txtF5695P2CrdCarryfwd',
    'form5695.p2Total':        'txtF5695P1EngEffImpTot',
    'form5695.p2Credit':       'txtF5695P1NonbusiEngCrd',
  },

  ca540: {},
};
