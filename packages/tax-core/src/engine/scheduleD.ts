import { irsRound } from './form1040';

export interface StockTransaction {
  description: string;
  dateAcquired: string;
  dateSold: string;
  proceeds: number;
  costBasis: number;
  /** Adjustment for wash sales, RSU basis correction, etc. */
  adjustment?: number;
  adjustmentCode?: 'W' | 'B' | string;
}

export interface ScheduleDOutput {
  shortTermGains: number;
  shortTermLosses: number;
  shortTermNet: number;
  longTermGains: number;
  longTermLosses: number;
  longTermNet: number;
  netCapitalGainLoss: number;
  /** Capital loss deduction (max $3,000 per year) */
  capitalLossDeduction: number;
  /** Excess loss carried forward to next year */
  carryforwardLoss: number;
}

const CAPITAL_LOSS_LIMIT = 3000;
const MS_PER_DAY = 86400000;
const DAYS_PER_YEAR = 365;

/** Determine if a holding period qualifies as long-term (> 1 year) */
export function isLongTerm(dateAcquired: string, dateSold: string): boolean {
  const acquired = new Date(dateAcquired);
  const sold = new Date(dateSold);
  const daysHeld = (sold.getTime() - acquired.getTime()) / MS_PER_DAY;
  return daysHeld > DAYS_PER_YEAR;
}

/** Calculate gain/loss for a single transaction */
export function calculateGainLoss(tx: StockTransaction): number {
  const adjustedBasis = tx.costBasis + (tx.adjustment ?? 0);
  return irsRound(tx.proceeds - adjustedBasis);
}

/** Full Schedule D calculation */
export function calculateScheduleD(
  transactions: StockTransaction[],
): ScheduleDOutput {
  let shortTermGains = 0;
  let shortTermLosses = 0;
  let longTermGains = 0;
  let longTermLosses = 0;

  for (const tx of transactions) {
    const gainLoss = calculateGainLoss(tx);
    const longTerm = isLongTerm(tx.dateAcquired, tx.dateSold);

    if (longTerm) {
      if (gainLoss >= 0) longTermGains += gainLoss;
      else longTermLosses += gainLoss;
    } else {
      if (gainLoss >= 0) shortTermGains += gainLoss;
      else shortTermLosses += gainLoss;
    }
  }

  const shortTermNet = irsRound(shortTermGains + shortTermLosses);
  const longTermNet = irsRound(longTermGains + longTermLosses);
  const netCapitalGainLoss = irsRound(shortTermNet + longTermNet);

  let capitalLossDeduction = 0;
  let carryforwardLoss = 0;

  if (netCapitalGainLoss < 0) {
    capitalLossDeduction = Math.min(Math.abs(netCapitalGainLoss), CAPITAL_LOSS_LIMIT);
    carryforwardLoss = Math.abs(netCapitalGainLoss) - capitalLossDeduction;
  }

  return {
    shortTermGains: irsRound(shortTermGains),
    shortTermLosses: irsRound(shortTermLosses),
    shortTermNet,
    longTermGains: irsRound(longTermGains),
    longTermLosses: irsRound(longTermLosses),
    longTermNet,
    netCapitalGainLoss,
    capitalLossDeduction,
    carryforwardLoss,
  };
}
