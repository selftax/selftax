import { irsRound } from './form1040';

export interface ScheduleEInput {
  /** Gross rental income (Line 3) */
  grossRentalIncome: number;
  /** Advertising (Line 5) */
  advertising?: number;
  /** Auto and travel (Line 6) */
  autoTravel?: number;
  /** Cleaning and maintenance (Line 7) */
  cleaningMaintenance?: number;
  /** Commissions (Line 8) */
  commissions?: number;
  /** Insurance (Line 9) */
  insurance?: number;
  /** Legal and professional fees (Line 10) */
  legalFees?: number;
  /** Management fees (Line 11) */
  managementFees?: number;
  /** Mortgage interest (Line 12) — for RENTAL property, not primary */
  mortgageInterest?: number;
  /** Other interest (Line 13) */
  otherInterest?: number;
  /** Repairs (Line 14) */
  repairs?: number;
  /** Supplies (Line 15) */
  supplies?: number;
  /** Property taxes (Line 16) — NOT subject to SALT cap */
  propertyTaxes?: number;
  /** Utilities (Line 17) */
  utilities?: number;
  /** Depreciation (Line 18) — from Form 4562 */
  depreciation?: number;
  /** Other expenses (Line 19) */
  otherExpenses?: number;
  /** Prior-year unallowed passive loss (from Form 8582) — offsets current year income */
  priorYearUnallowedLoss?: number;
}

export interface PassiveActivityInput {
  /** Taxpayer's AGI for passive loss limitation */
  agi: number;
  /** Does the taxpayer actively participate in the rental activity? */
  activeParticipant: boolean;
}

export interface ScheduleEOutput {
  /** Line 3: Gross rental income */
  grossIncome: number;
  /** Line 20: Total expenses */
  totalExpenses: number;
  /** Line 21: Net rental income/loss before passive limits */
  netRentalIncome: number;
  /** Allowed rental loss after passive activity limits */
  allowedLoss: number;
  /** Suspended passive loss (carried forward) */
  suspendedLoss: number;
  /** Final amount to carry to Form 1040 */
  amountFor1040: number;
}

/** Calculate total rental expenses */
export function calculateRentalExpenses(input: ScheduleEInput): number {
  return irsRound(
    (input.advertising ?? 0) +
    (input.autoTravel ?? 0) +
    (input.cleaningMaintenance ?? 0) +
    (input.commissions ?? 0) +
    (input.insurance ?? 0) +
    (input.legalFees ?? 0) +
    (input.managementFees ?? 0) +
    (input.mortgageInterest ?? 0) +
    (input.otherInterest ?? 0) +
    (input.repairs ?? 0) +
    (input.supplies ?? 0) +
    (input.propertyTaxes ?? 0) +
    (input.utilities ?? 0) +
    (input.depreciation ?? 0) +
    (input.otherExpenses ?? 0),
  );
}

/**
 * Calculate passive activity loss allowance.
 *
 * IRS Section 469 special allowance for active participants:
 * - AGI ≤ $100,000: up to $25,000 deduction allowed
 * - AGI $100,000-$150,000: phased out ($1 per $2 over $100k)
 * - AGI > $150,000: rental losses fully suspended
 */
export function calculatePassiveActivityAllowance(
  rentalLoss: number,
  passiveInput: PassiveActivityInput,
): { allowedLoss: number; suspendedLoss: number } {
  // If there's no loss, no limitation needed
  if (rentalLoss >= 0) {
    return { allowedLoss: 0, suspendedLoss: 0 };
  }

  const absLoss = Math.abs(rentalLoss);

  if (!passiveInput.activeParticipant) {
    // Non-active participants: all losses suspended
    return { allowedLoss: 0, suspendedLoss: absLoss };
  }

  const { agi } = passiveInput;
  let maxAllowance: number;

  if (agi <= 100000) {
    maxAllowance = 25000;
  } else if (agi >= 150000) {
    maxAllowance = 0;
  } else {
    // Phase out: reduce by $1 for every $2 over $100k
    maxAllowance = 25000 - Math.floor((agi - 100000) / 2);
  }

  const allowedLoss = Math.min(absLoss, maxAllowance);
  const suspendedLoss = absLoss - allowedLoss;

  return {
    allowedLoss: irsRound(allowedLoss),
    suspendedLoss: irsRound(suspendedLoss),
  };
}

/** Calculate depreciation for residential rental property (27.5 year straight-line) */
export function calculateRentalDepreciation(
  buildingBasis: number,
  _yearsInService?: number,
): number {
  return irsRound(buildingBasis / 27.5);
}

/** Full Schedule E calculation */
export function calculateScheduleE(
  input: ScheduleEInput,
  passiveInput?: PassiveActivityInput,
): ScheduleEOutput {
  const grossIncome = irsRound(input.grossRentalIncome);
  const totalExpenses = calculateRentalExpenses(input);
  const netRentalIncome = irsRound(grossIncome - totalExpenses);

  // Apply prior-year unallowed passive loss against current-year income
  const priorLoss = input.priorYearUnallowedLoss ?? 0;
  const netAfterPriorLoss = irsRound(netRentalIncome - priorLoss);

  let allowedLoss = 0;
  let suspendedLoss = 0;
  let amountFor1040 = netAfterPriorLoss;

  if (netAfterPriorLoss < 0 && passiveInput) {
    const passiveResult = calculatePassiveActivityAllowance(
      netAfterPriorLoss,
      passiveInput,
    );
    allowedLoss = passiveResult.allowedLoss;
    suspendedLoss = passiveResult.suspendedLoss;
    amountFor1040 = allowedLoss === 0 ? 0 : -allowedLoss; // Negative = loss allowed on 1040
  }

  return {
    grossIncome,
    totalExpenses,
    netRentalIncome,
    allowedLoss,
    suspendedLoss,
    amountFor1040,
  };
}
