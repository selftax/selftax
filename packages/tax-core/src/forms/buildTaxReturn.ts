/**
 * buildTaxReturn — compose engine outputs + profile into canonical TaxReturnData.
 *
 * This is a pure function: same inputs → same output, no side effects.
 * It maps the scattered engine Output interfaces into a single typed structure.
 */

import { irsRound } from '../engine/form1040';
import { getTaxYearConfig } from '../engine/taxYearConfigs';
import type { FilingStatus } from '../engine/taxConstants';
import type { Form1040Output } from '../engine/form1040';
import type { ScheduleAInput, ScheduleAOutput } from '../engine/scheduleA';
import type { ScheduleDOutput } from '../engine/scheduleD';
import type { ScheduleEInput, ScheduleEOutput } from '../engine/scheduleE';
import type { Form2441Output } from '../engine/form2441';
import type { Form6251Output } from '../engine/form6251';
import type { Form8959Output } from '../engine/form8959';
import type { Form8960Output } from '../engine/form8960';
import type { ScheduleCOutput } from '../engine/scheduleC';
import type { ScheduleSEOutput } from '../engine/scheduleSE';
import type { EducationCreditOutput } from '../engine/form8863';
import type { SaversCreditOutput } from '../engine/form8880';
import type { Form540Output } from '../engine/form540';
import type {
  TaxReturnData,
  PIIData,
  Schedule1Data,
  Schedule2Data,
  Schedule3Data,
  ScheduleAData,
  ScheduleDData,
  ScheduleEData,
  ScheduleEProperty,
  Form2441Data,
  Form4562Data,
  Form8582Data,
  Form8995Data,
  CA540Data,
} from '../types/taxReturnData';

/** Per-property rental data for Schedule E */
export interface RentalPropertyInput {
  address: string;
  city?: string;
  state?: string;
  zip?: string;
  propertyType: string;
  fairRentalDays: number;
  personalUseDays: number;
  input: ScheduleEInput;
  output: ScheduleEOutput;
}

/** All engine calculation results needed to build the return */
export interface BuildTaxReturnInput {
  taxYear: number;
  filingStatus: FilingStatus;
  pii: PIIData;

  // Engine outputs
  form1040: Form1040Output;

  // Wages breakout (not in Form1040Output directly)
  wages: number;
  taxableInterest?: number;
  qualifiedDividends?: number;
  ordinaryDividends?: number;

  // Schedule A (itemized deductions)
  scheduleA?: { input: ScheduleAInput; output: ScheduleAOutput };

  // Schedule D (capital gains/losses)
  scheduleD?: ScheduleDOutput;
  /** Capital loss carryforward deducted this year (capped at $3,000) */
  capitalLossDeduction?: number;

  // Schedule E (rental properties)
  rentalProperties?: RentalPropertyInput[];
  /** Aggregate Schedule E amounts (if properties provided) */
  scheduleEAggregate?: ScheduleEOutput;

  // Form 2441 (dependent care credit)
  form2441?: Form2441Output;

  // Form 6251 (AMT)
  form6251?: Form6251Output;

  // Form 4562 (depreciation — total across all properties)
  totalDepreciation?: number;

  // Schedule C (self-employment)
  scheduleC?: ScheduleCOutput;
  scheduleCGrossReceipts?: number;
  scheduleCBusinessName?: string;

  // Schedule SE (self-employment tax)
  scheduleSE?: ScheduleSEOutput;

  // Form 8959 (Additional Medicare Tax)
  form8959?: Form8959Output;
  medicareWages?: number;

  // Form 8960 (Net Investment Income Tax)
  form8960?: Form8960Output;

  // Form 8863 (Education Credits)
  form8863?: EducationCreditOutput;

  // Form 8880 (Saver's Credit)
  form8880?: SaversCreditOutput;
  saversContributions?: number;

  // Form 8995 (QBI deduction)
  qbiDeduction?: number;
  qbiIncome?: number;

  // Number of qualifying children (for Form 8812)
  qualifyingChildren?: number;

  // CA Form 540
  form540?: Form540Output;

  // Withholding breakout
  w2Withholding?: number;
  otherWithholding?: number;
  estimatedPayments?: number;

  // CA withholding
  caWithholding?: number;
  caEstimatedPayments?: number;
}

/** Build the canonical TaxReturnData from engine outputs + profile */
export function buildTaxReturn(input: BuildTaxReturnInput): TaxReturnData {
  const {
    taxYear,
    filingStatus,
    pii,
    form1040: f1040,
    wages,
  } = input;

  // ── Schedule E (rental properties) ──
  let scheduleE: ScheduleEData | undefined;
  if (input.rentalProperties && input.rentalProperties.length > 0) {
    const properties: ScheduleEProperty[] = input.rentalProperties.map((rp) => {
      const otherExp = irsRound(rp.input.otherExpenses ?? 0);
      const priorLoss = rp.input.priorYearUnallowedLoss ?? 0;
      // Line 22: allowed loss from Form 8582
      // If current year has net income and there's a prior year suspended loss, the loss is released
      const loss = rp.output.netRentalIncome < 0
        ? irsRound(rp.output.allowedLoss)
        : (priorLoss > 0 ? irsRound(-priorLoss) : undefined);
      return {
        address: rp.address,
        city: rp.city,
        state: rp.state,
        zip: rp.zip,
        propertyType: rp.propertyType,
        fairRentalDays: rp.fairRentalDays,
        personalUseDays: rp.personalUseDays,
        line3: irsRound(rp.output.grossIncome),
        line5: irsRound(rp.input.advertising ?? 0),
        line6: irsRound(rp.input.autoTravel ?? 0),
        line7: irsRound(rp.input.cleaningMaintenance ?? 0),
        line8: irsRound(rp.input.commissions ?? 0),
        line9: irsRound(rp.input.insurance ?? 0),
        line10: irsRound(rp.input.legalFees ?? 0),
        line11: irsRound(rp.input.managementFees ?? 0),
        line12: irsRound(rp.input.mortgageInterest ?? 0),
        line13: irsRound(rp.input.otherInterest ?? 0),
        line14: irsRound(rp.input.repairs ?? 0),
        line15: irsRound(rp.input.supplies ?? 0),
        line16: irsRound(rp.input.propertyTaxes ?? 0),
        line17: irsRound(rp.input.utilities ?? 0),
        line18: irsRound(rp.input.depreciation ?? 0),
        line19: otherExp,
        line19Desc: otherExp > 0 ? 'Amortization' : undefined,
        line20: irsRound(rp.output.totalExpenses),
        line21: irsRound(rp.output.netRentalIncome),
        line22: loss,
        no1099: true,
      };
    });

    const agg = input.scheduleEAggregate;
    const netTotal = agg
      ? irsRound(agg.amountFor1040)
      : irsRound(properties.reduce((sum, p) => sum + p.line21, 0));

    scheduleE = {
      properties,
      line23a: netTotal,
      line24: netTotal >= 0 ? netTotal : 0,
      line25: netTotal < 0 ? netTotal : 0,
      line26: netTotal,
    };
  }

  // ── Form 8582 (Passive Activity Loss Limitations) ──
  let form8582: Form8582Data | undefined;
  if (input.rentalProperties && input.rentalProperties.length > 0) {
    const rp = input.rentalProperties[0];
    const activityName = rp.address || 'Rental Property';
    const netIncome = rp.output.netRentalIncome;
    const priorLoss = rp.input.priorYearUnallowedLoss ?? 0;
    const combined = irsRound(netIncome - priorLoss);
    const filingAmt = input.filingStatus === 'mfs' ? 12500 : 25000;
    const prelimAgi = f1040.agi;

    // Common worksheet data
    const wsBase = {
      ws1Name: activityName,
      ws1NetIncome: netIncome > 0 ? irsRound(netIncome) : undefined,
      ws1NetLoss: netIncome < 0 ? irsRound(netIncome) : undefined,
      ws1UnallowedLoss: priorLoss > 0 ? irsRound(priorLoss) : undefined,
      ws1Gain: combined > 0 ? combined : undefined,
      ws1OverallLoss: combined < 0 ? combined : undefined,
    };

    if (combined < 0) {
      // Loss — compute special allowance
      const absLoss = Math.abs(combined);
      const overThreshold = Math.max(0, prelimAgi - 100000);
      const phaseout = irsRound(overThreshold * 0.5);
      const maxAllowance = Math.max(0, filingAmt - phaseout);
      const allowed = Math.min(absLoss, maxAllowance);
      const suspended = irsRound(absLoss - allowed);

      form8582 = {
        ...wsBase,
        line1a: netIncome > 0 ? irsRound(netIncome) : undefined,
        line1b: netIncome < 0 ? irsRound(netIncome) : undefined,
        line1c: priorLoss > 0 ? irsRound(-priorLoss) : undefined,
        line1d: combined,
        line5: absLoss,
        line6: filingAmt,
        line7: irsRound(prelimAgi),
        line8: irsRound(overThreshold),
        line9: phaseout,
        line10: irsRound(allowed),
        totalLoss: irsRound(allowed),
        // Worksheet 6
        ws6Name: activityName,
        ws6Form: 'Schedule E',
        ws6Loss: combined,
        ws6UnallowedLoss: suspended > 0 ? irsRound(-suspended) : undefined,
        ws6AllowedLoss: allowed > 0 ? irsRound(-allowed) : undefined,
      };
    } else {
      // Income or zero — all prior losses absorbed, no limitation
      form8582 = {
        ...wsBase,
        line1a: netIncome > 0 ? irsRound(netIncome) : undefined,
        line1b: netIncome < 0 ? irsRound(netIncome) : undefined,
        line1c: priorLoss > 0 ? irsRound(-priorLoss) : undefined,
        line1d: combined,
        totalIncome: combined > 0 ? combined : undefined,
        // Worksheet 6 — no loss to allocate
        ws6Name: activityName,
        ws6Form: 'Schedule E',
      };
    }
  }

  // ── Schedule 1 (additional income + adjustments) ──
  const rentalAmount = scheduleE?.line26 ?? 0;
  const hasSchedule1 = rentalAmount !== 0;
  let schedule1: Schedule1Data | undefined;
  if (hasSchedule1) {
    schedule1 = {
      line1: 0,
      line2a: 0,
      line3: 0,
      line4: 0,
      line5: rentalAmount,
      line6: 0,
      line7: 0,
      line8z: 0,
      line9: 0,
      line10: irsRound(rentalAmount),
      line11: 0,
      line15: 0,
      line19: 0,
      line25: 0,
      line26: 0,
    };
  }

  // ── Schedule 3 (additional credits) ──
  const dependentCareCredit = input.form2441?.credit ?? 0;
  const hasSchedule3 = dependentCareCredit > 0;
  let schedule3: Schedule3Data | undefined;
  if (hasSchedule3) {
    schedule3 = {
      line1: 0,
      line2: irsRound(dependentCareCredit),
      line3: 0,
      line4: 0,
      line5a: 0,
      line7: irsRound(dependentCareCredit),
      line8: irsRound(dependentCareCredit),
      line9: 0,
      line15: 0,
    };
  }

  // ── Schedule 2 (AMT + other taxes) ──
  const amt = input.form6251?.amt ?? 0;
  const hasSchedule2 = amt > 0;
  let schedule2: Schedule2Data | undefined;
  if (hasSchedule2) {
    schedule2 = {
      line1: irsRound(amt),
      line2: 0,
      line4: irsRound(amt),
      line6: 0,
      line11: 0,
      line18: 0,
      line21: 0,
    };
  }

  // ── Schedule A (itemized deductions) ──
  let scheduleA: ScheduleAData | undefined;
  if (input.scheduleA && input.scheduleA.output.shouldItemize) {
    const saIn = input.scheduleA.input;
    const saOut = input.scheduleA.output;
    scheduleA = {
      line1: 0,
      line4: 0,
      line5a: irsRound(saIn.stateIncomeTax ?? 0),
      line5b: 0,
      line5c: irsRound(saIn.primaryPropertyTax ?? 0),
      line5d: irsRound(saOut.saltTotal),
      line5e: irsRound(saOut.saltDeduction),
      line6: 0,
      line7: irsRound(saOut.saltDeduction),
      line8a: irsRound(saIn.mortgageInterest ?? 0),
      line8b: 0,
      line8c: 0,
      line10: irsRound(saOut.mortgageInterest),
      line11: irsRound(saIn.charitableCash ?? 0),
      line12: irsRound(saIn.charitableNonCash ?? 0),
      line13: 0,
      line14: irsRound(saOut.charitableTotal),
      line15: 0,
      line16: irsRound(saIn.otherDeductions ?? 0),
      line17: irsRound(saOut.totalItemized),
    };
  }

  // ── Schedule D (capital gains/losses) ──
  let scheduleD: ScheduleDData | undefined;
  if (input.scheduleD) {
    const sd = input.scheduleD;
    // Line 14: long-term carryover (entered as negative on the form)
    const ltCarryover = sd.carryforwardLoss > 0
      ? irsRound(-(sd.carryforwardLoss + sd.capitalLossDeduction))
      : (sd.longTermLosses < 0 ? irsRound(sd.longTermLosses) : undefined);
    scheduleD = {
      line7: irsRound(sd.shortTermNet),
      line14: ltCarryover,
      line15: irsRound(sd.longTermNet),
      line16: irsRound(sd.netCapitalGainLoss),
      line21: sd.capitalLossDeduction > 0
        ? irsRound(-sd.capitalLossDeduction)
        : irsRound(sd.netCapitalGainLoss),
    };
  }

  // ── Form 2441 (dependent care) ──
  let form2441: Form2441Data | undefined;
  if (input.form2441) {
    const f = input.form2441;
    // Line 4/5: earned income — use wages as earned income for both filers
    // For MFJ both must have earned income > expenses for full credit
    const earnedIncome = irsRound(wages);
    form2441 = {
      line3: irsRound(f.expensesAfterFSA),
      line4: earnedIncome,
      line5: filingStatus === 'mfj' ? earnedIncome : undefined,
      line6: irsRound(f.expensesAfterFSA),
      line8: '.' + String(Math.round(f.creditPercentage * 100)).padStart(2, '0'),
      line9: irsRound(f.credit),
      line10: Math.max(0, irsRound(f1040.tax - (f1040.totalCredits - f.credit))),
      line11: irsRound(f.credit),
      solePropNo: 1,
    };
  }

  // ── Form 4562 (depreciation) ──
  let form4562: Form4562Data | undefined;
  if (input.totalDepreciation) {
    form4562 = {
      line22: irsRound(input.totalDepreciation),
    };
  }

  // ── Form 8995 (QBI) ──
  let form8995: Form8995Data | undefined;
  if (input.qbiDeduction && input.qbiDeduction > 0) {
    const qbiIncome = input.qbiIncome ?? 0;
    const taxableBeforeQBI = irsRound(f1040.taxableIncome + input.qbiDeduction);
    // Build business entries from rental properties + Schedule C (up to 5)
    const businesses: { name: string; qbi: number }[] = [];
    if (input.rentalProperties) {
      for (const rp of input.rentalProperties) {
        if (rp.output?.amountFor1040 && rp.output.amountFor1040 > 0) {
          // Full qualified address: "Schedule E: 123 EXAMPLE ST, Anytown, CA 90000"
          const addrParts = [rp.address || 'Rental Property'];
          if (rp.city) addrParts.push(rp.city);
          if (rp.state && rp.zip) addrParts.push(`${rp.state} ${rp.zip}`);
          else if (rp.state) addrParts.push(rp.state);
          const fullAddr = `Schedule E: ${addrParts.join(', ')}`;
          businesses.push({ name: fullAddr, qbi: irsRound(rp.output.amountFor1040) });
        }
      }
    }
    if (input.scheduleC?.netProfit && input.scheduleC.netProfit > 0) {
      businesses.push({ name: input.scheduleCBusinessName || 'Self-Employment', qbi: irsRound(input.scheduleC.netProfit) });
    }
    // If no individual businesses but QBI exists, add a generic entry
    if (businesses.length === 0 && qbiIncome > 0) {
      businesses.push({ name: 'Schedule E Rental', qbi: irsRound(qbiIncome) });
    }
    form8995 = {
      businesses: businesses.slice(0, 5),
      line1: irsRound(qbiIncome),
      line2: irsRound(qbiIncome * 0.2),
      line4: taxableBeforeQBI,
      line5: 0,
      line6: taxableBeforeQBI,
      line7: irsRound(taxableBeforeQBI * 0.2),
      line10: irsRound(input.qbiDeduction),
    };
  }

  // ── Schedule C (self-employment) ──
  let scheduleC: import('../types/taxReturnData').ScheduleCData | undefined;
  if (input.scheduleC) {
    const sc = input.scheduleC;
    scheduleC = {
      line1: irsRound(input.scheduleCGrossReceipts ?? sc.grossIncome),
      line7: irsRound(sc.grossIncome),
      line28: irsRound(sc.totalExpenses),
      line31: irsRound(sc.netProfit),
    };
  }

  // ── Schedule SE (self-employment tax) ──
  let scheduleSE: import('../types/taxReturnData').ScheduleSEData | undefined;
  if (input.scheduleSE) {
    const se = input.scheduleSE;
    scheduleSE = {
      line2: irsRound(se.seTaxBase / 0.9235), // Reverse to get net SE income
      line3: irsRound(se.seTaxBase),
      line4: irsRound(se.seTax),
      line5: irsRound(se.deductibleHalf),
    };
  }

  // ── Form 6251 (AMT) ──
  let form6251: import('../types/taxReturnData').Form6251Data | undefined;
  if (input.form6251 && input.form6251.amtApplies) {
    const amt = input.form6251;
    form6251 = {
      line1: irsRound(f1040.taxableIncome),
      line26: irsRound(amt.amti),
      line27: irsRound(amt.exemption),
      line28: irsRound(amt.amtiAfterExemption),
      line30: irsRound(amt.tentativeMinimumTax),
      line31: irsRound(f1040.tax),
      line32: irsRound(amt.amt),
    };
  }

  // ── Form 8812 (Child Tax Credit) ──
  let form8812: import('../types/taxReturnData').Form8812Data | undefined;
  if (input.qualifyingChildren && input.qualifyingChildren > 0) {
    const config = getTaxYearConfig(taxYear);
    const ctcPerChild = config.childTaxCredit;
    const qualChildren = input.qualifyingChildren;
    // Part I-A (2025 form lines 1–11)
    const line1 = irsRound(f1040.agi);
    const line3 = line1; // No exclusions (2a-2c) for typical filers
    const line4a = qualChildren;
    const line4b = irsRound(line4a * ctcPerChild);
    const line5 = 0;  // Other dependents (not qualifying children)
    const line6 = 0;  // line5 × $500
    const line7 = irsRound(line4b + line6);
    // AGI phaseout threshold (IRC §24: $400k MFJ, $200k others)
    const line8 = filingStatus === 'mfj' ? 400000 : 200000;
    const line9 = Math.max(0, irsRound(line3 - line8));
    const line10 = irsRound(line9 * 0.05);
    const line11 = Math.max(0, irsRound(line7 - line10));
    // Part I-B (2025 form lines 12–14)
    // Credit Limit Worksheet A: Form 1040 line 18 minus specific credits
    // (Form 5695 Part II, Sch R, Form 8396, Form 8839 — none apply to typical filers)
    const taxWithAMT = irsRound(f1040.tax + (form6251?.line32 ?? 0));
    const creditLimitWsA = taxWithAMT;
    // Line 14: final non-refundable CTC = min(credit after phaseout, tax limit)
    const credit = Math.min(line11, creditLimitWsA);
    // Part II: ACTC (refundable excess)
    const actc = Math.max(0, irsRound(line11 - credit));
    form8812 = {
      line1, line3, line4a, line4b, line5, line6, line7,
      line8, line9, line10, line11, creditLimitWsA, credit, actc,
    };
  }

  // ── Form 8863 (Education Credits) ──
  let form8863: import('../types/taxReturnData').Form8863Data | undefined;
  if (input.form8863 && input.form8863.creditAfterPhaseout > 0) {
    const edu = input.form8863;
    form8863 = {
      line14: irsRound(edu.refundableCredit),
      line17: irsRound(edu.nonrefundableCredit),
      line28: irsRound(edu.creditAfterPhaseout),
    };
  }

  // ── Form 8880 (Saver's Credit) ──
  let form8880: import('../types/taxReturnData').Form8880Data | undefined;
  if (input.form8880 && input.form8880.credit > 0) {
    const sc = input.form8880;
    form8880 = {
      line1a: irsRound(input.saversContributions ?? sc.eligibleContributions),
      line7: irsRound(sc.eligibleContributions),
      line8: irsRound(f1040.agi),
      line10: irsRound(sc.eligibleContributions * sc.creditRate),
      line14: irsRound(sc.credit),
    };
  }

  // ── Form 8959 (Additional Medicare Tax) ──
  let form8959: import('../types/taxReturnData').Form8959Data | undefined;
  if (input.form8959 && input.form8959.totalAdditionalTax > 0) {
    const med = input.form8959;
    const threshold = 250000; // MFJ default, should come from config
    form8959 = {
      line1: irsRound(input.medicareWages ?? wages),
      line4: irsRound(input.medicareWages ?? wages),
      line5: threshold,
      line6: irsRound(Math.max(0, (input.medicareWages ?? wages) - threshold)),
      line7: irsRound(med.additionalTaxOnWages),
      line18: irsRound(med.totalAdditionalTax),
    };
  }

  // ── Form 8960 (NIIT) ──
  let form8960: import('../types/taxReturnData').Form8960Data | undefined;
  if (input.form8960 && input.form8960.applies) {
    const niit = input.form8960;
    const threshold = 250000; // MFJ default
    form8960 = {
      line1: irsRound(input.taxableInterest ?? 0),
      line2: irsRound(input.ordinaryDividends ?? 0),
      line8: irsRound(niit.netInvestmentIncome),
      line12: irsRound(niit.netInvestmentIncome),
      line13: irsRound(f1040.agi),
      line14: threshold,
      line15: irsRound(niit.magiOverThreshold),
      line16: irsRound(Math.min(niit.netInvestmentIncome, niit.magiOverThreshold)),
      line17: irsRound(niit.niit),
    };
  }

  // ── CA Form 540 ──
  let ca540: CA540Data | undefined;
  if (input.form540) {
    const ca = input.form540;
    ca540 = {
      line13: irsRound(f1040.agi),
      line14: 0,
      line15: irsRound(ca.caAGI),
      line18: irsRound(ca.deduction),
      line19: irsRound(ca.taxableIncome),
      line31: irsRound(ca.taxBeforeCredits),
      line35: irsRound(ca.mentalHealthSurcharge),
      line40: irsRound(ca.exemptionCredits),
      line48: irsRound(ca.totalTax),
      line71: irsRound(input.caWithholding ?? 0),
      line72: irsRound(input.caEstimatedPayments ?? 0),
      line74: irsRound(ca.totalPayments),
      line91: ca.isRefund ? irsRound(ca.refundOrOwed) : 0,
      line95: ca.isRefund ? 0 : irsRound(Math.abs(ca.refundOrOwed)),
    };
  }

  // ── Form 1040 ──
  const capitalGainLine7 = scheduleD?.line21 ?? irsRound(input.capitalLossDeduction ? -input.capitalLossDeduction : 0);
  const otherIncomeLine8 = schedule1?.line10 ?? 0;
  const adjustmentsLine10 = schedule1?.line26 ?? 0;
  const qbi = input.qbiDeduction ?? 0;
  const w2With = irsRound(input.w2Withholding ?? 0);
  const otherWith = irsRound(input.otherWithholding ?? 0);
  const estPay = irsRound(input.estimatedPayments ?? 0);

  const form1040Data = {
    line1a: irsRound(wages),
    line1z: irsRound(wages),
    line2a: 0,
    line2b: irsRound(input.taxableInterest ?? 0),
    line3a: irsRound(input.qualifiedDividends ?? 0),
    line3b: irsRound(input.ordinaryDividends ?? 0),
    line4a: 0,
    line4b: 0,
    line5a: 0,
    line5b: 0,
    line6a: 0,
    line6b: 0,
    line7: irsRound(capitalGainLine7),
    line8: irsRound(otherIncomeLine8),
    line9: irsRound(f1040.totalIncome),
    line10: irsRound(adjustmentsLine10),
    line11: irsRound(f1040.agi),
    line12a: irsRound(f1040.deduction),
    line12b: 0,
    line12c: irsRound(f1040.deduction),
    line13: irsRound(qbi),
    line14: irsRound(f1040.deduction + qbi),
    line15: Math.max(0, irsRound(f1040.agi - f1040.deduction - qbi)),
    line16: irsRound(f1040.tax),
    line17: schedule2?.line4 ?? 0,
    line18: irsRound(f1040.tax + (schedule2?.line4 ?? 0)),
    line19: form8812 ? irsRound(form8812.credit) : 0,
    line20: schedule3?.line8 ?? 0,
    line21: irsRound(f1040.totalCredits),
    line22: Math.max(0, irsRound(f1040.tax + (schedule2?.line4 ?? 0) - f1040.totalCredits)),
    line23: schedule2?.line21 ?? 0,
    line24: irsRound(f1040.totalTax),
    line25a: w2With,
    line25b: otherWith,
    line25c: 0,
    line25d: irsRound(w2With + otherWith),
    line26: estPay,
    line27a: 0,
    line33: irsRound(f1040.totalPayments),
    line34: f1040.isRefund ? irsRound(f1040.refundOrOwed) : 0,
    line35a: f1040.isRefund ? irsRound(f1040.refundOrOwed) : 0,
    line37: f1040.isRefund ? 0 : irsRound(Math.abs(f1040.refundOrOwed)),
    filingStatus,
  };

  return {
    taxYear,
    form1040: form1040Data,
    schedule1,
    schedule2,
    schedule3,
    scheduleA,
    scheduleC,
    scheduleD,
    scheduleE,
    scheduleSE,
    form2441,
    form4562,
    form6251,
    form8812,
    form8863,
    form8880,
    form8959,
    form8960,
    form8582,
    form8995,
    ca540,
    pii,
  };
}
