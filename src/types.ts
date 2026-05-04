/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface SalaryRecord {
  id: string;
  uid?: string;
  date: string; // YYYY-MM
  rank: string; // 職等
  salaryPoint: number; // 俸點
  
  // Income (收)
  basicPay: number; // 本薪
  professionalAllowance: number; // 專業加給
  medicalIncentive: number; // 獎勵金-醫事及行政
  yearEndBonus: number; // 年終
  performanceBonus: number; // 考績
  overtimePay: number; // 加班費
  otherIncome: number; // 其他(收)
  retroactivePay: number; // 應追領
  
  // Deductions (支)
  civilServiceInsurance: number; // 公保費
  healthInsurance: number; // 健保費
  pensionFund: number; // 退撫離職金
  otherDeduction: number; // 其他(支)
  withholdingTax?: number; // 扣繳稅額
  
  // Tax
  taxableIncome?: number; // 應稅所得
  
  // Expected values for comparison
  expectedBasicPay?: number; // 應領本薪
  expectedProfessionalAllowance?: number; // 應領專業加給
}

export interface YearlyStandard {
  id: string;
  uid?: string;
  year: string; // YYYY
  basicPay: number;
  professionalAllowance: number;
}

export interface CreditCard {
  id: string;
  uid?: string;
  name: string; // e.g. 玫瑰卡, 中信英雄聯盟...
  bank: string; // e.g. 台新, 國泰...
  statementDate: number; // 結帳日 (1-31)
  dueDate: number;       // 最後付款日 (1-31)
  limit: number;
  currentBalance: number;
  color?: string; // Optional for UI
}

export interface CreditCardBill {
  id: string;
  uid?: string;
  cardId: string;
  month: string; // YYYY-MM
  amount: number;
  isPaid?: boolean;
}

export interface BankAccount {
  id: string;
  uid?: string;
  name: string;
  bankName: string;
  balance: number;
  type: 'savings' | 'checking' | 'fixed' | 'loan' | 'high-yield';
  interestRate?: number; // 年度利率 %
  loanTotal?: number; // 貸款總額
  loanRemaining?: number; // 剩餘貸款
  monthlyPayment?: number; // 每期還款金額
  balanceLimit?: number; // 活存上限
  remark?: string; // 備註 (優惠條件)
}

export interface Fund {
  id: string;
  uid?: string;
  name: string;
  cost: number;
  currentValue: number;
  units: number;
  source?: string;
}

export interface TaxBracket {
  limit: number;
  rate: number;
  adjustment: number;
}

export interface TaxStandard {
  id: string;
  uid: string;
  year: number;
  exemptionBase: number;
  exemptionSenior: number;
  standardDeductionSingle: number;
  standardDeductionMarried: number;
  salaryDeductionUnit: number;
  savingsDeductionLimit: number;
  disabilityDeductionUnit: number;
  educationDeductionUnit: number;
  preschoolDeductionUnit: number;
  longTermCareDeductionUnit: number;
  basicLivingExpenseUnit: number;
  taxBrackets: TaxBracket[];
}

export type FilingMethod = 'joint' | 'salary_user_separate' | 'salary_spouse_separate';

export interface TaxRecord {
  id: string;
  uid: string;
  year: number; // 稅務年度 (例如 112)
  parameterYear?: number; // 使用哪一年的參數計算 (選填，預設同 year)
  salaryUser: number;
  salarySpouse: number;
  profitIncome: number;
  interestIncome: number;
  otherIncome: number;
  exemptionsCount: number;
  exemptionsSeniorCount: number;
  isMarried: boolean;
  filingMethod?: FilingMethod;
  propertyLossDeduction: number;
  savingsDeduction: number;
  disabilityCount: number;
  educationCount: number;
  preschoolCount: number;
  longTermCareCount: number;
  startupInvestmentDeduction: number;
  investmentCredits: number;
  homePurchaseCredits: number;
  withholding: number;
  dividendCredits: number;
  mainlandTaxCredits: number;
  itemizedDeduction?: number; // 列舉扣除額
  note?: string;
  // Computed fields (often stored for quick access or history)
  totalIncome?: number;
  taxDue?: number;
}

export interface Stock {
  id: string;
  uid?: string;
  symbol: string;
  name: string;
  shares: number;
  averageCost: number;
  currentPrice: number;
  source?: 'Cathay' | 'Firstrade' | 'FundRich';
  expectedDividendPerShare?: number; // 預估每股股利 (TWD 或 USD depending on market, 但主打台股)
  dividendRatio54C?: number; // 54C 占比 (0-100)
  dividendFrequency?: string; // 年配, 半年配, 季配, 月配
}

export interface Budget {
  id: string;
  uid?: string;
  category: string;
  allocated: number;
  spent: number;
  year: number;
  frequency: 'monthly' | 'quarterly' | 'semi-annually' | 'annually';
  isPaid: boolean;
  order?: number;
}

export interface ChildRecord {
  id: string;
  uid: string;
  type: 'income' | 'expense';
  category: string;
  amount: number;
  budgetAmount?: number;
  frequency: 'monthly' | 'quarterly' | 'half-yearly' | 'yearly';
  date: string; // YYYY-MM-DD
  year: number;
  note?: string;
}

export interface Insurance {
  id: string;
  uid?: string;
  name: string;
  provider: string; // e.g. 全球人壽, 遠雄人壽
  type: string; // e.g. 醫療險, 重大傷病
  order?: number;
  coverageSummary?: string; // AI generated summary of coverage
  analysisRaw?: string; // Raw AI analysis result
  planAge?: number;
  planGender?: '男性' | '女性';
  planTerm?: string;
  planCoverage?: string;
  planOptions?: string[]; // Array of extracted plan options
  planCalculatedPremium?: string; // AI calculated premium based on plan
  planCalculatedCoverage?: string; // JSON string representing the calculated coverage table
}

export interface InsurancePremium {
  id: string;
  uid?: string;
  insuranceId: string;
  age: number;
  premium: number;
}

export interface User {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write'
}
