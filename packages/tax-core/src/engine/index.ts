export {
  calculateTotalIncome,
  calculateAGI,
  calculateDeduction,
  calculateTaxableIncome,
  calculateTax,
  calculateTaxWithPreferentialRates,
  calculateChildTaxCredit,
  calculateForm1040,
  irsRound,
} from './form1040';
export type { Form1040Input, Form1040Output } from './form1040';
export { STANDARD_DEDUCTION, TAX_BRACKETS, CHILD_TAX_CREDIT, SALT_CAP, getTaxYearConfig, DEFAULT_TAX_YEAR, SUPPORTED_TAX_YEARS } from './taxConstants';
export type { FilingStatus, TaxBracket, TaxYearConfig } from './taxConstants';
export type { CapitalGainsThresholds } from './taxYearConfigs';
export { calculateNIIT } from './form8960';
export type { Form8960Input, Form8960Output } from './form8960';
export { calculateAdditionalMedicare } from './form8959';
export type { Form8959Input, Form8959Output } from './form8959';
export { calculateScheduleC } from './scheduleC';
export type { ScheduleCInput, ScheduleCOutput } from './scheduleC';
export { calculateScheduleSE } from './scheduleSE';
export type { ScheduleSEInput, ScheduleSEOutput } from './scheduleSE';
export { calculateTaxableSocialSecurity } from './socialSecurity';
export type { SocialSecurityInput, SocialSecurityOutput } from './socialSecurity';
export { calculateEducationCredit } from './form8863';
export type { EducationCreditInput, EducationCreditOutput } from './form8863';
export { calculateEITC } from './eitc';
export type { EITCInput, EITCOutput } from './eitc';
export { calculateSaversCredit } from './form8880';
export type { SaversCreditInput, SaversCreditOutput } from './form8880';
export {
  calculateScheduleA,
} from './scheduleA';
export type { ScheduleAInput, ScheduleAOutput } from './scheduleA';
export {
  calculateScheduleE,
  calculateRentalExpenses,
  calculatePassiveActivityAllowance,
  calculateRentalDepreciation,
} from './scheduleE';
export type { ScheduleEInput, ScheduleEOutput, PassiveActivityInput } from './scheduleE';
export {
  calculateScheduleD,
  calculateGainLoss,
  isLongTerm,
} from './scheduleD';
export type { StockTransaction, ScheduleDOutput } from './scheduleD';
export {
  calculateForm2441,
  getDependentCarePercentage,
} from './form2441';
export type { Form2441Input, Form2441Output } from './form2441';
export { calculateForm6251 } from './form6251';
export type { Form6251Input, Form6251Output } from './form6251';
export {
  calculateForm540,
  calculateCATax,
  calculateMentalHealthSurcharge,
} from './form540';
export type { Form540Input, Form540Output } from './form540';
export {
  CA_TAX_BRACKETS,
  CA_STANDARD_DEDUCTION,
  CA_PERSONAL_EXEMPTION_CREDIT,
  CA_MENTAL_HEALTH_THRESHOLD,
  CA_MENTAL_HEALTH_RATE,
} from './caConstants';
